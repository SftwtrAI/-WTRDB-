import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { falkorHealthCheck } from "./falkor.js";
import { dbHealthCheck } from "./db.js";
import { hasOpenAIKey } from "./openaiClient.js";
import { startIngest } from "./jobs/ingest.js";
import { runPipeline } from "./jobs/runPipeline.js";
import { findJobByImageId, listJobs } from "./jobs/jobStore.js";
import { resolveUserId } from "./auth/v2auth.js";
import { answerQuestion, graphCategories } from "./query/graphRag.js";

const log = createLogger("server");
const app = express();
app.disable("x-powered-by");

// ── CORS — let the v2 client call this service from the browser ──
const corsAllow = new Set<string>([
  config.v2BaseUrl,
  "http://localhost:5001",
  "http://localhost:5173",
  "https://localhost",
  ...config.corsOrigins,
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && corsAllow.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,X-Filename,Authorization",
    );
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

function deepLinks(kbId: string) {
  return {
    threeD: `${config.v2BaseUrl}/app/knowledge-graph-3d/${kbId}`,
    live: `${config.v2BaseUrl}/app/knowledge-graph-3d/${kbId}?live=1`,
    constellation: `${config.v2BaseUrl}/app/constellation`,
  };
}

// ── Health ──
app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "image-kg",
    falkordb: await falkorHealthCheck(),
    postgres: await dbHealthCheck(),
    openaiKey: await hasOpenAIKey(),
    v2BaseUrl: config.v2BaseUrl,
  });
});

// ── Raw streaming upload (SYSTEM_DESIGN §6 POST /v1/images) ──
app.post("/images", async (req, res) => {
  const title =
    (req.query.name as string) ||
    (req.headers["x-filename"] as string) ||
    "image";
  const imageId = randomUUID();
  const dir = path.join(config.uploadsDir, imageId);
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, "source");
  const ws = fs.createWriteStream(dest);
  let bytes = 0;
  let aborted = false;

  req.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > config.maxImageBytes && !aborted) {
      aborted = true;
      req.destroy();
      ws.destroy();
      res.status(413).json({ error: "file exceeds MAX_IMAGE_BYTES" });
    }
  });
  ws.on("error", (e) => {
    if (!aborted) res.status(500).json({ error: String(e) });
  });
  ws.on("finish", async () => {
    if (aborted) return;
    try {
      const job = await startIngest({ sourcePath: dest, title: String(title), imageId });
      res.json({ imageId, jobId: job.id, kbId: job.kbId, status: job.status });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
  req.pipe(ws);
});

// ── Job list + status (SYSTEM_DESIGN §6 GET /v1/jobs/{id}) ──
app.get("/images", async (_req, res) => {
  const jobs = await listJobs();
  res.json(
    jobs.map((j) => ({
      imageId: j.imageId,
      jobId: j.id,
      kbId: j.kbId,
      title: j.title,
      status: j.status,
      progress: j.progress,
    })),
  );
});

app.get("/images/:imageId", async (req, res) => {
  const job = await findJobByImageId(req.params.imageId);
  if (!job) return res.status(404).json({ error: "not found" });
  res.json({
    imageId: job.imageId,
    jobId: job.id,
    kbId: job.kbId,
    title: job.title,
    status: job.status,
    progress: job.progress,
    error: job.error,
    sourceImageId: job.artifacts.imageId ?? null,
    entityCount: job.artifacts.entityCount ?? null,
    relationshipCount: job.artifacts.relationshipCount ?? null,
    links: job.status === "completed" ? deepLinks(job.kbId) : null,
  });
});

// ── NL query (SYSTEM_DESIGN §6 GET /v1/graph/query) ──
app.post("/query", express.json(), async (req, res) => {
  try {
    const { imageId, kbId, question, minConfidence, conversationHistory } = req.body ?? {};
    if (!question) return res.status(400).json({ error: "question required" });

    let resolvedKbId = kbId as string | undefined;
    let userId: string | undefined;
    if (imageId) {
      const job = await findJobByImageId(imageId);
      if (!job) return res.status(404).json({ error: "image not found" });
      resolvedKbId = job.kbId;
      userId = job.userId;
    }
    if (!resolvedKbId) return res.status(400).json({ error: "imageId or kbId required" });
    if (!userId) userId = await resolveUserId();

    const result = await answerQuestion(userId, resolvedKbId, question, {
      minConfidence: typeof minConfidence === "number" ? minConfidence : undefined,
      history: conversationHistory,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Category log (SYSTEM_DESIGN §7 observability) ──
// Per-KB when ?kbId=... is given, else aggregated across all completed jobs.
app.get("/categories", async (req, res) => {
  try {
    const kbId = req.query.kbId as string | undefined;
    const userId = await resolveUserId();
    if (kbId) {
      return res.json({ kbId, categories: await graphCategories(userId, kbId) });
    }
    const jobs = (await listJobs()).filter((j) => j.status === "completed");
    const totals = new Map<string, number>();
    for (const j of jobs) {
      try {
        for (const c of await graphCategories(j.userId, j.kbId)) {
          totals.set(c.category, (totals.get(c.category) ?? 0) + c.count);
        }
      } catch {
        /* skip graphs that can't be read */
      }
    }
    const categories = [...totals.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function boot() {
  for (const d of [config.dataDir, config.uploadsDir, config.jobsDir]) {
    await fsp.mkdir(d, { recursive: true });
  }
  const [falkor, pg, key] = await Promise.all([
    falkorHealthCheck(),
    dbHealthCheck(),
    hasOpenAIKey(),
  ]);
  app.listen(config.port, () => {
    log.info(`image-kg listening on http://localhost:${config.port}`);
    log.info(`  FalkorDB: ${falkor ? "ok" : "UNREACHABLE"}`);
    log.info(`  Postgres: ${pg ? "ok" : "UNREACHABLE"}`);
    log.info(`  OpenAI key: ${key ? "present" : "MISSING (set OPENAI_API_KEY)"}`);
    log.info(`  v2 base: ${config.v2BaseUrl}`);
  });

  // Resume jobs interrupted by a crash/restart. runPipeline is resumable
  // (preprocess + extraction cached) and idempotent (FalkorDB MERGE), so
  // re-running a non-terminal job is safe and clears any stuck "extracting" KB.
  try {
    const jobs = await listJobs();
    const stuck = jobs.filter((j) => j.status !== "completed" && j.status !== "failed");
    for (const j of stuck) {
      log.info(`resuming interrupted job ${j.id} (status=${j.status}) for kb ${j.kbId}`);
      runPipeline(j.id).catch((err) =>
        log.error(`resume of job ${j.id} failed: ${err.message}`),
      );
    }
    if (stuck.length) log.info(`resumed ${stuck.length} interrupted job(s) on boot`);
  } catch (err: any) {
    log.warn(`job resume scan failed: ${err.message}`);
  }
}

boot().catch((err) => {
  log.error(`boot failed: ${err.message}`);
  process.exit(1);
});
