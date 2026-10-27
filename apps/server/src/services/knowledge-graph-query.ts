"use strict";

/**
 * Knowledge Graph Query Service
 *
 * Provides read-only Cypher query methods for searching entities and
 * traversing relationships in FalkorDB knowledge graphs. Used by the
 * MCP tools (Contract D) and the internal tools API for agent-worker
 * graph queries during live calls.
 *
 * All queries are strictly read-only (MATCH/RETURN only, no writes).
 */

import { falkordbPoolManager } from "../infrastructure/falkordb/pool-manager";
import {
  getGraphName,
  getFederationGraphName,
} from "../infrastructure/falkordb/client";
import { logger } from "../utils/logger";

/**
 * Internal properties that should not be surfaced to agents.
 * These are extraction/merge metadata not useful in conversational context.
 */
const INTERNAL_PROPERTY_KEYS = new Set([
  "sourceChunkIndex",
  "sourceKnowledgeBaseId",
  "_sourceGraphs",
  "_resolvedFrom",
  "_alignmentConfidence",
  "_alignmentTier",
  "_materializedAt",
  "_mergeMode",
  "_consistencyScore",
  "_conflictId",
  "_freshness",
  "embedding",
]);

// ── Public Interfaces ──

export interface GraphEntity {
  name: string;
  label: string;
  properties: Record<string, any>;
}

export interface GraphRelationship {
  sourceEntity: string;
  targetEntity: string;
  type: string;
  properties: Record<string, any>;
}

export interface GraphQueryResult {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  summary: string;
}

export interface GraphSearchResult {
  entities: GraphEntity[];
}

export interface GraphNeighborsResult {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

interface QueryOptions {
  entityTypes?: string[];
  maxDepth?: number;
  limit?: number;
}

// ── Helpers ──

const LOG_TAG = "KnowledgeGraphQuery";
const DEFAULT_LIMIT = 50;
const MAX_HOPS = 5;

/**
 * Parse a FalkorDB record row into a GraphEntity.
 * Nodes come back as arrays: [id, labels[], properties[]] in compact mode,
 * or as objects with .properties in non-compact mode.
 * We handle both formats defensively.
 */
function parseEntity(raw: any): GraphEntity | null {
  if (!raw) return null;

  // Object format (non-compact or already parsed)
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return {
      name: raw.name || raw.properties?.name || "Unknown",
      label: raw.label || raw.labels?.[0] || "Unknown",
      properties: raw.properties || {},
    };
  }

  // Compact array format: [id, [labels], [[key, type, value], ...]]
  if (Array.isArray(raw)) {
    const labels = Array.isArray(raw[1]) ? raw[1] : [];
    const propsArray = Array.isArray(raw[2]) ? raw[2] : [];

    const properties: Record<string, any> = {};
    for (const prop of propsArray) {
      if (Array.isArray(prop) && prop.length >= 3) {
        properties[prop[0]] = prop[2];
      }
    }

    return {
      name: properties.name || "Unknown",
      label: labels[0] || "Unknown",
      properties,
    };
  }

  return null;
}

/**
 * Parse a FalkorDB relationship into a GraphRelationship.
 * Relationships in compact format: [id, type, srcNodeId, destNodeId, [[key, type, value], ...]]
 */
function parseRelationship(
  raw: any,
  sourceEntityName?: string,
  targetEntityName?: string,
): GraphRelationship | null {
  if (!raw) return null;

  // Object format
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return {
      sourceEntity: raw.sourceEntity || sourceEntityName || "Unknown",
      targetEntity: raw.targetEntity || targetEntityName || "Unknown",
      type: raw.type || raw.relType || "RELATED_TO",
      properties: raw.properties || {},
    };
  }

  // Compact array format: [id, relType, srcId, destId, [[key, type, value], ...]]
  if (Array.isArray(raw)) {
    const relType = typeof raw[1] === "string" ? raw[1] : "RELATED_TO";
    const propsArray = Array.isArray(raw[4]) ? raw[4] : [];

    const properties: Record<string, any> = {};
    for (const prop of propsArray) {
      if (Array.isArray(prop) && prop.length >= 3) {
        properties[prop[0]] = prop[2];
      }
    }

    return {
      sourceEntity: sourceEntityName || "Unknown",
      targetEntity: targetEntityName || "Unknown",
      type: relType,
      properties,
    };
  }

  return null;
}

