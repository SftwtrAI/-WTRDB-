"use strict";

/**
 * Hybrid Knowledge Search Service
 *
 * Combines vector RAG search with FalkorDB knowledge graph queries
 * to provide richer, relationship-aware context to LLM agents.
 *
 * Graceful degradation: if the graph layer is unavailable or errors,
 * the service falls back to RAG-only results. Existing RAG behavior
 * is never broken.
 */

import { db } from "../db";
import { knowledgeGraphs } from "@wtrops/shared";
import { eq, and, inArray } from "drizzle-orm";
import { RAGKnowledgeService } from "./rag-knowledge";
import { logger } from "../utils/logger";

const SOURCE = "HybridKnowledgeSearch";

// ── Public types ──

export interface HybridSearchResult {
  /** Combined formatted text for LLM consumption */
  context: string;
  /** Raw vector search text */
  ragContext: string;
  /** Entities returned from the knowledge graph */
  graphEntities: GraphEntity[];
  /** Relationships returned from the knowledge graph */
  graphRelationships: GraphRelationship[];
  /** Breakdown of sources contributing to the result */
  sources: { type: "rag" | "graph"; count: number }[];
}

export interface GraphEntity {
  name: string;
  type: string;
  properties?: Record<string, any>;
}

export interface GraphRelationship {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}

// ── Service ──

export class HybridKnowledgeSearchService {
  /**
   * Search across both vector RAG and knowledge graph for the given KBs.
   *
   * 1. Checks which KBs have completed knowledge graphs.
   * 2. Runs vector RAG search + graph entity/relationship query in parallel.
   * 3. Merges results into a single formatted context string.
   *
   * If graph querying fails at any point, falls back to RAG-only.
   */
  static async search(
    query: string,
    knowledgeBaseIds: string[],
    userId: string,
  ): Promise<HybridSearchResult> {
    // 1. Check which KBs have completed knowledge graphs
    let graphKbIds: string[] = [];
    try {
      const graphs = await db
        .select()
        .from(knowledgeGraphs)
        .where(
          and(
            inArray(knowledgeGraphs.knowledgeBaseId, knowledgeBaseIds),
            eq(knowledgeGraphs.userId, userId),
            eq(knowledgeGraphs.status, "completed"),
          ),
        );
      graphKbIds = graphs.map((g) => g.knowledgeBaseId);
    } catch (err: any) {
      logger.warn(
        `Failed to query knowledge_graphs table: ${err.message}`,
        undefined,
        SOURCE,
      );
      // Continue with RAG only
    }

    // 2. Run searches in parallel
    const [ragResults, graphResults] = await Promise.all([
      // Vector RAG search (always runs)
      this.runRagSearch(query, knowledgeBaseIds, userId),
      // Graph search (only if any KBs have graphs)
      graphKbIds.length > 0
        ? this.runGraphSearch(query, graphKbIds, userId)
        : Promise.resolve({ entities: [] as GraphEntity[], relationships: [] as GraphRelationship[] }),
    ]);

    // 3. Merge results into formatted context
    const context = this.formatHybridResult(
      ragResults.context,
      graphResults.entities,
      graphResults.relationships,
    );

    const sources: HybridSearchResult["sources"] = [];
    if (ragResults.chunkCount > 0) {
      sources.push({ type: "rag", count: ragResults.chunkCount });
    }
    if (graphResults.entities.length > 0 || graphResults.relationships.length > 0) {
      sources.push({
        type: "graph",
        count: graphResults.entities.length + graphResults.relationships.length,
      });
    }

    return {
      context,
      ragContext: ragResults.context,
      graphEntities: graphResults.entities,
      graphRelationships: graphResults.relationships,
      sources,
    };
  }

  /**
   * Format the combined result for LLM consumption.
   */
  static formatHybridResult(
    ragContext: string,
    graphEntities: GraphEntity[],
    graphRelationships: GraphRelationship[],
  ): string {
    const parts: string[] = [];

    // Always include RAG context
    if (ragContext && ragContext.trim()) {
      parts.push(`=== Document Context ===\n${ragContext}`);
    }

    // Append graph context if available
    if (graphEntities.length > 0 || graphRelationships.length > 0) {
      const graphParts: string[] = ["=== Knowledge Graph ==="];

      if (graphEntities.length > 0) {
        const entityLines = graphEntities
          .slice(0, 20) // Cap at 20 entities to avoid context overflow
          .map((e) => {
            const props = e.properties
              ? ` (${Object.entries(e.properties).map(([k, v]) => `${k}: ${v}`).join(", ")})`
              : "";
            return `- [${e.type}] ${e.name}${props}`;
          });
        graphParts.push(`Entities:\n${entityLines.join("\n")}`);
      }

      if (graphRelationships.length > 0) {
        const relLines = graphRelationships
          .slice(0, 20) // Cap at 20 relationships
          .map((r) => `- ${r.source} --[${r.type}]--> ${r.target}`);
        graphParts.push(`Relationships:\n${relLines.join("\n")}`);
      }

      parts.push(graphParts.join("\n"));
    }

    return parts.join("\n\n");
  }

