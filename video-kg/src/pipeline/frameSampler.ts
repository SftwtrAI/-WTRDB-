import fs from "node:fs/promises";
import path from "node:path";
import { run } from "./exec.js";
import { config } from "../config.js";
import type { SampledFrame, Window } from "../types.js";

/**
 * Spec step 4: sample frames for a window. We pick an effective FPS that spreads
 * at most MAX_FRAMES_PER_WINDOW frames across the window, downscale to
 * FRAME_MAX_DIM on the long edge, and record each frame's real pts (seconds).
 */
export async function sampleWindowFrames(
  file: string,
  window: Window,
  outDir: string,
): Promise<SampledFrame[]> {
  await fs.mkdir(outDir, { recursive: true });
  const dur = Math.max(0.001, window.endSec - window.startSec);

  // Effective fps so frame count <= maxFramesPerWindow.
  const effFps = Math.min(config.sampleFps, config.maxFramesPerWindow / dur);
  const fps = Math.max(0.05, effFps);

  const pattern = path.join(outDir, `w${window.index}_f%05d.jpg`);
  await run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-ss",
    String(window.startSec),
    "-i",
    file,
    "-t",
    String(dur),
    "-vf",
    `fps=${fps},scale='min(${config.frameMaxDim},iw)':-2`,
    "-frames:v",
    String(config.maxFramesPerWindow),
    "-q:v",
    "3",
    pattern,
  ]);

  // Collect produced files and assign timestamps.
  const files = (await fs.readdir(outDir))
    .filter((f) => f.startsWith(`w${window.index}_f`) && f.endsWith(".jpg"))
    .sort();

  const frames: SampledFrame[] = files.map((f, i) => {
    const ptsSec = Math.min(window.endSec, window.startSec + i / fps);
    return {
      id: f.replace(/\.jpg$/, ""),
      path: path.join(outDir, f),
      ptsSec: Number(ptsSec.toFixed(3)),
      windowIndex: window.index,
    };
  });
  return frames;
}