/**
 * Deduplicate entities by name (case-insensitive).
 */
function deduplicateEntities(entities: GraphEntity[]): GraphEntity[] {
  const seen = new Map<string, GraphEntity>();
  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, entity);
    }
  }
  return Array.from(seen.values());
}

/**
 * Deduplicate relationships by source+target+type.
 */
function deduplicateRelationships(
  relationships: GraphRelationship[],
): GraphRelationship[] {
  const seen = new Set<string>();
  const result: GraphRelationship[] = [];
  for (const rel of relationships) {
    const key = `${rel.sourceEntity.toLowerCase()}|${rel.type}|${rel.targetEntity.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(rel);
    }
  }
  return result;
}

// ── Service Class ──

export class KnowledgeGraphQueryService {
  /**
   * Query the knowledge graph with a free-text query.
   * Searches entities by name/property matching and traverses relationships.
   *
   * Supports both leaf graphs (knowledgeBaseIds) and federation graphs
   * (federationIds). Federation graphs are materialized FalkorDB named
   * graphs that support native Cypher path traversals across what were
   * previously separate subgraphs.
   *
   * Returns matching entities, their relationships, and a formatted summary.
   */
  static async queryGraph(
    query: string,
    knowledgeBaseIds: string[],
    userId: string,
    options?: QueryOptions & { federationIds?: string[] },
  ): Promise<GraphQueryResult> {
    const limit = options?.limit || DEFAULT_LIMIT;
    const allEntities: GraphEntity[] = [];
    const allRelationships: GraphRelationship[] = [];

    const client = falkordbPoolManager.getClient();

    // Build the list of all graph names to query
    const graphTargets: Array<{ graphName: string; source: string }> = [];

    for (const kbId of knowledgeBaseIds) {
      graphTargets.push({
        graphName: getGraphName(userId, kbId),
        source: `kb:${kbId}`,
      });
    }

    // Federation graphs — these are materialized snapshots that support
    // native Cypher path traversals across constituent subgraphs
    if (options?.federationIds) {
      for (const fedId of options.federationIds) {
        graphTargets.push({
          graphName: getFederationGraphName(userId, fedId),
          source: `federation:${fedId}`,
        });
      }
    }

    for (const { graphName, source } of graphTargets) {
      try {
        // Step 1: Find entities matching the query by name (case-insensitive contains)
        let entityFilter = "";
        if (
          options?.entityTypes &&
          options.entityTypes.length > 0
        ) {
          // Filter by label -- use WHERE with label check
          const labelChecks = options.entityTypes
            .map((t) => `label(n) = $entityType_${t.replace(/\W/g, "")}`)
            .join(" OR ");
          entityFilter = `AND (${labelChecks})`;
        }

        const searchCypher = `
          MATCH (n)
          WHERE toLower(n.name) CONTAINS toLower($searchTerm)
          ${entityFilter}
          RETURN n
          LIMIT $resultLimit
        `;

        const params: Record<string, any> = {
          searchTerm: query,
          resultLimit: limit,
        };

        // Add entity type parameters if filtering
        if (options?.entityTypes) {
          for (const t of options.entityTypes) {
            params[`entityType_${t.replace(/\W/g, "")}`] = t;
          }
        }

        const entityResult = await client.query(graphName, searchCypher, params);

        const matchedEntities: GraphEntity[] = [];
        for (const record of entityResult.records) {
          const entity = parseEntity(record.n);
          if (entity) matchedEntities.push(entity);
        }

        // Step 2: For matched entities, find their relationships and neighbors
        if (matchedEntities.length > 0) {
          const neighborCypher = `
            MATCH (n)-[r]-(m)
            WHERE toLower(n.name) CONTAINS toLower($searchTerm)
            RETURN n, r, m
            LIMIT $resultLimit
          `;

          const neighborResult = await client.query(
            graphName,
            neighborCypher,
            { searchTerm: query, resultLimit: limit },
          );

          for (const record of neighborResult.records) {
            const sourceEntity = parseEntity(record.n);
            const targetEntity = parseEntity(record.m);
            const rel = parseRelationship(
              record.r,
              sourceEntity?.name,
              targetEntity?.name,
            );

            if (targetEntity) matchedEntities.push(targetEntity);
            if (rel) allRelationships.push(rel);
          }
        }

        allEntities.push(...matchedEntities);
      } catch (error: any) {
        logger.warn(
          `[${LOG_TAG}] Query failed for graph ${graphName} (${source}): ${error.message}`,
          undefined,
          LOG_TAG,
        );
        // Continue with other graphs
      }
    }

    const entities = deduplicateEntities(allEntities);
    const relationships = deduplicateRelationships(allRelationships);
    const summary = KnowledgeGraphQueryService.formatGraphResultForAgent(
      entities,
      relationships,
    );

    return { entities, relationships, summary };
  }

  /**
   * Get neighbors of a specific entity up to maxHops away.
   * Supports both leaf graphs and federation graphs.
   */
  static async getEntityNeighbors(
    entityName: string,
    knowledgeBaseIds: string[],
    userId: string,
    maxHops?: number,
    federationIds?: string[],
  ): Promise<GraphNeighborsResult> {
    const hops = Math.min(maxHops || 2, MAX_HOPS);
    const allEntities: GraphEntity[] = [];
    const allRelationships: GraphRelationship[] = [];

    const client = falkordbPoolManager.getClient();

    // Build graph name list from both leaf and federation refs
    const graphNames: string[] = [
      ...knowledgeBaseIds.map((kbId) => getGraphName(userId, kbId)),
      ...(federationIds || []).map((fedId) =>
        getFederationGraphName(userId, fedId),
      ),
    ];

    for (const graphName of graphNames) {
      try {
        // Variable-length path query to find neighbors up to maxHops
        const cypher = `
          MATCH (n)-[r*1..${hops}]-(m)
          WHERE toLower(n.name) CONTAINS toLower($name)
          RETURN n, r, m
          LIMIT $resultLimit
        `;

        const result = await client.query(graphName, cypher, {
          name: entityName,
          resultLimit: DEFAULT_LIMIT,
        });

        for (const record of result.records) {
          const sourceEntity = parseEntity(record.n);
          const targetEntity = parseEntity(record.m);

          if (sourceEntity) allEntities.push(sourceEntity);
          if (targetEntity) allEntities.push(targetEntity);

          // r is an array of relationships in a variable-length path
          const rels = Array.isArray(record.r) ? record.r : [record.r];
          for (const rel of rels) {
            const parsedRel = parseRelationship(
              rel,
              sourceEntity?.name,
              targetEntity?.name,
            );
            if (parsedRel) allRelationships.push(parsedRel);
          }
        }
      } catch (error: any) {
        logger.warn(
          `[${LOG_TAG}] Neighbor query failed for graph ${graphName}: ${error.message}`,
          undefined,
          LOG_TAG,
        );
      }
    }

    return {
      entities: deduplicateEntities(allEntities),
      relationships: deduplicateRelationships(allRelationships),
    };
  }

  /**
   * Search entities by name pattern match, optionally filtered by entity type.
   * Supports both leaf graphs and federation graphs.
   */
  static async searchEntities(
    searchTerm: string,
    knowledgeBaseIds: string[],
    userId: string,
    entityType?: string,
    federationIds?: string[],
  ): Promise<GraphSearchResult> {
    const allEntities: GraphEntity[] = [];

    const client = falkordbPoolManager.getClient();

    // Build graph name list from both leaf and federation refs
    const graphNames: string[] = [
      ...knowledgeBaseIds.map((kbId) => getGraphName(userId, kbId)),
      ...(federationIds || []).map((fedId) =>
        getFederationGraphName(userId, fedId),
      ),
    ];

    for (const graphName of graphNames) {
      try {
        let cypher: string;
        const params: Record<string, any> = {
          searchTerm,
          resultLimit: DEFAULT_LIMIT,
        };

        if (entityType) {
          cypher = `
            MATCH (n)
            WHERE toLower(n.name) CONTAINS toLower($searchTerm)
              AND label(n) = $entityType
            RETURN n
            LIMIT $resultLimit
          `;
          params.entityType = entityType;
        } else {
          cypher = `
            MATCH (n)
            WHERE toLower(n.name) CONTAINS toLower($searchTerm)
            RETURN n
            LIMIT $resultLimit
          `;
        }

        const result = await client.query(graphName, cypher, params);

        for (const record of result.records) {
          const entity = parseEntity(record.n);
          if (entity) allEntities.push(entity);
        }
      } catch (error: any) {
        logger.warn(
          `[${LOG_TAG}] Search failed for graph ${graphName}: ${error.message}`,
          undefined,
          LOG_TAG,
        );
      }
    }

    return {
      entities: deduplicateEntities(allEntities),
    };
  }

  /**
   * Filter out internal/extraction metadata properties from an entity's
   * property map. Surfaces numeric, string, and boolean user-facing
   * properties while stripping provenance and extraction internals.
   *
   * Follows the functorial transformation principle (Hamdani & Turkarslan,
   * KGSWC 2025): the Brain API projection strips infrastructure-level
   * properties to produce a clean application-level property graph.
   */
  static filterEntityProperties(
    properties: Record<string, any>,
  ): Record<string, any> {
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(properties)) {
      // Skip internal metadata properties
      if (INTERNAL_PROPERTY_KEYS.has(key)) continue;
      // Skip keys starting with underscore (convention for internal props)
      if (key.startsWith("_")) continue;
      // Keep meaningful values
      if (value !== null && value !== undefined && value !== "") {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  /**
   * Format graph query results into readable text for the voice agent.
   *
   * Enhanced to:
   *  - Surface numeric properties (counts, scores, versions, etc.)
   *  - Filter out internal metadata (sourceChunkIndex, embeddings, etc.)
   *  - Include relationship evidence text when available
   *
   * Produces output like:
   *   "Found 3 entities: Entity X (Organization) [employees: 150, revenue: 5M],
   *    Entity Y (Person), Entity Z (Concept).
   *    Relationships: Entity Y WORKS AT Entity X (evidence: employment records); ..."
   */
  static formatGraphResultForAgent(
    entities: GraphEntity[],
    relationships: GraphRelationship[],
  ): string {
    if (entities.length === 0 && relationships.length === 0) {
      return "No entities or relationships found in the knowledge graph for this query.";
    }

    const parts: string[] = [];

    // Summarize entities with filtered properties
    if (entities.length > 0) {
      const entityDescriptions = entities
        .slice(0, 20) // Cap for readability in voice context
        .map((e) => {
          const filtered = KnowledgeGraphQueryService.filterEntityProperties(
            e.properties || {},
          );
          const desc = filtered.description;
          // Remove description from inline properties since it's shown separately
          delete filtered.description;
          // Remove name from properties since it's already in the entity name
          delete filtered.name;

          // Build property annotations for numeric and notable string values
          const propAnnotations: string[] = [];
          for (const [key, value] of Object.entries(filtered)) {
            if (typeof value === "number") {
              propAnnotations.push(`${key}: ${value}`);
            } else if (
              typeof value === "boolean"
            ) {
              propAnnotations.push(`${key}: ${value}`);
            } else if (
              typeof value === "string" &&
              value.length <= 60 &&
              key !== "source_id"
            ) {
              propAnnotations.push(`${key}: ${value}`);
            }
          }

          let result = `${e.name} (${e.label})`;
          if (propAnnotations.length > 0) {
            result += ` [${propAnnotations.slice(0, 5).join(", ")}]`;
          }
          if (desc) {
            result += ` - ${desc}`;
          }
          return result;
        });

      parts.push(
        `Found ${entities.length} entities: ${entityDescriptions.join("; ")}.`,
      );
    }

    // Summarize relationships with evidence when available
    if (relationships.length > 0) {
      const relDescriptions = relationships
        .slice(0, 15) // Cap for readability
        .map((r) => {
          const filtered = KnowledgeGraphQueryService.filterEntityProperties(
            r.properties || {},
          );
          const evidence = filtered.evidence || filtered.evidence_text;
          const confidence = filtered.confidence;

          let desc = `${r.sourceEntity} ${r.type.replace(/_/g, " ")} ${r.targetEntity}`;
          const annotations: string[] = [];
          if (evidence && typeof evidence === "string" && evidence.length <= 80) {
            annotations.push(`evidence: ${evidence}`);
          }
          if (typeof confidence === "number") {
            annotations.push(`confidence: ${confidence}`);
          }
          if (annotations.length > 0) {
            desc += ` (${annotations.join(", ")})`;
          }
          return desc;
        });

      parts.push(`Relationships: ${relDescriptions.join("; ")}.`);
    }

    return parts.join(" ");
  }
}
