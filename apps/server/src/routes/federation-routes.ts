"use strict";

/**
 * Federation REST API Routes (WS1-T1.2)
 *
 * Provides endpoints for managing federated knowledge graphs:
 * federations, alignments, merge operations, conflicts, and quality.
 *
 * Endpoints:
 *   POST   /api/federations                          — Create federation
 *   GET    /api/federations                          — List user federations
 *   GET    /api/federations/:id                      — Get federation
 *   PUT    /api/federations/:id                      — Update federation config
 *   DELETE /api/federations/:id                      — Delete federation
 *   GET    /api/federations/:id/staleness            — Check staleness
 *   GET    /api/federations/:id/quality              — Get quality summary
 *
 *   GET    /api/federations/:id/alignments           — List alignments
 *   POST   /api/federations/:id/alignments           — Create alignments (bulk)
 *   PUT    /api/federations/alignments/:alignmentId  — Update alignment decision
 *   DELETE /api/federations/:id/alignments           — Clear all alignments
 *
 *   GET    /api/federations/:id/operations           — List merge operations
 *   POST   /api/federations/:id/operations           — Record merge operation
 *   GET    /api/federations/operations/:operationId  — Get merge operation
 *
 *   GET    /api/federations/operations/:operationId/conflicts  — List conflicts
 *   POST   /api/federations/operations/:operationId/conflicts  — Create conflicts (bulk)
 *   PUT    /api/federations/conflicts/:conflictId/resolve      — Resolve conflict
 *
 *   GET    /api/federations/:id/schema-proposals     — List schema proposals
 *
 *   GET    /api/knowledge-graph/:kbId/extraction-events — List extraction events
 */

import { Router, Response } from "express";
import { RouteContext, AuthRequest } from "./common";
import * as federationService from "../services/federation.service";

