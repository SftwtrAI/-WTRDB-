/**
 * Cypher identifier/token helpers. Labels and relationship types are the ONLY
 * model-generated strings that reach Cypher as identifiers (never as string
 * values), so they are whitelisted to a bare identifier here. Every other
 * model value is passed as a CYPHER parameter (see falkor.ts `toCypherLiteral`).
 */

/**
 * Sanitize a property/map key to a valid Cypher identifier.
 * Alphanumeric + underscore only; never leads with a digit.
 */
export function sanitizePropertyKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

/**
 * Sanitize a relationship type to a valid Cypher relationship type:
 * UPPER_SNAKE, alphanumeric + underscore, never empty.
 */
export function sanitizeRelType(type: string): string {
  return (
    type
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^[0-9]/, "_$&")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "RELATED_TO"
  );
}

/**
 * Sanitize a model-chosen category into a valid Cypher node label (used bare in
 * `MERGE (n:Label ...)`). Alphanumeric + underscore only; never empty.
 * The model is told to Capitalize categories; we preserve its casing but strip
 * anything that isn't identifier-safe.
 */
export function sanitizeLabel(label: string): string {
  const cleaned = label
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^[0-9]/, "_$&");
  return cleaned || "Concept";
}

/** Lowercase, identifier-safe token used as the id namespace prefix for a label. */
export function labelIdPrefix(label: string): string {
  return sanitizeLabel(label).toLowerCase() || "concept";
}
