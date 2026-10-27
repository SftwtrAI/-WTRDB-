"use strict";

/**
 * Knowledge Graph Extraction Service
 *
 * Uses OpenAI GPT-4o-mini to extract entities, relationships, and events
 * from knowledge base document chunks, then writes them to FalkorDB.
 *
 * WS3-T1.1: Incremental Extraction (Knowledge Increment ΔG_k)
 *   Only processes new/unprocessed chunks. Tracks extractedAt timestamp.
 *   V_k = V_{k-1} ∪ V_k^+, E_k = (E_{k-1} \ E_k^↓) ∪ E_k^+
 *
 * WS3-T1.2: Dual-Track Routing
 *   STATIC track → entities + relationships (triples)
 *   EVENT track → event structures ε = (trigger, roles, time, intent)
 *
 * WS3-T1.3: Governance Adjudication
 *   Three-filter pipeline applied per chunk before writing to graph.
 *
 * WS3-T1.4: Extraction Event Logging
 *   Events emitted to kg_extraction_events table and via WebSocket.
 *
 * Cross-workstream dependencies:
 *  - FalkorDB client (WS1): apps/server/src/infrastructure/falkordb/client.ts
 *  - Knowledge graph types (WS1): libs/shared/src/knowledge-graph-types.ts
 *
 * References:
 *  - Bao et al., "DIAL-KG," arXiv:2603.20059, 2026.
 *  - Spivak & Kent, "Ologs," PLoS ONE, 2012.
 */

import OpenAI from "openai";
import { db } from "../db";
import {
  knowledgeChunks,
  knowledgeBase,
  globalSettings,
} from "@wtrops/shared";
import { createSchemaProposals } from "./federation.service";
import { callStageLlm } from "./kg-llm-router";
import { getStageModel } from "./kg-model-settings";
import { eq, sql, and } from "drizzle-orm";
import type {
  GraphEntity,
  GraphRelationship,
} from "@wtrops/shared";
import {
  createFalkorDBClient,
  getGraphName,
  type FalkorDBClient,
} from "../infrastructure/falkordb/client";
import {
  buildExtractionPrompt,
  extractionJsonSchema,
  normalizeEntityType,
  ENTITY_TYPES,
  type ExtractedEvent,
} from "./knowledge-graph-prompts";
import {
  adjudicateExtraction,
  applySoftDeprecation,
  type AdjudicationResult,
} from "./governance-adjudication";
import {
  emitChunkStart,
  emitEntityDiscovered,
  emitRelationshipExtracted,
  emitEventDetected,
  emitDeprecation,
  emitAdjudicationResult,
  emitExtractionComplete,
  emitExtractionError,
  clearEventBuffer,
} from "./kg-extraction-events";

// ── OpenAI client management (mirrors rag-knowledge.ts pattern) ──

// LLM used for the DIAL-KG extraction pipeline
const DIAL_KG_MODEL = "gpt-5.3-codex";
const DIAL_KG_REASONING = "high";

let openaiClient: OpenAI | null = null;
let lastApiKey: string | null = null;

export async function getOpenAIApiKey(): Promise<string> {
  try {
    const [dbSetting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "openai_api_key"))
      .limit(1);

    if (dbSetting?.value) {
      return dbSetting.value as string;
    }
  } catch {
    // Table might not exist yet, fall back to env var
  }

  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  throw new Error(
    "OPENAI_API_KEY is required for knowledge graph extraction. Configure it in Admin Settings or as an environment variable.",
  );
}

async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getOpenAIApiKey();

  if (!openaiClient || lastApiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    lastApiKey = apiKey;
  }

  return openaiClient;
}

// ── FalkorDB client management ──

let falkordbClient: FalkorDBClient | null = null;

/**
 * Get (or lazily create) a FalkorDB client connected via ioredis.
 * Reads FALKORDB_URL from environment (defaults to redis://localhost:6379).
 */
async function getFalkorDBClient(): Promise<FalkorDBClient> {
  if (falkordbClient) return falkordbClient;

  // Dynamic import so the module is only loaded when actually needed
  const Redis = (await import("ioredis")).default;
  const url = process.env.FALKORDB_URL || "redis://localhost:6379";
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  await redis.connect();

  falkordbClient = createFalkorDBClient(redis);
  return falkordbClient;
}

// ── Types for raw extraction results ──

interface RawExtractionResult {
  entities: Array<{
    name: string;
    label: string;
    properties: Record<string, string>;
  }>;
  relationships: Array<{
    sourceEntity: string;
    targetEntity: string;
    type: string;
    properties: Record<string, string>;
  }>;
  events: Array<{
    name: string;
    type: string;
    trigger: string;
    startDate: string;
    endDate: string;
    participants: string[];
    outcome: string;
    intent: string;
    deprecates: string[];
  }>;
}

// ── Extraction from a single chunk (dual-track) ──

/**
 * Call OpenAI to extract entities, relationships, and events from a text chunk.
 *
 * WS3-T1.2: Dual-Track Routing
 *  - STATIC track: entities + relationships
 *  - EVENT track: events array
 *
 * @param existingEntities - Entity names already in the graph for dedup hints
 */
