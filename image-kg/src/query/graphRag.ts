import { z } from "zod";
import { getOpenAI } from "../openaiClient.js";
import { config } from "../config.js";
import { falkorQuery, getGraphName } from "../falkor.js";
import { createLogger } from "../logger.js";

const log = createLogger("graphrag");

/**
 * GraphRAG over an image graph (GRAPH_DB_SPEC §9). Label-agnostic: because
 * categories are OPEN model-chosen labels, we pull ALL non-Image nodes and ALL
 * domain edges (image graphs are small), filter by a caller-supplied
 * min_confidence, and let the model reason semantically — returning provenance
 * (source image + confidence) on every fact it relies on.
 */

interface GraphNode {
  id: string;
  label: string;
  name: string;
  confidence: number;
  sourceImageId: string | null;
}
interface GraphRel {
  src: string;
  type: string;
  tgt: string;
  confidence: number;
}
interface GraphContext {
  nodes: GraphNode[];
  relationships: GraphRel[];
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadGraphContext(
  userId: string,
  kbId: string,
  minConfidence = 0,
): Promise<GraphContext> {
  const g = getGraphName(userId, kbId);
  const [nodesRes, relsRes] = await Promise.all([
    falkorQuery(
      g,
      `MATCH (n) WHERE NOT n:Image RETURN n.id AS id, labels(n)[0] AS label, n.name AS name, n.confidence AS confidence, n.source_image_id AS sourceImageId`,
    ),
    falkorQuery(
      g,
      `MATCH (a)-[r]->(b) WHERE type(r) <> 'DERIVED_FROM' RETURN a.name AS src, type(r) AS type, b.name AS tgt, r.confidence AS confidence`,
    ),
  ]);

  const nodes: GraphNode[] = nodesRes.records
    .map((r) => ({
      id: r.id,
      label: r.label,
      name: r.name,
      confidence: num(r.confidence),
      sourceImageId: r.sourceImageId ?? null,
    }))
    .filter((n) => n.name && n.confidence >= minConfidence);

  const relationships: GraphRel[] = relsRes.records
    .map((r) => ({
      src: r.src,
      type: r.type,
      tgt: r.tgt,
      confidence: num(r.confidence),
    }))
    .filter((r) => r.src && r.tgt && r.type && r.confidence >= minConfidence);

  return { nodes, relationships };
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string", description: "natural-language answer grounded in the graph" },
    found: { type: "boolean", description: "whether the graph contains anything relevant" },
    relevantNodeNames: {
      type: "array",
      items: { type: "string" },
      description: "exact node names used as evidence (subset of the provided nodes)",
    },
  },
  required: ["answer", "found", "relevantNodeNames"],
} as const;

const answerZod = z.object({
  answer: z.string(),
  found: z.boolean(),
  relevantNodeNames: z.array(z.string()),
});

const SYSTEM_PROMPT = `You answer questions about a single image using its extracted knowledge graph.

The graph contains:
- OBJECTS, each with a broad CATEGORY (its label, e.g. Animal/Vehicle/Furniture) and a specific NAME, plus a confidence, and
- RELATIONSHIPS between objects (e.g. sitting on, holding, next to), each with a confidence.

Rules:
- Reason about MEANING and synonyms/hypernyms. e.g. a "dog" may be recorded with category "Animal" name "golden retriever"; a "car" as category "Vehicle". Match the user's intent to what is in the graph even if the wording differs.
- Be concise and concrete. Refer to objects by their names and categories.
- Set found=false ONLY if nothing in the graph plausibly relates to the question; then say so plainly. Otherwise found=true.
- Never invent objects/relationships not present in the graph. List the exact node names you relied on in relevantNodeNames.`;

/** True for OpenAI errors that mean "the LLM is unavailable" (quota/rate/auth) rather than a bug. */
function isLlmUnavailable(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  const code = err?.code ?? err?.error?.code;
  const msg = String(err?.message ?? "");
  return (
    status === 429 ||
    status === 401 ||
    code === "insufficient_quota" ||
    code === "rate_limit_exceeded" ||
    /quota|rate limit|insufficient_quota/i.test(msg)
  );
}

