"use strict";

/**
 * Knowledge Graph Extraction Event Logging (WS3-T1.4)
 *
 * Logs extraction pipeline events to the `kg_extraction_events` table
 * and emits them via WebSocket for real-time display in the Creation Theatre.
 *
 * Event types:
 *   chunk_start         — Processing of a new chunk has begun
 *   entity_discovered   — A new entity was extracted
 *   relationship_extracted — A new relationship was extracted
 *   event_detected      — An event was detected (EVENT track)
 *   schema_proposal     — A new entity/relationship type was proposed
 *   deprecation         — An edge was soft-deprecated
 *   adjudication_result — Governance pipeline completed for a chunk
 *   extraction_complete — Full KB extraction finished
 *   extraction_error    — An error occurred during extraction
 *
 * The kg_extraction_events table is created by WS1 and may not exist yet.
 * All database writes are wrapped in try/catch to gracefully degrade.
 *
 * WebSocket events follow the pattern:
 *   { type: "kg_extraction_event", payload: ExtractionEvent }
 * sent to all connections belonging to the event's userId.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { WebSocket } from "ws";
import {
  wsManager,
} from "../infrastructure/websocket/connection-manager";

// ── Event Types ──

export const KG_EVENT_TYPES = [
  "chunk_start",
  "entity_discovered",
  "relationship_extracted",
  "event_detected",
  "schema_proposal",
  "deprecation",
  "adjudication_result",
  "extraction_complete",
  "extraction_error",
] as const;

export type KGEventType = (typeof KG_EVENT_TYPES)[number];

export interface ExtractionEvent {
  id?: string;
  knowledgeBaseId: string;
  userId: string;
  eventType: KGEventType;
  chunkIndex?: number;
  entityName?: string;
  entityLabel?: string;
  relationshipType?: string;
  sourceEntity?: string;
  targetEntity?: string;
  eventName?: string;
  eventIntent?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ── In-memory event buffer for replay ──

const EVENT_BUFFER_MAX_SIZE = 5000;
const eventBuffers = new Map<string, ExtractionEvent[]>();

/**
 * Get buffered events for a knowledge base (for replay in Creation Theatre).
 */
export function getBufferedEvents(knowledgeBaseId: string): ExtractionEvent[] {
  return eventBuffers.get(knowledgeBaseId) || [];
}

/**
 * Clear the event buffer for a knowledge base.
 */
export function clearEventBuffer(knowledgeBaseId: string): void {
  eventBuffers.delete(knowledgeBaseId);
}

// ── Core emit function ──

/**
 * Log an extraction event to the database and emit via WebSocket.
 */
export async function emitExtractionEvent(
  event: Omit<ExtractionEvent, "id" | "timestamp">,
): Promise<void> {
  const fullEvent: ExtractionEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // 1. Buffer in memory for replay
  const buffer = eventBuffers.get(event.knowledgeBaseId) || [];
  buffer.push(fullEvent);
  if (buffer.length > EVENT_BUFFER_MAX_SIZE) {
    buffer.shift(); // Remove oldest event
  }
  eventBuffers.set(event.knowledgeBaseId, buffer);

  // 2. Persist to database (non-blocking, graceful failure)
  persistEvent(fullEvent).catch((err) => {
    // Silently ignore — table may not exist yet (WS1 dependency)
    if (!err.message?.includes("does not exist")) {
      console.warn(
        `[KG Events] Failed to persist event: ${err.message}`,
      );
    }
  });

  // 3. Emit via WebSocket to the user's connections
  broadcastToUser(event.userId, {
    type: "kg_extraction_event",
    payload: fullEvent,
  });
}

// ── Convenience emitters ──

export async function emitChunkStart(
  knowledgeBaseId: string,
  userId: string,
  chunkIndex: number,
  totalChunks: number,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "chunk_start",
    chunkIndex,
    details: { totalChunks },
  });
}