export async function extractFromChunk(
  chunkText: string,
  documentTitle: string,
  existingEntities?: string[],
  userId?: string,
  stageConfig?: import("./kg-model-settings").StageModelConfig,
): Promise<{
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  events: ExtractedEvent[];
}> {
  const { systemPrompt, userPrompt } = buildExtractionPrompt(
    chunkText,
    documentTitle,
    existingEntities,
  );

  const apiKey = await getOpenAIApiKey();
  const result = await callStageLlm(apiKey, userId ?? "system", "extraction", {
    systemPrompt,
    userPrompt,
    jsonSchema: {
      name: extractionJsonSchema.name,
      strict: extractionJsonSchema.strict,
      schema: extractionJsonSchema.schema,
    },
    maxOutputTokens: 16384,
    config: stageConfig,
  });

  const content = result.text;
  if (!content) {
    return { entities: [], relationships: [], events: [] };
  }

  let parsed: RawExtractionResult;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error(
      "[KG Extraction] Failed to parse OpenAI response as JSON:",
      content.substring(0, 200),
    );
    return { entities: [], relationships: [], events: [] };
  }

  // Normalize and convert to typed entities
  const entities: GraphEntity[] = (parsed.entities || []).map((e, idx) => ({
    id: `e_${Date.now()}_${idx}`,
    label: normalizeEntityType(e.label),
    name: e.name.trim(),
    properties: e.properties || {},
    sourceKnowledgeBaseId: "", // filled by caller
    sourceChunkIndex: 0, // filled by caller
  }));

  const relationships: GraphRelationship[] = (parsed.relationships || []).map(
    (r, idx) => ({
      id: `r_${Date.now()}_${idx}`,
      type: r.type.toUpperCase().replace(/\s+/g, "_"),
      sourceEntityId: r.sourceEntity.trim(),
      targetEntityId: r.targetEntity.trim(),
      properties: r.properties || {},
      sourceKnowledgeBaseId: "", // filled by caller
    }),
  );

  // Parse events (EVENT track)
  const events: ExtractedEvent[] = (parsed.events || []).map((ev) => ({
    name: ev.name || "",
    type: (ev.type || "change") as ExtractedEvent["type"],
    trigger: ev.trigger || "",
    startDate: ev.startDate || "",
    endDate: ev.endDate || "",
    participants: ev.participants || [],
    outcome: ev.outcome || "",
    intent: (ev.intent === "Evolutionary" ? "Evolutionary" : "Informational") as ExtractedEvent["intent"],
    deprecates: ev.deprecates || [],
  }));

  return { entities, relationships, events };
}

/**
 * @deprecated Use extractFromChunk instead (dual-track extraction).
 * Kept for backward compatibility with existing callers.
 */
export async function extractEntitiesFromChunk(
  chunkText: string,
  documentTitle: string,
): Promise<{ entities: GraphEntity[]; relationships: GraphRelationship[] }> {
  const result = await extractFromChunk(chunkText, documentTitle);
  return { entities: result.entities, relationships: result.relationships };
}

// ── Knowledge graph metadata helpers ──

/**
 * Try to upsert the knowledgeGraphs metadata row.
 * Since the table is created by WS1 and may not exist yet, wrap in try/catch.
 */
async function updateGraphMetadata(
  knowledgeBaseId: string,
  userId: string,
  status: string,
  entityCount?: number,
  relationshipCount?: number,
  errorMessage?: string,
): Promise<void> {
  try {
    // Use raw SQL since the table may or may not exist
    await db.execute(sql`
      INSERT INTO knowledge_graphs (id, knowledge_base_id, user_id, status, entity_count, relationship_count, error_message, updated_at)
      VALUES (gen_random_uuid(), ${knowledgeBaseId}, ${userId}, ${status}, ${entityCount ?? 0}, ${relationshipCount ?? 0}, ${errorMessage ?? null}, NOW())
      ON CONFLICT (knowledge_base_id)
      DO UPDATE SET
        status = ${status},
        entity_count = COALESCE(${entityCount ?? null}::int, knowledge_graphs.entity_count),
        relationship_count = COALESCE(${relationshipCount ?? null}::int, knowledge_graphs.relationship_count),
        error_message = ${errorMessage ?? null},
        updated_at = NOW()
    `);
  } catch (err: any) {
    // Table may not exist yet (WS1 dependency). Log and continue.
    console.warn(
      `[KG Extraction] Could not update knowledge_graphs metadata (table may not exist): ${err.message}`,
    );
  }
}

// ── Chunk extraction tracking ──

/**
 * Mark a chunk as extracted by setting an extractedAt timestamp in its metadata.
 * Uses the existing JSONB metadata column on knowledge_chunks.
 */
