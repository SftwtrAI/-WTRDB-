import { run } from "./exec.js";
import type { Window } from "../types.js";
import { createLogger } from "../logger.js";

const log = createLogger("scene");

/** Max length of a temporal window (long shots get split for vision batching). */
export const WINDOW_MAX_SEC = 15;

/**
 * Spec step 3: detect scene/shot boundaries. PySceneDetect replacement using
 * ffmpeg's scene filter + showinfo; we parse pts_time of detected cuts from
 * stderr. Returns sorted cut timestamps (seconds).
 */
export async function detectSceneCuts(
  file: string,
  threshold: number,
): Promise<number[]> {
  const { stderr } = await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      file,
      "-filter:v",
      `select='gt(scene,${threshold})',showinfo`,
      "-an",
      "-f",
      "null",
      "-",
    ],
    { allowNonZero: true },
  );
  const cuts: number[] = [];
  const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const t = parseFloat(m[1]);
    if (Number.isFinite(t)) cuts.push(t);
  }
  const sorted = Array.from(new Set(cuts)).sort((a, b) => a - b);
  log.info(`Detected ${sorted.length} scene cut(s)`);
  return sorted;
}

/**
 * Turn scene cuts + total duration into bounded temporal windows. Shots longer
 * than WINDOW_MAX_SEC are split into roughly-equal sub-windows so each window
 * yields a manageable number of frames for one vision call.
 */
export function buildWindows(
  cuts: number[],
  durationSec: number,
  maxWindowSec = WINDOW_MAX_SEC,
): Window[] {
  const bounds = [0, ...cuts.filter((c) => c > 0 && c < durationSec), durationSec];
  const uniq = Array.from(new Set(bounds)).sort((a, b) => a - b);

  const windows: Window[] = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    const start = uniq[i];
    const end = uniq[i + 1];
    const dur = end - start;
    if (dur <= 0.05) continue;
    if (dur <= maxWindowSec) {
      windows.push({ index: windows.length, startSec: start, endSec: end });
    } else {
      const parts = Math.ceil(dur / maxWindowSec);
      const step = dur / parts;
      for (let p = 0; p < parts; p++) {
        windows.push({
          index: windows.length,
          startSec: start + p * step,
          endSec: p === parts - 1 ? end : start + (p + 1) * step,
        });
      }
    }
  }
  // Guarantee at least one window for very short clips.
  if (windows.length === 0 && durationSec > 0) {
    windows.push({ index: 0, startSec: 0, endSec: durationSec });
  }
  return windows;
}
