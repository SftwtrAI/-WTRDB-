import { getOpenAI } from "../openaiClient.js";
import { config } from "../config.js";
import { createLogger } from "../logger.js";
import type { GraphPerson } from "../types.js";
import { reconcileJsonSchema, reconcileZod } from "./schema.js";
import { RECONCILE_SYSTEM_PROMPT, buildReconcileUserText } from "./prompts.js";

const log = createLogger("reconcile");

/**
 * Spec entity-persistence (no ByteTrack): given the running roster of known
 * people and the people newly detected in a window, return localId → existing
 * trackId (or null if new) using an LLM appearance-matching pass.
 */
export async function matchPersons(
  roster: GraphPerson[],
  newPersons: { localId: string; appearance: string }[],
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (newPersons.length === 0) return result;
  if (roster.length === 0) {
    for (const p of newPersons) result.set(p.localId, null);
    return result;
  }

  try {
    const openai = await getOpenAI();
    const completion = await openai.chat.completions.create({
      model: config.reconcileModel,
      messages: [
        { role: "system", content: RECONCILE_SYSTEM_PROMPT },
        { role: "user", content: buildReconcileUserText(roster, newPersons) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "person_reconciliation",
          strict: true,
          schema: reconcileJsonSchema as any,
        },
      },
    });
    const content = completion.choices[0]?.message?.content ?? '{"mappings":[]}';
    const parsed = reconcileZod.parse(JSON.parse(content));
    const validIds = new Set(roster.map((r) => r.trackId));
    for (const m of parsed.mappings) {
      result.set(
        m.localId,
        m.matchedTrackId !== null && validIds.has(m.matchedTrackId)
          ? m.matchedTrackId
          : null,
      );
    }
    // Any unmapped new person → treat as new.
    for (const p of newPersons) if (!result.has(p.localId)) result.set(p.localId, null);
  } catch (err: any) {
    log.warn(`reconcile failed, treating all as new: ${err.message}`);
    for (const p of newPersons) result.set(p.localId, null);
  }
  return result;
}
