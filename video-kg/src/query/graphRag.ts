import { z } from "zod";
import { getOpenAI } from "../openaiClient.js";
import { config } from "../config.js";
import { falkorQuery, getGraphName } from "../falkor.js";
import { findJobByKbId } from "../jobs/jobStore.js";
import { createLogger } from "../logger.js";

const log = createLogger("graphrag");

/**
 * GraphRAG question answering. Instead of v2's literal NL→Cypher (which can't
 * connect "dragon" to a node named "creature"), we pull the WHOLE graph (video
 * graphs are small — tens of nodes) and let a strong LLM reason over it
 * semantically, citing timestamps + evidence.
 */

interface GraphContext {
  persons: { name: string; appearance: string | null }[];
  objects: { name: string; type: string | null }[];
  locations: { name: string }[];
  events: {
    name: string;
    action: string | null;
    startSec: number | null;
    endSec: number | null;
    confidence: number | null;
    evidenceFrames: string[];
  }[];
  relationships: { src: string; type: string; tgt: string }[];
}

function parseFrames(v: any): string[] {
  if (typeof v !== "string") return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

export async function loadGraphContext(
  userId: string,
  kbId: string,
): Promise<GraphContext> {
  const g = getGraphName(userId, kbId);
  const [persons, objects, locations, events, rels] = await Promise.all([
    falkorQuery(g, `MATCH (p:Person) RETURN p.name AS name, p.description AS appearance`),
    falkorQuery(g, `MATCH (o:Object) RETURN o.name AS name, o.type AS type`),
    falkorQuery(g, `MATCH (l:Location) RETURN l.name AS name`),
    falkorQuery(
      g,
      `MATCH (e:Event) RETURN e.name AS name, e.action AS action, e.timestampStartSec AS startSec, e.timestampEndSec AS endSec, e.confidence AS confidence, e.evidenceFrames AS evidenceFrames ORDER BY e.timestampStartSec`,
    ),
    // PARTICIPATES_IN is a mirror of ACTOR (written for v2's NL→Cypher prompt);
    // exclude it here so the LLM context doesn't get each actor→event edge twice.
    falkorQuery(g, `MATCH (a)-[r]->(b) WHERE type(r) <> 'PARTICIPATES_IN' RETURN a.name AS src, type(r) AS type, b.name AS tgt`),
  ]);

  return {
    persons: persons.records.map((r) => ({ name: r.name, appearance: r.appearance ?? null })),
    objects: objects.records.map((r) => ({ name: r.name, type: r.type ?? null })),
    locations: locations.records.map((r) => ({ name: r.name })),
    events: events.records.map((r) => ({
      name: r.name,
      action: r.action ?? null,
      // FalkorDB compact format returns doubles as strings — coerce to number.
      startSec: r.startSec == null ? null : Number(r.startSec),
      endSec: r.endSec == null ? null : Number(r.endSec),
      confidence: r.confidence == null ? null : Number(r.confidence),
      evidenceFrames: parseFrames(r.evidenceFrames),
    })),
    relationships: rels.records
      .filter((r) => r.src && r.tgt && r.type)
      .map((r) => ({ src: r.src, type: r.type, tgt: r.tgt })),
  };
}

function mmss(sec: number | null): string {
  const n = Number(sec);
  if (sec === null || !Number.isFinite(n)) return "?";
  const s = Math.floor(n);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string", description: "natural-language answer, citing mm:ss timestamps" },
    found: { type: "boolean", description: "whether the graph contains anything relevant" },
    relevantEventNames: {
      type: "array",
      items: { type: "string" },
      description: "exact names of events used as evidence (subset of the provided events)",
    },
  },
  required: ["answer", "found", "relevantEventNames"],
} as const;

const answerZod = z.object({
  answer: z.string(),
  found: z.boolean(),
  relevantEventNames: z.array(z.string()),
});

const SYSTEM_PROMPT = `You answer questions about a single video using its extracted knowledge graph.

The graph contains:
- people (described by visual APPEARANCE, not real names),
- objects, locations, and
- timestamped EVENTS (each with start/end seconds and a confidence), plus
- relationships (ACTOR/PARTICIPATES_IN link a person to an event; OBJECT links an event to an object; AT_LOCATION; INTERACTS_WITH; NEXT_EVENT gives temporal order).

Rules:
- Reason about MEANING and synonyms/hypernyms. e.g. a "dragon" may be recorded as "creature" or "flying creature"; a "car" as "vehicle"; "kid" as "child/person". Match the user's intent to what is in the graph even if the wording differs.
- Treat event seconds as the time in the video. Always cite timestamps as mm:ss for anything you assert.
- Be concise and concrete. Mention the people (by their appearance description) and objects involved when relevant.
- Set found=false ONLY if nothing in the graph plausibly relates to the question; then say so plainly. Otherwise found=true.
- Never invent entities/events not present in the graph. List the exact event names you relied on in relevantEventNames.`;

export async function answerQuestion(
  userId: string,
  kbId: string,
  question: string,
  history?: { role: "user" | "assistant"; content: string }[],
): Promise<{
  answer: string;
  found: boolean;
  evidence: { event: string; timestamp: string; frameUrls: string[] }[];
  graphCounts: { persons: number; objects: number; locations: number; events: number };
}> {
  const ctx = await loadGraphContext(userId, kbId);

  // Compact, readable serialization for the model.
  const contextText = JSON.stringify(
    {
      people: ctx.persons.map((p) => p.appearance || p.name),
      objects: ctx.objects.map((o) => o.name),
      locations: ctx.locations.map((l) => l.name),
      events: ctx.events.map((e) => ({
        name: e.name,
        action: e.action,
        time: `${mmss(e.startSec)}-${mmss(e.endSec)}`,
        startSec: e.startSec,
        confidence: e.confidence,
      })),
      relationships: ctx.relationships.map((r) => `${r.src} -[${r.type}]-> ${r.tgt}`),
    },
    null,
    1,
  );

  const openai = await getOpenAI();
  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (history) for (const h of history) messages.push({ role: h.role, content: h.content });
  messages.push({
    role: "user",
    content: `Video knowledge graph:\n${contextText}\n\nQuestion: ${question}`,
  });

  const completion = await openai.chat.completions.create({
    model: config.queryModel,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: { name: "graph_answer", strict: true, schema: ANSWER_SCHEMA as any },
    },
  });

  const parsed = answerZod.parse(
    JSON.parse(completion.choices[0]?.message?.content ?? "{}"),
  );

  // Resolve evidence frame URLs from the cited events.
  const job = await findJobByKbId(kbId);
  const videoId = job?.videoId;
  const byName = new Map(ctx.events.map((e) => [e.name, e]));
  const evidence = parsed.relevantEventNames
    .map((name) => byName.get(name))
    .filter((e): e is GraphContext["events"][number] => !!e)
    .map((e) => ({
      event: e.name,
      timestamp: mmss(e.startSec),
      frameUrls: videoId
        ? e.evidenceFrames.map((id) => `/videos/${videoId}/frames/${id}`)
        : [],
    }));

  log.info(`answered (found=${parsed.found}) for kb ${kbId}`);
  return {
    answer: parsed.answer,
    found: parsed.found,
    evidence,
    graphCounts: {
      persons: ctx.persons.length,
      objects: ctx.objects.length,
      locations: ctx.locations.length,
      events: ctx.events.length,
    },
  };
}
