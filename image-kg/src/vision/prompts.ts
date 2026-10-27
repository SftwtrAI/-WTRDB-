import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

/**
 * The versioned image-extraction prompt (EXTRACTION_SPEC §4/§8). Loaded from the
 * on-disk artifact so the prompt text lives in one place (prompts/) and its
 * version is recorded as provenance on every fact.
 */
export const IMAGE_PROMPT_VERSION = config.promptVersion; // "p1"

const promptPath = fileURLToPath(
  new URL("../../prompts/extraction_p1.txt", import.meta.url),
);

export const EXTRACTION_SYSTEM_PROMPT = fs.readFileSync(promptPath, "utf8");

export function buildUserText(): string {
  return "Analyze this single image. Return the extraction JSON with objects and relationships, following the schema exactly.";
}