export async function emitEntityDiscovered(
  knowledgeBaseId: string,
  userId: string,
  chunkIndex: number,
  entityName: string,
  entityLabel: string,
  confidence?: number,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "entity_discovered",
    chunkIndex,
    entityName,
    entityLabel,
    details: confidence != null ? { confidence } : undefined,
  });
}

export async function emitRelationshipExtracted(
  knowledgeBaseId: string,
  userId: string,
  chunkIndex: number,
  sourceEntity: string,
  targetEntity: string,
  relationshipType: string,
  confidence?: number,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "relationship_extracted",
    chunkIndex,
    sourceEntity,
    targetEntity,
    relationshipType,
    details: confidence != null ? { confidence } : undefined,
  });
}

export async function emitEventDetected(
  knowledgeBaseId: string,
  userId: string,
  chunkIndex: number,
  eventName: string,
  eventIntent: string,
  deprecatesCount: number,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "event_detected",
    chunkIndex,
    eventName,
    eventIntent,
    details: { deprecatesCount },
  });
}

export async function emitSchemaProposal(
  knowledgeBaseId: string,
  userId: string,
  proposalType: "entity_type" | "relationship_type",
  proposedLabel: string,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "schema_proposal",
    details: { proposalType, proposedLabel },
  });
}

export async function emitDeprecation(
  knowledgeBaseId: string,
  userId: string,
  sourceEntity: string,
  targetEntity: string,
  relationshipType: string,
  reason: string,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "deprecation",
    sourceEntity,
    targetEntity,
    relationshipType,
    details: { reason },
  });
}

export async function emitAdjudicationResult(
  knowledgeBaseId: string,
  userId: string,
  chunkIndex: number,
  stats: Record<string, number>,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "adjudication_result",
    chunkIndex,
    details: stats,
  });
}

export async function emitExtractionComplete(
  knowledgeBaseId: string,
  userId: string,
  entityCount: number,
  relationshipCount: number,
  eventCount: number,
  deprecationCount: number,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "extraction_complete",
    details: { entityCount, relationshipCount, eventCount, deprecationCount },
  });
}

export async function emitExtractionError(
  knowledgeBaseId: string,
  userId: string,
  error: string,
  chunkIndex?: number,
): Promise<void> {
  await emitExtractionEvent({
    knowledgeBaseId,
    userId,
    eventType: "extraction_error",
    chunkIndex,
    details: { error },
  });
}

// ── Database persistence ──

/**
 * Persist an extraction event to the kg_extraction_events table.
 * Table may not exist (WS1 dependency) — fails gracefully.
 */
async function persistEvent(event: ExtractionEvent): Promise<void> {
  await db.execute(sql`
    INSERT INTO kg_extraction_events (
      id, knowledge_base_id, user_id, event_type,
      chunk_index, entity_name, entity_label,
      relationship_type, source_entity, target_entity,
      event_name, event_intent, details, created_at
    ) VALUES (
      gen_random_uuid(),
      ${event.knowledgeBaseId},
      ${event.userId},
      ${event.eventType},
      ${event.chunkIndex ?? null},
      ${event.entityName ?? null},
      ${event.entityLabel ?? null},
      ${event.relationshipType ?? null},
      ${event.sourceEntity ?? null},
      ${event.targetEntity ?? null},
      ${event.eventName ?? null},
      ${event.eventIntent ?? null},
      ${event.details ? JSON.stringify(event.details) : null}::jsonb,
      ${event.timestamp}::timestamp
    )
  `);
}

// ── WebSocket broadcasting ──

/**
 * Send a message to all WebSocket connections belonging to a specific user.
 */
function broadcastToUser(userId: string, message: Record<string, unknown>): void {
  try {
    const connectionIds = wsManager.getUserConnections(userId);
    if (connectionIds.size === 0) return;

    const payload = JSON.stringify(message);

    for (const connId of connectionIds) {
      const ws = wsManager.getConnection(connId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  } catch (err: any) {
    // Non-critical — log and continue
    console.warn(
      `[KG Events] Failed to broadcast to user ${userId}: ${err.message}`,
    );
  }
}
