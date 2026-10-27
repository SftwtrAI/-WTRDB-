"use strict";

/**
 * FalkorDB Typed Client (Contract A)
 *
 * Provides a typed wrapper around FalkorDB's Redis-protocol GRAPH.* commands.
 * All Cypher queries are executed via the GRAPH.QUERY command on a named graph.
 */

import type Redis from "ioredis";

// ── Contract A: Public interfaces ──

export interface FalkorDBResult {
  records: Record<string, any>[];
  metadata: {
    nodesCreated?: number;
    relationshipsCreated?: number;
    executionTimeMs: number;
  };
}

export interface FalkorDBClient {
  query(
    graphName: string,
    cypher: string,
    params?: Record<string, any>,
  ): Promise<FalkorDBResult>;
  healthCheck(): Promise<{ healthy: boolean; message: string }>;
}

/**
 * Derive the FalkorDB graph name for a user + knowledge base pair.
 * Convention: "kg_{userId}_{knowledgeBaseId}"   (Leaf graph, Tier 1)
 */
export function getGraphName(userId: string, knowledgeBaseId: string): string {
  return `kg_${userId}_${knowledgeBaseId}`;
}

/**
 * Derive the FalkorDB graph name for a user + federation pair.
 * Convention: "kgf_{userId}_{federationId}"   (Federation graph, Tier 2)
 *
 * Tri-level named graph topology:
 *   Leaf:       kg_{userId}_{kbId}             — instance data (per KB)
 *   Federation: kgf_{userId}_{federationId}    — legacy materialized merge
 *   Meta:       kgm_{userId}_{metaGraphId}     — procedural meta-graph
 */
export function getFederationGraphName(
  userId: string,
  federationId: string,
): string {
  return `kgf_${userId}_${federationId}`;
}

/**
 * Derive the FalkorDB graph name for a user + meta-graph pair.
 * Convention: "kgm_{userId}_{metaGraphId}"   (Meta-graph, Tier 3)
 *
 * Holds the *procedural facet* of a meta-knowledge graph: the actual
 * nodes/edges encoding general know-how (e.g. "reset password →
 * verify identity → trigger OKTA flow"). The pattern facet (slots +
 * pattern edges) lives in Postgres on the meta_graphs table.
 */
export function getMetaGraphName(
  userId: string,
  metaGraphId: string,
): string {
  return `kgm_${userId}_${metaGraphId}`;
}

// ── Internal helpers ──

/**
 * Serialize parameters into the FalkorDB CYPHER parameter prefix.
 * FalkorDB expects: GRAPH.QUERY graphName "CYPHER param1=value1 param2=value2 QUERY"
 */
function serializeParams(params: Record<string, any>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      // Escape double quotes inside strings
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      parts.push(`${key}="${escaped}"`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    } else if (value === null || value === undefined) {
      parts.push(`${key}=NULL`);
    } else {
      // For arrays/objects, JSON-encode
      const escaped = JSON.stringify(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
      parts.push(`${key}="${escaped}"`);
    }
  }
  return parts.join(" ");
}

/**
 * Unwrap a FalkorDB compact-format value.
 *
 * Compact values are [type, payload] pairs:
 *   1 = NULL, 2 = string, 3 = integer, 4 = boolean, 5 = double,
 *   6 = array, 7 = edge, 8 = node, 9 = path
 *
 * Scalars: [2, "hello"] → "hello", [3, 42] → 42
 * Arrays:  [6, [[2, "A"], [2, "B"]]] → ["A", "B"]
 * Non-compact (plain value): returned as-is
 */
function unwrapCompactValue(val: any): any {
  if (!Array.isArray(val)) return val ?? null;
  if (val.length !== 2 || typeof val[0] !== "number") {
    // Not a [type, payload] pair — return as-is
    return val;
  }
  const [type, payload] = val;
  switch (type) {
    case 1: // NULL
      return null;
    case 2: // string
    case 3: // integer
    case 4: // boolean
    case 5: // double
      return payload;
    case 6: // array
      if (Array.isArray(payload)) {
        return payload.map(unwrapCompactValue);
      }
      return payload;
    default:
      // node (8), edge (7), path (9) — return raw for now
      return payload;
  }
}