export function createFederationRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateHybrid, storage } = ctx;

  // ================================================================
  //  FEDERATION CRUD
  // ================================================================

  /**
   * POST /api/federations
   * Create a new federation registry entry.
   */
  router.post(
    "/api/federations",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const {
          name,
          description,
          constituentKbIds,
          mergeMode,
          mergeConfig,
          alignmentConfig,
          schemaConfig,
          qualityConfig,
          accessConfig,
          autoRefresh,
          refreshSchedule,
          classification,
        } = req.body;

        if (!name || typeof name !== "string") {
          return res.status(400).json({ error: "name is required" });
        }
        if (
          !constituentKbIds ||
          !Array.isArray(constituentKbIds) ||
          constituentKbIds.length < 2
        ) {
          return res.status(400).json({
            error:
              "constituentKbIds must be an array with at least 2 knowledge base IDs",
          });
        }

        const federation = await federationService.createFederation({
          userId,
          name,
          description,
          constituentKbIds,
          mergeMode: mergeMode || "union",
          mergeConfig: mergeConfig || {},
          alignmentConfig: alignmentConfig || {},
          schemaConfig: schemaConfig || {},
          qualityConfig: qualityConfig || {},
          accessConfig: accessConfig || {},
          autoRefresh: autoRefresh || "manual",
          refreshSchedule,
          classification: classification || "internal",
        });

        res.status(201).json(federation);
      } catch (error: any) {
        console.error("[Federation Routes] Create error:", error);
        res.status(500).json({ error: "Failed to create federation" });
      }
    },
  );

  /**
   * GET /api/federations
   * List all federations for the authenticated user.
   */
  router.get(
    "/api/federations",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await federationService.listFederations(userId, {
          limit,
          offset,
        });

        res.json(result);
      } catch (error: any) {
        console.error("[Federation Routes] List error:", error);
        res.status(500).json({ error: "Failed to list federations" });
      }
    },
  );

  /**
   * GET /api/federations/available-kbs
   * List the user's knowledge bases that can be selected for federation/merge.
   */
  router.get(
    "/api/federations/available-kbs",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const knowledgeBases = await storage.getUserKnowledgeBase(userId);

        const kbs = knowledgeBases.map((kb) => {
          const metadata =
            kb.metadata && typeof kb.metadata === "object"
              ? (kb.metadata as Record<string, unknown>)
              : {};

          const entityCountRaw = metadata.entityCount ?? metadata.entities ?? 0;
          const relationshipCountRaw =
            metadata.relationshipCount ?? metadata.relationships ?? 0;
          const freshnessRaw =
            metadata.freshnessScore ?? metadata.freshness ?? 0;
          const lastUpdatedRaw = metadata.updatedAt ?? metadata.lastUpdated;

          const entityCount = Number.isFinite(Number(entityCountRaw))
            ? Number(entityCountRaw)
            : 0;
          const relationshipCount = Number.isFinite(
            Number(relationshipCountRaw),
          )
            ? Number(relationshipCountRaw)
            : 0;
          const freshness = Number.isFinite(Number(freshnessRaw))
            ? Number(freshnessRaw)
            : 0;

          const createdAtIso =
            kb.createdAt instanceof Date
              ? kb.createdAt.toISOString()
              : new Date(kb.createdAt as any).toISOString();

          return {
            id: kb.id,
            name: kb.title,
            entityCount,
            relationshipCount,
            freshness,
            lastUpdated:
              typeof lastUpdatedRaw === "string" && lastUpdatedRaw.trim()
                ? lastUpdatedRaw
                : createdAtIso,
          };
        });

        res.json({ kbs });
      } catch (error: any) {
        console.error("[Federation Routes] Available KBs error:", error);
        res
          .status(500)
          .json({ error: "Failed to load available knowledge bases" });
      }
    },
  );

  /**
   * GET /api/federations/:id
   * Get a single federation by ID.
   */
  router.get(
    "/api/federations/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const federation = await federationService.getFederationById(
          req.params.id,
          userId,
        );

        if (!federation) {
          return res.status(404).json({ error: "Federation not found" });
        }

        res.json(federation);
      } catch (error: any) {
        console.error("[Federation Routes] Get error:", error);
        res.status(500).json({ error: "Failed to retrieve federation" });
      }
    },
  );

  /**
   * PUT /api/federations/:id
   * Update federation configuration.
   */
  router.put(
    "/api/federations/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const {
          name,
          description,
          constituentKbIds,
          mergeMode,
          mergeConfig,
          alignmentConfig,
          schemaConfig,
          qualityConfig,
          accessConfig,
          autoRefresh,
          refreshSchedule,
          classification,
        } = req.body;

        // Build update object only with provided fields
        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (constituentKbIds !== undefined) {
          if (!Array.isArray(constituentKbIds) || constituentKbIds.length < 2) {
            return res.status(400).json({
              error:
                "constituentKbIds must contain at least 2 knowledge base IDs",
            });
          }
          updates.constituentKbIds = constituentKbIds;
        }
        if (mergeMode !== undefined) updates.mergeMode = mergeMode;
        if (mergeConfig !== undefined) updates.mergeConfig = mergeConfig;
        if (alignmentConfig !== undefined)
          updates.alignmentConfig = alignmentConfig;
        if (schemaConfig !== undefined) updates.schemaConfig = schemaConfig;
        if (qualityConfig !== undefined) updates.qualityConfig = qualityConfig;
        if (accessConfig !== undefined) updates.accessConfig = accessConfig;
        if (autoRefresh !== undefined) updates.autoRefresh = autoRefresh;
        if (refreshSchedule !== undefined)
          updates.refreshSchedule = refreshSchedule;
        if (classification !== undefined)
          updates.classification = classification;

        const federation = await federationService.updateFederation(
          req.params.id,
          userId,
          updates,
        );

        if (!federation) {
          return res.status(404).json({ error: "Federation not found" });
        }

        res.json(federation);
      } catch (error: any) {
        console.error("[Federation Routes] Update error:", error);
        res.status(500).json({ error: "Failed to update federation" });
      }
    },
  );

  /**
   * DELETE /api/federations/:id
   * Delete a federation. Leaf graphs are unaffected.
   */
  router.delete(
    "/api/federations/:id",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const deleted = await federationService.deleteFederation(
          req.params.id,
          userId,
        );

        if (!deleted) {
          return res.status(404).json({ error: "Federation not found" });
        }

        res.json({ success: true, message: "Federation deleted" });
      } catch (error: any) {
        console.error("[Federation Routes] Delete error:", error);
        res.status(500).json({ error: "Failed to delete federation" });
      }
    },
  );

  /**
   * GET /api/federations/:id/staleness
   * Check if a federation is stale relative to its constituent leaf graphs.
   */
  router.get(
    "/api/federations/:id/staleness",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const result = await federationService.checkFederationStaleness(
          req.params.id,
          userId,
        );
        res.json(result);
      } catch (error: any) {
        console.error("[Federation Routes] Staleness check error:", error);
        res.status(500).json({ error: "Failed to check staleness" });
      }
    },
  );

  /**
   * GET /api/federations/:id/quality
   * Get quality summary including staleness, conflict counts, and metrics.
   */
  router.get(
    "/api/federations/:id/quality",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const result = await federationService.getFederationQualitySummary(
          req.params.id,
          userId,
        );

        if (!result) {
          return res.status(404).json({ error: "Federation not found" });
        }

        res.json(result);
      } catch (error: any) {
        console.error("[Federation Routes] Quality summary error:", error);
        res.status(500).json({ error: "Failed to get quality summary" });
      }
    },
  );

  // ================================================================
  //  ALIGNMENT CRUD
  // ================================================================

  /**
   * GET /api/federations/:id/alignments
   * List entity alignment decisions for a federation.
   */
  router.get(
    "/api/federations/:id/alignments",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const decision = req.query.decision as string | undefined;
        const minConfidence = req.query.minConfidence
          ? parseFloat(req.query.minConfidence as string)
          : undefined;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await federationService.listAlignments(req.params.id, {
          decision,
          minConfidence,
          limit,
          offset,
        });

        res.json(result);
      } catch (error: any) {
        console.error("[Federation Routes] List alignments error:", error);
        res.status(500).json({ error: "Failed to list alignments" });
      }
    },
  );

  /**
   * POST /api/federations/:id/alignments
   * Create alignment decisions in bulk (from ER cascade).
   */
  router.post(
    "/api/federations/:id/alignments",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { alignments } = req.body;
        if (!alignments || !Array.isArray(alignments)) {
          return res.status(400).json({ error: "alignments must be an array" });
        }

        // Inject federationId into each alignment
        const withFedId = alignments.map((a: any) => ({
          ...a,
          federationId: req.params.id,
        }));

        const result = await federationService.createAlignments(withFedId);
        res.status(201).json({ created: result.length, alignments: result });
      } catch (error: any) {
        console.error("[Federation Routes] Create alignments error:", error);
        res.status(500).json({ error: "Failed to create alignments" });
      }
    },
  );

  /**
   * PUT /api/federations/alignments/:alignmentId
   * Update a single alignment decision (human override).
   */
  router.put(
    "/api/federations/alignments/:alignmentId",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { decision, metadata } = req.body;
        if (
          !decision ||
          !["SAME", "DIFFERENT", "UNCERTAIN"].includes(decision)
        ) {
          return res.status(400).json({
            error: "decision must be one of: SAME, DIFFERENT, UNCERTAIN",
          });
        }

        const updated = await federationService.updateAlignmentDecision(
          req.params.alignmentId,
          decision,
          metadata,
        );

        if (!updated) {
          return res.status(404).json({ error: "Alignment not found" });
        }

        res.json(updated);
      } catch (error: any) {
        console.error("[Federation Routes] Update alignment error:", error);
        res.status(500).json({ error: "Failed to update alignment" });
      }
    },
  );

  /**
   * DELETE /api/federations/:id/alignments
   * Clear all alignment decisions for a federation (before re-running ER).
   */
  router.delete(
    "/api/federations/:id/alignments",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const deletedCount =
          await federationService.deleteAlignmentsForFederation(req.params.id);
        res.json({ success: true, deleted: deletedCount });
      } catch (error: any) {
        console.error("[Federation Routes] Delete alignments error:", error);
        res.status(500).json({ error: "Failed to delete alignments" });
      }
    },
  );

  // ================================================================
  //  MERGE OPERATIONS
  // ================================================================

  /**
   * GET /api/federations/:id/operations
   * List merge operations (materialization audit log) for a federation.
   */
  router.get(
    "/api/federations/:id/operations",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await federationService.listMergeOperations(
          req.params.id,
          { limit, offset },
        );

        res.json(result);
      } catch (error: any) {
        console.error("[Federation Routes] List operations error:", error);
        res.status(500).json({ error: "Failed to list merge operations" });
      }
    },
  );

  /**
   * POST /api/federations/:id/operations
   * Record a merge operation (called by the materialization pipeline).
   */
  router.post(
    "/api/federations/:id/operations",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const {
          operationType,
          configSnapshot,
          entitiesProcessed,
          edgesProcessed,
          entitiesMerged,
          conflictsDetected,
          conflictsAutoResolved,
          conflictsDeferred,
          consistencyScore,
          conflictDimension,
          topoQuality,
          durationMs,
        } = req.body;

        if (!operationType || !configSnapshot) {
          return res.status(400).json({
            error: "operationType and configSnapshot are required",
          });
        }

        const operation = await federationService.createMergeOperation({
          federationId: req.params.id,
          operationType,
          configSnapshot,
          entitiesProcessed,
          edgesProcessed,
          entitiesMerged,
          conflictsDetected,
          conflictsAutoResolved,
          conflictsDeferred,
          consistencyScore,
          conflictDimension,
          topoQuality,
          durationMs,
          operatorId: userId,
        });

        res.status(201).json(operation);
      } catch (error: any) {
        console.error("[Federation Routes] Create operation error:", error);
        res.status(500).json({ error: "Failed to record merge operation" });
      }
    },
  );

  /**
   * GET /api/federations/operations/:operationId
   * Get a single merge operation by ID.
   */
  router.get(
    "/api/federations/operations/:operationId",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const operation = await federationService.getMergeOperationById(
          req.params.operationId,
        );

        if (!operation) {
          return res.status(404).json({ error: "Operation not found" });
        }

        res.json(operation);
      } catch (error: any) {
        console.error("[Federation Routes] Get operation error:", error);
        res.status(500).json({ error: "Failed to retrieve operation" });
      }
    },
  );

  // ================================================================
  //  MERGE CONFLICTS
  // ================================================================

  /**
   * GET /api/federations/operations/:operationId/conflicts
   * List conflicts for a merge operation.
   */
  router.get(
    "/api/federations/operations/:operationId/conflicts",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const conflictType = req.query.conflictType as string | undefined;
        const resolved =
          req.query.resolved !== undefined
            ? req.query.resolved === "true"
            : undefined;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await federationService.listMergeConflicts(
          req.params.operationId,
          { conflictType, resolved, limit, offset },
        );

        res.json(result);
      } catch (error: any) {
        console.error("[Federation Routes] List conflicts error:", error);
        res.status(500).json({ error: "Failed to list conflicts" });
      }
    },
  );

  /**
   * POST /api/federations/operations/:operationId/conflicts
   * Create conflicts in bulk (from a merge operation).
   */
  router.post(
    "/api/federations/operations/:operationId/conflicts",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const { conflicts } = req.body;
        if (!conflicts || !Array.isArray(conflicts)) {
          return res.status(400).json({ error: "conflicts must be an array" });
        }

        // Inject mergeOperationId into each conflict
        const withOpId = conflicts.map((c: any) => ({
          ...c,
          mergeOperationId: req.params.operationId,
        }));

        const result = await federationService.createMergeConflicts(withOpId);
        res.status(201).json({ created: result.length, conflicts: result });
      } catch (error: any) {
        console.error("[Federation Routes] Create conflicts error:", error);
        res.status(500).json({ error: "Failed to create conflicts" });
      }
    },
  );

  /**
   * PUT /api/federations/conflicts/:conflictId/resolve
   * Resolve a merge conflict (human adjudication).
   */
  router.put(
    "/api/federations/conflicts/:conflictId/resolve",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.userId!;
        const { resolution } = req.body;

        if (!resolution || typeof resolution !== "string") {
          return res
            .status(400)
            .json({
              error:
                "resolution is required (e.g., 'accept_left', 'accept_right', 'defer')",
            });
        }

        const resolved = await federationService.resolveConflict(
          req.params.conflictId,
          resolution,
          userId,
        );

        if (!resolved) {
          return res.status(404).json({ error: "Conflict not found" });
        }

        res.json(resolved);
      } catch (error: any) {
        console.error("[Federation Routes] Resolve conflict error:", error);
        res.status(500).json({ error: "Failed to resolve conflict" });
      }
    },
  );

  // ================================================================
  //  SCHEMA PROPOSALS
  // ================================================================

  /**
   * GET /api/federations/:id/schema-proposals
   * List schema proposals for a federation graph.
   */
  router.get(
    "/api/federations/:id/schema-proposals",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const status = req.query.status as string | undefined;
        const proposalType = req.query.proposalType as string | undefined;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await federationService.listSchemaProposals(
          req.params.id,
          { status, proposalType, limit, offset },
        );

        res.json(result);
      } catch (error: any) {
        console.error(
          "[Federation Routes] List schema proposals error:",
          error,
        );
        res.status(500).json({ error: "Failed to list schema proposals" });
      }
    },
  );

  // ================================================================
  //  EXTRACTION EVENTS (scoped to knowledge base, not federation)
  // ================================================================

  /**
   * GET /api/knowledge-graph/:knowledgeBaseId/extraction-events
   * List extraction events (knowledge increments) for a knowledge base.
   */
  router.get(
    "/api/knowledge-graph/:knowledgeBaseId/extraction-events",
    authenticateHybrid,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined;
        const offset = req.query.offset
          ? parseInt(req.query.offset as string, 10)
          : undefined;

        const result = await federationService.listExtractionEvents(
          req.params.knowledgeBaseId,
          { limit, offset },
        );

        res.json(result);
      } catch (error: any) {
        console.error(
          "[Federation Routes] List extraction events error:",
          error,
        );
        res.status(500).json({ error: "Failed to list extraction events" });
      }
    },
  );

  return router;
}
