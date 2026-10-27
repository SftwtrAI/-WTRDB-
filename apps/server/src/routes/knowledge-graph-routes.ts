"use strict";

/**
 * Knowledge Graph REST API Routes
 *
 * Provides endpoints for generating, querying, and managing
 * FalkorDB knowledge graphs built from knowledge base documents.
 *
 * Endpoints:
 *   GET    /api/knowledge-graph/:knowledgeBaseId/summary
 *   POST   /api/knowledge-graph/:knowledgeBaseId/generate
 *   GET    /api/knowledge-graph/:knowledgeBaseId/entities
 *   GET    /api/knowledge-graph/:knowledgeBaseId/relationships
 *   POST   /api/knowledge-graph/query
 *   DELETE /api/knowledge-graph/:knowledgeBaseId
 */

import { Router, Response } from "express";
import { RouteContext, AuthRequest } from "./common";
import {
  processKnowledgeBase,
  deleteKnowledgeGraph,
  getGraphSummary,
  queryEntities,
  queryRelationships,
  executeNaturalLanguageQuery,
} from "../services/knowledge-graph-extraction";
import { getBufferedEvents } from "../services/kg-extraction-events";
import {
  listSchemaProposals,
  updateSchemaProposalStatus,
  getSchemaProposal,
} from "../services/federation.service";
import {
  materializeAcceptedProposal,
} from "../services/schema-materialization";
import {
  getUserKgPreferences,
  setUserKgPreferences,
  MODEL_CATALOG,
  STAGE_INFO,
  DEFAULT_STAGE_MODELS,
} from "../services/kg-model-settings";

const extractionInFlight = new Map<string, true>();

