import express from "express";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Server as TusServer, EVENTS } from "@tus/server";
import { FileStore } from "@tus/file-store";

import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { falkorHealthCheck } from "./falkor.js";
import { dbHealthCheck } from "./db.js";
import { hasOpenAIKey } from "./openaiClient.js";
import { startIngest } from "./jobs/ingest.js";
import { runPipeline } from "./jobs/runPipeline.js";
import { getJob, findJobByVideoId, listJobs } from "./jobs/jobStore.js";
import { answerQuestion } from "./query/graphRag.js";
import type { VideoGraph } from "./types.js";

const log = createLogger("server");
const app = express();
app.disable("x-powered-by");

// ── CORS — let the v2 client (different origin/port) call this service from the browser ──
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
      "Content-Type,X-Filename,Authorization,Upload-Length,Upload-Metadata,Upload-Offset,Tus-Resumable",
    );
    res.setHeader("Access-Control-Expose-Headers", "Location,Upload-Offset,Tus-Resumable");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const webDir = fileURLToPath(new URL("../web", import.meta.url));

function deepLinks(kbId: string) {
  return {
    reactFlow: `${config.v2BaseUrl}/app/knowledge-graph/${kbId}`,
    threeD: `${config.v2BaseUrl}/app/knowledge-graph-3d/${kbId}`,
    constellation: `${config.v2BaseUrl}/app/constellation`,
  };
}

// ── Health ──
app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    falkordb: await falkorHealthCheck(),
    postgres: await dbHealthCheck(),
    openaiKey: await hasOpenAIKey(),
    v2BaseUrl: config.v2BaseUrl,
  });
});

// ── Resumable upload (tus) — used by the web UI ──
const tusServer = new TusServer({
  path: "/files",
  datastore: new FileStore({ directory: config.tusDir }),
  maxSize: config.maxVideoBytes,
});
tusServer.on(EVENTS.POST_FINISH, async (_req, _res, upload) => {
  try {
    const filename =
      (upload.metadata && (upload.metadata as any).filename) || upload.id;
    const sourcePath = path.join(config.tusDir, upload.id);
    await startIngest({ sourcePath, title: String(filename), videoId: upload.id });
    log.info(`tus upload finished → ingest started (videoId=${upload.id})`);
  } catch (err: any) {
    log.error(`tus onFinish ingest failed: ${err.message}`);
  }
});
app.all("/files", (req, res) => tusServer.handle(req, res));
app.all("/files/*", (req, res) => tusServer.handle(req, res));

