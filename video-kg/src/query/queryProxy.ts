import { config } from "../config.js";
import { mintToken } from "../auth/v2auth.js";
import { createLogger } from "../logger.js";

const log = createLogger("query");

/**
 * Spec §10 query flow: reuse v2's existing NL→Cypher engine verbatim. We mint a
 * v2-compatible JWT and POST to /api/knowledge-graph/query scoped to the video's
 * KB. The rows returned carry our Event.name / timestampStartSec / confidence /
 * evidenceFrames — i.e. timestamped, evidence-bearing answers.
 */
export async function queryVideoGraph(
  userId: string,
  kbId: string,
  question: string,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ results: any[]; cypher: string }> {
  const token = mintToken(userId);
  const res = await fetch(`${config.v2BaseUrl}/api/knowledge-graph/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: question,
      knowledgeBaseIds: [kbId],
      conversationHistory,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    log.error(`v2 query failed: ${res.status} ${body.slice(0, 300)}`);
    throw new Error(`v2 query failed: ${res.status}`);
  }
  const data: any = await res.json();
  return {
    results: data.results ?? data.rows ?? [],
    cypher: data.cypher ?? "",
  };
}
