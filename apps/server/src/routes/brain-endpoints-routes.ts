"use strict";

/**
 * Brain Endpoints Routes
 *
 * Two transports for each published Brain endpoint:
 *   1. REST     — POST /api/brain/:apiKey/ask  (JSON)
 *   2. MCP      — POST /api/brain/:apiKey/mcp  (Streamable HTTP)
 *
 * Plus management routes (session-authed) for CRUD on the user's
 * own endpoints.
 */

import { Router, Response, Request } from "express";
import { RouteContext, AuthRequest } from "./common";
import {
  createBrainEndpoint,
  listBrainEndpoints,
  getBrainEndpointById,
  getBrainEndpointByApiKey,
  updateBrainEndpoint,
  deleteBrainEndpoint,
  regenerateApiKey,
  recordEndpointQuery,
  resolveEndpointModelConfig,
} from "../services/brain-endpoints";
import {
  executeNaturalLanguageQuery,
  getOpenAIApiKey,
  getGraphSummary,
  queryEntities,
  queryRelationships,
} from "../services/knowledge-graph-extraction";
import { callStageLlm } from "../services/kg-llm-router";
import { createBrainMcpServer } from "../services/brain-mcp-server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { BrainEndpointRow } from "@wtrops/shared";
import {
  BRAIN_DOCS_MARKDOWN,
  markdownToHtml,
  buildLlmsIndex,
  buildBrainDocsHtml,
} from "../services/brain-docs";

