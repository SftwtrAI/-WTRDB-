import Redis from "ioredis";
import { config } from "./config.js";

/**
 * FalkorDB client. Issues `GRAPH.QUERY <name> <cypher> --compact` against the
 * SAME FalkorDB instance and graph names (kg_{userId}_{kbId}) as wtrdb-v2, so
 * image graphs are visible/queryable through v2's existing UI.
 *
 * Unlike v2's own writer (which inlines values into the Cypher text), this
 * service passes ALL model-generated values as FalkorDB CYPHER parameters via
 * `toCypherLiteral` — including list/map params for UNWIND-based fragment
 * writes — so the graph writer is parameterized end to end (GRAPH_DB_SPEC §7.2).
 */

export interface FalkorDBResult {
  records: Record<string, any>[];
  metadata: {
    nodesCreated?: number;
    relationshipsCreated?: number;
    executionTimeMs: number;
  };
}

/** Convention shared with v2: leaf graph name is kg_{userId}_{knowledgeBaseId}. */
export function getGraphName(userId: string, knowledgeBaseId: string): string {
  return `kg_${userId}_${knowledgeBaseId}`;
}

/** Escape a string for a single-quoted Cypher string literal. */
function escapeSingleQuoted(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function sanitizeMapKey(k: string): string {
  return k.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[0-9]/, "_$&") || "_";
}

/**
 * Encode a JS value as a Cypher literal for use in a CYPHER parameter value.
 * Strings are single-quoted + escaped; numbers/booleans/null verbatim; arrays
 * and objects recurse into `[...]` / `{key:literal}` — so a value NEVER reaches
 * the query as interpolated text and cannot inject Cypher.
 */
export function toCypherLiteral(v: any): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return `'${escapeSingleQuoted(v)}'`;
  if (Array.isArray(v)) return `[${v.map(toCypherLiteral).join(",")}]`;
  if (typeof v === "object") {
    const parts: string[] = [];
    for (const [k, val] of Object.entries(v)) {
      parts.push(`${sanitizeMapKey(k)}:${toCypherLiteral(val)}`);
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}

function serializeParams(params: Record<string, any>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${toCypherLiteral(value)}`)
    .join(" ");
}

function unwrapCompactValue(val: any): any {
  if (!Array.isArray(val)) return val ?? null;
  if (val.length !== 2 || typeof val[0] !== "number") return val;
  const [type, payload] = val;
  switch (type) {
    case 1:
      return null;
    case 2:
    case 3:
    case 4:
    case 5:
      return payload;
    case 6:
      return Array.isArray(payload) ? payload.map(unwrapCompactValue) : payload;
    default:
      return payload;
  }
}

function parseResponse(raw: any): FalkorDBResult {
  const metadata: FalkorDBResult["metadata"] = { executionTimeMs: 0 };
  const records: Record<string, any>[] = [];
  if (!Array.isArray(raw)) return { records, metadata };

  let metaBlock: string[] = [];
  let headers: any[] = [];
  let rows: any[][] = [];

  if (raw.length === 1) {
    metaBlock = Array.isArray(raw[0]) ? raw[0] : [];
  } else if (raw.length >= 3) {
    headers = raw[0] || [];
    rows = raw[1] || [];
    metaBlock = raw[2] || [];
  } else if (raw.length === 2) {
    if (
      Array.isArray(raw[0]) &&
      raw[0].length > 0 &&
      typeof raw[0][0] === "string" &&
      Array.isArray(raw[1]) &&
      raw[1].length > 0 &&
      typeof raw[1][0] === "string"
    ) {
      headers = raw[0];
      metaBlock = raw[1];
    } else {
      headers = raw[0] || [];
      metaBlock = raw[1] || [];
    }
  }

  for (const entry of metaBlock) {
    if (typeof entry !== "string") continue;
    const lower = entry.toLowerCase();
    if (lower.includes("nodes created")) {
      const m = entry.match(/(\d+)/);
      if (m) metadata.nodesCreated = parseInt(m[1], 10);
    } else if (lower.includes("relationships created")) {
      const m = entry.match(/(\d+)/);
      if (m) metadata.relationshipsCreated = parseInt(m[1], 10);
    } else if (lower.includes("internal execution time")) {
      const m = entry.match(/([\d.]+)/);
      if (m) metadata.executionTimeMs = parseFloat(m[1]);
    }
  }

  const normalizedHeaders: string[] = headers.map((h) =>
    Array.isArray(h) ? String(h[h.length - 1]) : String(h),
  );

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const record: Record<string, any> = {};
    for (let i = 0; i < normalizedHeaders.length; i++) {
      record[normalizedHeaders[i]] = unwrapCompactValue(row[i]);
    }
    records.push(record);
  }

  return { records, metadata };
}

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.falkordbUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }
  return redis;
}

export async function falkorQuery(
  graphName: string,
  cypher: string,
  params?: Record<string, any>,
): Promise<FalkorDBResult> {
  const r = getRedis();
  let fullQuery: string;
  if (params && Object.keys(params).length > 0) {
    fullQuery = `CYPHER ${serializeParams(params)} ${cypher}`;
  } else {
    fullQuery = cypher;
  }
  const raw = await (r as any).call(
    "GRAPH.QUERY",
    graphName,
    fullQuery,
    "--compact",
  );
  return parseResponse(raw);
}

export async function falkorHealthCheck(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export async function closeFalkor(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