export async function answerQuestion(
  userId: string,
  kbId: string,
  question: string,
  opts?: {
    minConfidence?: number;
    history?: { role: "user" | "assistant"; content: string }[];
  },
): Promise<{
  answer: string;
  found: boolean;
  evidence: { name: string; category: string; sourceImageId: string | null; confidence: number }[];
  graphCounts: { nodes: number; relationships: number };
  minConfidence: number;
  degraded?: boolean;
}> {
  const minConfidence = opts?.minConfidence ?? 0;
  const ctx = await loadGraphContext(userId, kbId, minConfidence);

  const contextText = JSON.stringify(
    {
      objects: ctx.nodes.map((n) => ({
        name: n.name,
        category: n.label,
        confidence: n.confidence,
      })),
      relationships: ctx.relationships.map((r) => `${r.src} -[${r.type}]-> ${r.tgt}`),
    },
    null,
    1,
  );

  const openai = await getOpenAI();
  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (opts?.history) for (const h of opts.history) messages.push({ role: h.role, content: h.content });
  messages.push({
    role: "user",
    content: `Image knowledge graph:\n${contextText}\n\nQuestion: ${question}`,
  });

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: config.queryModel,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "graph_answer", strict: true, schema: ANSWER_SCHEMA as any },
      },
    });
  } catch (err: any) {
    // When the LLM is unavailable (quota/rate/auth), don't fail blankly — the
    // image WAS captured. Return the graph facts we already loaded so the user
    // sees what's in the image and why answering is degraded.
    if (isLlmUnavailable(err)) {
      log.warn(`LLM unavailable for kb ${kbId} (${err.message}); returning degraded answer`);
      return {
        answer: `AI answering is temporarily unavailable (OpenAI quota/rate limit). The image was captured: ${ctx.nodes.length} objects and ${ctx.relationships.length} relationships. Detected objects: ${ctx.nodes
          .slice(0, 20)
          .map((n) => n.name)
          .join(", ")}.`,
        found: ctx.nodes.length > 0,
        evidence: ctx.nodes.slice(0, 20).map((n) => ({
          name: n.name,
          category: n.label,
          sourceImageId: n.sourceImageId,
          confidence: n.confidence,
        })),
        graphCounts: { nodes: ctx.nodes.length, relationships: ctx.relationships.length },
        minConfidence,
        degraded: true,
      };
    }
    throw err;
  }

  const parsed = answerZod.parse(
    JSON.parse(completion.choices[0]?.message?.content ?? "{}"),
  );

  // Provenance on every returned fact (GRAPH_DB_SPEC §9).
  const byName = new Map(ctx.nodes.map((n) => [n.name, n]));
  const evidence = parsed.relevantNodeNames
    .map((name) => byName.get(name))
    .filter((n): n is GraphNode => !!n)
    .map((n) => ({
      name: n.name,
      category: n.label,
      sourceImageId: n.sourceImageId,
      confidence: n.confidence,
    }));

  log.info(`answered (found=${parsed.found}) for kb ${kbId}`);
  return {
    answer: parsed.answer,
    found: parsed.found,
    evidence,
    graphCounts: { nodes: ctx.nodes.length, relationships: ctx.relationships.length },
    minConfidence,
  };
}

/**
 * Category histogram for a graph (SYSTEM_DESIGN §7 observability). Read-only —
 * never gates anything.
 */
export async function graphCategories(
  userId: string,
  kbId: string,
): Promise<{ category: string; count: number }[]> {
  const g = getGraphName(userId, kbId);
  const res = await falkorQuery(
    g,
    `MATCH (n) WHERE NOT n:Image RETURN labels(n)[0] AS category, count(*) AS count`,
  );
  return res.records
    .filter((r) => r.category)
    .map((r) => ({ category: String(r.category), count: num(r.count) }));
}