async function markChunkExtracted(chunkId: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE knowledge_chunks
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('extractedAt', ${new Date().toISOString()}::text)
      WHERE id = ${chunkId}
    `);
  } catch (err: any) {
    console.warn(
      `[KG Extraction] Could not mark chunk ${chunkId} as extracted: ${err.message}`,
    );
  }
}

/**
 * Fetch existing entity names from the FalkorDB graph.
 * Used to pass context to the extraction prompt for better deduplication.
 */
async function getExistingEntityNames(
  client: FalkorDBClient,
  graphName: string,
): Promise<string[]> {
  try {
    const result = await client.query(
      graphName,
      "MATCH (n) RETURN n.name AS name LIMIT 500",
    );
    return result.records
      .map((r) => r.name)
      .filter((name): name is string => typeof name === "string");
  } catch {
    // Graph may not exist yet
    return [];
  }
}

/**
 * Get all distinct entity labels (types) currently in the graph.
 */
async function getExistingEntityLabels(
  client: FalkorDBClient,
  graphName: string,
): Promise<Set<string>> {
  try {
    const result = await client.query(
      graphName,
      "MATCH (n) RETURN DISTINCT labels(n) AS lbl",
    );
    const labels = new Set<string>();
    for (const r of result.records) {
      const lbl = Array.isArray(r.lbl) ? r.lbl[0] : r.lbl;
      if (typeof lbl === "string") labels.add(lbl);
    }
    return labels;
  } catch {
    return new Set();
  }
}

/**
 * Get all distinct relationship types currently in the graph.
 */
async function getExistingRelationshipTypes(
  client: FalkorDBClient,
  graphName: string,
): Promise<Set<string>> {
  try {
    const result = await client.query(
      graphName,
      "MATCH ()-[r]->() RETURN DISTINCT type(r) AS t",
    );
    const types = new Set<string>();
    for (const r of result.records) {
      if (typeof r.t === "string") types.add(r.t);
    }
    return types;
  } catch {
    return new Set();
  }
}

/**
 * Compute simple normalized similarity between two type names.
 * Used for synonym detection (e.g. "installed_on" ~ "RUNS_ON").
 */
function normalizeTypeName(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, "");
}

/**
 * Levenshtein distance for fuzzy matching, capped early for performance.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 4) return 99;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Find the closest existing type for a candidate name.
 * Returns the existing type if a synonym is detected, null otherwise.
 */
function findClosestType(candidate: string, existing: Set<string>): string | null {
  const candNorm = normalizeTypeName(candidate);
  for (const existingType of existing) {
    const existNorm = normalizeTypeName(existingType);
    if (candNorm === existNorm && candidate !== existingType) {
      // Same normalized form but different surface — definite synonym
      return existingType;
    }
    // Fuzzy match: edit distance ≤ 2 on normalized forms (handles minor variants)
    if (Math.abs(candNorm.length - existNorm.length) <= 2 && editDistance(candNorm, existNorm) <= 2) {
      return existingType;
    }
  }
  return null;
}

/**
 * WS3-T1.5: Schema Induction
 *
 * After extraction, compare newly discovered entity labels and relationship
 * types against the existing schema. Generate proposals for:
 *  - new_entity_type: a label never seen before
 *  - new_relationship_type: a relationship type never seen before
 *  - type_synonym: a label that's a normalized variant of an existing one
 *  - relationship_canonicalization: a rel type that's a variant of an existing one
 *
 * Proposals are written to the schema_proposals table for human curation
 * via the Schema Observatory UI.
 */
async function induceSchemaProposals(
  knowledgeBaseId: string,
  newEntityLabels: Map<string, number>, // label → count
  newRelationshipTypes: Map<string, number>,
  existingLabels: Set<string>,
  existingRelTypes: Set<string>,
): Promise<number> {
  const proposals: any[] = [];

  // Entity labels
  for (const [label, frequency] of newEntityLabels) {
    if (existingLabels.has(label)) continue; // already known

    const synonym = findClosestType(label, existingLabels);
    if (synonym) {
      proposals.push({
        graphId: knowledgeBaseId,
        graphType: "leaf",
        proposalType: "type_synonym",
        proposedName: label,
        proposedDefinition: { mergeTarget: synonym, source: "induction" },
        observedFrequency: frequency,
      });
    } else {
      proposals.push({
        graphId: knowledgeBaseId,
        graphType: "leaf",
        proposalType: "new_entity_type",
        proposedName: label,
        proposedDefinition: { source: "induction", category: "entity" },
        observedFrequency: frequency,
      });
    }
  }

  // Relationship types
  for (const [relType, frequency] of newRelationshipTypes) {
    if (existingRelTypes.has(relType)) continue;

    const canonical = findClosestType(relType, existingRelTypes);
    if (canonical) {
      proposals.push({
        graphId: knowledgeBaseId,
        graphType: "leaf",
        proposalType: "relationship_canonicalization",
        proposedName: relType,
        proposedDefinition: { mergeTarget: canonical, source: "induction" },
        observedFrequency: frequency,
      });
    } else {
      proposals.push({
        graphId: knowledgeBaseId,
        graphType: "leaf",
        proposalType: "new_relationship_type",
        proposedName: relType,
        proposedDefinition: { source: "induction", category: "relationship" },
        observedFrequency: frequency,
      });
    }
  }

  if (proposals.length === 0) return 0;

  try {
    await createSchemaProposals(proposals);
    console.log(
      `[Schema Induction] Created ${proposals.length} proposals for KB ${knowledgeBaseId}`,
    );
    return proposals.length;
  } catch (err: any) {
    console.error(`[Schema Induction] Failed to create proposals: ${err.message}`);
    return 0;
  }
}

// ── Full knowledge base processing (incremental) ──

/**
 * Process chunks in a knowledge base to extract a knowledge graph.
 *
 * WS3-T1.1: Incremental Extraction
 *   Only processes chunks that have not been extracted yet (no extractedAt
 *   in metadata). This implements the Knowledge Increment ΔG_k:
 *     V_k = V_{k-1} ∪ V_k^+
 *     E_k = (E_{k-1} \ E_k^↓) ∪ E_k^+
 *     ∀ e ∈ E_k^↓ : σ(e) ← Deprecated (soft deprecation)
 *
 * WS3-T1.2: Dual-Track Routing integrated per chunk.
 * WS3-T1.3: Governance Adjudication applied per chunk.
 * WS3-T1.4: Extraction events emitted throughout.
 *
 * Steps:
 *  1. Set status to "extracting"
 *  2. Fetch unprocessed chunks (incremental)
 *  3. For each chunk: extract (dual-track), adjudicate (3-filter), write
 *  4. Deduplicate entities across chunks by (name + label)
 *  5. Write entities, relationships, and events to FalkorDB
 *  6. Apply soft deprecations from evolutionary events
 *  7. Update metadata with counts and "completed" status
 *  8. Emit extraction_complete event
 *
 * If any individual chunk fails, processing continues with remaining chunks.
 *
 * @param forceFullReExtraction - If true, process all chunks regardless of
 *   extractedAt status. Useful for rebuilding graphs.
 */
export async function processKnowledgeBase(
  knowledgeBaseId: string,
  userId: string,
  forceFullReExtraction = false,
): Promise<void> {
  console.log(
    `[KG Extraction] Starting ${forceFullReExtraction ? "full" : "incremental"} graph extraction for KB ${knowledgeBaseId}`,
  );

  // Clear event buffer for fresh logging
  clearEventBuffer(knowledgeBaseId);

  await updateGraphMetadata(knowledgeBaseId, userId, "extracting");

  try {
    // 1. Fetch chunks — incremental: only unextracted chunks. RAG ingestion
    // runs in the background (rag-knowledge-routes.ts upload handler), so a
    // freshly-uploaded KB may have zero chunks at this moment. Poll up to 60s
    // for the producer to write chunk rows before giving up. Without this the
    // first /generate call after upload races RAG ingest, finds no chunks,
    // marks the graph "completed (0 entities)" and the UI spins forever.
    const fetchChunks = async () => {
      if (forceFullReExtraction) {
        return db
          .select()
          .from(knowledgeChunks)
          .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));
      }
      return db
        .select()
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId),
            sql`(metadata->>'extractedAt') IS NULL`,
          ),
        );
    };

    const MAX_CHUNK_WAIT_RETRIES = 30;
    const CHUNK_WAIT_DELAY_MS = 2000;
    let chunks: any[] = await fetchChunks();
    for (
      let attempt = 1;
      chunks.length === 0 && attempt <= MAX_CHUNK_WAIT_RETRIES;
      attempt++
    ) {
      console.log(
        `[KG Extraction] No chunks yet for KB ${knowledgeBaseId}, waiting for RAG ingest (retry ${attempt}/${MAX_CHUNK_WAIT_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, CHUNK_WAIT_DELAY_MS));
      chunks = await fetchChunks();
    }

    if (chunks.length === 0) {
      const errMsg =
        "No chunks were produced from this document within 60s. Check that RAG ingestion succeeded.";
      console.log(`[KG Extraction] ${errMsg} (KB ${knowledgeBaseId})`);
      await emitExtractionError(knowledgeBaseId, userId, errMsg);
      await updateGraphMetadata(
        knowledgeBaseId,
        userId,
        "failed",
        undefined,
        undefined,
        errMsg,
      );
      return;
    }

    // Fetch document title for prompt context
    const [kbRecord] = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.id, knowledgeBaseId))
      .limit(1);

    const documentTitle = kbRecord?.title || "Untitled Document";

    // Get FalkorDB client and existing entity names for dedup context
    let client: FalkorDBClient;
    try {
      client = await getFalkorDBClient();
    } catch (err: any) {
      console.error(
        `[KG Extraction] Cannot connect to FalkorDB: ${err.message}`,
      );
      await emitExtractionError(knowledgeBaseId, userId, `FalkorDB connection failed: ${err.message}`);
      await updateGraphMetadata(knowledgeBaseId, userId, "failed", undefined, undefined, err.message);
      return;
    }

    const graphName = getGraphName(userId, knowledgeBaseId);
    const existingEntities = await getExistingEntityNames(client, graphName);

    // Capture existing schema BEFORE writes (for induction comparison)
    const preExistingLabels = await getExistingEntityLabels(client, graphName);
    const preExistingRelTypes = await getExistingRelationshipTypes(client, graphName);

    // Resolve user's chosen models ONCE (cached for the whole batch)
    const extractionConfig = await getStageModel(userId, "extraction");
    const adjudicationConfig = await getStageModel(userId, "adjudication");
    console.log(
      `[KG Extraction] Models — extraction=${extractionConfig.model} (${extractionConfig.reasoningEffort ?? "n/a"}), adjudication=${adjudicationConfig.model} (${adjudicationConfig.reasoningEffort ?? "n/a"})`,
    );

    // 2. Extract from each chunk with dual-track routing + adjudication
    const allEntities: GraphEntity[] = [];
    const allRelationships: GraphRelationship[] = [];
    const allEvents: ExtractedEvent[] = [];
    let totalDeprecations = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        console.log(
          `[KG Extraction] Processing chunk ${i + 1}/${chunks.length} (index ${chunk.chunkIndex}) for KB ${knowledgeBaseId}`,
        );

        // Emit chunk_start event
        await emitChunkStart(knowledgeBaseId, userId, chunk.chunkIndex, chunks.length);

        // Dual-track extraction (uses cached extractionConfig)
        const { entities, relationships, events } = await extractFromChunk(
          chunk.chunkText,
          documentTitle,
          existingEntities.length > 0 ? existingEntities : undefined,
          userId,
          extractionConfig,
        );

        // Tag entities/relationships with source info
        for (const entity of entities) {
          entity.sourceKnowledgeBaseId = knowledgeBaseId;
          entity.sourceChunkIndex = chunk.chunkIndex;
        }
        for (const rel of relationships) {
          rel.sourceKnowledgeBaseId = knowledgeBaseId;
        }

        // WS3-T1.3: Governance Adjudication (3-filter pipeline, uses cached config)
        const adjudication: AdjudicationResult = await adjudicateExtraction(
          entities,
          relationships,
          events,
          chunk.chunkText,
          client,
          graphName,
          userId,
          adjudicationConfig,
        );

        // Emit adjudication result event
        await emitAdjudicationResult(
          knowledgeBaseId,
          userId,
          chunk.chunkIndex,
          adjudication.stats,
        );

        // Collect accepted entities and relationships
        const acceptedEntities = adjudication.entities.filter(
          (e) => e.verdict !== "rejected",
        );
        const acceptedRels = adjudication.relationships.filter(
          (r) => r.verdict !== "rejected",
        );
        const acceptedEvents = adjudication.events.filter(
          (e) => e.verdict !== "rejected",
        );

        // Emit events for each discovered entity/relationship/event
        for (const ent of acceptedEntities) {
          await emitEntityDiscovered(
            knowledgeBaseId, userId, chunk.chunkIndex,
            ent.name, ent.label, ent.confidence,
          );
          // Track new entity names for subsequent chunk prompts
          if (!existingEntities.includes(ent.name)) {
            existingEntities.push(ent.name);
          }
        }

        for (const rel of acceptedRels) {
          await emitRelationshipExtracted(
            knowledgeBaseId, userId, chunk.chunkIndex,
            rel.sourceEntityId, rel.targetEntityId, rel.type, rel.confidence,
          );
        }

        for (const evt of acceptedEvents) {
          await emitEventDetected(
            knowledgeBaseId, userId, chunk.chunkIndex,
            evt.name, evt.intent, evt.deprecationTargets.length,
          );
        }

        // Apply soft deprecations from evolutionary events
        for (const evt of acceptedEvents) {
          if (evt.deprecationTargets.length > 0) {
            const depCount = await applySoftDeprecation(
              evt.deprecationTargets,
              client,
              graphName,
            );
            totalDeprecations += depCount;

            // Emit deprecation events
            for (const dep of evt.deprecationTargets) {
              await emitDeprecation(
                knowledgeBaseId, userId,
                dep.sourceEntityName, dep.targetEntityName,
                dep.relationshipType, dep.reason,
              );
            }
          }
        }

        allEntities.push(...acceptedEntities);
        allRelationships.push(...acceptedRels);
        allEvents.push(...acceptedEvents);

        // Mark chunk as extracted (incremental tracking)
        await markChunkExtracted(chunk.id);

        // Small delay to respect rate limits
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (chunkError: any) {
        console.error(
          `[KG Extraction] Error processing chunk ${i} for KB ${knowledgeBaseId}:`,
          chunkError.message,
        );
        await emitExtractionError(
          knowledgeBaseId, userId,
          chunkError.message, chunk.chunkIndex,
        );
        // Continue with other chunks
      }
    }

    // 3. Deduplicate entities by (name + label)
    const entityMap = new Map<string, GraphEntity>();
    for (const entity of allEntities) {
      const key = `${entity.name.toLowerCase()}::${entity.label}`;
      const existing = entityMap.get(key);
      if (existing) {
        // Merge properties (keep existing, add new)
        existing.properties = { ...entity.properties, ...existing.properties };
      } else {
        entityMap.set(key, entity);
      }
    }

    const uniqueEntities = Array.from(entityMap.values());

    // 4. Write to FalkorDB
    console.log(
      `[KG Extraction] Writing ${uniqueEntities.length} entities, ${allRelationships.length} relationships, ${allEvents.length} events to graph "${graphName}"`,
    );

    // Write entities
    for (const entity of uniqueEntities) {
      try {
        const propsEntries = Object.entries(entity.properties).filter(
          ([k]) => !k.startsWith("_"), // skip internal props
        );
        const propsSetClause =
          propsEntries.length > 0
            ? ", " +
              propsEntries
                .map(
                  ([k, v]) =>
                    `e.${sanitizePropertyKey(k)} = "${escapeCypherString(String(v))}"`,
                )
                .join(", ")
            : "";

        const now = new Date().toISOString();
        const cypher = `MERGE (e:${entity.label} {name: "${escapeCypherString(entity.name)}"}) SET e.sourceKnowledgeBaseId = "${escapeCypherString(entity.sourceKnowledgeBaseId)}", e.sourceChunkIndex = ${entity.sourceChunkIndex}, e.status = "Active", e._updatedAt = "${now}"${propsSetClause}`;
        await client.query(graphName, cypher);
      } catch (err: any) {
        console.error(
          `[KG Extraction] Failed to write entity "${entity.name}":`,
          err.message,
        );
      }
    }

    // Write relationships with status and timestamps
    let relationshipsWritten = 0;
    for (const rel of allRelationships) {
      try {
        const srcExists = uniqueEntities.some(
          (e) => e.name.toLowerCase() === rel.sourceEntityId.toLowerCase(),
        );
        const tgtExists = uniqueEntities.some(
          (e) => e.name.toLowerCase() === rel.targetEntityId.toLowerCase(),
        );

        if (!srcExists || !tgtExists) {
          continue;
        }

        const relType = sanitizeRelType(rel.type);
        const now = new Date().toISOString();

        // Build property SET clause including temporal metadata
        const allProps: Record<string, string> = {
          ...rel.properties,
          status: "Active",
          _validFrom: now,
          _ingested: now,
          sourceKnowledgeBaseId: rel.sourceKnowledgeBaseId,
        };

        // Filter out internal-only props that shouldn't go to SET
        const propsEntries = Object.entries(allProps);
        const propsSetClause =
          propsEntries.length > 0
            ? " SET " +
              propsEntries
                .map(
                  ([k, v]) =>
                    `r.${sanitizePropertyKey(k)} = "${escapeCypherString(String(v))}"`,
                )
                .join(", ")
            : "";

        const cypher = `MATCH (a {name: "${escapeCypherString(rel.sourceEntityId)}"}), (b {name: "${escapeCypherString(rel.targetEntityId)}"}) MERGE (a)-[r:${relType}]->(b)${propsSetClause}`;
        await client.query(graphName, cypher);
        relationshipsWritten++;
      } catch (err: any) {
        console.error(
          `[KG Extraction] Failed to write relationship "${rel.sourceEntityId}" -> "${rel.targetEntityId}":`,
          err.message,
        );
      }
    }

    // Write events as Event nodes with participant edges
    let eventsWritten = 0;
    for (const event of allEvents) {
      try {
        const now = new Date().toISOString();
        const eventProps = [
          `e.trigger = "${escapeCypherString(event.trigger)}"`,
          `e.outcome = "${escapeCypherString(event.outcome)}"`,
          `e.intent = "${escapeCypherString(event.intent)}"`,
          `e.eventType = "${escapeCypherString(event.type)}"`,
          `e.status = "Active"`,
          `e._ingested = "${now}"`,
        ];
        if (event.startDate) {
          eventProps.push(`e.startDate = "${escapeCypherString(event.startDate)}"`);
        }
        if (event.endDate) {
          eventProps.push(`e.endDate = "${escapeCypherString(event.endDate)}"`);
        }

        const cypher = `MERGE (e:Event {name: "${escapeCypherString(event.name)}"}) SET ${eventProps.join(", ")}`;
        await client.query(graphName, cypher);

        // Create PARTICIPATES_IN edges from participants to the event
        for (const participant of event.participants) {
          try {
            await client.query(
              graphName,
              `MATCH (p {name: "${escapeCypherString(participant)}"}), (e:Event {name: "${escapeCypherString(event.name)}"}) MERGE (p)-[r:PARTICIPATES_IN]->(e) SET r.status = "Active", r._ingested = "${now}"`,
            );
          } catch {
            // Participant may not exist — skip silently
          }
        }

        eventsWritten++;
      } catch (err: any) {
        console.error(
          `[KG Extraction] Failed to write event "${event.name}":`,
          err.message,
        );
      }
    }

    // 4.5 WS3-T1.5: Schema Induction
    // Compare new types against pre-existing schema and write proposals.
    try {
      const newLabelCounts = new Map<string, number>();
      for (const ent of uniqueEntities) {
        if (!ent.label) continue;
        newLabelCounts.set(ent.label, (newLabelCounts.get(ent.label) ?? 0) + 1);
      }
      const newRelTypeCounts = new Map<string, number>();
      for (const rel of allRelationships) {
        const t = sanitizeRelType(rel.type);
        if (!t) continue;
        newRelTypeCounts.set(t, (newRelTypeCounts.get(t) ?? 0) + 1);
      }
      await induceSchemaProposals(
        knowledgeBaseId,
        newLabelCounts,
        newRelTypeCounts,
        preExistingLabels,
        preExistingRelTypes,
      );
    } catch (err: any) {
      console.warn(`[KG Extraction] Schema induction failed: ${err.message}`);
    }

    // 5. Update metadata with final counts (additive for incremental)
    // Query actual counts from FalkorDB for accuracy
    let finalEntityCount = uniqueEntities.length;
    let finalRelCount = relationshipsWritten;
    try {
      const entityResult = await client.query(
        graphName,
        "MATCH (n) RETURN count(n) AS cnt",
      );
      const relResult = await client.query(
        graphName,
        "MATCH ()-[r]->() RETURN count(r) AS cnt",
      );
      finalEntityCount = Number(entityResult.records[0]?.cnt ?? uniqueEntities.length);
      finalRelCount = Number(relResult.records[0]?.cnt ?? relationshipsWritten);
    } catch {
      // Use local counts as fallback
    }

    await updateGraphMetadata(
      knowledgeBaseId,
      userId,
      "completed",
      finalEntityCount,
      finalRelCount,
    );

    // Emit extraction_complete event
    await emitExtractionComplete(
      knowledgeBaseId,
      userId,
      finalEntityCount,
      finalRelCount,
      eventsWritten,
      totalDeprecations,
    );

    console.log(
      `[KG Extraction] Completed ${forceFullReExtraction ? "full" : "incremental"} extraction for KB ${knowledgeBaseId}: ${finalEntityCount} entities, ${finalRelCount} relationships, ${eventsWritten} events, ${totalDeprecations} deprecations`,
    );
  } catch (error: any) {
    console.error(
      `[KG Extraction] Fatal error processing KB ${knowledgeBaseId}:`,
      error.message,
    );
    await emitExtractionError(knowledgeBaseId, userId, error.message);
    await updateGraphMetadata(
      knowledgeBaseId,
      userId,
      "failed",
      undefined,
      undefined,
      error.message,
    );
  }
}

