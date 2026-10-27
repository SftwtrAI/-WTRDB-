"use strict";

/**
 * Brain MCP Server Factory
 *
 * Builds a per-request McpServer instance for a specific Brain endpoint.
 * Each Brain endpoint is its own logical MCP server with the wrapped KB id
 * and per-endpoint model config baked in.
 *
 * Tools exposed (4):
 *   - ask: NL question → prose answer
 *   - cypher: raw Cypher passthrough (only if allow_cypher)
 *   - entity_lookup: find entities by name
 *   - traverse: BFS from a start entity, return subgraph
 *
 * Resources exposed (1):
 *   - graph://schema: entity types + rel types + counts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BrainEndpointRow } from "@wtrops/shared";
import { resolveEndpointModelConfig, recordEndpointQuery } from "./brain-endpoints";
import {
  executeNaturalLanguageQuery,
  getGraphSummary,
  queryEntities,
  queryRelationships,
  getOpenAIApiKey,
} from "./knowledge-graph-extraction";
import { callStageLlm } from "./kg-llm-router";
import { createFalkorDBClient, getGraphName } from "../infrastructure/falkordb/client";
import Redis from "ioredis";

let _falkorClient: any = null;
async function getFalkor() {
  if (_falkorClient) return _falkorClient;
  const url = process.env.FALKORDB_URL || "redis://localhost:6379";
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  await redis.connect();
  _falkorClient = createFalkorDBClient(redis);
  return _falkorClient;
}

function escapeCypher(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Build a per-request McpServer that wraps a single Brain endpoint.
 */
