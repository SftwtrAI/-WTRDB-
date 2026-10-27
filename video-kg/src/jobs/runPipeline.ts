import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { getJob, updateJob } from "./jobStore.js";
import { probeVideo, ensureNormalized } from "../pipeline/ffmpeg.js";
import { detectSceneCuts, buildWindows } from "../pipeline/sceneDetect.js";
import { sampleWindowFrames } from "../pipeline/frameSampler.js";
import { analyzeWindow } from "../vision/visionClient.js";
import { createGraphAccumulator, saveGraph } from "../graph/graphBuilder.js";
import { writeGraphToFalkor } from "../graph/falkorWriter.js";
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
import type { Job, Window, WindowAnalysis } from "../types.js";

const log = createLogger("pipeline");

function videoPaths(videoId: string) {
  const dir = path.join(config.uploadsDir, videoId);
  return {
    dir,
    framesDir: path.join(dir, "frames"),
    analysesDir: path.join(dir, "analyses"),
    logsDir: path.join(dir, "vision-logs"),
    graphPath: path.join(dir, "graph.json"),
  };
}

async function loadAnalysis(
  analysesDir: string,
  index: number,
): Promise<WindowAnalysis | null> {
  try {
    const raw = await fs.readFile(
      path.join(analysesDir, `win_${index}.json`),
      "utf8",
    );
    return JSON.parse(raw) as WindowAnalysis;
  } catch {
    return null;
  }
}

/**
 * Run the full pipeline for a job, resumable at window granularity. Safe to call
 * again after a crash: completed stages (normalize, per-window vision) are
 * skipped using artifacts on disk.
 */
export async function runPipeline(jobId: string): Promise<void> {
  let job = await getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  const p = videoPaths(job.videoId);

  try {
    const sourcePath = job.artifacts.sourcePath;
    if (!sourcePath) throw new Error("job has no sourcePath");

    // 1. Probe
    await updateJob(jobId, { status: "probing", progress: 5 });
    const meta = job.artifacts.meta ?? (await probeVideo(sourcePath));
    await updateJob(jobId, { artifacts: { meta } });
    log.info(
      `probe: ${meta.durationSec.toFixed(1)}s, ${meta.width}x${meta.height}, ${meta.codec}, ${(meta.sizeBytes / 1e6).toFixed(1)}MB`,
    );

    // 2. Normalize (skips re-encode when already H264 mp4/mov)
    await updateJob(jobId, { status: "normalizing", progress: 12 });
    const normalizedPath =
      job.artifacts.normalizedPath ??
      (await ensureNormalized(sourcePath, meta, p.dir));
    await updateJob(jobId, { artifacts: { normalizedPath } });

    // 3. Scene detect → windows
    await updateJob(jobId, { status: "scene_detect", progress: 18 });
    let windows: Window[];
    if (job.artifacts.windows && job.artifacts.windows.length) {
      windows = job.artifacts.windows;
    } else {
      const cuts = await detectSceneCuts(normalizedPath, config.sceneThreshold);
      windows = buildWindows(cuts, meta.durationSec);
      if (config.maxAnalyzeSeconds > 0) {
        windows = windows.filter((w) => w.startSec < config.maxAnalyzeSeconds);
      }
      await updateJob(jobId, { artifacts: { windows } });
    }
    log.info(`windows: ${windows.length}`);

    // Create the v2 rows EARLY (status "extracting", empty FalkorDB graph) so the
    // browser's live view attaches immediately and we can stream node-by-node as
    // each window is analyzed. FalkorDB stays empty until the final persist so
    // v2's /summary self-heal doesn't flip the view to "completed" mid-reveal.
    await beginKnowledgeBaseRows({
      kbId: job.kbId,
      userId: job.userId,
      title: job.title,
      sizeBytes: meta.sizeBytes,
      durationSec: meta.durationSec,
      videoId: job.videoId,
    });

    // 4+5+6. Per-window sample + vision + incremental reconcile (resumable).
    // Each window is folded into the accumulator as soon as it's analyzed, and
    // its NEW nodes/edges are streamed to the live view right away.
    await updateJob(jobId, { status: "sampling", progress: 22 });
    await fs.mkdir(p.analysesDir, { recursive: true });
    const acc = createGraphAccumulator();
    const done = new Set(job.artifacts.analyzedWindowIndexes ?? []);

    for (const w of windows) {
      let analysis = done.has(w.index)
        ? await loadAnalysis(p.analysesDir, w.index)
        : null;
      if (!analysis) {
        await updateJob(jobId, { status: "vision" });
        const frames = await sampleWindowFrames(normalizedPath, w, p.framesDir);
        analysis = await analyzeWindow(w, frames, p.logsDir);
        await fs.writeFile(
          path.join(p.analysesDir, `win_${w.index}.json`),
          JSON.stringify(analysis, null, 2),
          "utf8",
        );
        done.add(w.index);
        const progress =
          22 + Math.round((done.size / Math.max(1, windows.length)) * 60);
        await updateJob(jobId, {
          progress,
          artifacts: { analyzedWindowIndexes: [...done] },
        });
      }
      // Fold this window in and stream just its newly-discovered nodes/edges.
      const delta = await acc.addWindow(analysis);
      await streamLiveDelta(job.kbId, job.userId, delta);
    }

    // 7. Assemble the final graph + save the artifact.
    await updateJob(jobId, { status: "graph_build", progress: 86 });
    const graph = acc.getGraph();
    await saveGraph(graph, p.graphPath);
    await updateJob(jobId, { artifacts: { graphPath: p.graphPath } });

    // 8. Persist to FalkorDB + finalize the Postgres rows (status "completed").
    await updateJob(jobId, { status: "injecting", progress: 92 });
    const { entityCount, relationshipCount, entityTypes } =
      await writeGraphToFalkor(job.userId, job.kbId, graph);
    await injectKnowledgeBaseRows({
      kbId: job.kbId,
      userId: job.userId,
      title: job.title,
      sizeBytes: meta.sizeBytes,
      durationSec: meta.durationSec,
      videoId: job.videoId,
      entityCount,
      relationshipCount,
      entityTypes,
    });
    await emitLiveComplete(
      job.kbId,
      job.userId,
      entityCount,
      relationshipCount,
      windows.length,
    );

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      error: null,
      artifacts: { entityCount, relationshipCount },
    });
    log.info(`job ${jobId} completed: kb ${job.kbId}`);
  } catch (err: any) {
    log.error(`job ${jobId} failed: ${err.message}`);
    await updateJob(jobId, { status: "failed", error: err.message });
    // Surface the failure in the live view (best-effort) so it stops spinning.
    await failKnowledgeGraph(job.kbId);
    await emitLiveError(job.kbId, job.userId, err.message);
    throw err;
  }
}
