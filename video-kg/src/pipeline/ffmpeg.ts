import fs from "node:fs/promises";
import path from "node:path";
import { run } from "./exec.js";
import { config } from "../config.js";
import type { VideoMeta } from "../types.js";
import { createLogger } from "../logger.js";

const log = createLogger("ffmpeg");

export async function probeVideo(file: string): Promise<VideoMeta> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const data = JSON.parse(stdout);
  const v = (data.streams || []).find((s: any) => s.codec_type === "video");
  if (!v) throw new Error("No video stream found");

  // r_frame_rate like "30000/1001"
  let fps = 25;
  if (typeof v.r_frame_rate === "string" && v.r_frame_rate.includes("/")) {
    const [a, b] = v.r_frame_rate.split("/").map(Number);
    if (b) fps = a / b;
  }
  const durationSec = Number(
    data.format?.duration ?? v.duration ?? 0,
  );
  const sizeBytes = Number(data.format?.size ?? 0);
  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 25,
    width: Number(v.width ?? 0),
    height: Number(v.height ?? 0),
    codec: String(v.codec_name ?? "unknown"),
    sizeBytes,
  };
}

/**
 * Spec step 2: normalize to H264 MP4. We skip a costly re-encode when the
 * source is already H264 in an mp4/mov container (just reuse it); otherwise we
 * transcode using VideoToolbox HW accel on Apple Silicon (falls back to libx264
 * when FFMPEG_FORCE_CPU=1, e.g. inside Docker).
 */
export async function ensureNormalized(
  file: string,
  meta: VideoMeta,
  outDir: string,
): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  const alreadyOk =
    meta.codec === "h264" && [".mp4", ".mov", ".m4v"].includes(ext);
  if (alreadyOk) {
    log.info(`Source already H264/${ext}; skipping re-encode`);
    return file;
  }
  await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, "normalized.mp4");
  const vcodec = config.ffmpegForceCpu
    ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
    : ["-c:v", "h264_videotoolbox", "-b:v", "5M"];
  log.info(`Normalizing → ${out} (${config.ffmpegForceCpu ? "libx264" : "videotoolbox"})`);
  await run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-i",
    file,
    ...vcodec,
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    out,
  ]);
  return out;
}

/** Extract a single JPEG frame at a timestamp (used for ad-hoc evidence). */
export async function extractFrameAt(
  file: string,
  ptsSec: number,
  outPath: string,
  maxDim = config.frameMaxDim,
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-ss",
    String(ptsSec),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `scale='min(${maxDim},iw)':-2`,
    "-q:v",
    "3",
    outPath,
  ]);
}
