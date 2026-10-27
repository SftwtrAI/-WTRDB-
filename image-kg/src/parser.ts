import { extractionZod, type RawExtraction } from "./vision/schema.js";

/** Raised when model output cannot be parsed into a schema-shaped fragment. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Defensive strip (EXTRACTION_SPEC §6.2): remove code fences and any leading /
 * trailing prose so a stray wrapper doesn't defeat JSON.parse. Only ever removes
 * noise — never invents or alters values.
 */
export function stripToJson(s: string): string {
  let t = s.trim();
  // strip ``` or ```json fences
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // if wrapped in prose, keep the outermost {...}
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i >= 0 && j > i) t = t.slice(i, j + 1);
  return t;
}

/** Remove trailing commas — a common recoverable malformation. */
export function repairJson(s: string): string {
  return s.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Parse raw model content into a schema-validated RawExtraction, applying cheap
 * deterministic repairs. Throws ParseError if nothing parses.
 */
export function parseExtraction(content: string): RawExtraction {
  const stripped = stripToJson(content);
  const candidates = [content, stripped, repairJson(stripped)];
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      return extractionZod.parse(obj);
    } catch {
      /* try next candidate */
    }
  }
  throw new ParseError("unparseable or schema-violating extraction JSON");
}