export function createBrainMcpServer(endpoint: BrainEndpointRow): McpServer {
  const server = new McpServer(
    {
      name: `wtrdb-brain-${endpoint.id.slice(0, 8)}`,
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // ── Tool: ask (NL question → prose answer) ──
  if (endpoint.allowNlQueries) {
    server.registerTool(
      "ask",
      {
        title: "Ask a question",
        description:
          "Ask a natural-language question about the knowledge graph. The system translates it to Cypher, executes it, and returns a concise prose answer.",
        inputSchema: {
          question: z.string().describe("The natural-language question to ask."),
        },
      },
      async ({ question }) => {
        const startMs = Date.now();
        try {
          const queryResult = await executeNaturalLanguageQuery(
            question,
            [endpoint.knowledgeBaseId],
            endpoint.userId,
            {},
          );

          // Summarize via the user's traversal model
          const traversalConfig = await resolveEndpointModelConfig(endpoint, "traversal");
          const apiKey = await getOpenAIApiKey();
          let answer = `Found ${queryResult.results.length} matching result(s).`;
          try {
            const compactResults = JSON.stringify(queryResult.results.slice(0, 20));
            const summarized = await Promise.race([
              callStageLlm(apiKey, endpoint.userId, "query", {
                systemPrompt:
                  "You are a knowledge graph query assistant. Given a user question, the Cypher query that ran, and the raw results, write a CONCISE answer in 1-3 short sentences. Be specific (cite entity names, counts). Plain text only.",
                userPrompt: `Question: ${question}\n\nCypher: ${queryResult.cypher}\n\nResults (${queryResult.results.length} rows): ${compactResults}`,
                maxOutputTokens: 512,
                config: traversalConfig,
              }),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 60000)),
            ]);
            if (summarized && (summarized as any).text) {
              answer = (summarized as any).text.trim();
            }
          } catch (err: any) {
            console.warn("[BrainMCP ask] Summarization failed:", err.message);
          }

          await recordEndpointQuery(endpoint.id, Date.now() - startMs);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  answer,
                  cypher: queryResult.cypher,
                  resultCount: queryResult.results.length,
                }),
              },
            ],
          };
        } catch (err: any) {
          await recordEndpointQuery(endpoint.id, Date.now() - startMs);
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      },
    );
  }

  // ── Tool: cypher (raw passthrough) ──
  if (endpoint.allowCypher) {
    server.registerTool(
      "cypher",
      {
        title: "Run a Cypher query",
        description:
          "Execute a raw Cypher query against the knowledge graph. Returns the result rows as JSON.",
        inputSchema: {
          query: z.string().describe("The Cypher query to execute."),
        },
      },
      async ({ query }) => {
        const startMs = Date.now();
        try {
          const client = await getFalkor();
          const graphName = getGraphName(endpoint.userId, endpoint.knowledgeBaseId);
          const result = await client.query(graphName, query);
          await recordEndpointQuery(endpoint.id, Date.now() - startMs);
          return {
            content: [
              { type: "text", text: JSON.stringify({ rows: result.records ?? [] }) },
            ],
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Cypher error: ${err.message}` }],
            isError: true,
          };
        }
      },
    );
  }

  // ── Tool: entity_lookup ──
  server.registerTool(
    "entity_lookup",
    {
      title: "Look up entities by name",
      description:
        "Find entities in the graph by name. Supports exact and substring matching.",
      inputSchema: {
        name: z.string().describe("The entity name (or substring) to look up."),
        fuzzy: z
          .boolean()
          .optional()
          .describe("If true, do a substring CONTAINS match. Default false (exact)."),
      },
    },
    async ({ name, fuzzy }) => {
      const startMs = Date.now();
      try {
        const client = await getFalkor();
        const graphName = getGraphName(endpoint.userId, endpoint.knowledgeBaseId);
        const condition = fuzzy
          ? `toLower(n.name) CONTAINS toLower("${escapeCypher(name)}")`
          : `toLower(n.name) = toLower("${escapeCypher(name)}")`;
        const cypher = `MATCH (n) WHERE ${condition} RETURN n.name AS name, labels(n) AS labels, properties(n) AS properties LIMIT 50`;
        const result = await client.query(graphName, cypher);
        const matches = (result.records ?? []).map((r: any) => ({
          name: r.name,
          label: Array.isArray(r.labels) ? r.labels[0] : r.labels,
          properties: r.properties ?? {},
        }));
        await recordEndpointQuery(endpoint.id, Date.now() - startMs);
        return {
          content: [{ type: "text", text: JSON.stringify({ matches }) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Lookup error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: traverse ──
  server.registerTool(
    "traverse",
    {
      title: "Traverse from an entity",
      description:
        "Starting from a named entity, follow relationships up to N hops and return the subgraph as nodes and edges.",
      inputSchema: {
        startEntity: z.string().describe("The name of the entity to start from."),
        hops: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe("Number of hops to traverse. Default 2, max 3."),
        relTypes: z
          .array(z.string())
          .optional()
          .describe("Optional list of relationship types to follow. Default: any."),
      },
    },
    async ({ startEntity, hops, relTypes }) => {
      const startMs = Date.now();
      try {
        const client = await getFalkor();
        const graphName = getGraphName(endpoint.userId, endpoint.knowledgeBaseId);
        const depth = hops ?? 2;
        const relFilter =
          relTypes && relTypes.length > 0
            ? `:${relTypes.map((t) => t.replace(/[^A-Z0-9_]/gi, "_").toUpperCase()).join("|")}`
            : "";
        const cypher = `MATCH p=(start)-[${relFilter}*1..${depth}]-(end) WHERE toLower(start.name) = toLower("${escapeCypher(startEntity)}") RETURN nodes(p) AS nodes, relationships(p) AS rels LIMIT 50`;
        const result = await client.query(graphName, cypher);
        const nodeMap = new Map<string, any>();
        const edges: any[] = [];
        for (const row of result.records ?? []) {
          const nodes = row.nodes ?? [];
          const rels = row.rels ?? [];
          for (const n of nodes) {
            const key = (n as any)?.name ?? JSON.stringify(n);
            if (!nodeMap.has(key)) {
              nodeMap.set(key, {
                name: (n as any)?.name,
                label: Array.isArray((n as any)?.labels) ? (n as any).labels[0] : undefined,
              });
            }
          }
          for (const r of rels) {
            edges.push({
              type: (r as any)?.relation || (r as any)?.type,
              source: (r as any)?.srcNode?.name,
              target: (r as any)?.destNode?.name,
            });
          }
        }
        await recordEndpointQuery(endpoint.id, Date.now() - startMs);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                nodes: Array.from(nodeMap.values()),
                edges,
              }),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Traverse error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ── Resource: graph://schema ──
  server.registerResource(
    "schema",
    "graph://schema",
    {
      title: "Graph schema",
      description:
        "Entity types and relationship types in this knowledge graph, with instance counts.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const summary = await getGraphSummary(endpoint.knowledgeBaseId, endpoint.userId);
        const entities = await queryEntities(endpoint.knowledgeBaseId, endpoint.userId, {});
        const relationships = await queryRelationships(
          endpoint.knowledgeBaseId,
          endpoint.userId,
          {},
        );
        const entityCounts: Record<string, number> = {};
        for (const e of entities.entities) {
          entityCounts[e.label] = (entityCounts[e.label] ?? 0) + 1;
        }
        const relCounts: Record<string, number> = {};
        for (const r of relationships.relationships) {
          relCounts[r.type] = (relCounts[r.type] ?? 0) + 1;
        }
        const schema = {
          knowledgeBaseId: endpoint.knowledgeBaseId,
          totalEntities: summary.entityCount,
          totalRelationships: summary.relationshipCount,
          entityTypes: entityCounts,
          relationshipTypes: relCounts,
        };
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Schema error: ${err.message}`,
            },
          ],
        };
      }
    },
  );

  return server;
}
