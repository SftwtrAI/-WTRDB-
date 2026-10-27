/**
 * Knowledge Graph Types (Contract B)
 *
 * Shared type definitions for the FalkorDB knowledge graph integration.
 * Used by both server-side graph operations and client-side displays.
 *
 * WS3 additions:
 *  - GraphEvent — event structures from dual-track extraction
 *  - ExtractionEventPayload — real-time extraction event for WebSocket
 *  - GraphEntityStatus / GraphEdgeStatus — temporal status tracking
 */

/** Status for graph entities and edges (temporal knowledge graph) */
export type GraphEntityStatus = "Active" | "Deprecated" | "Contested";

/** A node/entity extracted from a knowledge base document */
export interface GraphEntity {
  id: string;
  label: string;
  name: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
  sourceChunkIndex: number;
}

/** A directed relationship between two entities */
export interface GraphRelationship {
  id: string;
  type: string;
  sourceEntityId: string;
  targetEntityId: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
}

/** An event extracted from the EVENT track (dual-track routing) */
export interface GraphEvent {
  name: string;
  type: string;
  trigger: string;
  startDate: string;
  endDate: string;
  participants: string[];
  outcome: string;
  intent: "Informational" | "Evolutionary";
  deprecates: string[];
}

/** Summary statistics for a knowledge base's graph */
export interface KnowledgeGraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: "pending" | "extracting" | "completed" | "failed";
  lastUpdated: string;
}

/**
 * Real-time extraction event payload (WS3-T1.4).
 * Emitted via WebSocket with type "kg_extraction_event".
 */
export interface ExtractionEventPayload {
  knowledgeBaseId: string;
  userId: string;
  eventType:
    | "chunk_start"
    | "entity_discovered"
    | "relationship_extracted"
    | "event_detected"
    | "schema_proposal"
    | "deprecation"
    | "adjudication_result"
    | "extraction_complete"
    | "extraction_error";
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
