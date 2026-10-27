import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { callVision } from "./vision/visionClient.js";
import { parseExtraction, ParseError } from "./parser.js";
import { validateExtraction } from "./validator.js";
import type { RawExtraction } from "./vision/schema.js";

const log = createLogger("extract");

export interface ValidatedObject {
  local_ref: string;
  category: string;
  name: string;
  properties: Record<string, string>;
  confidence: number;
  bbox: number[] | null;
}
export interface ValidatedRelationship {
  source_ref: string;
  target_ref: string;
  type: string;
  confidence: number;
}
export interface ValidatedExtraction {
  objects: ValidatedObject[];
  relationships: ValidatedRelationship[];
}

/** Raised when output is still invalid after the one corrective re-prompt. */
export class ModelOutputInvalid extends Error {
  detail: string[];
  constructor(errors: string[]) {
    super(`model_output_invalid: ${errors.join("; ")}`);
    this.name = "ModelOutputInvalid";
    this.detail = errors;
  }
}

function propsToMap(pairs: { key: string; value: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of pairs) {
    const k = (p.key ?? "").trim();
    if (k) m[k] = String(p.value ?? "").trim();
  }
  return m;
}

/**
 * Confidence-filter (EXTRACTION_SPEC §7.2) and normalize a validated raw
 * extraction: drop objects/relationships below MIN_CONFIDENCE, drop
 * relationships whose endpoints were dropped, and fold property pairs into maps.
 */
function finalize(raw: RawExtraction): ValidatedExtraction {
  const kept = raw.objects.filter((o) => o.confidence >= config.minConfidence);
  const keptRefs = new Set(kept.map((o) => o.local_ref));
  const objects: ValidatedObject[] = kept.map((o) => ({
    local_ref: o.local_ref,
    category: o.category.trim(),
    name: o.name.trim(),
    properties: propsToMap(o.properties),
    confidence: o.confidence,
    bbox: o.bbox ?? null,
  }));
  const relationships: ValidatedRelationship[] = raw.relationships
    .filter(
      (r) =>
        r.confidence >= config.minConfidence &&
        keptRefs.has(r.source_ref) &&
        keptRefs.has(r.target_ref),
    )
    .map((r) => ({
      source_ref: r.source_ref,
      target_ref: r.target_ref,
      type: r.type.trim(),
      confidence: r.confidence,
    }));
  return { objects, relationships };
}

function buildCorrection(errors: string[]): string {
  return (
    `Your previous response was invalid: ${errors.join("; ")}. ` +
    `Re-examine the image and return corrected JSON that fixes exactly these problems. ` +
    `Output valid JSON only — no prose, no code fences — matching the extraction schema exactly.`
  );
}

/**
 * Full extraction with repair + one corrective re-prompt (EXTRACTION_SPEC §6):
 * vision → parse → validate. If invalid, re-prompt once naming the errors, then
 * fail with ModelOutputInvalid (nothing is written). Returns the validated,
 * confidence-filtered extraction.
 */
export async function extractGraph(preparedPath: string): Promise<ValidatedExtraction> {
  const content = await callVision(preparedPath);

  let raw: RawExtraction | null = null;
  let errors: string[] = [];
  try {
    raw = parseExtraction(content);
    errors = validateExtraction(raw);
  } catch (e) {
    errors = [e instanceof ParseError ? e.message : String((e as Error).message)];
  }
  if (raw && errors.length === 0) {
    log.info(`extraction ok: ${raw.objects.length} objects, ${raw.relationships.length} relationships`);
    return finalize(raw);
  }

  // One corrective re-prompt, naming the specific problems.
  log.warn(`extraction invalid (${errors.length} issue(s)); re-prompting once`);
  const content2 = await callVision(preparedPath, buildCorrection(errors));
  let raw2: RawExtraction;
  try {
    raw2 = parseExtraction(content2);
  } catch (e) {
    throw new ModelOutputInvalid([
      e instanceof ParseError ? e.message : String((e as Error).message),
    ]);
  }
  const errors2 = validateExtraction(raw2);
  if (errors2.length) throw new ModelOutputInvalid(errors2);

  log.info(`extraction ok after re-prompt: ${raw2.objects.length} objects, ${raw2.relationships.length} relationships`);
  return finalize(raw2);
}
