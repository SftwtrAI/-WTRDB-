import type { RawExtraction } from "./vision/schema.js";

/**
 * Shape + provenance-completeness validation (EXTRACTION_SPEC §5.2). Never
 * checks category/name/type against any vocabulary — only structure. Returns a
 * list of human-readable error strings (empty ⇒ valid) suitable for a corrective
 * re-prompt.
 */
export function validateExtraction(raw: RawExtraction): string[] {
  const errors: string[] = [];
  const refs = new Set<string>();

  raw.objects.forEach((o, i) => {
    if (!o.local_ref || !o.local_ref.trim()) {
      errors.push(`object[${i}] missing local_ref`);
    } else if (refs.has(o.local_ref)) {
      errors.push(`object[${i}] duplicate local_ref '${o.local_ref}'`);
    } else {
      refs.add(o.local_ref);
    }
    if (!o.category || !o.category.trim()) errors.push(`object[${i}] missing category`);
    if (!o.name || !o.name.trim()) errors.push(`object[${i}] missing name`);
    if (!(typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1)) {
      errors.push(`object[${i}] confidence ${o.confidence} not in [0,1]`);
    }
    if (o.bbox && o.bbox.length !== 4) {
      errors.push(`object[${i}] bbox must have 4 numbers`);
    }
  });

  raw.relationships.forEach((r, i) => {
    if (!r.type || !r.type.trim()) errors.push(`relationship[${i}] missing type`);
    if (!(typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1)) {
      errors.push(`relationship[${i}] confidence ${r.confidence} not in [0,1]`);
    }
    if (!refs.has(r.source_ref)) {
      errors.push(
        `relationship[${i}].source_ref '${r.source_ref}' does not match any object`,
      );
    }
    if (!refs.has(r.target_ref)) {
      errors.push(
        `relationship[${i}].target_ref '${r.target_ref}' does not match any object`,
      );
    }
  });

  return errors;
}
