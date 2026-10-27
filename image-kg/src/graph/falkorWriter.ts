import { falkorQuery, getGraphName } from "../falkor.js";
import { createLogger } from "../logger.js";
import { generateFragmentWrite } from "./cypherGen.js";
import { fragmentLabels, type GraphFragment } from "./graphBuilder.js";

const log = createLogger("falkor-writer");

/**
 * Create the GRAPH_DB_SPEC §6 indexes per label (idempotent). Node identity is
 * enforced by MERGE-on-id; these indexes back the hot read paths (provenance
 * lookup, re-ingest MERGE, name filtering). CREATE INDEX errors when the index
 * already exists — swallowed.
 */
export async function ensureIndexes(graphName: string, labels: string[]): Promise<void> {
  const all = ["Image", ...labels];
  const stmts: string[] = [];
  for (const l of all) {
    stmts.push(`CREATE INDEX FOR (n:\`${l}\`) ON (n.id)`);
    stmts.push(`CREATE INDEX FOR (n:\`${l}\`) ON (n.source_image_id)`);
    stmts.push(`CREATE INDEX FOR (n:\`${l}\`) ON (n.name)`);
  }
  stmts.push("CREATE INDEX FOR (n:`Image`) ON (n.hash)");
  for (const s of stmts) {
    try {
      await falkorQuery(graphName, s);
    } catch {
      /* index already exists */
    }
  }
}

/**
 * Persist a fragment (GRAPH_DB_SPEC §7–§8): ensure indexes, then execute the
 * whole fragment as ONE parameterized GRAPH.QUERY. A single FalkorDB query is
 * atomic, so the fragment commits or fails as a unit. Bounded retry on transient
 * failure is a full-fragment re-run (safe: MERGE + deterministic ids).
 */
export async function writeFragment(
  userId: string,
  kbId: string,
  frag: GraphFragment,
): Promise<{ entityCount: number; relationshipCount: number; entityTypes: string[] }> {
  const graphName = getGraphName(userId, kbId);
  const labels = fragmentLabels(frag);
  await ensureIndexes(graphName, labels);

  const { query, params } = generateFragmentWrite(frag, kbId);

  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await falkorQuery(graphName, query, params);
      log.info(
        `wrote fragment to ${graphName}: ${frag.nodes.length} nodes, ${frag.edges.length} edges (+Image, +${frag.nodes.length} DERIVED_FROM)`,
      );
      return {
        entityCount: frag.nodes.length,
        relationshipCount: frag.edges.length,
        entityTypes: labels,
      };
    } catch (err) {
      lastErr = err;
      log.warn(`fragment write attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}`);
    }
  }
  throw new Error(`graph_write_error: ${(lastErr as Error)?.message ?? "unknown"}`);
}
