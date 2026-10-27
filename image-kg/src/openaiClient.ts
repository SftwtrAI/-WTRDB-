import OpenAI from "openai";
import { config } from "./config.js";
import { readV2OpenAiKey } from "./db.js";
import { createLogger } from "./logger.js";

const log = createLogger("openai");

let client: OpenAI | null = null;
let resolvedKey: string | null = null;

/**
 * Resolve the OpenAI API key: prefer this service's OPENAI_API_KEY, otherwise
 * fall back to wtrdb-v2's stored key (global_settings.openai_api_key).
 */
export async function getOpenAI(): Promise<OpenAI> {
  if (client) return client;
  let key = config.openaiApiKey.trim();
  if (!key) {
    const v2 = await readV2OpenAiKey();
    if (v2) {
      key = v2;
      log.info("Using OpenAI key from v2 global_settings");
    }
  }
  if (!key) {
    throw new Error(
      "No OpenAI API key. Set OPENAI_API_KEY in image-kg/.env or store one in v2's global_settings.openai_api_key.",
    );
  }
  resolvedKey = key;
  client = new OpenAI({ apiKey: key });
  return client;
}

/** True if a key is available without throwing (for health/status reporting). */
export async function hasOpenAIKey(): Promise<boolean> {
  if (resolvedKey) return true;
  if (config.openaiApiKey.trim()) return true;
  return !!(await readV2OpenAiKey());
}