/**
 * Parse the raw FalkorDB GRAPH.QUERY response into typed records + metadata.
 *
 * FalkorDB returns an array of arrays:
 *   [0] = column headers (array of strings)
 *   [1] = result rows (array of arrays)
 *   [2] = metadata (array of strings like "Nodes created: 1", "Query internal execution time: 0.5 milliseconds")
 *
 * If there are no result columns (e.g. a CREATE with no RETURN), the response
 * may only contain the metadata array.
 */
function parseResponse(raw: any): FalkorDBResult {
  const metadata: FalkorDBResult["metadata"] = { executionTimeMs: 0 };
  const records: Record<string, any>[] = [];

  if (!Array.isArray(raw)) {
    return { records, metadata };
  }

  // Determine which part is the metadata block (always last, array of strings)
  let metaBlock: string[] = [];
  let headers: string[] = [];
  let rows: any[][] = [];

  if (raw.length === 1) {
    // Only metadata (e.g. write-only query with no RETURN)
    metaBlock = Array.isArray(raw[0]) ? raw[0] : [];
  } else if (raw.length >= 3) {
    headers = raw[0] || [];
    rows = raw[1] || [];
    metaBlock = raw[2] || [];
  } else if (raw.length === 2) {
    // Could be [headers, rows] or [rows, metadata]
    // If first element looks like headers (array of strings), treat as [headers, metadata]
    if (
      Array.isArray(raw[0]) &&
      raw[0].length > 0 &&
      typeof raw[0][0] === "string" &&
      Array.isArray(raw[1]) &&
      raw[1].length > 0 &&
      typeof raw[1][0] === "string"
    ) {
      // Both are string arrays — first is headers, second is metadata (no rows)
      headers = raw[0];
      metaBlock = raw[1];
    } else {
      headers = raw[0] || [];
      metaBlock = raw[1] || [];
    }
  }

  // Parse metadata strings
  for (const entry of metaBlock) {
    if (typeof entry !== "string") continue;
    const lower = entry.toLowerCase();
    if (lower.includes("nodes created")) {
      const match = entry.match(/(\d+)/);
      if (match) metadata.nodesCreated = parseInt(match[1], 10);
    } else if (lower.includes("relationships created")) {
      const match = entry.match(/(\d+)/);
      if (match) metadata.relationshipsCreated = parseInt(match[1], 10);
    } else if (lower.includes("internal execution time")) {
      const match = entry.match(/([\d.]+)/);
      if (match) metadata.executionTimeMs = parseFloat(match[1]);
    }
  }

  // Normalize headers: compact format returns [type, name] pairs
  const normalizedHeaders: string[] = headers.map((h) =>
    Array.isArray(h) ? String(h[h.length - 1]) : String(h),
  );

  // Build record objects from headers + rows
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

/**
 * Create a FalkorDBClient backed by an ioredis instance.
 */
export function createFalkorDBClient(redis: Redis): FalkorDBClient {
  return {
    async query(
      graphName: string,
      cypher: string,
      params?: Record<string, any>,
    ): Promise<FalkorDBResult> {
      let fullQuery: string;
      if (params && Object.keys(params).length > 0) {
        const paramStr = serializeParams(params);
        fullQuery = `CYPHER ${paramStr} ${cypher}`;
      } else {
        fullQuery = cypher;
      }

      const raw = await (redis as any).call(
        "GRAPH.QUERY",
        graphName,
        fullQuery,
        "--compact",
      );

      return parseResponse(raw);
    },

    async healthCheck(): Promise<{ healthy: boolean; message: string }> {
      try {
        const pong = await redis.ping();
        if (pong === "PONG") {
          return { healthy: true, message: "FalkorDB connection is healthy" };
        }
        return {
          healthy: false,
          message: `Unexpected PING response: ${pong}`,
        };
      } catch (error: any) {
        return {
          healthy: false,
          message: `FalkorDB health check failed: ${error.message}`,
        };
      }
    },
  };
}