// ── Deletion ──

/**
 * Delete a knowledge graph from FalkorDB and remove the metadata row.
 */
export async function deleteKnowledgeGraph(
  knowledgeBaseId: string,
  userId: string,
): Promise<void> {
  console.log(
    `[KG Extraction] Deleting knowledge graph for KB ${knowledgeBaseId}`,
  );

  try {
    const client = await getFalkorDBClient();
    const graphName = getGraphName(userId, knowledgeBaseId);

    // Drop the graph in FalkorDB
    try {
      await client.query(graphName, "MATCH (n) DETACH DELETE n");
    } catch (err: any) {
      // Graph may not exist — that's fine
      console.warn(
        `[KG Extraction] Could not delete graph "${graphName}" (may not exist): ${err.message}`,
      );
    }

    // Also try GRAPH.DELETE command directly via the underlying redis
    try {
      const Redis = (await import("ioredis")).default;
      const url = process.env.FALKORDB_URL || "redis://localhost:6379";
      const redis = new Redis(url);
      await (redis as any).call("GRAPH.DELETE", graphName);
      await redis.quit();
    } catch {
      // Ignore — best-effort cleanup
    }

    // Delete metadata row
    try {
      await db.execute(
        sql`DELETE FROM knowledge_graphs WHERE knowledge_base_id = ${knowledgeBaseId}`,
      );
    } catch {
      // Table may not exist yet
    }

    console.log(
      `[KG Extraction] Deleted knowledge graph for KB ${knowledgeBaseId}`,
    );
  } catch (error: any) {
    console.error(
      `[KG Extraction] Error deleting knowledge graph:`,
      error.message,
    );
    throw error;
  }
}

