"use strict";

/**
 * Meta-Knowledge Graphs Service
 *
 * CRUD + procedural-graph operations for meta-graphs. A meta-graph has two
 * facets:
 *   - Pattern facet: slots + pattern edges in Postgres (meta_graphs row)
 *   - Procedural facet: real nodes/edges in FalkorDB at kgm_{userId}_{id}
 *
 * Slots are typed roles ("Client", "Resolution Step"). Pattern edges are
 * relationships between slots ("(Client)-[:HAS]->(Ticket)"). Procedural
 * nodes are concrete general knowledge that does NOT belong to any specific
 * client ("Reset password via OKTA").
 */

import crypto from "crypto";
import { db } from "../db";
import {
  metaGraphs,
  type MetaGraphRow,
  type MetaSlot,
  type MetaPatternEdge,
} from "@wtrops/shared";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  createFalkorDBClient,
  getMetaGraphName,
  type FalkorDBClient,
} from "../infrastructure/falkordb/client";

// ── FalkorDB client (lazy) ──

let falkordbClient: FalkorDBClient | null = null;

async function getFalkorDBClient(): Promise<FalkorDBClient> {
  if (falkordbClient) return falkordbClient;
  const Redis = (await import("ioredis")).default;
  const url = process.env.FALKORDB_URL || "redis://localhost:6379";
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  await redis.connect();
  falkordbClient = createFalkorDBClient(redis);
  return falkordbClient;
}

// ── Inputs ──

export interface CreateMetaGraphInput {
  name: string;
  description?: string | null;
  source?: "manual" | "induced" | "hybrid";
  derivedFromKbIds?: string[];
  slots?: MetaSlot[];
  pattern?: MetaPatternEdge[];
}

export interface UpdateMetaGraphInput {
  name?: string;
  description?: string | null;
  slots?: MetaSlot[];
  pattern?: MetaPatternEdge[];
}

export interface AddProceduralNodeInput {
  name: string;
  slotId?: string | null; // optional pattern slot this node instantiates
  description?: string;
  properties?: Record<string, string>;
}

export interface AddProceduralEdgeInput {
  fromNodeId: string;
  toNodeId: string;
  relType: string;
  description?: string;
}

// ── String helpers ──

function escapeCypherString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sanitizeRelType(type: string): string {
  return (
    type
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^[0-9]/, "_$&")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "RELATED_TO"
  );
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

// ── CRUD ──

export async function createMetaGraph(
  userId: string,
  input: CreateMetaGraphInput,
): Promise<MetaGraphRow> {
  // Auto-fill slot ids if missing so the caller can hand us a draft
  const slots = (input.slots ?? []).map((s) => ({
    ...s,
    id: s.id || newId("slot"),
  }));
  const pattern = (input.pattern ?? []).map((p) => ({
    ...p,
    id: p.id || newId("pat"),
  }));

  const [row] = await db
    .insert(metaGraphs)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
      source: input.source ?? "manual",
      derivedFromKbIds: input.derivedFromKbIds ?? [],
      slots,
      pattern,
    })
    .returning();
  return row;
}

export async function listMetaGraphs(userId: string): Promise<MetaGraphRow[]> {
  return db
    .select()
    .from(metaGraphs)
    .where(eq(metaGraphs.userId, userId))
    .orderBy(desc(metaGraphs.createdAt));
}

