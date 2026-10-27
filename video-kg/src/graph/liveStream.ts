import { config } from "../config.js";
import { createLogger } from "../logger.js";
import type { GraphDelta } from "./graphBuilder.js";

const log = createLogger("live-stream");

/**
 * Stream the video graph to v2's live knowledge-graph view as node-by-node
 * WebSocket events, so the user watches the graph assemble as each window is
 * analyzed instead of getting a finished snapshot. video-kg can't reach v2's
 * in-process event bus directly, so it POSTs events to v2's trusted
 * `/internal/kg-events` bridge (shared-secret = JWT_SECRET), which re-emits them
 * on the bus the browser subscribes to.
 *
 * Every event carries a STABLE, unique `id` — the client dedups on `id` first
 * (across replay + live delivery), so without it a whole window's same-millisecond
 * events collide and get shown repeatedly. Relationship events also carry resolved
 * `sourceEntity`/`targetEntity` NAMES so the event rail reads "grass -> AT_LOCATION
 * -> forest clearing" instead of "Source -> AT_LOCATION -> Target".
 */

type LiveEvent = {
  id: string;
  knowledgeBaseId: string;
  userId: string;
  eventType:
    | "entity_discovered"
    | "relationship_extracted"
    | "extraction_complete"
    | "extraction_error";
  chunkIndex?: number;
  entityId?: string;
  entityName?: string;
  entityLabel?: string;
  entityProperties?: Record<string, string>;
  relationshipId?: string;
  relationshipType?: string;
  sourceEntityId?: string;
  sourceEntity?: string;
  targetEntityId?: string;
  targetEntity?: string;
  relationshipProperties?: Record<string, string>;
  details?: Record<string, unknown>;
};

async function postEvents(events: LiveEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    const res = await fetch(`${config.v2BaseUrl}/internal/kg-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": config.jwtSecret,
      },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) log.warn(`emit failed: HTTP ${res.status}`);
  } catch (err: any) {
    // Live streaming is best-effort; the persisted graph is the source of truth.
    log.warn(`emit error: ${err?.message ?? err}`);
  }
}

/**
 * Emit the newly-discovered nodes/edges from one window (a `GraphDelta`) to the
 * live view. Nodes first, then edges. Edge endpoints reference global node ids
 * emitted in this delta or an earlier one.
 */
export async function streamLiveDelta(
  kbId: string,
  userId: string,
  delta: GraphDelta,
): Promise<void> {
  const base = { knowledgeBaseId: kbId, userId };

  const entityEvents: LiveEvent[] = delta.nodes.map((n) => ({
    ...base,
    id: `${kbId}:e:${n.id}`,
    eventType: "entity_discovered",
    chunkIndex: 0,
    entityId: n.id,
    entityName: n.name,
    entityLabel: n.label,
    entityProperties: n.props,
  }));

  const relEvents: LiveEvent[] = delta.edges.map((e) => ({
    ...base,
    id: `${kbId}:r:${e.id}`,
    eventType: "relationship_extracted",
    relationshipId: e.id,
    relationshipType: e.type,
    sourceEntityId: e.sourceId,
    sourceEntity: e.sourceName,
    targetEntityId: e.targetId,
    targetEntity: e.targetName,
    relationshipProperties: {},
  }));

  // Nodes first, then edges — the client mounts nodes before wiring edges.
  await postEvents(entityEvents);
  await postEvents(relEvents);
  if (entityEvents.length || relEvents.length) {
    log.info(
      `streamed delta: ${entityEvents.length} nodes + ${relEvents.length} edges to live view for kb ${kbId}`,
    );
  }
}

/** Signal the live view that the build finished (unlocks interaction cleanly). */
export async function emitLiveComplete(
  kbId: string,
  userId: string,
  entityCount: number,
  relationshipCount: number,
  chunks: number,
): Promise<void> {
  await postEvents([
    {
      id: `${kbId}:complete`,
      knowledgeBaseId: kbId,
      userId,
      eventType: "extraction_complete",
      details: {
        entityCount,
        relationshipCount,
        processedChunks: chunks,
        totalChunks: chunks,
      },
    },
  ]);
}

/** Tell the live view the build failed, so it surfaces the error instead of spinning. */
export async function emitLiveError(
  kbId: string,
  userId: string,
  message: string,
): Promise<void> {
  await postEvents([
    {
      id: `${kbId}:error`,
      knowledgeBaseId: kbId,
      userId,
      eventType: "extraction_error",
      details: { error: message },
    },
  ]);
}
