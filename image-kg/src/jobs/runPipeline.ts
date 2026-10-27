import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { getJob, updateJob } from "./jobStore.js";
import { preprocessImage, type PreparedImage } from "../preprocess.js";
import { extractGraph, type ValidatedExtraction } from "../extract.js";
import {
  buildFragment,
  fragmentToDelta,
  type Provenance,
} from "../graph/graphBuilder.js";
import { writeFragment } from "../graph/falkorWriter.js";
import {
  beginKnowledgeBaseRows,
  injectKnowledgeBaseRows,
  failKnowledgeGraph,
} from "../graph/v2Inject.js";
import {
  streamLiveDelta,
  emitLiveComplete,
  emitLiveError,
} from "../graph/liveStream.js";

const log = createLogger("pipeline");

function imagePaths(imageId: string) {
  const dir = path.join(config.uploadsDir, imageId);
  return {
    dir,
    extractionPath: path.join(dir, "extraction.json"),
    fragmentPath: path.join(dir, "fragment.json"),
  };
}

async function loadJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Run the Wtr.Vision-KG pipeline for one image job (SYSTEM_DESIGN §4 state
 * machine). Resumable: preprocessing + the validated extraction are cached on
 * disk, and the graph write is idempotent (MERGE + deterministic ids), so
 * re-running a non-terminal job after a crash is safe.
 */
export async function runPipeline(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  const p = imagePaths(job.imageId);

  try {
    const sourcePath = job.artifacts.sourcePath;
    if (!sourcePath) throw new Error("job has no sourcePath");

    // 1. Preprocess (hash → imageId, normalize, resize). Resumable.
    await updateJob(jobId, { status: "preprocessing", progress: 15 });
    let prepared: PreparedImage;
    if (job.artifacts.imageId && job.artifacts.preparedPath) {
      prepared = {
        sourceImageId: job.artifacts.imageId,
        hash: job.artifacts.imageId.replace(/^img_/, ""),
        preparedPath: job.artifacts.preparedPath,
        width: job.artifacts.width ?? 0,
        height: job.artifacts.height ?? 0,
        sizeBytes: job.artifacts.sizeBytes ?? 0,
        mime: job.artifacts.mime ?? "image/jpeg",
      };
    } else {
      prepared = await preprocessImage(sourcePath, p.dir);
      await updateJob(jobId, {
        artifacts: {
          imageId: prepared.sourceImageId,
          preparedPath: prepared.preparedPath,
          width: prepared.width,
          height: prepared.height,
          sizeBytes: prepared.sizeBytes,
          mime: prepared.mime,
        },
      });
    }

    // 2. Create v2 rows EARLY (status "extracting", empty FalkorDB graph) so the
    //    browser's live view attaches and we can stream node-by-node.
    await beginKnowledgeBaseRows({
      kbId: job.kbId,
      userId: job.userId,
      title: job.title,
      sizeBytes: prepared.sizeBytes,
      imageId: job.imageId,
    });

    // 3. Extract (vision → parse → validate → one corrective re-prompt). Cached.
    await updateJob(jobId, { status: "extracting", progress: 35 });
    let extraction = await loadJson<ValidatedExtraction>(p.extractionPath);
    if (!extraction) {
      extraction = await extractGraph(prepared.preparedPath);
      await fs.writeFile(p.extractionPath, JSON.stringify(extraction, null, 2), "utf8");
    }
    await updateJob(jobId, { artifacts: { extractionPath: p.extractionPath }, progress: 60 });

    // 4. Build the deterministic fragment (content-hash ids + provenance).
    await updateJob(jobId, { status: "validating", progress: 70 });
    const provenance: Provenance = {
      model_name: config.visionModel,
      model_version: config.visionModel, // concrete version not returned; use configured id
      extraction_version: config.extractionVersion,
      prompt_version: config.promptVersion,
      created_at: new Date().toISOString(),
    };
    const fragment = buildFragment(extraction, prepared, provenance);
    await fs.writeFile(p.fragmentPath, JSON.stringify(fragment, null, 2), "utf8");
    await updateJob(jobId, { artifacts: { fragmentPath: p.fragmentPath } });

    // 5. Stream the graph to the live view (Image + nodes, then edges).
    await streamLiveDelta(job.kbId, job.userId, fragmentToDelta(fragment));

    // 6. Persist to FalkorDB (single atomic parameterized write).
    await updateJob(jobId, { status: "writing", progress: 85 });
    const { entityCount, relationshipCount, entityTypes } = await writeFragment(
      job.userId,
      job.kbId,
      fragment,
    );

    // 7. Finalize the Postgres rows (status "completed") + signal the live view.
    await injectKnowledgeBaseRows({
      kbId: job.kbId,
      userId: job.userId,
      title: job.title,
      sizeBytes: prepared.sizeBytes,
      imageId: job.imageId,
      entityCount,
      relationshipCount,
      entityTypes,
    });
    await emitLiveComplete(job.kbId, job.userId, entityCount, relationshipCount, 1);

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      error: null,
      artifacts: { entityCount, relationshipCount },
    });
    log.info(`job ${jobId} completed: kb ${job.kbId} (${entityCount} nodes, ${relationshipCount} edges)`);
  } catch (err: any) {
    // Make a quota/rate/auth failure legible: an upload that stops here should
    // say WHY, not look like it silently did nothing.
    const status = err?.status ?? err?.response?.status;
    const code = err?.code ?? err?.error?.code;
    const llmDown =
      status === 429 ||
      status === 401 ||
      code === "insufficient_quota" ||
      /quota|rate limit|insufficient_quota/i.test(String(err?.message ?? ""));
    const reason = llmDown
      ? `OpenAI quota/rate limit or auth error during extraction — image not captured. (${err.message})`
      : err.message;
    log.error(`job ${jobId} failed: ${reason}`);
    await updateJob(jobId, { status: "failed", error: reason });
    await failKnowledgeGraph(job.kbId);
    await emitLiveError(job.kbId, job.userId, reason);
    throw err;
  }
}