// ── Query helpers (used by routes) ──

/**
 * Get a summary of the knowledge graph for a knowledge base.
 */
export async function getGraphSummary(
  knowledgeBaseId: string,
  userId: string,
): Promise<{
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: string;
  lastUpdated: string;
  extractedChunks: number;
  totalChunks: number;
}> {
  const chunkProgress = await getChunkProgress(knowledgeBaseId);

  // Try to read from metadata table first
  try {
    const result = await db.execute(
      sql`SELECT * FROM knowledge_graphs WHERE knowledge_base_id = ${knowledgeBaseId} LIMIT 1`,
    );
    const row = (result as any).rows?.[0];
    if (row) {
      return {
        knowledgeBaseId,
        entityCount: row.entity_count || 0,
        relationshipCount: row.relationship_count || 0,
        entityTypes: row.entity_types || [],
        status: row.status || "pending",
        lastUpdated: row.updated_at
          ? new Date(row.updated_at).toISOString()
          : new Date().toISOString(),
        ...chunkProgress,
      };
    }
  } catch {
    // Table may not exist
  }

  // Fall back to querying FalkorDB directly
  try {
    const client = await getFalkorDBClient();
    const graphName = getGraphName(userId, knowledgeBaseId);

    const entityResult = await client.query(
      graphName,
      "MATCH (n) RETURN count(n) AS cnt",
    );
    const relResult = await client.query(
      graphName,
      "MATCH ()-[r]->() RETURN count(r) AS cnt",
    );
    const labelsResult = await client.query(
      graphName,
      "MATCH (n) RETURN DISTINCT labels(n) AS lbl",
    );

    const entityCount = entityResult.records[0]?.cnt ?? 0;
    const relationshipCount = relResult.records[0]?.cnt ?? 0;
    const entityTypes = labelsResult.records
      .map((r) => {
        const lbl = r.lbl;
        return Array.isArray(lbl) ? lbl[0] : lbl;
      })
      .filter(Boolean);

    return {
      knowledgeBaseId,
      entityCount: Number(entityCount),
      relationshipCount: Number(relationshipCount),
      entityTypes,
      status: "completed",
      lastUpdated: new Date().toISOString(),
      ...chunkProgress,
    };
  } catch (falkorErr: any) {
    console.error(
      `[KG Summary] FalkorDB fallback failed for KB ${knowledgeBaseId}:`,
      falkorErr.message || falkorErr,
    );
    return {
      knowledgeBaseId,
      entityCount: 0,
      relationshipCount: 0,
      entityTypes: [],
      status: "pending",
      lastUpdated: new Date().toISOString(),
      ...chunkProgress,
    };
  }
}

