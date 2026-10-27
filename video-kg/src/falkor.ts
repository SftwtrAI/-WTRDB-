import Redis from "ioredis";
import { config } from "./config.js";

/**
 * FalkorDB client — the query()/serializeParams()/parseResponse() internals are
 * copied from version-2.0's apps/server/src/infrastructure/falkordb/client.ts
 * so this service issues byte-identical GRAPH.QUERY ... --compact commands
 * against the SAME FalkorDB instance and graph names (kg_{userId}_{kbId}).
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

function serializeParams(params: Record<string, any>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      parts.push(`${key}="${escaped}"`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    } else if (value === null || value === undefined) {
      parts.push(`${key}=NULL`);
    } else {
      const escaped = JSON.stringify(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
      parts.push(`${key}="${escaped}"`);
    }
  }
  return parts.join(" ");
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
