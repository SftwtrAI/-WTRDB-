"use strict";

/**
 * KG Model Settings Service
 *
 * Per-user model preferences for each stage of the DIAL-KG pipeline.
 * Users pick which OpenAI model + reasoning effort to use for each stage.
 */

import { db } from "../db";
import { userKgModelSettings } from "@wtrops/shared";
import { eq } from "drizzle-orm";

export type PipelineStage = "extraction" | "adjudication" | "query";

export interface StageModelConfig {
  model: string;
  reasoningEffort: "low" | "medium" | "high" | null;
}

export type UserKgPreferences = Partial<Record<PipelineStage, StageModelConfig>>;

// ── Defaults (used when user has no preference set) ──

export const DEFAULT_STAGE_MODELS: Record<PipelineStage, StageModelConfig> = {
  extraction: { model: "gpt-5.3-codex", reasoningEffort: "high" },
  adjudication: { model: "gpt-5-mini", reasoningEffort: "medium" },
  query: { model: "gpt-4.1-mini", reasoningEffort: null },
};

// ── Curated catalog of available models per stage ──
//
// Each model carries metadata so the UI can show cost/quality/speed
// tradeoffs and educational descriptions.

export interface ModelOption {
  id: string;
  label: string;
  family: string;
  api: "responses" | "chat";  // which OpenAI endpoint to use
  reasoning: boolean;          // supports reasoning_effort?
  speed: "fast" | "medium" | "slow" | "very-slow";
  cost: "$" | "$$" | "$$$" | "$$$$";
  quality: "good" | "great" | "best";
  description: string;
}

export const MODEL_CATALOG: ModelOption[] = [
  // ── Premium reasoning ──
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    family: "Reasoning",
    api: "responses",
    reasoning: true,
    speed: "very-slow",
    cost: "$$$$",
    quality: "best",
    description:
      "Newest reasoning model. Highest extraction quality, deepest analysis. Slowest and most expensive.",
  },
  {
    id: "gpt-5-codex",
    label: "GPT-5 Codex",
    family: "Reasoning",
    api: "responses",
    reasoning: true,
    speed: "slow",
    cost: "$$$",
    quality: "best",
    description:
      "Strong reasoning model. Excellent extraction quality with slightly faster responses than 5.3.",
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    family: "Reasoning",
    api: "responses",
    reasoning: true,
    speed: "slow",
    cost: "$$$",
    quality: "great",
    description:
      "General-purpose reasoning. Good balance for extraction and complex governance.",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    family: "Reasoning",
    api: "responses",
    reasoning: true,
    speed: "medium",
    cost: "$$",
    quality: "great",
    description:
      "Smaller reasoning model. Much cheaper than full 5-series, still does multi-step thinking.",
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 Nano",
    family: "Reasoning",
    api: "responses",
    reasoning: true,
    speed: "fast",
    cost: "$",
    quality: "good",
    description:
      "Cheapest reasoning model. Good for low-stakes reasoning tasks like simple Cypher generation.",
  },

  // ── Classic GPT-4.1 (no reasoning) ──
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    family: "Chat",
    api: "chat",
    reasoning: false,
    speed: "fast",
    cost: "$$",
    quality: "great",
    description:
      "Refined GPT-4 series. Great for fast extraction without paying for reasoning.",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    family: "Chat",
    api: "chat",
    reasoning: false,
    speed: "fast",
    cost: "$",
    quality: "good",
    description:
      "Smaller GPT-4.1. Cheap and fast. Use when budget matters more than depth.",
  },
];

// ── Stage descriptions for the UI ──

export interface StageInfo {
  id: PipelineStage;
  label: string;
  description: string;
  whyItMatters: string;
  recommendedTier: "premium" | "balanced" | "budget";
}

export const STAGE_INFO: StageInfo[] = [
  {
    id: "extraction",
    label: "Extraction",
    description:
      "Reads each document chunk and extracts entities, relationships, and events. This is the core of DIAL-KG.",
    whyItMatters:
      "Quality here determines everything downstream. A weak model produces orphan entities, missed relationships, and noisy types. Spend the most here.",
    recommendedTier: "premium",
  },
  {
    id: "adjudication",
    label: "Governance Adjudication",
    description:
      "Verifies extracted facts against the source text. Filters out hallucinations and weak evidence before writing to the graph.",
    whyItMatters:
      "Acts as a safety net for the extractor. A medium-tier model is usually enough — it just needs to spot obvious contradictions.",
    recommendedTier: "balanced",
  },
  {
    id: "query",
    label: "Natural Language Query",
    description:
      "Translates user questions into Cypher queries against the FalkorDB graph.",
    whyItMatters:
      "Runs on demand when users ask questions. Speed and cost matter more than deep reasoning since the graph schema is small.",
    recommendedTier: "budget",
  },
];

// ── DB access ──

export async function getUserKgPreferences(
  userId: string,
): Promise<UserKgPreferences> {
  try {
    const [row] = await db
      .select()
      .from(userKgModelSettings)
      .where(eq(userKgModelSettings.userId, userId))
      .limit(1);
    return (row?.preferences as UserKgPreferences) ?? {};
  } catch {
    return {};
  }
}

export async function setUserKgPreferences(
  userId: string,
  preferences: UserKgPreferences,
): Promise<void> {
  // Upsert
  const existing = await db
    .select()
    .from(userKgModelSettings)
    .where(eq(userKgModelSettings.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userKgModelSettings)
      .set({ preferences: preferences as any, updatedAt: new Date() })
      .where(eq(userKgModelSettings.userId, userId));
  } else {
    await db.insert(userKgModelSettings).values({
      userId,
      preferences: preferences as any,
    });
  }
}

/**
 * Resolve the model config for a given user + stage.
 * Falls back to defaults if user has no preference set.
 */
export async function getStageModel(
  userId: string,
  stage: PipelineStage,
): Promise<StageModelConfig> {
  const prefs = await getUserKgPreferences(userId);
  return prefs[stage] ?? DEFAULT_STAGE_MODELS[stage];
}

/**
 * Look up a model in the catalog (returns null if unknown).
 */
export function getModelOption(modelId: string): ModelOption | null {
  return MODEL_CATALOG.find((m) => m.id === modelId) ?? null;
}
