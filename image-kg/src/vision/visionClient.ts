import fs from "node:fs/promises";
import { getOpenAI } from "../openaiClient.js";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { extractionJsonSchema } from "./schema.js";
import { EXTRACTION_SYSTEM_PROMPT, buildUserText } from "./prompts.js";

const log = createLogger("vision");

async function toDataUrl(preparedPath: string): Promise<string> {
  const buf = await fs.readFile(preparedPath);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/**
 * Single-pass extraction (EXTRACTION_SPEC §2): send the prepared image to GPT-5
 * Vision and return the raw model content (JSON text). `correction`, when given,
 * is the one corrective re-prompt message (§6.3). Returns the raw string so the
 * parser/validator own repair + shape checks.
 */
export async function callVision(
  preparedPath: string,
  correction?: string,
): Promise<string> {
  const openai = await getOpenAI();
  const dataUrl = await toDataUrl(preparedPath);

  const messages: any[] = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: buildUserText() },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" as const } },
      ],
    },
  ];
  if (correction) {
    messages.push({ role: "user", content: correction });
  }

  const completion = await openai.chat.completions.create({
    model: config.visionModel,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "image_extraction",
        strict: true,
        schema: extractionJsonSchema as any,
      },
    },
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  log.info(
    `vision call ${correction ? "(corrective) " : ""}returned ${content.length} chars`,
  );
  return content;
}
