/**
 * Cypher string helpers — copied VERBATIM from version-2.0's
 * apps/server/src/services/knowledge-graph-extraction.ts so that graphs this
 * service writes are byte-compatible with graphs v2 writes itself. Do not
 * "improve" these without checking the originals.
 */

/** Escape a string for safe use inside a Cypher double-quoted string. */
export function escapeCypherString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Sanitize a property key to be a valid Cypher identifier.
 * Removes characters that aren't alphanumeric or underscore.
 */
export function sanitizePropertyKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

/**
 * Sanitize a relationship type to be a valid Cypher relationship type.
 * Must be uppercase alphanumeric with underscores.
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
 * Sanitize a node label to a valid Cypher label (PascalCase-ish; alnum only).
 * v2 uses label values like "Person"/"Event" directly in MERGE (n:Label ...),
 * so any label we write must be a bare identifier.
 */
export function sanitizeLabel(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9_]/g, "").replace(/^[0-9]/, "_$&");
  return cleaned || "Concept";
}

/**
 * v2's escapeCypherString does NOT handle newlines/control chars, and node
 * `name` values are used in single-line MERGE statements. Collapse whitespace
 * so generated Cypher never breaks across lines.
 */
export function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
