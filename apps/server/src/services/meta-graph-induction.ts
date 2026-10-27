"use strict";

/**
 * Meta-Graph Induction
 *
 * Given N existing knowledge bases, mine recurring entity-type and
 * relationship-type patterns and produce a draft meta-graph that captures
 * the structural know-how shared across them.
 *
 * Pipeline:
 *   1. For each KB, query its FalkorDB graph for entity type histograms
 *      and relationship type histograms.
 *   2. Find entity types appearing in ≥ ceil(N/2) KBs → candidate slots.
 *   3. Find relationships connecting candidate slot types in ≥ ceil(N/2)
 *      KBs → candidate pattern edges.
 *   4. Use the LLM router with the user's induction model to (a) name slots
 *      based on entity samples, (b) write pattern descriptions, (c)
 *      optionally seed procedural nodes recurring across the KBs.
 *   5. Return a draft (not persisted).
 */

import crypto from "crypto";
import {
  createFalkorDBClient,
  getGraphName,
  type FalkorDBClient,
} from "../infrastructure/falkordb/client";
import type { MetaSlot, MetaPatternEdge } from "@wtrops/shared";
import { callStageLlm } from "./kg-llm-router";
import { getOpenAIApiKey } from "./knowledge-graph-extraction";
import { getStageModel, type StageModelConfig } from "./kg-model-settings";

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

// ── Public types ──

export interface InduceMetaGraphInput {
  kbIds: string[];
  modelOverride?: StageModelConfig;
  seedProceduralNodes?: boolean;
  proposedName?: string;
}

export interface ProceduralNodeDraft {
  tempId: string;
  name: string;
  slotId: string | null;
  description?: string;
}

export interface ProceduralEdgeDraft {
  fromTempId: string;
  toTempId: string;
  relType: string;
  description?: string;
}

export interface InducedMetaGraphDraft {
  name: string;
  description: string;
  source: "induced";
  derivedFromKbIds: string[];
  slots: MetaSlot[];
  pattern: MetaPatternEdge[];
  proceduralNodes: ProceduralNodeDraft[];
  proceduralEdges: ProceduralEdgeDraft[];
  // Diagnostics that the UI can display
  inductionStats: {
    kbsAnalyzed: number;
    entityTypeCandidates: number;
    relationshipCandidates: number;
    minSupport: number;
  };
}

// ── Histogram mining ──

interface EntityTypeHist {
  label: string;
  count: number;
  sampleNames: string[];
}

interface RelationshipHist {
  fromLabel: string;
  toLabel: string;
  relType: string;
  count: number;
}

async function getEntityTypeHistogram(
  client: FalkorDBClient,
  graphName: string,
): Promise<EntityTypeHist[]> {
  try {
    const result = await client.query(
      graphName,
      "MATCH (n) RETURN labels(n) AS label, count(n) AS cnt, collect(n.name)[..5] AS samples ORDER BY cnt DESC LIMIT 50",
    );
    return result.records
      .map((r) => {
        const lbl = Array.isArray(r.label) ? r.label[0] : r.label;
        return {
          label: String(lbl ?? ""),
          count: Number(r.cnt ?? 0),
          sampleNames: Array.isArray(r.samples)
            ? r.samples.map((s: any) => String(s)).filter(Boolean)
            : [],
        };
      })
      .filter((h) => h.label);
  } catch (err: any) {
    console.warn(
      `[MetaInduction] entity histogram failed for ${graphName}:`,
      err.message,
    );
    return [];
  }
}

