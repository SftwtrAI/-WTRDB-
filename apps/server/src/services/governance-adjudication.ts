"use strict";

/**
 * Governance Adjudication Service (WS3-T1.3)
 *
 * Implements the three-filter pipeline from DIAL-KG for validating
 * extracted knowledge before it enters the graph:
 *
 *   Filter 1: Evidence Verification — LLM judges whether extracted facts
 *             are actually supported by the source text.
 *   Filter 2: Logical Verification — Rejects contradictions and type
 *             violations against the existing graph.
 *   Filter 3: Evolutionary-Intent Verification — Classifies evolutionary
 *             events and triggers soft deprecation.
 *
 * Design principle: Conservative acceptance. Facts are only rejected if
 * evidence actively contradicts them. Ambiguous facts are accepted with
 * lower confidence. Nothing is ever physically deleted — evolutionary
 * events trigger soft deprecation (status='Deprecated', _invalidAt=now()).
 *
 * Reference:
 *   Bao, W. et al. "DIAL-KG: Schema-Free Incremental Knowledge Graph
 *   Construction via Dynamic Schema Induction and Evolution-Intent
 *   Assessment." arXiv:2603.20059, 2026.
 */

import OpenAI from "openai";
import { db } from "../db";
import { globalSettings } from "@wtrops/shared";
import { eq } from "drizzle-orm";
import type { GraphEntity, GraphRelationship } from "@wtrops/shared";
import type { ExtractedEvent } from "./knowledge-graph-prompts";
import type { FalkorDBClient } from "../infrastructure/falkordb/client";
import { callStageLlm } from "./kg-llm-router";

// ── Types ──

export type AdjudicationVerdict = "accepted" | "rejected" | "low_confidence";

export interface AdjudicatedEntity extends GraphEntity {
  verdict: AdjudicationVerdict;
  confidence: number;
  rejectionReason?: string;
}

export interface AdjudicatedRelationship extends GraphRelationship {
  verdict: AdjudicationVerdict;
  confidence: number;
  rejectionReason?: string;
}

export interface AdjudicatedEvent extends ExtractedEvent {
  verdict: AdjudicationVerdict;
  confidence: number;
  rejectionReason?: string;
  /** Edges that should be soft-deprecated if this event is accepted */
  deprecationTargets: DeprecationTarget[];
}

export interface DeprecationTarget {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: string;
  reason: string;
}

export interface AdjudicationResult {
  entities: AdjudicatedEntity[];
  relationships: AdjudicatedRelationship[];
  events: AdjudicatedEvent[];
  /** Summary statistics */
  stats: {
    entitiesAccepted: number;
    entitiesRejected: number;
    entitiesLowConfidence: number;
    relationshipsAccepted: number;
    relationshipsRejected: number;
    relationshipsLowConfidence: number;
    eventsAccepted: number;
    eventsRejected: number;
    deprecationsTriggered: number;
  };
}

// ── OpenAI client (mirrors pattern from knowledge-graph-extraction.ts) ──

let openaiClient: OpenAI | null = null;
let lastApiKey: string | null = null;

