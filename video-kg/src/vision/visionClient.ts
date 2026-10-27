import fs from "node:fs/promises";
import path from "node:path";
import { getOpenAI } from "../openaiClient.js";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import type { SampledFrame, Window, WindowAnalysis } from "../types.js";
import {
  windowAnalysisJsonSchema,
  windowAnalysisZod,
} from "./schema.js";
import { VISION_SYSTEM_PROMPT, buildVisionUserText } from "./prompts.js";

const log = createLogger("vision");

async function frameToDataUrl(frame: SampledFrame): Promise<string> {
  const buf = await fs.readFile(frame.path);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/**
 * Spec steps 5–9 (for one window): send the window's frames to a hosted
 * multimodal model and get structured detections/events back.
 */
export async function analyzeWindow(
  window: Window,
  frames: SampledFrame[],
  logDir?: string,
): Promise<WindowAnalysis> {
  if (frames.length === 0) {
    return {
      windowIndex: window.index,
      startSec: window.startSec,
      endSec: window.endSec,
      persons: [],
      objects: [],
      locations: [],
      events: [],
      interactions: [],
    };
  }

  const openai = await getOpenAI();
  const images = await Promise.all(
    frames.map(async (f) => ({
      type: "image_url" as const,
      image_url: { url: await frameToDataUrl(f), detail: "low" as const },
    })),
  );

  const userText = buildVisionUserText(window, frames);

  const completion = await openai.chat.completions.create({
    model: config.visionModel,
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [{ type: "text", text: userText }, ...images],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "window_analysis",
        strict: true,
        schema: windowAnalysisJsonSchema as any,
      },
    },
  });

  const content = completion.choices[0]?.message?.content ?? "{}";

  if (logDir) {
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(
      path.join(logDir, `win_${window.index}.json`),
      content,
      "utf8",
    );
  }

  const parsed = windowAnalysisZod.parse(JSON.parse(content));
  log.info(
    `window ${window.index}: ${parsed.persons.length} persons, ${parsed.objects.length} objects, ${parsed.events.length} events`,
  );

  return {
    windowIndex: window.index,
    startSec: window.startSec,
    endSec: window.endSec,
    ...parsed,
  };
}
