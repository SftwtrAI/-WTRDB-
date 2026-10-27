"use strict";

/**
 * Federation Service (WS1-T1.3)
 *
 * CRUD operations for the federation registry, alignment decisions,
 * merge operations, merge conflicts, and quality metrics.
 *
 * Mathematical foundation:
 *   - Bi-level named graph topology (math.md Part A.2)
 *   - Merge algebra: union (Sigma_M), intersection (Delta_M),
 *     differential (cokernel), conflict resolution (sheaf-augmented)
 *   - Alignment context Lambda = (A_resolved, Omega, canon) (math.md Section 6)
 *   - Sheaf cohomology quality metrics (math.md Section 5.4, 7.5)
 *   - Composite quality score (math.md Section 11)
 *
 * FalkorDB naming: kgf_{userId}_{federationId}
 *
 * References:
 *   Spivak (2012) "Functorial Data Migration"
 *   Robinson (2017) "Sheaves for Sensor Integration"
 */

import { db } from "../db";
import {
  graphFederations,
  graphAlignments,
  mergeOperations,
  mergeConflicts,
  schemaProposals,
  kgExtractionEvents,
  knowledgeGraphs,
  users,
} from "@wtrops/shared";
import type {
  GraphFederationRow,
  InsertGraphFederation,
  GraphAlignmentRow,
  InsertGraphAlignment,
  MergeOperationRow,
  InsertMergeOperation,
  MergeConflictRow,
  InsertMergeConflict,
  SchemaProposalRow,
  InsertSchemaProposal,
  KgExtractionEventRow,
  InsertKgExtractionEvent,
} from "@wtrops/shared";
import { eq, and, desc, inArray, sql, count } from "drizzle-orm";

// ════════════════════════════════════════════════════════════════
//  FEDERATION CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Create a new federation registry entry.
 * This does NOT materialize the federation graph — it only creates
 * the metadata record. Materialization is a separate pipeline step.
 */
export async function createFederation(
  data: InsertGraphFederation,
): Promise<GraphFederationRow> {
  const [federation] = await db
    .insert(graphFederations)
    .values(data)
    .returning();
  return federation;
}

/**
 * Get a single federation by ID, scoped to the requesting user.
 */
export async function getFederationById(
  federationId: string,
  userId: string,
): Promise<GraphFederationRow | undefined> {
  const [federation] = await db
    .select()
    .from(graphFederations)
    .where(
      and(
        eq(graphFederations.id, federationId),
        eq(graphFederations.userId, userId),
      ),
    )
    .limit(1);
  return federation;
}

/**
 * List all federations for a user, ordered by most recently updated.
 */
export async function listFederations(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ federations: GraphFederationRow[]; total: number }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [federations, [{ total }]] = await Promise.all([
    db
      .select()
      .from(graphFederations)
      .where(eq(graphFederations.userId, userId))
      .orderBy(desc(graphFederations.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(graphFederations)
      .where(eq(graphFederations.userId, userId)),
  ]);

  return { federations, total: Number(total) };
}

/**
 * Update a federation's configuration or metadata.
 */
export async function updateFederation(
  federationId: string,
  userId: string,
  updates: Partial<
    Pick<
      GraphFederationRow,
      | "name"
      | "description"
      | "constituentKbIds"
      | "mergeMode"
      | "mergeConfig"
      | "alignmentConfig"
      | "schemaConfig"
      | "qualityConfig"
      | "accessConfig"
      | "autoRefresh"
      | "refreshSchedule"
      | "classification"
    >
  >,
): Promise<GraphFederationRow | undefined> {
  const [updated] = await db
    .update(graphFederations)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(graphFederations.id, federationId),
        eq(graphFederations.userId, userId),
      ),
    )
    .returning();
  return updated;
}

/**
 * Delete a federation and all related records (cascading).
 * This does NOT affect constituent leaf graphs — they are always
 * the source of truth (math.md Section 14).
 */
export async function deleteFederation(
  federationId: string,
  userId: string,
): Promise<boolean> {
  // Verify ownership first
  const [fed] = await db
    .select({ id: graphFederations.id })
    .from(graphFederations)
    .where(
      and(
        eq(graphFederations.id, federationId),
        eq(graphFederations.userId, userId),
      ),
    )
    .limit(1);

  if (!fed) return false;

  // Delete children in FK-dependency order (conflicts → operations, alignments → federation)
  const ops = await db
    .select({ id: mergeOperations.id })
    .from(mergeOperations)
    .where(eq(mergeOperations.federationId, federationId));

  for (const op of ops) {
    await db.delete(mergeConflicts).where(eq(mergeConflicts.mergeOperationId, op.id));
  }
  await db.delete(mergeOperations).where(eq(mergeOperations.federationId, federationId));
  await db.delete(graphAlignments).where(eq(graphAlignments.federationId, federationId));

  const result = await db
    .delete(graphFederations)
    .where(eq(graphFederations.id, federationId))
    .returning({ id: graphFederations.id });
  return result.length > 0;
}

