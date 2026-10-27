/**
 * Smoke test for the ffmpeg pipeline (P2) — no OpenAI / DB needed.
 * Usage: npx tsx scripts/smoke-ffmpeg.ts /path/to/video.mp4
 */
import path from "node:path";
import fs from "node:fs/promises";
import { probeVideo, ensureNormalized } from "../src/pipeline/ffmpeg.js";
import { detectSceneCuts, buildWindows } from "../src/pipeline/sceneDetect.js";
import { sampleWindowFrames } from "../src/pipeline/frameSampler.js";
import { config } from "../src/config.js";

async function main() {
  const file = path.resolve(process.argv[2] ?? "/tmp/vktest.mp4");
  const outDir = path.join(config.dataDir, "_smoke");
  await fs.mkdir(outDir, { recursive: true });

  const meta = await probeVideo(file);
  console.log("probe:", meta);

  const normalized = await ensureNormalized(file, meta, outDir);
  console.log("normalized:", normalized);

  const cuts = await detectSceneCuts(normalized, config.sceneThreshold);
  console.log("scene cuts:", cuts);

  const windows = buildWindows(cuts, meta.durationSec);
  console.log("windows:", windows);

  let totalFrames = 0;
  for (const w of windows) {
    const frames = await sampleWindowFrames(normalized, w, path.join(outDir, "frames"));
    totalFrames += frames.length;
    console.log(
      `  window ${w.index} [${w.startSec.toFixed(2)}-${w.endSec.toFixed(2)}]: ${frames.length} frames ->`,
      frames.map((f) => `${f.id}@${f.ptsSec}`).join(", "),
    );
  }
  console.log(`TOTAL frames sampled: ${totalFrames}`);
  console.log("SMOKE OK ✓");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
