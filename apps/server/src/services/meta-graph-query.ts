"use strict";

/**
 * Meta-Graph Query Service
 *
 * Two query modes:
 *   - alone:     run the question against the meta-graph's procedural facet
 *                only (kgm_*). Pure structural/procedural answers, no
 *                instance data.
 *   - projected: resolve slot bindings into the constituent KBs and combine
 *                results with the procedural scaffold for an entity-grounded
 *                answer.
 */

import { db } from "../db";
import {
  metaGraphs,
  metaGraphBindings,
  type MetaGraphRow,
  type MetaGraphBindingRow,
  type SlotResolver,
} from "@wtrops/shared";
import { and, eq, inArray } from "drizzle-orm";
import {
  createFalkorDBClient,
  getGraphName,
  getMetaGraphName,
  type FalkorDBClient,
} from "../infrastructure/falkordb/client";
import { callStageLlm } from "./kg-llm-router";
import { getOpenAIApiKey } from "./knowledge-graph-extraction";

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

// ── Public types ──

export interface MetaQueryResult {
  answer: string;
  mode: "alone" | "projected";
  metaGraphId: string;
  proceduralEvidence: Array<{
    fromName: string;
    relType: string;
    toName: string;
  }>;
  perKbEvidence?: Array<{
    knowledgeBaseId: string;
    slotMatches: Array<{ slotId: string; slotName: string; entities: string[] }>;
  }>;
  cypher?: string;
}

// ── Helpers ──

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