/**
 * Update materialization status and quality metrics on a federation.
 * Called after the materialization pipeline completes.
 */
export async function updateFederationMaterialization(
  federationId: string,
  metrics: {
    isMaterialized: boolean;
    materializedAt: Date;
    entityCount: number;
    edgeCount: number;
    conflictCount: number;
    consistencyScore?: string;
    conflictDimension?: number;
    topoQuality?: string;
    freshnessScore?: string;
    compositeQuality?: string;
  },
): Promise<GraphFederationRow | undefined> {
  const [updated] = await db
    .update(graphFederations)
    .set({ ...metrics, updatedAt: new Date() })
    .where(eq(graphFederations.id, federationId))
    .returning();
  return updated;
}

/**
 * Check staleness: returns true if any constituent leaf graph has been
 * updated after the federation's materialization timestamp.
 *
 * Implements the staleness predicate from math.md Section 1.2:
 *   stale(G_fed) <=> exists G_leaf in constituents : updated_at(G_leaf) > materialized_at(G_fed)
 */
export async function checkFederationStaleness(
  federationId: string,
  userId: string,
): Promise<{
  isStale: boolean;
  staleKbIds: string[];
  materializedAt: Date | null;
}> {
  const federation = await getFederationById(federationId, userId);
  if (!federation) {
    throw new Error(`Federation ${federationId} not found`);
  }

  if (!federation.isMaterialized || !federation.materializedAt) {
    return { isStale: true, staleKbIds: [], materializedAt: null };
  }

  const constituentKbIds = (federation.constituentKbIds as string[]) || [];
  if (constituentKbIds.length === 0) {
    return {
      isStale: false,
      staleKbIds: [],
      materializedAt: federation.materializedAt,
    };
  }

  // Find leaf graphs updated after materialization
  const staleGraphs = await db
    .select({ knowledgeBaseId: knowledgeGraphs.knowledgeBaseId })
    .from(knowledgeGraphs)
    .where(
      and(
        inArray(knowledgeGraphs.knowledgeBaseId, constituentKbIds),
        eq(knowledgeGraphs.userId, userId),
        sql`${knowledgeGraphs.updatedAt} > ${federation.materializedAt}`,
      ),
    );

  const staleKbIds = staleGraphs.map((g) => g.knowledgeBaseId);

  return {
    isStale: staleKbIds.length > 0,
    staleKbIds,
    materializedAt: federation.materializedAt,
  };
}

// ════════════════════════════════════════════════════════════════
//  ALIGNMENT CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Create alignment decisions in bulk (from an ER cascade run).
 */
export async function createAlignments(
  alignments: InsertGraphAlignment[],
): Promise<GraphAlignmentRow[]> {
  if (alignments.length === 0) return [];
  const result = await db
    .insert(graphAlignments)
    .values(alignments)
    .returning();
  return result;
}

/**
 * List alignment decisions for a federation with optional filters.
 */
export async function listAlignments(
  federationId: string,
  opts?: {
    decision?: string;
    minConfidence?: number;
    limit?: number;
    offset?: number;
  },
): Promise<{ alignments: GraphAlignmentRow[]; total: number }> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const conditions = [eq(graphAlignments.federationId, federationId)];
  if (opts?.decision) {
    conditions.push(eq(graphAlignments.decision, opts.decision));
  }
  if (opts?.minConfidence !== undefined) {
    conditions.push(
      sql`${graphAlignments.confidence} >= ${opts.minConfidence.toString()}`,
    );
  }

  const whereClause = and(...conditions);

  const [alignments, [{ total }]] = await Promise.all([
    db
      .select()
      .from(graphAlignments)
      .where(whereClause)
      .orderBy(desc(graphAlignments.confidence))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(graphAlignments)
      .where(whereClause),
  ]);

  return { alignments, total: Number(total) };
}

/**
 * Update a single alignment decision (e.g., human override).
 */
export async function updateAlignmentDecision(
  alignmentId: string,
  decision: string,
  metadata?: Record<string, any>,
): Promise<GraphAlignmentRow | undefined> {
  const updates: Record<string, any> = { decision };
  if (metadata) {
    updates.metadata = metadata;
  }
  const [updated] = await db
    .update(graphAlignments)
    .set(updates)
    .where(eq(graphAlignments.id, alignmentId))
    .returning();
  return updated;
}

/**
 * Delete all alignments for a federation (before re-running ER cascade).
 */