// ── Raw streaming upload (spec §9 POST /videos) — used by curl/CLI ──
app.post("/videos", async (req, res) => {
  const title =
    (req.query.name as string) ||
    (req.headers["x-filename"] as string) ||
    "video";
  const videoId = randomUUID();
  const dir = path.join(config.uploadsDir, videoId);
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, "source");
  const ws = fs.createWriteStream(dest);
  let bytes = 0;
  let aborted = false;

  req.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > config.maxVideoBytes && !aborted) {
      aborted = true;
      req.destroy();
      ws.destroy();
      res.status(413).json({ error: "file exceeds MAX_VIDEO_BYTES" });
    }
  });
  ws.on("error", (e) => {
    if (!aborted) res.status(500).json({ error: String(e) });
  });
  ws.on("finish", async () => {
    if (aborted) return;
    try {
      const job = await startIngest({
        sourcePath: dest,
        title: String(title),
        videoId,
      });
      res.json({ videoId, jobId: job.id, kbId: job.kbId, status: job.status });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
  req.pipe(ws);
});

// ── Job status (spec §9 GET /videos/{id}) ──
app.get("/videos", async (_req, res) => {
  const jobs = await listJobs();
  res.json(
    jobs.map((j) => ({
      videoId: j.videoId,
      jobId: j.id,
      kbId: j.kbId,
      title: j.title,
      status: j.status,
      progress: j.progress,
    })),
  );
});

app.get("/videos/:videoId", async (req, res) => {
  const job = await findJobByVideoId(req.params.videoId);
  if (!job) return res.status(404).json({ error: "not found" });
  res.json({
    videoId: job.videoId,
    jobId: job.id,
    kbId: job.kbId,
    title: job.title,
    status: job.status,
    progress: job.progress,
    error: job.error,
    entityCount: job.artifacts.entityCount ?? null,
    relationshipCount: job.artifacts.relationshipCount ?? null,
    links: job.status === "completed" ? deepLinks(job.kbId) : null,
  });
});

// ── NL query (spec §9 POST /query) — proxies to v2's NL→Cypher ──
app.post("/query", express.json(), async (req, res) => {
  try {
    const { videoId, kbId, question, conversationHistory } = req.body ?? {};
    if (!question) return res.status(400).json({ error: "question required" });

    let resolvedKbId = kbId as string | undefined;
    let userId: string | undefined;
    if (videoId) {
      const job = await findJobByVideoId(videoId);
      if (!job) return res.status(404).json({ error: "video not found" });
      resolvedKbId = job.kbId;
      userId = job.userId;
    }
    if (!resolvedKbId) return res.status(400).json({ error: "videoId or kbId required" });
    if (!userId) {
      const { resolveUserId } = await import("./auth/v2auth.js");
      userId = await resolveUserId();
    }

    const result = await answerQuestion(
      userId,
      resolvedKbId,
      question,
      conversationHistory,
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Events & graph artifacts (spec §9) ──
async function readGraph(videoId: string): Promise<VideoGraph | null> {
  const job = await findJobByVideoId(videoId);
  if (!job?.artifacts.graphPath) return null;
  try {
    return JSON.parse(await fsp.readFile(job.artifacts.graphPath, "utf8"));
  } catch {
    return null;
  }
}

app.get("/events/:videoId", async (req, res) => {
  const graph = await readGraph(req.params.videoId);
  if (!graph) return res.status(404).json({ error: "no graph yet" });
  const events = graph.events.map((e) => ({
    ...e,
    evidenceFrameUrls: e.evidenceFrames.map(
      (id) => `/videos/${req.params.videoId}/frames/${id}`,
    ),
  }));
  res.json({ events });
});

app.get("/graph/:videoId", async (req, res) => {
  const graph = await readGraph(req.params.videoId);
  if (!graph) return res.status(404).json({ error: "no graph yet" });
  res.json(graph);
});

// ── Evidence frames ──
app.get("/videos/:videoId/frames/:frameId", (req, res) => {
  const { videoId, frameId } = req.params;
  if (!/^[a-zA-Z0-9_]+$/.test(frameId) || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
    return res.status(400).end();
  }
  const file = path.join(config.uploadsDir, videoId, "frames", `${frameId}.jpg`);
  res.sendFile(file, (err) => {
    if (err) res.status(404).end();
  });
});

// ── Static UI ──
app.use(express.static(webDir));

async function boot() {
  for (const d of [config.dataDir, config.uploadsDir, config.tusDir, config.jobsDir]) {
    await fsp.mkdir(d, { recursive: true });
  }
  const [falkor, pg, key] = await Promise.all([
    falkorHealthCheck(),
    dbHealthCheck(),
    hasOpenAIKey(),
  ]);
  app.listen(config.port, () => {
    log.info(`video-kg listening on http://localhost:${config.port}`);
    log.info(`  FalkorDB: ${falkor ? "ok" : "UNREACHABLE"}`);
    log.info(`  Postgres: ${pg ? "ok" : "UNREACHABLE"}`);
    log.info(`  OpenAI key: ${key ? "present" : "MISSING (set OPENAI_API_KEY)"}`);
    log.info(`  v2 base: ${config.v2BaseUrl}`);
  });

  // Resume jobs interrupted by a crash/restart. runPipeline is resumable
  // (per-window analysis cached on disk) and idempotent (FalkorDB MERGE), so
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
