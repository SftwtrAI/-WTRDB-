"use strict";

/**
 * Meta-Graphs Routes
 *
 * HTTP API for meta-knowledge graphs:
 *   - CRUD on meta_graphs
 *   - Procedural facet read/write (FalkorDB kgm_*)
 *   - Auto-induction from N constituent KBs
 *   - Slot bindings to constituent KBs
 *   - Standalone + projected query
 *   - Federation grouping (1 meta + N constituents)
 */

import { Router, Response } from "express";
import { RouteContext, AuthRequest } from "./common";
import {
  createMetaGraph,
  listMetaGraphs,
  getMetaGraph,
  updateMetaGraph,
  deleteMetaGraph,
  getProceduralGraph,
  addProceduralNode,
  addProceduralEdge,
  writeProceduralGraph,
} from "../services/meta-graphs";
import { induceFromKnowledgeBases } from "../services/meta-graph-induction";
import {
  queryMetaAlone,
  queryMetaProjected,
  upsertBinding,
  listBindings,
  deleteBinding,
} from "../services/meta-graph-query";
import {
  createMetaFederation,
  listMetaFederations,
  getMetaFederation,
  updateMetaFederation,
  deleteMetaFederation,
} from "../services/meta-graph-federation";

export function createMetaGraphsRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateHybrid } = ctx;

  // ─────────────────────────────────────────────────────────────────
  //  CRUD on meta-graphs
  // ─────────────────────────────────────────────────────────────────

  router.get(
    "/api/meta-graphs",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const rows = await listMetaGraphs(userId);
        res.json({ metaGraphs: rows });
      } catch (err: any) {
        console.error("[MetaGraphs] list error:", err);
        res.status(500).json({ error: "Failed to list meta-graphs" });
      }
    },
  );

  router.post(
    "/api/meta-graphs",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        if (!body?.name) {
          return res.status(400).json({ error: "name is required" });
        }
        const row = await createMetaGraph(userId, {
          name: String(body.name),
          description: body.description ?? null,
          source: body.source ?? "manual",
          derivedFromKbIds: body.derivedFromKbIds ?? [],
          slots: body.slots ?? [],
          pattern: body.pattern ?? [],
        });
        res.json({ metaGraph: row });
      } catch (err: any) {
        console.error("[MetaGraphs] create error:", err);
        res.status(500).json({ error: "Failed to create meta-graph" });
      }
    },
  );

  router.get(
    "/api/meta-graphs/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const row = await getMetaGraph(userId, req.params.id);
        if (!row) return res.status(404).json({ error: "Meta-graph not found" });
        res.json({ metaGraph: row });
      } catch (err: any) {
        console.error("[MetaGraphs] get error:", err);
        res.status(500).json({ error: "Failed to fetch meta-graph" });
      }
    },
  );

  router.patch(
    "/api/meta-graphs/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        const updated = await updateMetaGraph(userId, req.params.id, {
          name: body.name,
          description: body.description,
          slots: body.slots,
          pattern: body.pattern,
        });
        if (!updated) return res.status(404).json({ error: "Meta-graph not found" });
        res.json({ metaGraph: updated });
      } catch (err: any) {
        console.error("[MetaGraphs] patch error:", err);
        res.status(500).json({ error: "Failed to update meta-graph" });
      }
    },
  );

  router.delete(
    "/api/meta-graphs/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const ok = await deleteMetaGraph(userId, req.params.id);
        if (!ok) return res.status(404).json({ error: "Meta-graph not found" });
        res.json({ success: true });
      } catch (err: any) {
        console.error("[MetaGraphs] delete error:", err);
        res.status(500).json({ error: "Failed to delete meta-graph" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────
  //  Procedural facet (FalkorDB kgm_*)
  // ─────────────────────────────────────────────────────────────────

  router.get(
    "/api/meta-graphs/:id/procedural",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const meta = await getMetaGraph(userId, req.params.id);
        if (!meta) return res.status(404).json({ error: "Meta-graph not found" });
        const data = await getProceduralGraph(userId, req.params.id);
        res.json(data);
      } catch (err: any) {
        console.error("[MetaGraphs] procedural read error:", err);
        res.status(500).json({ error: "Failed to read procedural graph" });
      }
    },
  );

  router.post(
    "/api/meta-graphs/:id/procedural/nodes",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const meta = await getMetaGraph(userId, req.params.id);
        if (!meta) return res.status(404).json({ error: "Meta-graph not found" });
        const body = req.body as any;
        if (!body?.name) return res.status(400).json({ error: "name is required" });
        const node = await addProceduralNode(userId, req.params.id, {
          name: String(body.name),
          slotId: body.slotId ?? null,
          description: body.description,
          properties: body.properties,
        });
        res.json({ node });
      } catch (err: any) {
        console.error("[MetaGraphs] add procedural node error:", err);
        res.status(500).json({ error: "Failed to add procedural node" });
      }
    },
  );

  router.post(
    "/api/meta-graphs/:id/procedural/edges",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const meta = await getMetaGraph(userId, req.params.id);
        if (!meta) return res.status(404).json({ error: "Meta-graph not found" });
        const body = req.body as any;
        if (!body?.fromNodeId || !body?.toNodeId || !body?.relType) {
          return res.status(400).json({
            error: "fromNodeId, toNodeId, and relType are required",
          });
        }
        const edge = await addProceduralEdge(userId, req.params.id, {
          fromNodeId: String(body.fromNodeId),
          toNodeId: String(body.toNodeId),
          relType: String(body.relType),
          description: body.description,
        });
        res.json({ edge });
      } catch (err: any) {
        console.error("[MetaGraphs] add procedural edge error:", err);
        res.status(500).json({ error: "Failed to add procedural edge" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────
  //  Induction (auto-mine from N KBs)
  // ─────────────────────────────────────────────────────────────────

  router.post(
    "/api/meta-graphs/induce",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        if (!Array.isArray(body?.kbIds) || body.kbIds.length === 0) {
          return res.status(400).json({ error: "kbIds array is required" });
        }
        const draft = await induceFromKnowledgeBases(userId, {
          kbIds: body.kbIds,
          modelOverride: body.modelOverride,
          seedProceduralNodes: body.seedProceduralNodes !== false,
          proposedName: body.proposedName,
        });
        res.json({ draft });
      } catch (err: any) {
        console.error("[MetaGraphs] induce error:", err);
        res.status(500).json({ error: err.message || "Induction failed" });
      }
    },
  );

  router.post(
    "/api/meta-graphs/induce/accept",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        const draft = body?.draft;
        if (!draft) return res.status(400).json({ error: "draft is required" });

        const created = await createMetaGraph(userId, {
          name: draft.name,
          description: draft.description,
          source: "induced",
          derivedFromKbIds: draft.derivedFromKbIds ?? [],
          slots: draft.slots ?? [],
          pattern: draft.pattern ?? [],
        });

        // Materialize procedural seeds (if any)
        if (Array.isArray(draft.proceduralNodes) && draft.proceduralNodes.length > 0) {
          // Re-map slot ids: the draft slot ids were generated by the induction
          // service but createMetaGraph regenerates them, so we look them up by name.
          const nameToNewSlotId = new Map<string, string>();
          for (let i = 0; i < created.slots.length; i++) {
            nameToNewSlotId.set(created.slots[i].name, created.slots[i].id);
          }
          // Build a draftSlotId → newSlotId map by aligning order
          const draftSlotIdToNewId = new Map<string, string>();
          if (Array.isArray(draft.slots)) {
            for (let i = 0; i < draft.slots.length && i < created.slots.length; i++) {
              draftSlotIdToNewId.set(draft.slots[i].id, created.slots[i].id);
            }
          }
          await writeProceduralGraph(userId, created.id, {
            nodes: draft.proceduralNodes.map((n: any) => ({
              tempId: n.tempId,
              name: n.name,
              slotId: n.slotId ? draftSlotIdToNewId.get(n.slotId) ?? null : null,
              description: n.description,
            })),
            edges: draft.proceduralEdges ?? [],
          });
        }

        const refreshed = await getMetaGraph(userId, created.id);
        res.json({ metaGraph: refreshed });
      } catch (err: any) {
        console.error("[MetaGraphs] induce accept error:", err);
        res.status(500).json({ error: "Failed to accept draft" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────
  //  Bindings
  // ─────────────────────────────────────────────────────────────────

  router.get(
    "/api/meta-graphs/:id/bindings",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const meta = await getMetaGraph(userId, req.params.id);
        if (!meta) return res.status(404).json({ error: "Meta-graph not found" });
        const bindings = await listBindings(req.params.id);
        res.json({ bindings });
      } catch (err: any) {
        console.error("[MetaGraphs] list bindings error:", err);
        res.status(500).json({ error: "Failed to list bindings" });
      }
    },
  );

  router.post(
    "/api/meta-graphs/:id/bindings",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const meta = await getMetaGraph(userId, req.params.id);
        if (!meta) return res.status(404).json({ error: "Meta-graph not found" });
        const body = req.body as any;
        if (!body?.knowledgeBaseId || !body?.slotResolvers) {
          return res.status(400).json({
            error: "knowledgeBaseId and slotResolvers are required",
          });
        }
        const binding = await upsertBinding(
          req.params.id,
          String(body.knowledgeBaseId),
          body.slotResolvers,
        );
        res.json({ binding });
      } catch (err: any) {
        console.error("[MetaGraphs] upsert binding error:", err);
        res.status(500).json({ error: "Failed to save binding" });
      }
    },
  );

  router.delete(
    "/api/meta-graphs/:id/bindings/:bindingId",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const meta = await getMetaGraph(userId, req.params.id);
        if (!meta) return res.status(404).json({ error: "Meta-graph not found" });
        const ok = await deleteBinding(req.params.id, req.params.bindingId);
        if (!ok) return res.status(404).json({ error: "Binding not found" });
        res.json({ success: true });
      } catch (err: any) {
        console.error("[MetaGraphs] delete binding error:", err);
        res.status(500).json({ error: "Failed to delete binding" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────
  //  Query
  // ─────────────────────────────────────────────────────────────────

  router.post(
    "/api/meta-graphs/:id/query",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        if (!body?.question) return res.status(400).json({ error: "question is required" });
        const mode = body.mode === "projected" ? "projected" : "alone";
        if (mode === "projected") {
          if (!Array.isArray(body.kbIds) || body.kbIds.length === 0) {
            return res.status(400).json({
              error: "kbIds array is required for projected mode",
            });
          }
          const result = await queryMetaProjected(
            userId,
            req.params.id,
            body.kbIds,
            String(body.question),
          );
          return res.json(result);
        }
        const result = await queryMetaAlone(
          userId,
          req.params.id,
          String(body.question),
        );
        res.json(result);
      } catch (err: any) {
        console.error("[MetaGraphs] query error:", err);
        res.status(500).json({ error: err.message || "Query failed" });
      }
    },
  );

  // ─────────────────────────────────────────────────────────────────
  //  Federations (1 meta + N constituents)
  // ─────────────────────────────────────────────────────────────────

  router.get(
    "/api/meta-graph-federations",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const rows = await listMetaFederations(userId);
        res.json({ federations: rows });
      } catch (err: any) {
        console.error("[MetaFederations] list error:", err);
        res.status(500).json({ error: "Failed to list federations" });
      }
    },
  );

  router.post(
    "/api/meta-graph-federations",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        if (!body?.name || !body?.metaGraphId) {
          return res.status(400).json({
            error: "name and metaGraphId are required",
          });
        }
        const row = await createMetaFederation(userId, {
          name: String(body.name),
          description: body.description ?? null,
          metaGraphId: String(body.metaGraphId),
          constituentKbIds: Array.isArray(body.constituentKbIds)
            ? body.constituentKbIds
            : [],
        });
        res.json({ federation: row });
      } catch (err: any) {
        console.error("[MetaFederations] create error:", err);
        res.status(500).json({ error: err.message || "Failed to create federation" });
      }
    },
  );

  router.get(
    "/api/meta-graph-federations/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const detail = await getMetaFederation(userId, req.params.id);
        if (!detail) return res.status(404).json({ error: "Federation not found" });
        res.json({ federation: detail });
      } catch (err: any) {
        console.error("[MetaFederations] get error:", err);
        res.status(500).json({ error: "Failed to fetch federation" });
      }
    },
  );

  router.patch(
    "/api/meta-graph-federations/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const body = req.body as any;
        const updated = await updateMetaFederation(userId, req.params.id, {
          name: body.name,
          description: body.description,
          constituentKbIds: body.constituentKbIds,
        });
        if (!updated) return res.status(404).json({ error: "Federation not found" });
        res.json({ federation: updated });
      } catch (err: any) {
        console.error("[MetaFederations] patch error:", err);
        res.status(500).json({ error: "Failed to update federation" });
      }
    },
  );

  router.delete(
    "/api/meta-graph-federations/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const ok = await deleteMetaFederation(userId, req.params.id);
        if (!ok) return res.status(404).json({ error: "Federation not found" });
        res.json({ success: true });
      } catch (err: any) {
        console.error("[MetaFederations] delete error:", err);
        res.status(500).json({ error: "Failed to delete federation" });
      }
    },
  );

  return router;
}