export async function deleteAlignmentsForFederation(
  federationId: string,
): Promise<number> {
  const result = await db
    .delete(graphAlignments)
    .where(eq(graphAlignments.federationId, federationId))
    .returning({ id: graphAlignments.id });
  return result.length;
}

// ════════════════════════════════════════════════════════════════
//  MERGE OPERATIONS CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Record a merge operation (audit log entry).
 */
export async function createMergeOperation(
  data: InsertMergeOperation,
): Promise<MergeOperationRow> {
  const [operation] = await db
    .insert(mergeOperations)
    .values(data)
    .returning();
  return operation;
}

/**
 * List merge operations for a federation, most recent first.
 */
export async function listMergeOperations(
  federationId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ operations: MergeOperationRow[]; total: number }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [operations, [{ total }]] = await Promise.all([
    db
      .select()
      .from(mergeOperations)
      .where(eq(mergeOperations.federationId, federationId))
      .orderBy(desc(mergeOperations.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(mergeOperations)
      .where(eq(mergeOperations.federationId, federationId)),
  ]);

  return { operations, total: Number(total) };
}

/**
 * Get a single merge operation by ID.
 */
export async function getMergeOperationById(
  operationId: string,
): Promise<MergeOperationRow | undefined> {
  const [operation] = await db
    .select()
    .from(mergeOperations)
    .where(eq(mergeOperations.id, operationId))
    .limit(1);
  return operation;
}

// ════════════════════════════════════════════════════════════════
//  MERGE CONFLICTS CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Create conflict records in bulk (from a merge operation).
 */
export async function createMergeConflicts(
  conflicts: InsertMergeConflict[],
): Promise<MergeConflictRow[]> {
  if (conflicts.length === 0) return [];
  const result = await db
    .insert(mergeConflicts)
    .values(conflicts)
    .returning();
  return result;
}

/**
 * List conflicts for a merge operation with optional type filter.
 */
export async function listMergeConflicts(
  mergeOperationId: string,
  opts?: {
    conflictType?: string;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ conflicts: MergeConflictRow[]; total: number }> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const conditions = [eq(mergeConflicts.mergeOperationId, mergeOperationId)];
  if (opts?.conflictType) {
    conditions.push(eq(mergeConflicts.conflictType, opts.conflictType));
  }
  if (opts?.resolved === true) {
    conditions.push(sql`${mergeConflicts.resolvedAt} IS NOT NULL`);
  } else if (opts?.resolved === false) {
    conditions.push(sql`${mergeConflicts.resolvedAt} IS NULL`);
  }

  const whereClause = and(...conditions);

  const [conflicts, [{ total }]] = await Promise.all([
    db
      .select()
      .from(mergeConflicts)
      .where(whereClause)
      .orderBy(desc(mergeConflicts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(mergeConflicts)
      .where(whereClause),
  ]);

  return { conflicts, total: Number(total) };
}

/**
 * Resolve a merge conflict (human adjudication from the Conflict Dashboard).
 */
export async function resolveConflict(
  conflictId: string,
  resolution: string,
  resolvedBy: string,
): Promise<MergeConflictRow | undefined> {
  const [updated] = await db
    .update(mergeConflicts)
    .set({
      actualResolution: resolution,
      resolvedBy,
      resolvedAt: new Date(),
    })
    .where(eq(mergeConflicts.id, conflictId))
    .returning();
  return updated;
}

/**
 * Get unresolved conflict count for a federation (across all operations).
 */
export async function getUnresolvedConflictCount(
  federationId: string,
): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(mergeConflicts)
    .innerJoin(
      mergeOperations,
      eq(mergeConflicts.mergeOperationId, mergeOperations.id),
    )
    .where(
      and(
        eq(mergeOperations.federationId, federationId),
        sql`${mergeConflicts.resolvedAt} IS NULL`,
      ),
    );
  return Number(total);
}

// ════════════════════════════════════════════════════════════════
//  SCHEMA PROPOSALS CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Create schema proposals in bulk (from an extraction batch).
 */
export async function createSchemaProposals(
  proposals: InsertSchemaProposal[],
): Promise<SchemaProposalRow[]> {
  if (proposals.length === 0) return [];
  const result = await db
    .insert(schemaProposals)
    .values(proposals)
    .returning();
  return result;
}

/**
 * List schema proposals for a graph with optional status filter.
 */
export async function listSchemaProposals(
  graphId: string,
  opts?: {
    status?: string;
    proposalType?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ proposals: SchemaProposalRow[]; total: number }> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const conditions = [eq(schemaProposals.graphId, graphId)];
  if (opts?.status) {
    conditions.push(eq(schemaProposals.status, opts.status));
  }
  if (opts?.proposalType) {
    conditions.push(eq(schemaProposals.proposalType, opts.proposalType));
  }

  const whereClause = and(...conditions);

  const [proposals, [{ total }]] = await Promise.all([
    db
      .select()
      .from(schemaProposals)
      .where(whereClause)
      .orderBy(desc(schemaProposals.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(schemaProposals)
      .where(whereClause),
  ]);

  return { proposals, total: Number(total) };
}

/**
 * Fetch a single schema proposal by id.
 */
export async function getSchemaProposal(
  proposalId: string,
): Promise<SchemaProposalRow | undefined> {
  const [row] = await db
    .select()
    .from(schemaProposals)
    .where(eq(schemaProposals.id, proposalId))
    .limit(1);
  return row;
}

/**
 * Update a schema proposal's status (accept, reject, merge).
 */
export async function updateSchemaProposalStatus(
  proposalId: string,
  status: "accepted" | "rejected" | "merged",
): Promise<SchemaProposalRow | undefined> {
  const updates: Record<string, any> = { status };
  if (status === "accepted") {
    updates.acceptedAt = new Date();
  }
  const [updated] = await db
    .update(schemaProposals)
    .set(updates)
    .where(eq(schemaProposals.id, proposalId))
    .returning();
  return updated;
}

// ════════════════════════════════════════════════════════════════
//  KG EXTRACTION EVENTS CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Record a knowledge graph extraction event (knowledge increment DeltaG_k).
 */
export async function createExtractionEvent(
  data: InsertKgExtractionEvent,
): Promise<KgExtractionEventRow> {
  const [event] = await db
    .insert(kgExtractionEvents)
    .values(data)
    .returning();
  return event;
}

/**
 * Update an extraction event with results (after processing completes).
 */
export async function updateExtractionEvent(
  eventId: string,
  updates: Partial<
    Pick<
      KgExtractionEventRow,
      | "status"
      | "entitiesAdded"
      | "edgesAdded"
      | "edgesDeprecated"
      | "documentsProcessed"
      | "chunksProcessed"
      | "schemaProposalsGenerated"
      | "durationMs"
      | "errorMessage"
      | "metadata"
    >
  >,
): Promise<KgExtractionEventRow | undefined> {
  const [updated] = await db
    .update(kgExtractionEvents)
    .set(updates)
    .where(eq(kgExtractionEvents.id, eventId))
    .returning();
  return updated;
}

/**
 * List extraction events for a knowledge base, most recent first.
 */
export async function listExtractionEvents(
  knowledgeBaseId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ events: KgExtractionEventRow[]; total: number }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [events, [{ total }]] = await Promise.all([
    db
      .select()
      .from(kgExtractionEvents)
      .where(eq(kgExtractionEvents.knowledgeBaseId, knowledgeBaseId))
      .orderBy(desc(kgExtractionEvents.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(kgExtractionEvents)
      .where(eq(kgExtractionEvents.knowledgeBaseId, knowledgeBaseId)),
  ]);

  return { events, total: Number(total) };
}

// ════════════════════════════════════════════════════════════════
//  QUALITY & METRICS
// ════════════════════════════════════════════════════════════════

/**
 * Compute the composite quality score for a federation.
 *
 * quality(G_fed) = w_c * consistency_score + w_t * topo_quality + w_f * freshness_score
 *
 * Default weights from math.md Section 11: w_c = 0.4, w_t = 0.2, w_f = 0.4.
 * Custom weights can be stored in federation.qualityConfig.
 */
export function computeCompositeQuality(
  consistencyScore: number,
  topoQuality: number,
  freshnessScore: number,
  qualityConfig?: Record<string, any>,
): number {
  const wc = qualityConfig?.quality_weight_consistency ?? 0.4;
  const wt = qualityConfig?.quality_weight_topology ?? 0.2;
  const wf = qualityConfig?.quality_weight_freshness ?? 0.4;

  return wc * consistencyScore + wt * topoQuality + wf * freshnessScore;
}

/**
 * Get a quality summary for a federation, including staleness and
 * unresolved conflict count.
 */
export async function getFederationQualitySummary(
  federationId: string,
  userId: string,
): Promise<{
  federation: GraphFederationRow;
  staleness: { isStale: boolean; staleKbIds: string[] };
  unresolvedConflicts: number;
  latestOperation: MergeOperationRow | null;
} | null> {
  const federation = await getFederationById(federationId, userId);
  if (!federation) return null;

  const [staleness, unresolvedConflicts, { operations }] = await Promise.all([
    checkFederationStaleness(federationId, userId),
    getUnresolvedConflictCount(federationId),
    listMergeOperations(federationId, { limit: 1 }),
  ]);

  return {
    federation,
    staleness,
    unresolvedConflicts,
    latestOperation: operations[0] ?? null,
  };
}