async function getRelationshipHistogram(
  client: FalkorDBClient,
  graphName: string,
): Promise<RelationshipHist[]> {
  try {
    const result = await client.query(
      graphName,
      "MATCH (a)-[r]->(b) RETURN labels(a) AS fromLabel, type(r) AS relType, labels(b) AS toLabel, count(r) AS cnt ORDER BY cnt DESC LIMIT 200",
    );
    return result.records
      .map((r) => {
        const fl = Array.isArray(r.fromLabel) ? r.fromLabel[0] : r.fromLabel;
        const tl = Array.isArray(r.toLabel) ? r.toLabel[0] : r.toLabel;
        return {
          fromLabel: String(fl ?? ""),
          toLabel: String(tl ?? ""),
          relType: String(r.relType ?? ""),
          count: Number(r.cnt ?? 0),
        };
      })
      .filter((h) => h.fromLabel && h.toLabel && h.relType);
  } catch (err: any) {
    console.warn(
      `[MetaInduction] relationship histogram failed for ${graphName}:`,
      err.message,
    );
    return [];
  }
}

// ── LLM-naming ──

interface LlmNamingInput {
  draftName: string;
  derivedFromKbIds: string[];
  candidateSlots: Array<{ rawLabel: string; sampleNames: string[]; supportKbs: number }>;
  candidatePattern: Array<{ fromLabel: string; toLabel: string; relType: string; supportKbs: number }>;
}

interface LlmNamingOutput {
  name: string;
  description: string;
  slots: Array<{
    rawLabel: string;
    name: string;
    description: string;
  }>;
  pattern: Array<{
    fromLabel: string;
    toLabel: string;
    relType: string;
    description: string;
  }>;
  proceduralSeeds: Array<{
    tempId: string;
    name: string;
    slotRawLabel: string | null;
    description: string;
  }>;
  proceduralEdgeSeeds: Array<{
    fromTempId: string;
    toTempId: string;
    relType: string;
    description: string;
  }>;
}

async function llmNameAndDescribe(
  userId: string,
  input: LlmNamingInput,
  modelOverride?: StageModelConfig,
  seedProcedural = true,
): Promise<LlmNamingOutput | null> {
  const apiKey = await getOpenAIApiKey();
  const config =
    modelOverride ?? (await getStageModel(userId, "extraction"));

  const systemPrompt = `You are a knowledge architect distilling structural know-how from multiple instance graphs into a meta-knowledge graph.

A meta-graph captures HOW work gets done (procedures, roles, escalation patterns) WITHOUT including any specific client/customer/instance data. Slots are typed roles. Pattern edges are relationships between slots. Procedural seeds are concrete general knowledge (e.g. "Reset password via OKTA").

Given candidate slots and pattern edges mined from the constituent graphs, produce:
- A short name (3-6 words) for the meta-graph
- A 1-2 sentence description of what know-how this meta-graph captures
- Renamed slots: take each rawLabel and propose a generic, role-style name (e.g. "Customer" → "Client", "Bug" → "Issue"). Keep the rawLabel field unchanged so we can map back.
- Cleaned pattern edges with short descriptions
- ${seedProcedural ? "5-15 procedural seed nodes that look like generally useful steps/tools/decisions, plus any obvious edges between them. Use temporary ids like 'p1', 'p2'. Tag each procedural node with the slotRawLabel it most likely instantiates (or null if it's a freestanding piece of general knowledge)." : "An empty proceduralSeeds and proceduralEdgeSeeds array."}

Return ONLY valid JSON matching this schema. Do NOT mention any specific clients/companies/people from the input — the meta-graph is purposely instance-free.`;

  const userPrompt = JSON.stringify(input, null, 2);

  const jsonSchema = {
    name: "meta_graph_naming",
    strict: false,
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        slots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rawLabel: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["rawLabel", "name", "description"],
          },
        },
        pattern: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fromLabel: { type: "string" },
              toLabel: { type: "string" },
              relType: { type: "string" },
              description: { type: "string" },
            },
            required: ["fromLabel", "toLabel", "relType", "description"],
          },
        },
        proceduralSeeds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tempId: { type: "string" },
              name: { type: "string" },
              slotRawLabel: { type: ["string", "null"] },
              description: { type: "string" },
            },
            required: ["tempId", "name", "slotRawLabel", "description"],
          },
        },
        proceduralEdgeSeeds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fromTempId: { type: "string" },
              toTempId: { type: "string" },
              relType: { type: "string" },
              description: { type: "string" },
            },
            required: ["fromTempId", "toTempId", "relType", "description"],
          },
        },
      },
      required: ["name", "description", "slots", "pattern", "proceduralSeeds", "proceduralEdgeSeeds"],
    },
  };

  try {
    const result = await callStageLlm(apiKey, userId, "extraction", {
      systemPrompt,
      userPrompt,
      jsonSchema,
      config,
      maxOutputTokens: 4096,
    });
    const cleaned = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(cleaned) as LlmNamingOutput;
  } catch (err: any) {
    console.warn(`[MetaInduction] LLM naming failed:`, err.message);
    return null;
  }
}