export async function getMetaGraph(
  userId: string,
  id: string,
): Promise<MetaGraphRow | null> {
  const [row] = await db
    .select()
    .from(metaGraphs)
    .where(and(eq(metaGraphs.id, id), eq(metaGraphs.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateMetaGraph(
  userId: string,
  id: string,
  patch: UpdateMetaGraphInput,
): Promise<MetaGraphRow | null> {
  const updates: any = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.slots !== undefined) {
    updates.slots = patch.slots.map((s) => ({
      ...s,
      id: s.id || newId("slot"),
    }));
  }
  if (patch.pattern !== undefined) {
    updates.pattern = patch.pattern.map((p) => ({
      ...p,
      id: p.id || newId("pat"),
    }));
  }
  const [row] = await db
    .update(metaGraphs)
    .set(updates)
    .where(and(eq(metaGraphs.id, id), eq(metaGraphs.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteMetaGraph(
  userId: string,
  id: string,
): Promise<boolean> {
  const existing = await getMetaGraph(userId, id);
  if (!existing) return false;

  // Drop the procedural FalkorDB graph (best-effort)
  const graphName = getMetaGraphName(userId, id);
  try {
    const client = await getFalkorDBClient();
    await client.query(graphName, "MATCH (n) DETACH DELETE n");
  } catch {
    // Graph may not exist — fine
  }
  try {
    const Redis = (await import("ioredis")).default;
    const url = process.env.FALKORDB_URL || "redis://localhost:6379";
    const redis = new Redis(url);
    await (redis as any).call("GRAPH.DELETE", graphName);
    await redis.quit();
  } catch {
    // Best-effort
  }

  const result = await db
    .delete(metaGraphs)
    .where(and(eq(metaGraphs.id, id), eq(metaGraphs.userId, userId)))
    .returning();
  return result.length > 0;
}

// ── Procedural graph (FalkorDB kgm_*) ──

export interface ProceduralNode {
  id: string;
  name: string;
  slotId: string | null;
  description: string | null;
  properties: Record<string, string>;
}

export interface ProceduralEdge {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  description: string | null;
}

export async function getProceduralGraph(
  userId: string,
  metaGraphId: string,
): Promise<{ nodes: ProceduralNode[]; edges: ProceduralEdge[] }> {
  const client = await getFalkorDBClient();
  const graphName = getMetaGraphName(userId, metaGraphId);
  try {
    const nodeResult = await client.query(
      graphName,
      "MATCH (n) RETURN id(n) AS nodeId, n.name AS name, n.slotId AS slotId, n.description AS description",
    );
    const edgeResult = await client.query(
      graphName,
      "MATCH (a)-[r]->(b) RETURN id(r) AS relId, id(a) AS srcId, id(b) AS tgtId, type(r) AS type, r.description AS description",
    );

    const nodes: ProceduralNode[] = nodeResult.records.map((r) => ({
      id: `pn_${r.nodeId}`,
      name: String(r.name ?? ""),
      slotId: r.slotId ?? null,
      description: r.description ?? null,
      properties: {},
    }));
    const edges: ProceduralEdge[] = edgeResult.records.map((r) => ({
      id: `pe_${r.relId}`,
      type: String(r.type ?? "RELATED_TO"),
      fromNodeId: `pn_${r.srcId}`,
      toNodeId: `pn_${r.tgtId}`,
      description: r.description ?? null,
    }));
    return { nodes, edges };
  } catch (err: any) {
    console.warn(
      `[MetaGraph] getProceduralGraph failed for ${graphName}:`,
      err.message,
    );
    return { nodes: [], edges: [] };
  }
}

export async function addProceduralNode(
  userId: string,
  metaGraphId: string,
  input: AddProceduralNodeInput,
): Promise<ProceduralNode> {
  const client = await getFalkorDBClient();
  const graphName = getMetaGraphName(userId, metaGraphId);

  const props: string[] = [`name: "${escapeCypherString(input.name)}"`];
  if (input.slotId) {
    props.push(`slotId: "${escapeCypherString(input.slotId)}"`);
  }
  if (input.description) {
    props.push(`description: "${escapeCypherString(input.description)}"`);
  }
  if (input.properties) {
    for (const [k, v] of Object.entries(input.properties)) {
      const safeKey = k.replace(/[^a-zA-Z0-9_]/g, "_");
      props.push(`${safeKey}: "${escapeCypherString(String(v))}"`);
    }
  }

  const cypher = `CREATE (n:Procedural {${props.join(", ")}}) RETURN id(n) AS nodeId`;
  const result = await client.query(graphName, cypher);
  const nodeId = result.records[0]?.nodeId;

  // Bump procedural node count on the parent row
  await db
    .update(metaGraphs)
    .set({
      proceduralNodeCount: sql`COALESCE(${metaGraphs.proceduralNodeCount}, 0) + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(metaGraphs.id, metaGraphId), eq(metaGraphs.userId, userId)),
    );

  return {
    id: `pn_${nodeId}`,
    name: input.name,
    slotId: input.slotId ?? null,
    description: input.description ?? null,
    properties: input.properties ?? {},
  };
}

export async function addProceduralEdge(
  userId: string,
  metaGraphId: string,
  input: AddProceduralEdgeInput,
): Promise<ProceduralEdge> {
  const client = await getFalkorDBClient();
  const graphName = getMetaGraphName(userId, metaGraphId);

  // Strip the "pn_" prefix to get raw FalkorDB node ids
  const srcId = parseInt(input.fromNodeId.replace(/^pn_/, ""), 10);
  const tgtId = parseInt(input.toNodeId.replace(/^pn_/, ""), 10);
  if (Number.isNaN(srcId) || Number.isNaN(tgtId)) {
    throw new Error(
      `addProceduralEdge: invalid node id (from=${input.fromNodeId}, to=${input.toNodeId})`,
    );
  }
  const relType = sanitizeRelType(input.relType);
  const descClause = input.description
    ? ` {description: "${escapeCypherString(input.description)}"}`
    : "";

  const cypher = `MATCH (a), (b) WHERE id(a) = ${srcId} AND id(b) = ${tgtId} CREATE (a)-[r:${relType}${descClause}]->(b) RETURN id(r) AS relId`;
  const result = await client.query(graphName, cypher);
  const relId = result.records[0]?.relId;

  await db
    .update(metaGraphs)
    .set({
      proceduralEdgeCount: sql`COALESCE(${metaGraphs.proceduralEdgeCount}, 0) + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(metaGraphs.id, metaGraphId), eq(metaGraphs.userId, userId)),
    );

  return {
    id: `pe_${relId}`,
    type: relType,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    description: input.description ?? null,
  };
}

/**
 * Bulk write a procedural graph (used by induction acceptance to materialize
 * any LLM-suggested procedural seeds in one go).
 */
export async function writeProceduralGraph(
  userId: string,
  metaGraphId: string,
  input: {
    nodes: Array<{
      tempId: string;
      name: string;
      slotId?: string | null;
      description?: string;
    }>;
    edges: Array<{
      fromTempId: string;
      toTempId: string;
      relType: string;
      description?: string;
    }>;
  },
): Promise<void> {
  if (input.nodes.length === 0) return;

  const tempToReal: Record<string, string> = {};
  for (const n of input.nodes) {
    const created = await addProceduralNode(userId, metaGraphId, {
      name: n.name,
      slotId: n.slotId ?? null,
      description: n.description,
    });
    tempToReal[n.tempId] = created.id;
  }

  for (const e of input.edges) {
    const from = tempToReal[e.fromTempId];
    const to = tempToReal[e.toTempId];
    if (!from || !to) continue;
    try {
      await addProceduralEdge(userId, metaGraphId, {
        fromNodeId: from,
        toNodeId: to,
        relType: e.relType,
        description: e.description,
      });
    } catch (err: any) {
      console.warn(`[MetaGraph] writeProceduralGraph edge failed:`, err.message);
    }
  }
}