export function createBrainEndpointRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateHybrid } = ctx;

  // ─────────────────────────────────────────────────────────────────
  //  PUBLIC DOCS — no auth. LLMS.txt compliant.
  // ─────────────────────────────────────────────────────────────────

  // llms.txt index (https://llmstxt.org spec)
  router.get("/llms.txt", (req: Request, res: Response) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(buildLlmsIndex(origin));
  });

  // Full inline docs for LLMs (slurp in one fetch)
  router.get("/llms-full.txt", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(BRAIN_DOCS_MARKDOWN);
  });

  // Markdown version for LLMs / crawlers
  router.get("/docs/brain.md", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(BRAIN_DOCS_MARKDOWN);
  });

  // Human-readable HTML docs page
  router.get("/docs/brain", (_req: Request, res: Response) => {
    const html = buildBrainDocsHtml(markdownToHtml(BRAIN_DOCS_MARKDOWN));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // ================================================================
  //  GET /api/brain-endpoints
  //  List the current user's brain endpoints
  // ================================================================
  router.get(
    "/api/brain-endpoints",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const endpoints = await listBrainEndpoints(userId);
        res.json({ endpoints });
      } catch (error: any) {
        console.error("[BrainEndpoints] list error:", error);
        res.status(500).json({ error: "Failed to list brain endpoints" });
      }
    },
  );

  // ================================================================
  //  POST /api/brain-endpoints
  //  Create a new brain endpoint
  // ================================================================
  router.post(
    "/api/brain-endpoints",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        if (!body?.knowledgeBaseId || !body?.name) {
          return res.status(400).json({ error: "knowledgeBaseId and name required" });
        }
        const endpoint = await createBrainEndpoint(userId, {
          knowledgeBaseId: body.knowledgeBaseId,
          name: String(body.name),
          queryModel: body.queryModel ?? null,
          queryReasoningEffort: body.queryReasoningEffort ?? null,
          traversalModel: body.traversalModel ?? null,
          traversalReasoningEffort: body.traversalReasoningEffort ?? null,
          rateLimitPerMinute: body.rateLimitPerMinute,
          allowNlQueries: body.allowNlQueries,
          allowCypher: body.allowCypher,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        });
        res.json({ endpoint });
      } catch (error: any) {
        console.error("[BrainEndpoints] create error:", error);
        res.status(500).json({ error: "Failed to create brain endpoint" });
      }
    },
  );

  // ================================================================
  //  PATCH /api/brain-endpoints/:id
  //  Update an endpoint's settings
  // ================================================================
  router.patch(
    "/api/brain-endpoints/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { id } = req.params;
        const body = req.body as any;
        const updated = await updateBrainEndpoint(userId, id, {
          name: body.name,
          queryModel: body.queryModel,
          queryReasoningEffort: body.queryReasoningEffort,
          traversalModel: body.traversalModel,
          traversalReasoningEffort: body.traversalReasoningEffort,
          rateLimitPerMinute: body.rateLimitPerMinute,
          allowNlQueries: body.allowNlQueries,
          allowCypher: body.allowCypher,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : body.expiresAt,
        });
        if (!updated) return res.status(404).json({ error: "Endpoint not found" });
        res.json({ endpoint: updated });
      } catch (error: any) {
        console.error("[BrainEndpoints] update error:", error);
        res.status(500).json({ error: "Failed to update brain endpoint" });
      }
    },
  );

  // ================================================================
  //  DELETE /api/brain-endpoints/:id
  // ================================================================
  router.delete(
    "/api/brain-endpoints/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { id } = req.params;
        const ok = await deleteBrainEndpoint(userId, id);
        if (!ok) return res.status(404).json({ error: "Endpoint not found" });
        res.json({ success: true });
      } catch (error: any) {
        console.error("[BrainEndpoints] delete error:", error);
        res.status(500).json({ error: "Failed to delete brain endpoint" });
      }
    },
  );

  // ================================================================
  //  POST /api/brain-endpoints/:id/regenerate-key
  // ================================================================
  router.post(
    "/api/brain-endpoints/:id/regenerate-key",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { id } = req.params;
        const updated = await regenerateApiKey(userId, id);
        if (!updated) return res.status(404).json({ error: "Endpoint not found" });
        res.json({ endpoint: updated });
      } catch (error: any) {
        console.error("[BrainEndpoints] regen error:", error);
        res.status(500).json({ error: "Failed to regenerate key" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────
  //  PUBLIC ENDPOINTS — API KEY AUTH
  // ─────────────────────────────────────────────────────────────────

  // ================================================================
  //  POST /api/brain/:apiKey/ask
  //  Public REST: ask a natural-language question
  // ================================================================
  router.post(
    "/api/brain/:apiKey/ask",
    async (req: Request, res: Response) => {
      const startMs = Date.now();
      try {
        const { apiKey } = req.params;
        const endpoint = await getBrainEndpointByApiKey(apiKey);
        if (!endpoint) {
          return res.status(401).json({ error: "Invalid or expired API key" });
        }
        if (!endpoint.allowNlQueries) {
          return res.status(403).json({ error: "NL queries are disabled for this endpoint" });
        }
        const { question } = req.body as { question?: string };
        if (!question || typeof question !== "string") {
          return res.status(400).json({ error: "question is required" });
        }

        const queryResult = await executeNaturalLanguageQuery(
          question,
          [endpoint.knowledgeBaseId],
          endpoint.userId,
          {},
        );

        // Summarize using the endpoint's traversal model
        const traversalConfig = await resolveEndpointModelConfig(endpoint, "traversal");
        const llmKey = await getOpenAIApiKey();
        let answer = `Found ${queryResult.results.length} matching result(s).`;
        try {
          const compactResults = JSON.stringify(queryResult.results.slice(0, 20));
          const summarized = await Promise.race([
            callStageLlm(llmKey, endpoint.userId, "query", {
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
          console.warn("[Brain ask] summarization failed:", err.message);
        }

        await recordEndpointQuery(endpoint.id, Date.now() - startMs);
        res.json({
          answer,
          cypher: queryResult.cypher,
          resultCount: queryResult.results.length,
        });
      } catch (error: any) {
        console.error("[Brain ask] error:", error);
        res.status(500).json({ error: "Query failed" });
      }
    },
  );

  // ================================================================
  //  POST /api/brain/:apiKey/cypher  (raw Cypher passthrough)
  // ================================================================
  router.post(
    "/api/brain/:apiKey/cypher",
    async (req: Request, res: Response) => {
      const startMs = Date.now();
      try {
        const { apiKey } = req.params;
        const endpoint = await getBrainEndpointByApiKey(apiKey);
        if (!endpoint) return res.status(401).json({ error: "Invalid or expired API key" });
        if (!endpoint.allowCypher) {
          return res.status(403).json({ error: "Cypher passthrough disabled for this endpoint" });
        }
        const { query } = req.body as { query?: string };
        if (!query) return res.status(400).json({ error: "query is required" });

        // Reuse the falkor client via the extraction module's helper
        const { createFalkorDBClient, getGraphName } = await import("../infrastructure/falkordb/client");
        const Redis = (await import("ioredis")).default;
        const url = process.env.FALKORDB_URL || "redis://localhost:6379";
        const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
        await redis.connect();
        const client = createFalkorDBClient(redis);
        const graphName = getGraphName(endpoint.userId, endpoint.knowledgeBaseId);
        const result = await client.query(graphName, query);
        await redis.quit().catch(() => {});

        await recordEndpointQuery(endpoint.id, Date.now() - startMs);
        res.json({ rows: result.records ?? [] });
      } catch (error: any) {
        console.error("[Brain cypher] error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  // ================================================================
  //  GET /api/brain/:apiKey/schema  (entity/rel types + counts)
  // ================================================================
  router.get(
    "/api/brain/:apiKey/schema",
    async (req: Request, res: Response) => {
      try {
        const { apiKey } = req.params;
        const endpoint = await getBrainEndpointByApiKey(apiKey);
        if (!endpoint) return res.status(401).json({ error: "Invalid or expired API key" });

        const summary = await getGraphSummary(endpoint.knowledgeBaseId, endpoint.userId);
        const entities = await queryEntities(endpoint.knowledgeBaseId, endpoint.userId, {});
        const relationships = await queryRelationships(endpoint.knowledgeBaseId, endpoint.userId, {});
        const entityCounts: Record<string, number> = {};
        for (const e of entities.entities) entityCounts[e.label] = (entityCounts[e.label] ?? 0) + 1;
        const relCounts: Record<string, number> = {};
        for (const r of relationships.relationships) relCounts[r.type] = (relCounts[r.type] ?? 0) + 1;

        res.json({
          totalEntities: summary.entityCount,
          totalRelationships: summary.relationshipCount,
          entityTypes: entityCounts,
          relationshipTypes: relCounts,
        });
      } catch (error: any) {
        console.error("[Brain schema] error:", error);
        res.status(500).json({ error: "Failed to fetch schema" });
      }
    },
  );

  // ================================================================
  //  POST /api/brain/:apiKey/mcp  (MCP Streamable HTTP transport)
  //  GET also accepted for SSE polling
  // ================================================================
  const mcpHandler = async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.params;
      const endpoint = await getBrainEndpointByApiKey(apiKey);
      if (!endpoint) {
        return res.status(401).json({ error: "Invalid or expired API key" });
      }

      // Friendly landing page when someone opens the URL in a browser
      const accept = req.headers["accept"] || "";
      if (
        req.method === "GET" &&
        typeof accept === "string" &&
        accept.includes("text/html") &&
        !accept.includes("text/event-stream")
      ) {
        const baseUrl = `${req.protocol}://${req.get("host")}/api/brain/${apiKey}`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Brain MCP Server — ${endpoint.name}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0B1014; color: #E7EEF6; margin: 0; padding: 40px 20px; }
  .card { max-width: 720px; margin: 0 auto; background: #111A21; border: 1px solid #243645; border-radius: 12px; padding: 32px; }
  h1 { color: #07A288; font-size: 18px; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #8FA2B5; margin: 24px 0 8px; }
  p { color: #8FA2B5; font-size: 13px; line-height: 1.6; }
  code { display: block; background: #0B1014; border: 1px solid #243645; border-radius: 6px; padding: 10px 12px; font-size: 11px; color: #B8E52B; overflow-x: auto; word-break: break-all; font-family: ui-monospace, monospace; }
  .tool { background: #0B1014; border-left: 2px solid #07A288; padding: 8px 12px; margin: 6px 0; font-size: 12px; }
  .tool b { color: #E7EEF6; }
  .tool span { color: #8FA2B5; }
  .note { background: rgba(184, 229, 43, 0.08); border: 1px solid rgba(184, 229, 43, 0.3); border-radius: 8px; padding: 12px 16px; margin-top: 16px; font-size: 12px; color: #B8E52B; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
  .header h1 { margin: 0 0 4px; }
  .docs-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(7, 162, 136, 0.4); background: rgba(7, 162, 136, 0.1); color: #07A288; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; text-decoration: none; transition: all 150ms; }
  .docs-btn:hover { background: rgba(7, 162, 136, 0.2); border-color: #07A288; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div>
      <h1>Brain MCP Server</h1>
      <p style="margin:0"><b style="color:#E7EEF6">${endpoint.name}</b> · ${endpoint.queryCount} queries served</p>
    </div>
    <a class="docs-btn" href="/docs/brain" target="_blank" rel="noopener noreferrer">📖 Docs</a>
  </div>

  <div class="note">
    ⚠ This URL is an <b>MCP Streamable HTTP endpoint</b>, not a web page. You can't open it in a browser — give it to an MCP client like Claude Desktop, Cursor, or the MCP Inspector.
  </div>

  <h2>Use with MCP Inspector</h2>
  <p>Run <code style="display:inline">npx @modelcontextprotocol/inspector</code> in a terminal, select <b>Streamable HTTP</b> transport, and paste this URL:</p>
  <code>${baseUrl}/mcp</code>

  <h2>Claude Desktop / Cursor config</h2>
  <code>{
  "mcpServers": {
    "${endpoint.name.toLowerCase().replace(/\s+/g, "-")}": {
      "type": "http",
      "url": "${baseUrl}/mcp"
    }
  }
}</code>

  <h2>Tools exposed</h2>
  <div class="tool"><b>ask</b> <span>— natural-language question → prose answer</span></div>
  ${endpoint.allowCypher ? '<div class="tool"><b>cypher</b> <span>— raw Cypher passthrough</span></div>' : ""}
  <div class="tool"><b>entity_lookup</b> <span>— find entities by name (exact or fuzzy)</span></div>
  <div class="tool"><b>traverse</b> <span>— BFS from an entity, follow relationships N hops</span></div>

  <h2>Resources exposed</h2>
  <div class="tool"><b>graph://schema</b> <span>— entity types + relationship types + counts</span></div>

  <h2>Also available as REST</h2>
  <code>curl -X POST ${baseUrl}/ask \\
  -H "Content-Type: application/json" \\
  -d '{"question":"How many entities are in this graph?"}'</code>
</div>
</body>
</html>`);
      }

      // Build a fresh MCP server + transport for THIS request
      const server = createBrainMcpServer(endpoint);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      await server.connect(transport);
      await transport.handleRequest(req as any, res as any, req.body);
    } catch (error: any) {
      console.error("[Brain MCP] error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "MCP request failed" });
      }
    }
  };

  router.post("/api/brain/:apiKey/mcp", mcpHandler);
  router.get("/api/brain/:apiKey/mcp", mcpHandler);
  router.delete("/api/brain/:apiKey/mcp", mcpHandler);

  // ================================================================
  //  Legacy SSE MCP transport — for clients that can't speak
  //  Streamable HTTP (e.g. openclaw 2026.4.1's bundle-mcp).
  //  GET  /api/brain/:apiKey/sse       → SSE stream + server connect
  //  POST /api/brain/:apiKey/messages  → JSON-RPC messages by sessionId
  // ================================================================
  const sseSessions = new Map<
    string,
    { transport: SSEServerTransport; endpoint: BrainEndpointRow }
  >();

  router.get("/api/brain/:apiKey/sse", async (req: Request, res: Response) => {
    try {
      const endpoint = await getBrainEndpointByApiKey(req.params.apiKey);
      if (!endpoint) {
        return res.status(401).json({ error: "Invalid or expired API key" });
      }
      const messagesPath = `/api/brain/${req.params.apiKey}/messages`;
      const transport = new SSEServerTransport(messagesPath, res);
      sseSessions.set(transport.sessionId, { transport, endpoint });
      transport.onclose = () => {
        sseSessions.delete(transport.sessionId);
      };
      const server = createBrainMcpServer(endpoint);
      try {
        await server.connect(transport);
      } catch (err: any) {
        console.error("[Brain MCP SSE] connect error:", err);
        sseSessions.delete(transport.sessionId);
      }
    } catch (err: any) {
      console.error("[Brain MCP SSE] handler error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  router.post(
    "/api/brain/:apiKey/messages",
    async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string | undefined;
      if (!sessionId) return res.status(400).send("sessionId required");
      const session = sseSessions.get(sessionId);
      if (!session) return res.status(404).send("Session not found");
      if (session.endpoint.apiKey !== req.params.apiKey) {
        return res.status(403).send("API key mismatch");
      }
      try {
        await session.transport.handlePostMessage(req as any, res as any, req.body);
      } catch (err: any) {
        console.error("[Brain MCP SSE message] error:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      }
    },
  );

  return router;
}