async function loadMetaGraph(
  userId: string,
  metaGraphId: string,
): Promise<MetaGraphRow | null> {
  const [row] = await db
    .select()
    .from(metaGraphs)
    .where(and(eq(metaGraphs.id, metaGraphId), eq(metaGraphs.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function loadBindings(
  metaGraphId: string,
  kbIds?: string[],
): Promise<MetaGraphBindingRow[]> {
  const baseClause = eq(metaGraphBindings.metaGraphId, metaGraphId);
  if (kbIds && kbIds.length > 0) {
    return db
      .select()
      .from(metaGraphBindings)
      .where(
        and(baseClause, inArray(metaGraphBindings.knowledgeBaseId, kbIds)),
      );
  }
  return db.select().from(metaGraphBindings).where(baseClause);
}

/**
 * Pull a textual representation of the procedural facet for prompt context.
 */
async function dumpProceduralFacet(
  client: FalkorDBClient,
  graphName: string,
): Promise<{
  nodes: Array<{ name: string; slotId: string | null; description: string | null }>;
  edges: Array<{ from: string; to: string; type: string; description: string | null }>;
}> {
  const nodeRes = await client.query(
    graphName,
    "MATCH (n) RETURN n.name AS name, n.slotId AS slotId, n.description AS description LIMIT 500",
  );
  const edgeRes = await client.query(
    graphName,
    "MATCH (a)-[r]->(b) RETURN a.name AS from, b.name AS to, type(r) AS type, r.description AS description LIMIT 1000",
  );
  return {
    nodes: nodeRes.records.map((r) => ({
      name: String(r.name ?? ""),
      slotId: r.slotId ?? null,
      description: r.description ?? null,
    })),
    edges: edgeRes.records.map((r) => ({
      from: String(r.from ?? ""),
      to: String(r.to ?? ""),
      type: String(r.type ?? ""),
      description: r.description ?? null,
    })),
  };
}

// ── Mode: alone ──

export async function queryMetaAlone(
  userId: string,
  metaGraphId: string,
  question: string,
): Promise<MetaQueryResult> {
  const meta = await loadMetaGraph(userId, metaGraphId);
  if (!meta) {
    throw new Error(`meta-graph ${metaGraphId} not found`);
  }

  const client = await getFalkorDBClient();
  const graphName = getMetaGraphName(userId, metaGraphId);

  let facet;
  try {
    facet = await dumpProceduralFacet(client, graphName);
  } catch {
    facet = { nodes: [], edges: [] };
  }

  const slotsBlock = meta.slots
    .map((s) => `- ${s.name}: ${s.description ?? "(no description)"}`)
    .join("\n");
  const patternBlock = meta.pattern
    .map((p) => {
      const fromSlot = meta.slots.find((s) => s.id === p.fromSlotId);
      const toSlot = meta.slots.find((s) => s.id === p.toSlotId);
      return `- (${fromSlot?.name ?? "?"})-[${p.relType}]->(${toSlot?.name ?? "?"})${
        p.description ? ` — ${p.description}` : ""
      }`;
    })
    .join("\n");
  const proceduralBlock = facet.nodes
    .map((n) => `- ${n.name}${n.description ? `: ${n.description}` : ""}`)
    .join("\n");
  const proceduralEdgeBlock = facet.edges
    .map((e) => `- (${e.from})-[${e.type}]->(${e.to})${e.description ? ` — ${e.description}` : ""}`)
    .join("\n");

  const systemPrompt = `You are answering a question using ONLY the structural know-how encoded in a meta-knowledge graph called "${meta.name}". This graph captures HOW work gets done — procedures, roles, escalation paths — and contains NO specific client/customer/instance data.

Answer the question using only the slots, pattern, and procedural nodes/edges below. If the answer requires specific client data, say so explicitly and recommend using a federation (meta + constituent KBs) instead.

Slots (typed roles):
${slotsBlock || "(none)"}

Pattern (relationships between slots):
${patternBlock || "(none)"}

Procedural nodes (general know-how):
${proceduralBlock || "(none)"}

Procedural edges:
${proceduralEdgeBlock || "(none)"}

Be concise. Use the actual node/edge names where applicable.`;

  const apiKey = await getOpenAIApiKey();
  const result = await callStageLlm(apiKey, userId, "query", {
    systemPrompt,
    userPrompt: question,
    maxOutputTokens: 1024,
  });

  return {
    answer: result.text.trim(),
    mode: "alone",
    metaGraphId,
    proceduralEvidence: facet.edges.slice(0, 20).map((e) => ({
      fromName: e.from,
      relType: e.type,
      toName: e.to,
    })),
  };
}

// ── Mode: projected ──

/**
 * Resolve a single slot to a list of entity names in one KB by running the
 * binding's resolver.
 */
async function resolveSlotInKb(
  client: FalkorDBClient,
  graphName: string,
  resolver: SlotResolver,
): Promise<string[]> {
  try {
    let cypher = "";
    if (resolver.kind === "entityType") {
      const safeLabel = resolver.value.replace(/[^a-zA-Z0-9_]/g, "_");
      cypher = `MATCH (n:${safeLabel}) RETURN n.name AS name LIMIT 50`;
    } else if (resolver.kind === "labelMatch") {
      const escaped = escapeCypherString(resolver.value);
      cypher = `MATCH (n) WHERE toLower(n.name) CONTAINS toLower("${escaped}") RETURN n.name AS name LIMIT 50`;
    } else if (resolver.kind === "cypher") {
      // Trust the resolver string as-is — it's user-authored
      cypher = resolver.value;
    }
    const result = await client.query(graphName, cypher);
    return result.records
      .map((r) => String(r.name ?? r.n?.name ?? ""))
      .filter(Boolean);
  } catch (err: any) {
    console.warn(
      `[MetaQuery] resolveSlotInKb failed (${graphName}, ${resolver.kind}):`,
      err.message,
    );
    return [];
  }
}

export async function queryMetaProjected(
  userId: string,
  metaGraphId: string,
  kbIds: string[],
  question: string,
): Promise<MetaQueryResult> {
  const meta = await loadMetaGraph(userId, metaGraphId);
  if (!meta) {
    throw new Error(`meta-graph ${metaGraphId} not found`);
  }

  const client = await getFalkorDBClient();
  const metaGraphName = getMetaGraphName(userId, metaGraphId);

  // Procedural facet (scaffold for the answer)
  let facet;
  try {
    facet = await dumpProceduralFacet(client, metaGraphName);
  } catch {
    facet = { nodes: [], edges: [] };
  }

  // Per-KB slot resolution
  const bindings = await loadBindings(metaGraphId, kbIds);
  const perKbEvidence: NonNullable<MetaQueryResult["perKbEvidence"]> = [];

  for (const binding of bindings) {
    const graphName = getGraphName(userId, binding.knowledgeBaseId);
    const slotMatches: Array<{
      slotId: string;
      slotName: string;
      entities: string[];
    }> = [];
    for (const slot of meta.slots) {
      const resolver = binding.slotResolvers[slot.id];
      if (!resolver) continue;
      const entities = await resolveSlotInKb(client, graphName, resolver);
      if (entities.length > 0) {
        slotMatches.push({
          slotId: slot.id,
          slotName: slot.name,
          entities: entities.slice(0, 20),
        });
      }
    }
    perKbEvidence.push({
      knowledgeBaseId: binding.knowledgeBaseId,
      slotMatches,
    });
  }

  // Build the prompt
  const slotsBlock = meta.slots
    .map((s) => `- ${s.name}: ${s.description ?? "(no description)"}`)
    .join("\n");
  const patternBlock = meta.pattern
    .map((p) => {
      const fromSlot = meta.slots.find((s) => s.id === p.fromSlotId);
      const toSlot = meta.slots.find((s) => s.id === p.toSlotId);
      return `- (${fromSlot?.name ?? "?"})-[${p.relType}]->(${toSlot?.name ?? "?"})`;
    })
    .join("\n");
  const proceduralBlock = facet.nodes
    .map((n) => `- ${n.name}${n.description ? `: ${n.description}` : ""}`)
    .join("\n");
  const evidenceBlock = perKbEvidence
    .map((kb) => {
      const inner = kb.slotMatches
        .map(
          (m) =>
            `  - ${m.slotName}: [${m.entities.slice(0, 8).join(", ")}${m.entities.length > 8 ? ", …" : ""}]`,
        )
        .join("\n");
      return `KB ${kb.knowledgeBaseId}:\n${inner || "  (no matches)"}`;
    })
    .join("\n\n");

  const systemPrompt = `You are answering a question using a meta-knowledge graph called "${meta.name}" projected over ${kbIds.length} constituent knowledge base(s). The meta-graph encodes HOW work gets done; the constituents provide the WHO and WHAT.

Compose an answer that combines the procedural scaffold from the meta-graph with concrete entities resolved from the constituent KBs via slot bindings.

META-GRAPH SLOTS:
${slotsBlock || "(none)"}

META-GRAPH PATTERN:
${patternBlock || "(none)"}

META-GRAPH PROCEDURAL NODES:
${proceduralBlock || "(none)"}

CONSTITUENT EVIDENCE (slot → entities resolved per KB):
${evidenceBlock || "(no bindings or no matches)"}

Be concise and grounded. Cite entity names where relevant.`;

  const apiKey = await getOpenAIApiKey();
  const result = await callStageLlm(apiKey, userId, "query", {
    systemPrompt,
    userPrompt: question,
    maxOutputTokens: 1536,
  });

  return {
    answer: result.text.trim(),
    mode: "projected",
    metaGraphId,
    proceduralEvidence: facet.edges.slice(0, 20).map((e) => ({
      fromName: e.from,
      relType: e.type,
      toName: e.to,
    })),
    perKbEvidence,
  };
}

// ── Bindings CRUD (used by routes) ──

export async function upsertBinding(
  metaGraphId: string,
  knowledgeBaseId: string,
  slotResolvers: Record<string, SlotResolver>,
): Promise<MetaGraphBindingRow> {
  const existing = await db
    .select()
    .from(metaGraphBindings)
    .where(
      and(
        eq(metaGraphBindings.metaGraphId, metaGraphId),
        eq(metaGraphBindings.knowledgeBaseId, knowledgeBaseId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(metaGraphBindings)
      .set({ slotResolvers })
      .where(eq(metaGraphBindings.id, existing[0].id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(metaGraphBindings)
    .values({ metaGraphId, knowledgeBaseId, slotResolvers })
    .returning();
  return created;
}

export async function listBindings(
  metaGraphId: string,
): Promise<MetaGraphBindingRow[]> {
  return db
    .select()
    .from(metaGraphBindings)
    .where(eq(metaGraphBindings.metaGraphId, metaGraphId));
}

export async function deleteBinding(
  metaGraphId: string,
  bindingId: string,
): Promise<boolean> {
  const result = await db
    .delete(metaGraphBindings)
    .where(
      and(
        eq(metaGraphBindings.id, bindingId),
        eq(metaGraphBindings.metaGraphId, metaGraphId),
      ),
    )
    .returning();
  return result.length > 0;
}

// Re-export for re-use
export { sanitizeRelType };
