import type { SampledFrame, Window } from "../types.js";
import type { GraphPerson } from "../types.js";

export const VISION_SYSTEM_PROMPT = `You are a video understanding engine. You are given an ordered set of frames sampled from ONE short time window of a video, each labelled with a frame id and its timestamp in seconds. Identify the people, objects, locations, the actions/events that occur, and person↔object interactions.

Guidelines:
- Use window-local ids: persons "p1","p2",…; objects "o1","o2",… (consistent across the frames of THIS window only).
- Give each person a concise, distinguishing "appearance" (clothing/colors/build) — this is later used to track them across windows.
- "objects[].type" is a category noun (e.g. "backpack","car","laptop").
- Each event: a short "action" phrase, the actor (person localId or null), involved object localIds, location name (or null), a confidence in [0,1], a start/end timestamp in SECONDS that fall within this window's time range, and the evidence frame ids that show it.
- Only report what is visually supported. Prefer fewer, higher-confidence events over speculation.
- Return STRICTLY the JSON matching the provided schema. No prose.`;

export function buildVisionUserText(window: Window, frames: SampledFrame[]): string {
  const list = frames
    .map((f) => `- ${f.id} @ ${f.ptsSec.toFixed(2)}s`)
    .join("\n");
  return `Time window #${window.index}: ${window.startSec.toFixed(2)}s – ${window.endSec.toFixed(2)}s.
Frames (in order):
${list}

Analyze these frames and return the JSON. Timestamps must be within ${window.startSec.toFixed(2)}–${window.endSec.toFixed(2)}s. evidenceFrameIds must be chosen from the ids above.`;
}

export const RECONCILE_SYSTEM_PROMPT = `You match people across video time windows. You are given the running roster of already-known people (each with a global trackId and an appearance description) and the people newly detected in the current window. For each new person, decide whether they are the SAME individual as one of the known people (return that trackId) or a NEW person (return null). Base the decision on appearance similarity and plausibility of continuity. Return STRICTLY JSON matching the schema.`;

export function buildReconcileUserText(
  roster: GraphPerson[],
  newPersons: { localId: string; appearance: string }[],
): string {
  const known = roster.length
    ? roster
        .map(
          (p) =>
            `- trackId ${p.trackId}: ${p.appearance} (last seen ${p.lastSeenSec.toFixed(1)}s)`,
        )
        .join("\n")
    : "(none yet)";
  const incoming = newPersons
    .map((p) => `- ${p.localId}: ${p.appearance}`)
    .join("\n");
  return `Known people:\n${known}\n\nNewly detected in this window:\n${incoming}\n\nFor each newly detected localId, return matchedTrackId (an existing trackId) or null if they are new.`;
}