/**
 * Return the per-KB chunk extraction progress (extracted / total).
 * Cheap single-query aggregate on knowledge_chunks.
 */
async function getChunkProgress(
  knowledgeBaseId: string,
): Promise<{ extractedChunks: number; totalChunks: number }> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE metadata ? 'extractedAt')::int AS extracted,
        COUNT(*)::int AS total
      FROM knowledge_chunks
      WHERE knowledge_base_id = ${knowledgeBaseId}
    `);
    const row = (result as any).rows?.[0];
    return {
      extractedChunks: Number(row?.extracted ?? 0),
      totalChunks: Number(row?.total ?? 0),
    };
  } catch {
    return { extractedChunks: 0, totalChunks: 0 };
  }
}

/**
 * Query entities from FalkorDB with optional filters.
 */
export async function queryEntities(
  knowledgeBaseId: string,
  userId: string,
  options: {
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ entities: any[]; total: number }> {
  const client = await getFalkorDBClient();
  const graphName = getGraphName(userId, knowledgeBaseId);
  const limit = Math.min(options.limit || 2000, 5000);
  const offset = options.offset || 0;

  try {
    // Build WHERE clause
    const conditions: string[] = [];
    if (options.type) {
      conditions.push(`n:${sanitizeRelType(options.type)}`);
    }
    if (options.search) {
      conditions.push(
        `toLower(n.name) CONTAINS toLower("${escapeCypherString(options.search)}")`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countResult = await client.query(
      graphName,
      `MATCH (n) ${whereClause} RETURN count(n) AS total`,
    );
    const total = Number(countResult.records[0]?.total ?? 0);

    // Get paginated entities — return scalar properties (compact node format is not parsed)
    const dataResult = await client.query(
      graphName,
      `MATCH (n) ${whereClause} RETURN id(n) AS nodeId, labels(n) AS label, n.name AS name, n.sourceKnowledgeBaseId AS sourceKnowledgeBaseId, n.sourceChunkIndex AS sourceChunkIndex, n.description AS description, n.type AS type ORDER BY n.name SKIP ${offset} LIMIT ${limit}`,
    );

    const entities = dataResult.records.map((r, idx) => ({
      id: `e_${r.nodeId ?? idx}`,
      name: r.name,
      label: Array.isArray(r.label) ? r.label[0] : r.label,
      properties: {
        ...(r.description ? { description: r.description } : {}),
        ...(r.type ? { type: r.type } : {}),
      },
      sourceKnowledgeBaseId: r.sourceKnowledgeBaseId,
      sourceChunkIndex: r.sourceChunkIndex ?? 0,
    }));

    return { entities, total };
  } catch (err: any) {
    console.error(
      `[KG Extraction] Error querying entities:`,
      err.message,
    );
    return { entities: [], total: 0 };
  }
}

/**
 * Query relationships from FalkorDB with optional filters.
 */
export async function queryRelationships(
  knowledgeBaseId: string,
  userId: string,
  options: {
    type?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ relationships: any[]; total: number }> {
  const client = await getFalkorDBClient();
  const graphName = getGraphName(userId, knowledgeBaseId);
  const limit = Math.min(options.limit || 10000, 20000);
  const offset = options.offset || 0;

  try {
    const typeFilter = options.type
      ? `:${sanitizeRelType(options.type)}`
      : "";

    // Get total count
    const countResult = await client.query(
      graphName,
      `MATCH ()-[r${typeFilter}]->() RETURN count(r) AS total`,
    );
    const total = Number(countResult.records[0]?.total ?? 0);

    // Get paginated relationships — return scalar properties only
    const dataResult = await client.query(
      graphName,
      `MATCH (a)-[r${typeFilter}]->(b) RETURN id(r) AS relId, id(a) AS srcId, a.name AS source, type(r) AS type, id(b) AS tgtId, b.name AS target ORDER BY a.name SKIP ${offset} LIMIT ${limit}`,
    );

    const relationships = dataResult.records.map((rec, idx) => ({
      id: `r_${rec.relId ?? idx}`,
      type: rec.type,
      sourceEntityId: `e_${rec.srcId}`,
      targetEntityId: `e_${rec.tgtId}`,
      properties: {},
      sourceKnowledgeBaseId: knowledgeBaseId,
    }));

    return { relationships, total };
  } catch (err: any) {
    console.error(
      `[KG Extraction] Error querying relationships:`,
      err.message,
    );
    return { relationships: [], total: 0 };
  }
}

/**
 * Translate a natural language query to Cypher and run it against one or more knowledge bases.
 */
export async function executeNaturalLanguageQuery(
  query: string,
  knowledgeBaseIds: string[],
  userId: string,
  options: {
    entityTypes?: string[];
    maxDepth?: number;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  } = {},
): Promise<{ results: any[]; cypher: string }> {
  const maxDepth = options.maxDepth || 3;

  // Ask GPT to translate the natural language query to Cypher
  const systemPrompt = `You are a Cypher query translator for a knowledge graph stored in FalkorDB (RedisGraph-compatible).