  // ── Private helpers ──

  /**
   * Run vector RAG search using the existing RAGKnowledgeService.
   */
  private static async runRagSearch(
    query: string,
    knowledgeBaseIds: string[],
    userId: string,
  ): Promise<{ context: string; chunkCount: number }> {
    try {
      const results = await RAGKnowledgeService.searchKnowledge(
        query,
        knowledgeBaseIds,
        userId,
        5,
      );
      const context = RAGKnowledgeService.formatResultsForAgent(results);
      return { context, chunkCount: results.length };
    } catch (err: any) {
      logger.error(`RAG search failed: ${err.message}`, err, SOURCE);
      return { context: "", chunkCount: 0 };
    }
  }

  /**
   * Run knowledge graph entity + relationship search via FalkorDB.
   *
   * Dynamically imports the graph query service and FalkorDB infrastructure
   * to avoid hard failures when those modules are not yet available.
   */
  private static async runGraphSearch(
    query: string,
    graphKbIds: string[],
    userId: string,
  ): Promise<{ entities: GraphEntity[]; relationships: GraphRelationship[] }> {
    const empty = { entities: [] as GraphEntity[], relationships: [] as GraphRelationship[] };

    try {
      // Dynamic imports for graceful degradation — WS3 creates the query service
      let KnowledgeGraphQueryService: any;
      try {
        const mod = await import("./knowledge-graph-query");
        KnowledgeGraphQueryService = mod.KnowledgeGraphQueryService;
      } catch {
        // Module not yet available (WS3 not merged). Try direct FalkorDB query.
        return this.runDirectGraphSearch(query, graphKbIds, userId);
      }

      // Use the dedicated query service if available
      if (KnowledgeGraphQueryService?.search) {
        const result = await KnowledgeGraphQueryService.search(query, graphKbIds, userId);
        return {
          entities: (result.entities || []) as GraphEntity[],
          relationships: (result.relationships || []) as GraphRelationship[],
        };
      }

      return this.runDirectGraphSearch(query, graphKbIds, userId);
    } catch (err: any) {
      logger.warn(
        `Graph search failed, falling back to RAG-only: ${err.message}`,
        undefined,
        SOURCE,
      );
      return empty;
    }
  }

  /**
   * Fallback direct FalkorDB query when the dedicated query service is not available.
   * Searches for entities whose names contain keywords from the query.
   */
  private static async runDirectGraphSearch(
    query: string,
    graphKbIds: string[],
    userId: string,
  ): Promise<{ entities: GraphEntity[]; relationships: GraphRelationship[] }> {
    const empty = { entities: [] as GraphEntity[], relationships: [] as GraphRelationship[] };

    try {
      const { falkordbPoolManager } = await import("../infrastructure");
      const { getGraphName } = await import("../infrastructure/falkordb/client");

      if (!falkordbPoolManager.isReady()) {
        logger.debug("FalkorDB pool not ready, skipping graph search", undefined, SOURCE);
        return empty;
      }

      const client = falkordbPoolManager.getClient();

      // Extract keywords from query (simple tokenization)
      const keywords = query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2);

      if (keywords.length === 0) return empty;

      const allEntities: GraphEntity[] = [];
      const allRelationships: GraphRelationship[] = [];

      // Query each graph for matching entities and their relationships
      for (const kbId of graphKbIds) {
        const graphName = getGraphName(userId, kbId);

        try {
          // Search for entities matching query keywords
          const keywordPattern = keywords.slice(0, 5).join("|");
          const entityResult = await client.query(
            graphName,
            `MATCH (n) WHERE toLower(n.name) =~ $pattern RETURN n.name AS name, labels(n)[0] AS type LIMIT 10`,
            { pattern: `.*(?:${keywordPattern}).*` },
          );

          for (const record of entityResult.records) {
            if (record.name) {
              allEntities.push({
                name: String(record.name),
                type: String(record.type || "Entity"),
              });
            }
          }

          // Get relationships for matched entities
          if (allEntities.length > 0) {
            const entityNames = allEntities.slice(0, 5).map((e) => e.name);
            for (const entityName of entityNames) {
              try {
                const relResult = await client.query(
                  graphName,
                  `MATCH (a)-[r]->(b) WHERE a.name = $name RETURN a.name AS source, type(r) AS relType, b.name AS target LIMIT 5`,
                  { name: entityName },
                );

                for (const record of relResult.records) {
                  if (record.source && record.target) {
                    allRelationships.push({
                      source: String(record.source),
                      target: String(record.target),
                      type: String(record.relType || "RELATED_TO"),
                    });
                  }
                }
              } catch {
                // Skip individual relationship query failures
              }
            }
          }
        } catch (graphErr: any) {
          logger.debug(
            `Graph query failed for ${graphName}: ${graphErr.message}`,
            undefined,
            SOURCE,
          );
          // Continue with next KB graph
        }
      }

      return { entities: allEntities, relationships: allRelationships };
    } catch (err: any) {
      logger.debug(`Direct graph search unavailable: ${err.message}`, undefined, SOURCE);
      return empty;
    }
  }
}

export default HybridKnowledgeSearchService;
