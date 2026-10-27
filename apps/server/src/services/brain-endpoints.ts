"use strict";

/**
 * Brain Endpoints Service
 *
 * Manages externally-published "Brain" interfaces for knowledge graphs.
 * Each Brain endpoint wraps one KG and exposes it via REST + MCP transports
 * with per-endpoint model configuration that overrides the user's app-wide
 * DIAL-KG settings.
 */

import crypto from "crypto";
import { db } from "../db";
import { brainEndpoints, type BrainEndpointRow } from "@wtrops/shared";
import { eq, and, desc } from "drizzle-orm";
import { getStageModel, type PipelineStage, type StageModelConfig } from "./kg-model-settings";

export interface CreateBrainEndpointInput {
  knowledgeBaseId: string;
  name: string;
  queryModel?: string | null;
  queryReasoningEffort?: "low" | "medium" | "high" | null;
  traversalModel?: string | null;
  traversalReasoningEffort?: "low" | "medium" | "high" | null;
  rateLimitPerMinute?: number;
  allowNlQueries?: boolean;
  allowCypher?: boolean;
  expiresAt?: Date | null;
}

export interface UpdateBrainEndpointInput {
  name?: string;
  queryModel?: string | null;
  queryReasoningEffort?: "low" | "medium" | "high" | null;
  traversalModel?: string | null;
  traversalReasoningEffort?: "low" | "medium" | "high" | null;
  rateLimitPerMinute?: number;
  allowNlQueries?: boolean;
  allowCypher?: boolean;
  expiresAt?: Date | null;
}

function generateApiKey(): string {
  return `brn_${crypto.randomBytes(24).toString("hex")}`;
}

export async function createBrainEndpoint(
  userId: string,
  input: CreateBrainEndpointInput,
): Promise<BrainEndpointRow> {
  const apiKey = generateApiKey();
  const [row] = await db
    .insert(brainEndpoints)
    .values({
      userId,
      knowledgeBaseId: input.knowledgeBaseId,
      name: input.name,
      apiKey,
      queryModel: input.queryModel ?? null,
      queryReasoningEffort: input.queryReasoningEffort ?? null,
      traversalModel: input.traversalModel ?? null,
      traversalReasoningEffort: input.traversalReasoningEffort ?? null,
      rateLimitPerMinute: input.rateLimitPerMinute ?? 60,
      allowNlQueries: input.allowNlQueries ?? true,
      allowCypher: input.allowCypher ?? false,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row;
}

export async function listBrainEndpoints(
  userId: string,
): Promise<(BrainEndpointRow & { avgLatencyMs: number })[]> {
  const rows = await db
    .select()
    .from(brainEndpoints)
    .where(eq(brainEndpoints.userId, userId))
    .orderBy(desc(brainEndpoints.createdAt));
  return rows.map((r) => ({
    ...r,
    avgLatencyMs: r.queryCount > 0 ? Math.round(Number(r.totalLatencyMs) / r.queryCount) : 0,
  }));
}

export async function getBrainEndpointByApiKey(
  apiKey: string,
): Promise<BrainEndpointRow | null> {
  const [row] = await db
    .select()
    .from(brainEndpoints)
    .where(eq(brainEndpoints.apiKey, apiKey))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
  return row;
}

export async function getBrainEndpointById(
  userId: string,
  id: string,
): Promise<BrainEndpointRow | null> {
  const [row] = await db
    .select()
    .from(brainEndpoints)
    .where(and(eq(brainEndpoints.id, id), eq(brainEndpoints.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateBrainEndpoint(
  userId: string,
  id: string,
  patch: UpdateBrainEndpointInput,
): Promise<BrainEndpointRow | null> {
  const updates: any = { updatedAt: new Date() };
  for (const key of Object.keys(patch) as (keyof UpdateBrainEndpointInput)[]) {
    if (patch[key] !== undefined) updates[key] = patch[key];
  }
  const [row] = await db
    .update(brainEndpoints)
    .set(updates)
    .where(and(eq(brainEndpoints.id, id), eq(brainEndpoints.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteBrainEndpoint(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(brainEndpoints)
    .where(and(eq(brainEndpoints.id, id), eq(brainEndpoints.userId, userId)))
    .returning();
  return result.length > 0;
}

export async function regenerateApiKey(
  userId: string,
  id: string,
): Promise<BrainEndpointRow | null> {
  const newKey = generateApiKey();
  const [row] = await db
    .update(brainEndpoints)
    .set({ apiKey: newKey, updatedAt: new Date() })
    .where(and(eq(brainEndpoints.id, id), eq(brainEndpoints.userId, userId)))
    .returning();
  return row ?? null;
}

export async function recordEndpointQuery(
  endpointId: string,
  latencyMs: number,
): Promise<void> {
  try {
    await db
      .update(brainEndpoints)
      .set({
        queryCount: sqlIncrement("query_count", 1),
        totalLatencyMs: sqlIncrement("total_latency_ms", latencyMs),
        lastUsedAt: new Date(),
      } as any)
      .where(eq(brainEndpoints.id, endpointId));
  } catch (err) {
    // Don't fail the request if stat tracking fails
    console.warn("[BrainEndpoint] Failed to record query stats:", err);
  }
}

// drizzle helper for atomic increments
function sqlIncrement(column: string, delta: number) {
  // We need raw SQL for the atomic increment. Use a tagged template if available;
  // otherwise fall back to a simple expression.
  const { sql } = require("drizzle-orm");
  return sql.raw(`${column} + ${Number(delta)}`);
}

/**
 * Resolve the model config for a given Brain endpoint + pipeline stage.
 * If the endpoint has a per-endpoint override, use it; otherwise fall back
 * to the user's app-wide DIAL-KG setting.
 */
export async function resolveEndpointModelConfig(
  endpoint: BrainEndpointRow,
  stage: "query" | "traversal",
): Promise<StageModelConfig> {
  if (stage === "query") {
    if (endpoint.queryModel) {
      return {
        model: endpoint.queryModel,
        reasoningEffort: (endpoint.queryReasoningEffort as any) ?? null,
      };
    }
    return getStageModel(endpoint.userId, "query");
  }
  // traversal — use the user's "query" stage as the closest analogue if not set
  if (endpoint.traversalModel) {
    return {
      model: endpoint.traversalModel,
      reasoningEffort: (endpoint.traversalReasoningEffort as any) ?? null,
    };
  }
  return getStageModel(endpoint.userId, "query" as PipelineStage);
}