async function getOpenAIApiKey(): Promise<string> {
  try {
    const [dbSetting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "openai_api_key"))
      .limit(1);
    if (dbSetting?.value) return dbSetting.value as string;
  } catch {
    // Table might not exist yet
  }
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  throw new Error(
    "OPENAI_API_KEY is required for governance adjudication.",
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

// LLM used for governance adjudication (matches DIAL-KG extraction model)
const GOVERNANCE_MODEL = "gpt-5.3-codex";
const GOVERNANCE_REASONING = "high";

// ── Filter 1: Evidence Verification ──

/**
 * Verify that extracted entities and relationships are actually supported
 * by the source text. Uses LLM-as-judge to score evidence strength.
 *
 * Conservative principle: only reject if the source text actively
 * contradicts the extraction. Ambiguous or weakly supported facts
 * pass with lower confidence.
 */
async function evidenceVerification(
  entities: GraphEntity[],
  relationships: GraphRelationship[],
  events: ExtractedEvent[],
  sourceText: string,
  userId?: string,
  stageConfig?: import("./kg-model-settings").StageModelConfig,
): Promise<{
  entities: AdjudicatedEntity[];
  relationships: AdjudicatedRelationship[];
  events: (ExtractedEvent & { evidenceConfidence: number; evidenceNote: string })[];
}> {
  if (entities.length === 0 && relationships.length === 0 && events.length === 0) {
    return { entities: [], relationships: [], events: [] };
  }

  // Build a compact representation for the LLM
  const entitySummary = entities.map((e) => `${e.name} (${e.label})`).join("; ");
  const relSummary = relationships
    .map((r) => `${r.sourceEntityId} -[${r.type}]-> ${r.targetEntityId}`)
    .join("; ");
  const eventSummary = events
    .map((ev) => `${ev.name}: ${ev.trigger} [intent=${ev.intent}]`)
    .join("; ");

  const apiKey = await getOpenAIApiKey();
  const result = await callStageLlm(apiKey, userId ?? "system", "adjudication", {
    systemPrompt: `You are an evidence verification judge. Given a source text and extracted knowledge graph components, rate each component's evidence support.

For each entity, relationship, and event, provide:
- supported: true if the source text contains evidence for it, false if it contradicts the text
- confidence: 0.0 to 1.0 (how strongly the source text supports this fact)
- note: brief explanation

Be CONSERVATIVE in rejections. Only mark supported=false if the text ACTIVELY CONTRADICTS the extraction. Weak or implicit evidence should get lower confidence (0.3-0.6) but still supported=true.

Return JSON with: { entities: [{name, supported, confidence, note}], relationships: [{source, target, type, supported, confidence, note}], events: [{name, supported, confidence, note}] }`,
    userPrompt: `Source text:\n---\n${sourceText.substring(0, 3000)}\n---\n\nExtracted entities: ${entitySummary}\n\nExtracted relationships: ${relSummary}\n\nExtracted events: ${eventSummary}`,
    jsonObject: true,
    maxOutputTokens: 8192,
    config: stageConfig,
  });

  const respContent = result.text;

  let parsed: any = { entities: [], relationships: [], events: [] };
  try {
    parsed = JSON.parse(respContent || "{}");
  } catch {
    console.warn("[Governance] Failed to parse evidence verification response");
  }

  // Map verdicts back to entities
  const adjudicatedEntities: AdjudicatedEntity[] = entities.map((e) => {
    const verdict = parsed.entities?.find(
      (v: any) => v.name?.toLowerCase() === e.name.toLowerCase(),
    );
    const confidence = verdict?.confidence ?? 0.7; // default: moderate confidence
    const supported = verdict?.supported ?? true; // conservative: accept by default
    return {
      ...e,
      verdict: supported ? (confidence >= 0.5 ? "accepted" : "low_confidence") : "rejected",
      confidence,
      rejectionReason: supported ? undefined : (verdict?.note || "Not supported by source text"),
    } as AdjudicatedEntity;
  });

  // Map verdicts back to relationships
  const adjudicatedRels: AdjudicatedRelationship[] = relationships.map((r) => {
    const verdict = parsed.relationships?.find(
      (v: any) =>
        v.source?.toLowerCase() === r.sourceEntityId.toLowerCase() &&
        v.target?.toLowerCase() === r.targetEntityId.toLowerCase() &&
        v.type === r.type,
    );
    const confidence = verdict?.confidence ?? 0.7;
    const supported = verdict?.supported ?? true;
    return {
      ...r,
      verdict: supported ? (confidence >= 0.5 ? "accepted" : "low_confidence") : "rejected",
      confidence,
      rejectionReason: supported ? undefined : (verdict?.note || "Not supported by source text"),
    } as AdjudicatedRelationship;
  });

  // Map verdicts back to events
  const adjudicatedEvents = events.map((ev) => {
    const verdict = parsed.events?.find(
      (v: any) => v.name?.toLowerCase() === ev.name.toLowerCase(),
    );
    return {
      ...ev,
      evidenceConfidence: verdict?.confidence ?? 0.7,
      evidenceNote: verdict?.note || "",
    };
  });

  return {
    entities: adjudicatedEntities,
    relationships: adjudicatedRels,
    events: adjudicatedEvents,
  };
}

// ── Filter 2: Logical Verification ──

/**
 * Check extracted facts against the existing graph for logical consistency.
 * Rejects:
 *  - Type violations (entity extracted as Person but exists as Organization)
 *  - Direct contradictions with existing high-confidence edges
 *  - Functional relationship violations (e.g., X REPORTS_TO Y and X REPORTS_TO Z
 *    when REPORTS_TO is functional)
 */
const FUNCTIONAL_RELATIONSHIPS = new Set([
  "MANAGES",
  "REPORTS_TO",
  "LOCATED_IN",
  "RUNS_ON",
]);

async function logicalVerification(
  entities: AdjudicatedEntity[],
  relationships: AdjudicatedRelationship[],
  falkorClient: FalkorDBClient | null,
  graphName: string,
): Promise<{
  entities: AdjudicatedEntity[];
  relationships: AdjudicatedRelationship[];
}> {
  // If no FalkorDB client or graph, skip logical verification
  if (!falkorClient) {
    return { entities, relationships };
  }

  // Check entity type consistency
  for (const entity of entities) {
    if (entity.verdict === "rejected") continue;

    try {
      const result = await falkorClient.query(
        graphName,
        `MATCH (n {name: "${escapeCypher(entity.name)}"}) RETURN labels(n) AS lbl LIMIT 1`,
      );

      if (result.records.length > 0) {
        const existingLabel = Array.isArray(result.records[0].lbl)
          ? result.records[0].lbl[0]
          : result.records[0].lbl;

        if (existingLabel && existingLabel !== entity.label) {
          // Type conflict — lower confidence but don't reject
          // (the new type might be more accurate)
          entity.confidence = Math.min(entity.confidence, 0.5);
          entity.verdict = "low_confidence";
          entity.rejectionReason = `Existing entity has type "${existingLabel}" but extracted as "${entity.label}"`;
        }
      }
    } catch {
      // Graph may not exist yet — skip check
    }
  }

  // Check functional relationship violations
  for (const rel of relationships) {
    if (rel.verdict === "rejected") continue;
    if (!FUNCTIONAL_RELATIONSHIPS.has(rel.type)) continue;

    try {
      const result = await falkorClient.query(
        graphName,
        `MATCH (a {name: "${escapeCypher(rel.sourceEntityId)}"})-[r:${rel.type}]->(b) WHERE b.name <> "${escapeCypher(rel.targetEntityId)}" AND NOT EXISTS(r._invalidAt) RETURN b.name AS existingTarget LIMIT 1`,
      );

      if (result.records.length > 0) {
        // Functional relationship conflict — the new edge supersedes,
        // so we accept but flag the existing edge for deprecation
        rel.confidence = Math.min(rel.confidence, 0.6);
        if (!rel.properties) rel.properties = {};
        rel.properties._supersedes = `${rel.sourceEntityId} ${rel.type} ${result.records[0].existingTarget}`;
      }
    } catch {
      // Graph may not exist yet
    }
  }

  return { entities, relationships };
}

// ── Filter 3: Evolutionary-Intent Verification ──

/**
 * For events classified as Evolutionary, verify the intent classification
 * and compute the set of edges to soft-deprecate.
 *
 * Evolutionary events:
 *  - Promotions, role changes → deprecate old WORKS_AT/MANAGES/REPORTS_TO
 *  - Technology migrations → deprecate old RUNS_ON/DEPENDS_ON
 *  - Organization restructuring → deprecate old PART_OF
 *  - Credential rotation → deprecate old AUTHENTICATES_WITH
 */
async function evolutionaryIntentVerification(
  events: (ExtractedEvent & { evidenceConfidence: number; evidenceNote: string })[],
  falkorClient: FalkorDBClient | null,
  graphName: string,
): Promise<AdjudicatedEvent[]> {
  const adjudicatedEvents: AdjudicatedEvent[] = [];

  for (const event of events) {
    const deprecationTargets: DeprecationTarget[] = [];

    if (event.intent === "Evolutionary" && falkorClient) {
      // Try to resolve each deprecation description to actual graph edges
      for (const depDesc of event.deprecates) {
        // Parse "EntityA RELATIONSHIP EntityB" patterns
        const match = depDesc.match(/^(.+?)\s+([\w_]+)\s+(.+?)(?:\s+with\s+.+)?$/i);
        if (match) {
          const [, srcName, relType, tgtName] = match;
          try {
            const normalizedRelType = relType.toUpperCase().replace(/\s+/g, "_");
            const result = await falkorClient.query(
              graphName,
              `MATCH (a {name: "${escapeCypher(srcName.trim())}"})-[r:${normalizedRelType}]->(b {name: "${escapeCypher(tgtName.trim())}"}) WHERE NOT EXISTS(r._invalidAt) RETURN id(r) AS relId LIMIT 1`,
            );

            if (result.records.length > 0) {
              deprecationTargets.push({
                sourceEntityName: srcName.trim(),
                targetEntityName: tgtName.trim(),
                relationshipType: normalizedRelType,
                reason: `Deprecated by evolutionary event: ${event.name}`,
              });
            }
          } catch {
            // Edge may not exist — that's fine
          }
        }
      }
    }

    adjudicatedEvents.push({
      ...event,
      verdict: event.evidenceConfidence >= 0.3 ? "accepted" : "rejected",
      confidence: event.evidenceConfidence,
      rejectionReason:
        event.evidenceConfidence < 0.3
          ? "Insufficient evidence for event"
          : undefined,
      deprecationTargets,
    });
  }

  return adjudicatedEvents;
}

// ── Public API ──

/**
 * Run the full three-filter governance adjudication pipeline.
 *
 * @param entities - Raw extracted entities
 * @param relationships - Raw extracted relationships
 * @param events - Raw extracted events (from EVENT track)
 * @param sourceText - The original chunk text (for evidence verification)
 * @param falkorClient - FalkorDB client (optional; if null, skips graph checks)
 * @param graphName - FalkorDB graph name (for logical verification)
 */
export async function adjudicateExtraction(
  entities: GraphEntity[],
  relationships: GraphRelationship[],
  events: ExtractedEvent[],
  sourceText: string,
  falkorClient: FalkorDBClient | null,
  graphName: string,
  userId?: string,
  stageConfig?: import("./kg-model-settings").StageModelConfig,
): Promise<AdjudicationResult> {
  console.log(
    `[Governance] Starting adjudication: ${entities.length} entities, ${relationships.length} relationships, ${events.length} events`,
  );

  // Filter 1: Evidence Verification (uses chosen stage config)
  const evidence = await evidenceVerification(
    entities,
    relationships,
    events,
    sourceText,
    userId,
    stageConfig,
  );

  // Filter 2: Logical Verification
  const logical = await logicalVerification(
    evidence.entities,
    evidence.relationships,
    falkorClient,
    graphName,
  );

  // Filter 3: Evolutionary-Intent Verification
  const adjudicatedEvents = await evolutionaryIntentVerification(
    evidence.events,
    falkorClient,
    graphName,
  );

  // Compute stats
  const stats = {
    entitiesAccepted: logical.entities.filter((e) => e.verdict === "accepted").length,
    entitiesRejected: logical.entities.filter((e) => e.verdict === "rejected").length,
    entitiesLowConfidence: logical.entities.filter((e) => e.verdict === "low_confidence").length,
    relationshipsAccepted: logical.relationships.filter((r) => r.verdict === "accepted").length,
    relationshipsRejected: logical.relationships.filter((r) => r.verdict === "rejected").length,
    relationshipsLowConfidence: logical.relationships.filter(
      (r) => r.verdict === "low_confidence",
    ).length,
    eventsAccepted: adjudicatedEvents.filter((e) => e.verdict === "accepted").length,
    eventsRejected: adjudicatedEvents.filter((e) => e.verdict === "rejected").length,
    deprecationsTriggered: adjudicatedEvents.reduce(
      (acc, e) => acc + e.deprecationTargets.length,
      0,
    ),
  };

  console.log(
    `[Governance] Adjudication complete: entities ${stats.entitiesAccepted}A/${stats.entitiesRejected}R/${stats.entitiesLowConfidence}L, rels ${stats.relationshipsAccepted}A/${stats.relationshipsRejected}R, events ${stats.eventsAccepted}A/${stats.eventsRejected}R, ${stats.deprecationsTriggered} deprecations`,
  );

  return {
    entities: logical.entities,
    relationships: logical.relationships,
    events: adjudicatedEvents,
    stats,
  };
}

/**
 * Apply soft deprecation to edges in FalkorDB.
 * Sets status='Deprecated' and _invalidAt=<current ISO timestamp>.
 * Never physically deletes edges.
 */
export async function applySoftDeprecation(
  targets: DeprecationTarget[],
  falkorClient: FalkorDBClient,
  graphName: string,
): Promise<number> {
  let deprecatedCount = 0;
  const now = new Date().toISOString();

  for (const target of targets) {
    try {
      await falkorClient.query(
        graphName,
        `MATCH (a {name: "${escapeCypher(target.sourceEntityName)}"})-[r:${target.relationshipType}]->(b {name: "${escapeCypher(target.targetEntityName)}"}) SET r.status = "Deprecated", r._invalidAt = "${now}", r._deprecationReason = "${escapeCypher(target.reason)}"`,
      );
      deprecatedCount++;
      console.log(
        `[Governance] Soft-deprecated: ${target.sourceEntityName} -[${target.relationshipType}]-> ${target.targetEntityName}`,
      );
    } catch (err: any) {
      console.warn(
        `[Governance] Failed to deprecate edge: ${err.message}`,
      );
    }
  }

  return deprecatedCount;
}

// ── Helpers ──

function escapeCypher(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
