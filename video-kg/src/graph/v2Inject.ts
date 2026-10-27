import { pool } from "../db.js";
import { getGraphName } from "../falkor.js";
import { createLogger } from "../logger.js";

const log = createLogger("v2-inject");

/**
 * Insert the rows version-2.0's UI reads so the video graph shows up + is
 * queryable WITHOUT any change to v2:
 *   1. knowledge_base — makes the KB appear in GET /api/rag-knowledge (is_deleted
 *      defaults false; type="video"). We supply `id` (kbId) so the FalkorDB
 *      graph name kg_{userId}_{kbId} is known before we write the graph.
 *   2. knowledge_graphs — status="completed" + counts so /summary is instant.
 * Idempotent for job resume (ON CONFLICT / delete-then-insert).
 */
export async function injectKnowledgeBaseRows(input: {
  kbId: string;
  userId: string;
  title: string;
  sizeBytes: number;
  durationSec: number;
  videoId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const metadata = {
      source: "video-kg",
      videoId: input.videoId,
      durationSec: input.durationSec,
      ragEnabled: false,
    };

    await client.query(
      `INSERT INTO knowledge_base (id, user_id, type, title, storage_size, metadata)
       VALUES ($1, $2, 'video', $3, $4, $5::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             storage_size = EXCLUDED.storage_size,
             metadata = EXCLUDED.metadata`,
      [
        input.kbId,
        input.userId,
        input.title,
        Math.max(0, Math.round(input.sizeBytes)),
        JSON.stringify(metadata),
      ],
    );

    // Replace any prior graph-metadata row for this KB (idempotent resume).
    await client.query(
      `DELETE FROM knowledge_graphs WHERE knowledge_base_id = $1`,
      [input.kbId],
    );
    await client.query(
      `INSERT INTO knowledge_graphs
         (knowledge_base_id, user_id, status, entity_count, relationship_count, entity_types, falkordb_graph_name, updated_at)
       VALUES ($1, $2, 'completed', $3, $4, $5::jsonb, $6, now())`,
      [
        input.kbId,
        input.userId,
        input.entityCount,
        input.relationshipCount,
        JSON.stringify(input.entityTypes),
        getGraphName(input.userId, input.kbId),
      ],
    );

    await client.query("COMMIT");
    log.info(
      `injected knowledge_base + knowledge_graphs rows for kb ${input.kbId}`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create the v2 rows EARLY, before the graph is written, so the browser's live
 * build view attaches and shows an in-progress ("extracting") graph. Counts are
 * 0 here; `injectKnowledgeBaseRows` later overwrites the knowledge_graphs row
 * with the final counts + status="completed". Kept intentionally with an EMPTY
 * FalkorDB graph so v2's /summary self-heal (which promotes to "completed" once
 * FalkorDB has nodes) does NOT fire prematurely — the live reveal is driven by
 * streamed WS events, not by FalkorDB polling.
 */
export async function beginKnowledgeBaseRows(input: {
  kbId: string;
  userId: string;
  title: string;
  sizeBytes: number;
  durationSec: number;
  videoId: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const metadata = {
      source: "video-kg",
      videoId: input.videoId,
      durationSec: input.durationSec,
      ragEnabled: false,
    };
    await client.query(
      `INSERT INTO knowledge_base (id, user_id, type, title, storage_size, metadata)
       VALUES ($1, $2, 'video', $3, $4, $5::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             storage_size = EXCLUDED.storage_size,
             metadata = EXCLUDED.metadata`,
      [
        input.kbId,
        input.userId,
        input.title,
        Math.max(0, Math.round(input.sizeBytes)),
        JSON.stringify(metadata),
      ],
    );
    // Only (re)initialize the graph-metadata row if it isn't already completed —
    // resuming/re-running an already-materialized KB must NOT knock it back to
    // "extracting"/0 counts (the full graph still lives in FalkorDB).
    const cur = await client.query(
      `SELECT status FROM knowledge_graphs WHERE knowledge_base_id = $1 LIMIT 1`,
      [input.kbId],
    );
    if (cur.rows[0]?.status === "completed") {
      await client.query("COMMIT");
      log.info(`kb ${input.kbId} already completed; left knowledge_graphs untouched`);
      return;
    }
    await client.query(
      `DELETE FROM knowledge_graphs WHERE knowledge_base_id = $1`,
      [input.kbId],
    );
    await client.query(
      `INSERT INTO knowledge_graphs
         (knowledge_base_id, user_id, status, entity_count, relationship_count, entity_types, falkordb_graph_name, updated_at)
       VALUES ($1, $2, 'extracting', 0, 0, '[]'::jsonb, $3, now())`,
      [input.kbId, input.userId, getGraphName(input.userId, input.kbId)],
    );
    await client.query("COMMIT");
    log.info(`began knowledge_base + knowledge_graphs (extracting) for kb ${input.kbId}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Mark the graph-metadata row failed (best-effort) if the pipeline errors out. */
export async function failKnowledgeGraph(kbId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE knowledge_graphs SET status = 'failed', updated_at = now() WHERE knowledge_base_id = $1`,
      [kbId],
    );
  } catch (err: any) {
    log.warn(`failKnowledgeGraph(${kbId}) failed: ${err.message}`);
  }
}

/** Verify the user exists (so the FK on knowledge_base.user_id won't fail). */
export async function userExists(userId: string): Promise<boolean> {
  try {
    const r = await pool.query("SELECT 1 FROM users WHERE id = $1 LIMIT 1", [
      userId,
    ]);
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}