// ── Main entry point ──

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export async function induceFromKnowledgeBases(
  userId: string,
  input: InduceMetaGraphInput,
): Promise<InducedMetaGraphDraft> {
  if (input.kbIds.length === 0) {
    throw new Error("induceFromKnowledgeBases: at least one KB id is required");
  }

  const client = await getFalkorDBClient();
  const N = input.kbIds.length;
  const minSupport = Math.max(1, Math.ceil(N / 2));

  // Per-KB histograms
  const entityHistsPerKb: EntityTypeHist[][] = [];
  const relHistsPerKb: RelationshipHist[][] = [];

  for (const kbId of input.kbIds) {
    const graphName = getGraphName(userId, kbId);
    const [eh, rh] = await Promise.all([
      getEntityTypeHistogram(client, graphName),
      getRelationshipHistogram(client, graphName),
    ]);
    entityHistsPerKb.push(eh);
    relHistsPerKb.push(rh);
  }

  // Aggregate entity-type support across KBs
  const entitySupport = new Map<
    string,
    { count: number; supportKbs: number; sampleNames: string[] }
  >();
  for (const eh of entityHistsPerKb) {
    const seenInThisKb = new Set<string>();
    for (const e of eh) {
      const cur = entitySupport.get(e.label) ?? {
        count: 0,
        supportKbs: 0,
        sampleNames: [],
      };
      cur.count += e.count;
      if (!seenInThisKb.has(e.label)) {
        cur.supportKbs += 1;
        seenInThisKb.add(e.label);
      }
      // Mix in a few samples
      for (const s of e.sampleNames.slice(0, 3)) {
        if (cur.sampleNames.length < 8 && !cur.sampleNames.includes(s)) {
          cur.sampleNames.push(s);
        }
      }
      entitySupport.set(e.label, cur);
    }
  }

  const candidateSlotEntries = Array.from(entitySupport.entries())
    .filter(([, v]) => v.supportKbs >= minSupport)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);
  const candidateSlotLabels = new Set(candidateSlotEntries.map(([l]) => l));

  // Aggregate relationship support across KBs (only between candidate slots)
  const relSupport = new Map<
    string,
    {
      fromLabel: string;
      toLabel: string;
      relType: string;
      count: number;
      supportKbs: number;
    }
  >();
  for (const rh of relHistsPerKb) {
    const seenInThisKb = new Set<string>();
    for (const r of rh) {
      if (
        !candidateSlotLabels.has(r.fromLabel) ||
        !candidateSlotLabels.has(r.toLabel)
      ) {
        continue;
      }
      const key = `${r.fromLabel}|${r.relType}|${r.toLabel}`;
      const cur = relSupport.get(key) ?? {
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        relType: r.relType,
        count: 0,
        supportKbs: 0,
      };
      cur.count += r.count;
      if (!seenInThisKb.has(key)) {
        cur.supportKbs += 1;
        seenInThisKb.add(key);
      }
      relSupport.set(key, cur);
    }
  }

  const candidatePatternEntries = Array.from(relSupport.values())
    .filter((v) => v.supportKbs >= minSupport)
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // Hand the candidates to the LLM for naming + (optional) procedural seeds
  const llmInput: LlmNamingInput = {
    draftName: input.proposedName ?? `Meta-graph from ${N} KBs`,
    derivedFromKbIds: input.kbIds,
    candidateSlots: candidateSlotEntries.map(([rawLabel, v]) => ({
      rawLabel,
      sampleNames: v.sampleNames,
      supportKbs: v.supportKbs,
    })),
    candidatePattern: candidatePatternEntries.map((v) => ({
      fromLabel: v.fromLabel,
      toLabel: v.toLabel,
      relType: v.relType,
      supportKbs: v.supportKbs,
    })),
  };

  const llmOutput = await llmNameAndDescribe(
    userId,
    llmInput,
    input.modelOverride,
    input.seedProceduralNodes !== false,
  );

  // Build the draft. If LLM failed, fall back to raw labels as slot names.
  const palette = [
    "#07A288",
    "#5BBE4E",
    "#B8E52B",
    "#7DD3FC",
    "#F472B6",
    "#FBBF24",
    "#A78BFA",
    "#F87171",
    "#34D399",
    "#60A5FA",
  ];

  // Map rawLabel → slot id so pattern edges and procedural seeds can refer back
  const labelToSlotId = new Map<string, string>();
  const slots: MetaSlot[] = candidateSlotEntries.map(([rawLabel, v], idx) => {
    const id = newId("slot");
    labelToSlotId.set(rawLabel, id);
    const named = llmOutput?.slots.find((s) => s.rawLabel === rawLabel);
    return {
      id,
      name: named?.name ?? rawLabel,
      description:
        named?.description ?? `Mined from ${v.supportKbs}/${N} graphs`,
      expectedEntityTypes: [rawLabel],
      colorHint: palette[idx % palette.length],
    };
  });

  const pattern: MetaPatternEdge[] = candidatePatternEntries
    .map((v) => {
      const fromSlotId = labelToSlotId.get(v.fromLabel);
      const toSlotId = labelToSlotId.get(v.toLabel);
      if (!fromSlotId || !toSlotId) return null;
      const named = llmOutput?.pattern.find(
        (p) =>
          p.fromLabel === v.fromLabel &&
          p.toLabel === v.toLabel &&
          p.relType === v.relType,
      );
      return {
        id: newId("pat"),
        fromSlotId,
        toSlotId,
        relType: v.relType,
        description: named?.description,
        cardinality: undefined,
      } as MetaPatternEdge;
    })
    .filter((p): p is MetaPatternEdge => p !== null);

  const proceduralNodes: ProceduralNodeDraft[] =
    llmOutput?.proceduralSeeds.map((s) => ({
      tempId: s.tempId,
      name: s.name,
      slotId: s.slotRawLabel ? labelToSlotId.get(s.slotRawLabel) ?? null : null,
      description: s.description,
    })) ?? [];

  const validTempIds = new Set(proceduralNodes.map((n) => n.tempId));
  const proceduralEdges: ProceduralEdgeDraft[] =
    llmOutput?.proceduralEdgeSeeds
      .filter((e) => validTempIds.has(e.fromTempId) && validTempIds.has(e.toTempId))
      .map((e) => ({
        fromTempId: e.fromTempId,
        toTempId: e.toTempId,
        relType: e.relType,
        description: e.description,
      })) ?? [];

  return {
    name: llmOutput?.name ?? input.proposedName ?? `Meta-graph from ${N} KBs`,
    description:
      llmOutput?.description ??
      `Auto-induced from ${N} knowledge bases. ${slots.length} slots, ${pattern.length} pattern edges.`,
    source: "induced",
    derivedFromKbIds: input.kbIds,
    slots,
    pattern,
    proceduralNodes,
    proceduralEdges,
    inductionStats: {
      kbsAnalyzed: N,
      entityTypeCandidates: slots.length,
      relationshipCandidates: pattern.length,
      minSupport,
    },
  };
}