The graph contains nodes with labels: ${ENTITY_TYPES.join(", ")}
Each node has at least a "name" property and may have additional string properties.
Relationships include: WORKS_AT, RELATED_TO, PART_OF, LOCATED_IN, CREATED_BY, DEPENDS_ON, MENTIONS, MANAGES, OWNS, PARTICIPATES_IN, PRODUCES, USED_BY, FUNDED_BY, COLLABORATES_WITH, REPORTS_TO.

Rules:
- Return ONLY the Cypher query as plain text. No markdown, no explanation.
- Use MATCH patterns. Always RETURN results.
- Limit path depths to ${maxDepth} hops maximum.
- LIMIT results to 50 rows maximum.
- Use case-insensitive comparisons with toLower() for name matching.
${options.entityTypes && options.entityTypes.length > 0 ? `- Focus on these entity types: ${options.entityTypes.join(", ")}` : ""}`;

  // Build a single user prompt that includes any conversation history
  let userPrompt = "";
  if (options.conversationHistory && options.conversationHistory.length > 0) {
    for (const entry of options.conversationHistory) {
      userPrompt += `${entry.role}: ${entry.content}\n`;
    }
  }
  userPrompt += `user: ${query}`;

  const apiKey = await getOpenAIApiKey();
  const result = await callStageLlm(apiKey, userId ?? "system", "query", {
    systemPrompt,
    userPrompt,
    maxOutputTokens: 2048,
  });
  let cypher = result.text.trim();

  // Strip markdown code fences if present
  cypher = cypher
    .replace(/^```(?:cypher)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!cypher) {
    return { results: [], cypher: "" };
  }

  // Execute against all specified knowledge bases
  const allResults: any[] = [];
  const client = await getFalkorDBClient();

  for (const kbId of knowledgeBaseIds) {
    const graphName = getGraphName(userId, kbId);
    try {
      const result = await client.query(graphName, cypher);
      for (const record of result.records) {
        allResults.push({ knowledgeBaseId: kbId, ...record });
      }
    } catch (err: any) {
      console.error(
        `[KG Extraction] Cypher query failed on graph "${graphName}":`,
        err.message,
      );
    }
  }

  return { results: allResults, cypher };
}

// ── String helpers ──

/**
 * Escape a string for safe use inside a Cypher double-quoted string.
 */
function escapeCypherString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Sanitize a property key to be a valid Cypher identifier.
 * Removes characters that aren't alphanumeric or underscore.
 */
function sanitizePropertyKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

/**
 * Sanitize a relationship type to be a valid Cypher relationship type.
 * Must be uppercase alphanumeric with underscores.
 */
function sanitizeRelType(type: string): string {
  return type
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/^[0-9]/, "_$&")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "RELATED_TO";
}
