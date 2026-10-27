"use strict";

/**
 * KG LLM Router
 *
 * Single entry point for calling OpenAI from any DIAL-KG pipeline stage.
 * Handles the dispatch between the Chat Completions API (classic GPT-4
 * family) and the Responses API (GPT-5 reasoning family).
 *
 * Callers pass a StageModelConfig that says which model + reasoning effort
 * to use; this module figures out the right payload shape.
 */

import OpenAI from "openai";
import { getStageModel, getModelOption, type PipelineStage, type StageModelConfig } from "./kg-model-settings";

export interface LlmCallOptions {
  systemPrompt?: string;
  userPrompt: string;
  jsonSchema?: { name: string; strict?: boolean; schema: any };
  jsonObject?: boolean; // free-form JSON output (no schema)
  maxOutputTokens?: number;
  // Optional: pass a pre-resolved config to skip the DB lookup (e.g. when
  // running per chunk in a tight loop with cached settings)
  config?: StageModelConfig;
}

export interface LlmCallResult {
  text: string;
  modelUsed: string;
  api: "responses" | "chat";
}

let openaiClient: OpenAI | null = null;
let lastApiKey: string | null = null;

async function getOpenAI(apiKey: string): Promise<OpenAI> {
  if (!openaiClient || lastApiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    lastApiKey = apiKey;
  }
  return openaiClient;
}

/**
 * Make an LLM call for a specific pipeline stage.
 * Resolves the user's chosen model and dispatches to the right OpenAI API.
 */
export async function callStageLlm(
  apiKey: string,
  userId: string,
  stage: PipelineStage,
  options: LlmCallOptions,
): Promise<LlmCallResult> {
  const config = options.config ?? (await getStageModel(userId, stage));
  const modelOption = getModelOption(config.model);

  // If we don't know the model in our catalog, default to the responses API
  // for any model name starting with gpt-5 / gpt-5- / o-, otherwise chat.
  const useResponsesApi =
    modelOption?.api === "responses" ||
    (modelOption == null && /^gpt-5/.test(config.model));

  const openai = await getOpenAI(apiKey);

  if (useResponsesApi) {
    return callResponsesApi(openai, config, options);
  }
  return callChatApi(openai, config, options);
}

// ── Responses API (gpt-5 reasoning family) ──

async function callResponsesApi(
  openai: OpenAI,
  config: StageModelConfig,
  options: LlmCallOptions,
): Promise<LlmCallResult> {
  const input: any[] = [];
  if (options.systemPrompt) {
    input.push({ role: "system", content: options.systemPrompt });
  }
  input.push({ role: "user", content: options.userPrompt });

  const payload: any = {
    model: config.model,
    input,
    max_output_tokens: options.maxOutputTokens ?? 8192,
  };

  if (config.reasoningEffort) {
    payload.reasoning = { effort: config.reasoningEffort };
  }

  if (options.jsonSchema) {
    payload.text = {
      format: {
        type: "json_schema",
        name: options.jsonSchema.name,
        strict: options.jsonSchema.strict ?? true,
        schema: options.jsonSchema.schema,
      },
    };
  } else if (options.jsonObject) {
    payload.text = { format: { type: "json_object" } };
  }

  const response = await (openai as any).responses.create(payload);

  // Extract text from the responses-API output structure
  let text = "";
  const out = (response as any).output ?? [];
  for (const item of out) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c.type === "output_text" && typeof c.text === "string") {
          text += c.text;
        }
      }
    }
  }

  return { text, modelUsed: config.model, api: "responses" };
}

// ── Chat Completions API (gpt-4o, gpt-4.1, etc.) ──

async function callChatApi(
  openai: OpenAI,
  config: StageModelConfig,
  options: LlmCallOptions,
): Promise<LlmCallResult> {
  const messages: any[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: options.userPrompt });

  const payload: any = {
    model: config.model,
    messages,
    temperature: 0.1,
    max_tokens: options.maxOutputTokens ?? 4096,
  };

  if (options.jsonSchema) {
    payload.response_format = {
      type: "json_schema",
      json_schema: {
        name: options.jsonSchema.name,
        strict: options.jsonSchema.strict ?? true,
        schema: options.jsonSchema.schema,
      },
    };
  } else if (options.jsonObject) {
    payload.response_format = { type: "json_object" };
  }

  const response = await openai.chat.completions.create(payload);
  const text = response.choices[0]?.message?.content ?? "";

  return { text, modelUsed: config.model, api: "chat" };
}
