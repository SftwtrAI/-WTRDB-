import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("preprocess");

export interface PreparedImage {
  /** Content id: img_<sha256-of-raw-bytes>. Identity of the image; the Image
   *  node id and the source_image_id stamped on every fact. */
  sourceImageId: string;
  hash: string; // bare sha256 hex
  preparedPath: string; // normalized jpeg fed to vision
  width: number;
  height: number;
  sizeBytes: number; // size of the RAW upload (identity)
  mime: string;
}

/**
 * Preprocess a single image (SYSTEM_DESIGN §3 Preprocessing): compute the
 * content hash (identity), auto-orient + strip EXIF, resize to a max dimension,
 * and re-encode to jpeg for the vision call. The hash is taken over the RAW
 * uploaded bytes so an identical re-upload yields the same id (idempotency).
 */
export async function preprocessImage(
  sourcePath: string,
  workDir: string,
): Promise<PreparedImage> {
  const raw = await fs.readFile(sourcePath);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const sourceImageId = `img_${hash}`;

  await fs.mkdir(workDir, { recursive: true });
  const preparedPath = path.join(workDir, "prepared.jpg");

  // sharp strips metadata (incl. EXIF) by default; .rotate() bakes in EXIF
  // orientation first so the pixels are upright. failOn:"none" tolerates minor
  // corruption rather than throwing on odd-but-viewable images.
  const out = await sharp(raw, { failOn: "none" })
    .rotate()
    .resize({
      width: config.imageMaxDim,
      height: config.imageMaxDim,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  await fs.writeFile(preparedPath, out.data);

  const prepared: PreparedImage = {
    sourceImageId,
    hash,
    preparedPath,
    width: out.info.width,
    height: out.info.height,
    sizeBytes: raw.length,
    mime: "image/jpeg",
  };
  log.info(
    `prepared ${sourceImageId} → ${prepared.width}x${prepared.height}, ${(raw.length / 1024).toFixed(0)}KB source`,
  );
  return prepared;
}