export function createKnowledgeGraphRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateHybrid } = ctx;

  // ================================================================
  //  GET /api/knowledge-graph/:knowledgeBaseId/summary
  //  Return graph summary (entity/relationship counts, status)
  // ================================================================
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/summary",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const userId = req.userId!;

        const summary = await getGraphSummary(knowledgeBaseId, userId);
        res.json(summary);
      } catch (error: any) {
        console.error("Knowledge graph summary error:", error);
        res.status(500).json({ error: "Failed to retrieve graph summary" });
      }
    },
  );

  // ================================================================
  //  GET /api/knowledge-graph/:knowledgeBaseId/events/replay
  //  Return the in-memory event buffer for cinematic replay.
  //  Used by the Creation Theatre and on cinematic stage reconnect.
  // ================================================================
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/events/replay",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const events = getBufferedEvents(knowledgeBaseId);
        res.json({ knowledgeBaseId, events, count: events.length });
      } catch (error: any) {
        console.error("Knowledge graph events replay error:", error);
        res.status(500).json({ error: "Failed to retrieve events" });
      }
    },
  );

  // ================================================================
  //  POST /api/knowledge-graph/:knowledgeBaseId/generate
  //  Kick off async graph extraction. Returns immediately.
  // ================================================================
  router.post(
    "/api/knowledge-graph/:knowledgeBaseId/generate",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const userId = req.userId!;

        // De-dup: if an extraction is already running for this KB, don't spawn another.
        const inFlight = extractionInFlight.get(knowledgeBaseId);
        if (inFlight) {
          return res.json({
            knowledgeBaseId,
            status: "already-running",
            message: "Extraction is already in progress for this KB.",
          });
        }

        res.json({
          knowledgeBaseId,
          status: "pending",
          message:
            "Graph extraction started. Poll the summary endpoint for progress.",
        });

        extractionInFlight.set(knowledgeBaseId, true);
        setTimeout(() => {
          processKnowledgeBase(knowledgeBaseId, userId)
            .catch((err) => {
              console.error(
                `[KG Routes] Background extraction failed for KB ${knowledgeBaseId}:`,
                err.message,
              );
            })
            .finally(() => {
              extractionInFlight.delete(knowledgeBaseId);
            });
        }, 0);
      } catch (error: any) {
        console.error("Knowledge graph generate error:", error);
        res.status(500).json({ error: "Failed to start graph extraction" });
      }
    },
  );

  // ================================================================
  //  GET /api/knowledge-graph/:knowledgeBaseId/entities
  //  Query entities with optional type, search, pagination
  // ================================================================
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/entities",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const userId = req.userId!;
        const type = req.query.type as string | undefined;
        const search = req.query.search as string | undefined;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await queryEntities(knowledgeBaseId, userId, {
          type,
          search,
          limit,
          offset,
        });

        res.json(result);
      } catch (error: any) {
        console.error("Knowledge graph entities error:", error);
        res.status(500).json({ error: "Failed to query entities" });
      }
    },
  );

  // ================================================================
  //  GET /api/knowledge-graph/:knowledgeBaseId/relationships
  //  Query relationships with optional type filter and pagination
  // ================================================================
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/relationships",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const userId = req.userId!;
        const type = req.query.type as string | undefined;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await queryRelationships(knowledgeBaseId, userId, {
          type,
          limit,
          offset,
        });

        res.json(result);
      } catch (error: any) {
        console.error("Knowledge graph relationships error:", error);
        res
          .status(500)
          .json({ error: "Failed to query relationships" });
      }
    },
  );

  // ================================================================
  //  POST /api/knowledge-graph/query
  //  Natural language -> Cypher query across knowledge bases
  // ================================================================
  router.post(
    "/api/knowledge-graph/query",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { query, knowledgeBaseIds, entityTypes, maxDepth, conversationHistory } = req.body;

        if (!query || typeof query !== "string") {
          return res.status(400).json({ error: "query is required" });
        }

        if (
          !knowledgeBaseIds ||
          !Array.isArray(knowledgeBaseIds) ||
          knowledgeBaseIds.length === 0
        ) {
          return res
            .status(400)
            .json({ error: "knowledgeBaseIds must be a non-empty array" });
        }

        // Validate conversationHistory if provided
        const validHistory = Array.isArray(conversationHistory)
          ? conversationHistory.filter(
              (entry: any) =>
                entry &&
                typeof entry.role === "string" &&
                (entry.role === "user" || entry.role === "assistant") &&
                typeof entry.content === "string",
            )
          : undefined;

        const result = await executeNaturalLanguageQuery(
          query,
          knowledgeBaseIds,
          userId,
          {
            entityTypes,
            maxDepth,
            conversationHistory: validHistory,
          },
        );

        res.json(result);
      } catch (error: any) {
        console.error("Knowledge graph query error:", error);
        res.status(500).json({ error: "Failed to execute graph query" });
      }
    },
  );

  // ================================================================
  //  GET /api/knowledge-graph/:knowledgeBaseId/schema/types
  //  Return entity and relationship types with instance counts
  // ================================================================
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/schema/types",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const userId = req.userId!;

        const entities = await queryEntities(knowledgeBaseId, userId, {});
        const relationships = await queryRelationships(knowledgeBaseId, userId, {});

        const entityTypeCounts: Record<string, { count: number; examples: string[] }> = {};
        for (const e of entities.entities) {
          if (!entityTypeCounts[e.label]) {
            entityTypeCounts[e.label] = { count: 0, examples: [] };
          }
          entityTypeCounts[e.label].count += 1;
          if (entityTypeCounts[e.label].examples.length < 3) {
            entityTypeCounts[e.label].examples.push(e.name);
          }
        }

        const relTypeCounts: Record<string, { count: number }> = {};
        for (const r of relationships.relationships) {
          if (!relTypeCounts[r.type]) {
            relTypeCounts[r.type] = { count: 0 };
          }
          relTypeCounts[r.type].count += 1;
        }

        const types = [
          ...Object.entries(entityTypeCounts).map(([name, data]) => ({
            id: name,
            name,
            category: "entity" as const,
            instanceCount: data.count,
            examples: data.examples,
          })),
          ...Object.entries(relTypeCounts).map(([name, data]) => ({
            id: `rel_${name}`,
            name,
            category: "relationship" as const,
            instanceCount: data.count,
            examples: [],
          })),
        ];

        res.json({ types });
      } catch (error: any) {
        console.error("Schema types error:", error);
        res.status(500).json({ error: "Failed to retrieve schema types" });
      }
    },
  );

  // ================================================================
  //  GET /api/knowledge-graph/:knowledgeBaseId/schema/proposals
  //  List schema proposals for a knowledge base
  // ================================================================
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/schema/proposals",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const status = req.query.status as string | undefined;
        const result = await listSchemaProposals(knowledgeBaseId, { status });
        res.json(result);
      } catch (error: any) {
        console.error("Schema proposals error:", error);
        res.status(500).json({ error: "Failed to retrieve schema proposals" });
      }
    },
  );

  // ================================================================
  //  POST /api/knowledge-graph/:knowledgeBaseId/schema/proposals/:proposalId/resolve
  //  Accept, merge, or dismiss a schema proposal
  // ================================================================
  router.post(
    "/api/knowledge-graph/:knowledgeBaseId/schema/proposals/:proposalId/resolve",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { proposalId } = req.params;
        const userId = req.userId!;
        const { action } = req.body as { action: "accept" | "merge" | "dismiss" };
        const statusMap: Record<string, "accepted" | "rejected" | "merged"> = {
          accept: "accepted",
          merge: "merged",
          dismiss: "rejected",
        };
        const status = statusMap[action];
        if (!status) {
          res.status(400).json({ error: "Invalid action. Use accept, merge, or dismiss." });
          return;
        }

        // Materialize the change in FalkorDB if accepted/merged (synonym/canonicalization rewrites)
        let materialization = null;
        if (status === "accepted" || status === "merged") {
          const proposal = await getSchemaProposal(proposalId);
          if (proposal) {
            try {
              materialization = await materializeAcceptedProposal(proposal, userId);
            } catch (err: any) {
              console.error("Materialization error:", err.message);
              materialization = { applied: false, message: err.message };
            }
          }
        }

        const updated = await updateSchemaProposalStatus(proposalId, status);
        res.json({ proposal: updated, materialization });
      } catch (error: any) {
        console.error("Schema proposal resolve error:", error);
        res.status(500).json({ error: "Failed to resolve schema proposal" });
      }
    },
  );

  // ================================================================
  //  POST /api/knowledge-graph/:knowledgeBaseId/schema/proposals/accept-all
  //  Bulk-accept all pending proposals (with materialization)
  // ================================================================
  router.post(
    "/api/knowledge-graph/:knowledgeBaseId/schema/proposals/accept-all",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const userId = req.userId!;
        const { proposals } = await listSchemaProposals(knowledgeBaseId, { status: "proposed" });

        const results: { id: string; name: string; applied: boolean; message: string }[] = [];
        for (const proposal of proposals) {
          try {
            const mat = await materializeAcceptedProposal(proposal, userId);
            await updateSchemaProposalStatus(proposal.id, "accepted");
            results.push({
              id: proposal.id,
              name: proposal.proposedName,
              applied: mat.applied,
              message: mat.message,
            });
          } catch (err: any) {
            results.push({
              id: proposal.id,
              name: proposal.proposedName,
              applied: false,
              message: err.message,
            });
          }
        }

        res.json({ accepted: results.length, results });
      } catch (error: any) {
        console.error("Accept-all error:", error);
        res.status(500).json({ error: "Failed to accept proposals" });
      }
    },
  );

  // ================================================================
  //  GET /api/knowledge-graph/:knowledgeBaseId/schema/mappings
  //  Return canonical mappings derived from accepted proposals
  // ================================================================
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/schema/mappings",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const { proposals } = await listSchemaProposals(knowledgeBaseId, {
          status: "accepted",
        });
        const mappings = proposals
          .filter((p) =>
            p.proposalType === "type_synonym" ||
            p.proposalType === "relationship_canonicalization",
          )
          .map((p) => ({
            surfaceForm: p.proposedName,
            canonicalType: (p.proposedDefinition as any)?.mergeTarget ?? p.proposedName,
            frequency: p.observedFrequency ?? 1,
          }));
        res.json({ mappings });
      } catch (error: any) {
        console.error("Schema mappings error:", error);
        res.status(500).json({ error: "Failed to retrieve schema mappings" });
      }
    },
  );

  // ================================================================
  //  DELETE /api/knowledge-graph/:knowledgeBaseId
  //  Delete a knowledge graph from FalkorDB and metadata
  // ================================================================
  router.delete(
    "/api/knowledge-graph/:knowledgeBaseId",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { knowledgeBaseId } = req.params;
        const userId = req.userId!;

        await deleteKnowledgeGraph(knowledgeBaseId, userId);

        res.json({
          success: true,
          message: `Knowledge graph for ${knowledgeBaseId} deleted`,
        });
      } catch (error: any) {
        console.error("Knowledge graph delete error:", error);
        res
          .status(500)
          .json({ error: "Failed to delete knowledge graph" });
      }
    },
  );

  // ================================================================
  //  POST /api/knowledge-graph/ask
  //  One-shot ask: NL → Cypher → results → short prose answer
  //  Falls back to searching ALL the user's graphs if the current one returns 0.
  // ================================================================
  router.post(
    "/api/knowledge-graph/ask",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { question, knowledgeBaseIds } = req.body as {
          question: string;
          knowledgeBaseIds: string[];
        };
        if (!question || typeof question !== "string") {
          return res.status(400).json({ error: "question is required" });
        }
        if (!Array.isArray(knowledgeBaseIds) || knowledgeBaseIds.length === 0) {
          return res.status(400).json({ error: "knowledgeBaseIds required" });
        }

        // Step 1: NL → Cypher → execute on the current graph
        let queryResult = await executeNaturalLanguageQuery(
          question,
          knowledgeBaseIds,
          userId,
          {},
        );

        // Cross-graph fallback: if no results in the current graph,
        // search across ALL the user's other completed graphs
        let foundInGraphs: string[] = [];
        if (queryResult.results.length === 0) {
          try {
            const { db: dbRef } = await import("../db");
            const { knowledgeBase, knowledgeGraphs } = await import("@wtrops/shared");
            const { eq, and: andOp, ne } = await import("drizzle-orm");
            const otherGraphs = await dbRef
              .select({ id: knowledgeBase.id, title: knowledgeBase.title })
              .from(knowledgeBase)
              .innerJoin(knowledgeGraphs, eq(knowledgeGraphs.knowledgeBaseId, knowledgeBase.id))
              .where(
                andOp(
                  eq(knowledgeBase.userId, userId),
                  eq(knowledgeGraphs.status, "completed"),
                ),
              );
            const otherIds = otherGraphs
              .map((g) => g.id)
              .filter((id) => !knowledgeBaseIds.includes(id));

            if (otherIds.length > 0) {
              const fallbackResult = await executeNaturalLanguageQuery(
                question,
                otherIds,
                userId,
                {},
              );
              if (fallbackResult.results.length > 0) {
                queryResult = fallbackResult;
                // Identify which graphs the results came from
                const matchedKbIds = new Set<string>();
                for (const r of fallbackResult.results) {
                  if ((r as any).knowledgeBaseId) matchedKbIds.add((r as any).knowledgeBaseId);
                }
                foundInGraphs = otherGraphs
                  .filter((g) => matchedKbIds.has(g.id))
                  .map((g) => g.title);
              }
            }
          } catch (err: any) {
            console.error("[KG Ask] Cross-graph fallback failed:", err.message);
          }
        }

        // Step 2: Summarize results to a short prose answer (1-2 sentences)
        // Time-bounded — if it takes >25s, fall back to a deterministic answer.
        const { callStageLlm } = await import("../services/kg-llm-router");
        const { getOpenAIApiKey } = await import("../services/knowledge-graph-extraction");

        // Deterministic fallback — recursively walks results to extract useful info
        const fallbackAnswer = (() => {
          if (queryResult.results.length === 0) {
            return "No results found in this graph.";
          }
          const isUuidLike = (s: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
          const isUselessKey = (k: string) => k === "knowledgeBaseId" || k.startsWith("_");

          const entityNames: { name: string; label?: string }[] = [];
          const relationshipTypes: string[] = [];
          const counts: Record<string, number> = {};
          let totalCount: number | null = null;
          const visited = new WeakSet<object>();

          // Recursively walk any value (handles path objects, arrays, nested nodes)
          const walk = (val: any): void => {
            if (val == null) return;
            if (typeof val === "string") {
              if (val.length < 80 && !isUuidLike(val)) {
                // Could be a node name, label, or rel type — capture as candidate name
                entityNames.push({ name: val });
              }
              return;
            }
            if (typeof val === "number" || typeof val === "boolean") return;
            if (Array.isArray(val)) {
              for (const item of val) walk(item);
              return;
            }
            if (typeof val === "object") {
              if (visited.has(val)) return;
              visited.add(val);

              // Cypher node shape: { name, labels, properties }
              const name = (val as any).name;
              const labels = (val as any).labels;
              const type = (val as any).type;
              if (typeof name === "string" && !isUuidLike(name)) {
                const label = Array.isArray(labels) ? labels[0] : (typeof labels === "string" ? labels : undefined);
                entityNames.push({ name, label });
              }
              if (typeof type === "string") {
                relationshipTypes.push(type);
              }

              // Cypher path/segment shape: { nodes, relationships, segments, start, end }
              for (const key of ["nodes", "relationships", "segments", "start", "end", "properties"]) {
                if ((val as any)[key] !== undefined) walk((val as any)[key]);
              }

              // Walk any other object props (avoid useless ones)
              for (const [k, v] of Object.entries(val)) {
                if (isUselessKey(k)) continue;
                if (k === "nodes" || k === "relationships" || k === "segments" || k === "start" || k === "end" || k === "properties") continue;
                walk(v);
              }
            }
          };

          for (const row of queryResult.results.slice(0, 20)) {
            for (const [key, val] of Object.entries(row as Record<string, any>)) {
              if (isUselessKey(key)) continue;

              if (typeof val === "number") {
                if (key.toLowerCase().includes("count") || key.toLowerCase().includes("total")) {
                  totalCount = val;
                  continue;
                }
                counts[key] = (counts[key] ?? 0) + val;
                continue;
              }
              walk(val);
            }
          }

          if (totalCount != null && entityNames.length === 0) {
            return `Result: ${totalCount}.`;
          }

          const countEntries = Object.entries(counts);
          if (countEntries.length > 0 && entityNames.length === 0) {
            const top = countEntries.sort((a, b) => b[1] - a[1]).slice(0, 5);
            return top.map(([k, v]) => `${k} (${v})`).join(", ");
          }

          const seen = new Set<string>();
          const uniq: string[] = [];
          for (const it of entityNames) {
            const display = it.label ? `${it.name} [${it.label}]` : it.name;
            if (!seen.has(display)) {
              seen.add(display);
              uniq.push(display);
              if (uniq.length >= 6) break;
            }
          }
          const relSummary = relationshipTypes.length > 0
            ? ` via ${Array.from(new Set(relationshipTypes)).slice(0, 3).join(", ")}`
            : "";
          if (uniq.length > 0) {
            return `Found ${uniq.join(", ")}${relSummary}.`;
          }
          return `Found ${queryResult.results.length} matching result${queryResult.results.length === 1 ? "" : "s"}.`;
        })();

        let answer = fallbackAnswer;
        try {
          const apiKey = await getOpenAIApiKey();
          const compactResults = JSON.stringify(queryResult.results.slice(0, 20));

          // Race the LLM call against a 25s timeout
          const crossGraphNote = foundInGraphs.length > 0
            ? `\n\nNote: These results were not found in the current graph. They came from: ${foundInGraphs.join(", ")}. Mention this in your answer.`
            : "";
          const summarizationPromise = callStageLlm(apiKey, userId, "query", {
            systemPrompt:
              "You are a knowledge graph query assistant. Given a user question, the Cypher query that ran, and the raw results, write a CONCISE answer in 1-2 short sentences. Be specific (cite entity names, counts). If results are empty, say so plainly. Never use markdown — plain text only.",
            userPrompt: `Question: ${question}\n\nCypher: ${queryResult.cypher}\n\nResults (${queryResult.results.length} rows): ${compactResults}${crossGraphNote}`,
            maxOutputTokens: 256,
          });

          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 60000),
          );

          const summarized = await Promise.race([summarizationPromise, timeoutPromise]);
          if (summarized && summarized.text.trim()) {
            answer = summarized.text.trim();
          } else {
            console.warn("[KG Ask] Summarization timed out — using fallback");
          }
        } catch (err: any) {
          console.error("[KG Ask] Summarization failed:", err.message);
        }

        // Prepend a hint about the source graph if it was a cross-graph hit
        if (foundInGraphs.length > 0 && !/found|came|graph/i.test(answer.split(".")[0] ?? "")) {
          answer = `${answer} (from: ${foundInGraphs.join(", ")})`;
        }

        res.json({
          answer,
          cypher: queryResult.cypher,
          resultCount: queryResult.results.length,
          foundInGraphs,
        });
      } catch (error: any) {
        console.error("KG ask error:", error);
        res.status(500).json({ error: "Failed to answer question" });
      }
    },
  );

  // ================================================================
  //  POST /api/knowledge-graph/suggest
  //  Generate 3 short query suggestions for a graph (optionally
  //  follow-ups based on the last Q&A).
  // ================================================================
  router.post(
    "/api/knowledge-graph/suggest",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { knowledgeBaseId, lastQuestion, lastAnswer } = req.body as {
          knowledgeBaseId: string;
          lastQuestion?: string;
          lastAnswer?: string;
        };
        if (!knowledgeBaseId) {
          return res.status(400).json({ error: "knowledgeBaseId is required" });
        }

        // Pull schema info to ground the suggestions
        const summary = await getGraphSummary(knowledgeBaseId, userId);
        const entitiesPreview = await queryEntities(knowledgeBaseId, userId, { limit: 30 });
        const entityTypes: Record<string, string[]> = {};
        for (const e of entitiesPreview.entities) {
          if (!entityTypes[e.label]) entityTypes[e.label] = [];
          if (entityTypes[e.label].length < 3) entityTypes[e.label].push(e.name);
        }
        const typeSummary = Object.entries(entityTypes)
          .map(([label, names]) => `${label}: ${names.join(", ")}`)
          .join("\n");

        const { callStageLlm } = await import("../services/kg-llm-router");
        const { getOpenAIApiKey } = await import("../services/knowledge-graph-extraction");
        const apiKey = await getOpenAIApiKey();

        const isFollowUp = !!lastQuestion && !!lastAnswer;
        const userPrompt = isFollowUp
          ? `Knowledge graph contains ${summary.entityCount} entities, ${summary.relationshipCount} relationships.
Entity types and examples:
${typeSummary}

The user just asked: "${lastQuestion}"
The system answered: "${lastAnswer}"

Suggest 3 SHORT follow-up questions (max 8 words each) that dig deeper or explore related angles. Return strict JSON: { "suggestions": ["...", "...", "..."] }. No markdown.`
          : `Knowledge graph contains ${summary.entityCount} entities, ${summary.relationshipCount} relationships.
Entity types and examples:
${typeSummary}

Suggest 3 SHORT, useful starter questions (max 8 words each) the user might want to ask. Be specific to the actual entities in this graph. Return strict JSON: { "suggestions": ["...", "...", "..."] }. No markdown.`;

        let suggestions: string[] = [];
        try {
          const result = await Promise.race([
            callStageLlm(apiKey, userId, "query", {
              systemPrompt: "You generate query suggestions for a knowledge graph. Output strict JSON only.",
              userPrompt,
              jsonObject: true,
              maxOutputTokens: 256,
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
          ]);
          if (result && (result as any).text) {
            const parsed = JSON.parse((result as any).text);
            if (Array.isArray(parsed.suggestions)) {
              suggestions = parsed.suggestions.filter((s: any) => typeof s === "string").slice(0, 3);
            }
          }
        } catch (err: any) {
          console.error("[KG Suggest] Failed:", err.message);
        }

        // Fallback suggestions derived from graph schema
        if (suggestions.length === 0) {
          const labels = Object.keys(entityTypes);
          if (isFollowUp) {
            suggestions = [
              "What is connected to that?",
              "Show me related entities",
              "What are the relationships?",
            ];
          } else if (labels.length > 0) {
            const top = labels[0];
            suggestions = [
              `What ${top} entities exist?`,
              `Show the most connected ${top}`,
              `What types of relationships are there?`,
            ];
          } else {
            suggestions = [
              "What entities exist in this graph?",
              "How many relationships are there?",
              "What are the main entity types?",
            ];
          }
        }

        res.json({ suggestions });
      } catch (error: any) {
        console.error("KG suggest error:", error);
        res.status(500).json({ error: "Failed to generate suggestions" });
      }
    },
  );

  // ================================================================
  //  GET /api/kg-models/catalog
  //  Returns the curated list of available models + stage info
  // ================================================================
  router.get(
    "/api/kg-models/catalog",
    authenticateHybrid,
    async (_req: AuthRequest, res: Response) => {
      res.json({
        models: MODEL_CATALOG,
        stages: STAGE_INFO,
        defaults: DEFAULT_STAGE_MODELS,
      });
    },
  );

  // ================================================================
  //  GET /api/kg-models/settings
  //  Get the current user's per-stage model preferences
  // ================================================================
  router.get(
    "/api/kg-models/settings",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const preferences = await getUserKgPreferences(userId);
        // Merge with defaults so the client always has a complete picture
        const merged = {
          extraction: preferences.extraction ?? DEFAULT_STAGE_MODELS.extraction,
          adjudication: preferences.adjudication ?? DEFAULT_STAGE_MODELS.adjudication,
          query: preferences.query ?? DEFAULT_STAGE_MODELS.query,
        };
        res.json({ preferences: merged });
      } catch (error: any) {
        console.error("Get KG model settings error:", error);
        res.status(500).json({ error: "Failed to load model settings" });
      }
    },
  );

  // ================================================================
  //  PUT /api/kg-models/settings
  //  Update the current user's per-stage model preferences
  // ================================================================
  router.put(
    "/api/kg-models/settings",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { preferences } = req.body as { preferences: any };
        if (!preferences || typeof preferences !== "object") {
          res.status(400).json({ error: "preferences object required" });
          return;
        }
        await setUserKgPreferences(userId, preferences);
        res.json({ success: true, preferences });
      } catch (error: any) {
        console.error("Update KG model settings error:", error);
        res.status(500).json({ error: "Failed to save model settings" });
      }
    },
  );

  return router;
}
