"use strict";

/**
 * Meta-Graph Federation Service
 *
 * A federation in the meta-graph world is a thin grouping of:
 *   - exactly ONE meta-graph (the structural know-how on top)
 *   - N constituent KBs underneath (independent, NOT merged)
 *
 * There is no materialization, no merge mode, no sheaf cohomology. The
 * federation row is just a named tuple used as a query target by the
 * GraphQueryBar / Brain endpoints. Deleting a federation does NOT touch
 * the meta-graph or the constituents.
 */

import { db } from "../db";
import {
  metaGraphFederations,
  metaGraphs,
  knowledgeBase,
  type MetaGraphFederationRow,
  type MetaGraphRow,
} from "@wtrops/shared";
import { and, desc, eq, inArray } from "drizzle-orm";

export interface CreateMetaFederationInput {
  name: string;
  description?: string | null;
  metaGraphId: string;
  constituentKbIds: string[];
}

export interface UpdateMetaFederationInput {
  name?: string;
  description?: string | null;
  constituentKbIds?: string[];
}

export interface MetaFederationDetail extends MetaGraphFederationRow {
  metaGraph: MetaGraphRow | null;
  constituents: Array<{ id: string; name: string }>;
}

export async function createMetaFederation(
  userId: string,
  input: CreateMetaFederationInput,
): Promise<MetaGraphFederationRow> {
  // Verify the meta-graph belongs to the user
  const [meta] = await db
    .select()
    .from(metaGraphs)
    .where(and(eq(metaGraphs.id, input.metaGraphId), eq(metaGraphs.userId, userId)))
    .limit(1);
  if (!meta) {
    throw new Error(`meta-graph ${input.metaGraphId} not found`);
  }

  const [row] = await db
    .insert(metaGraphFederations)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
      metaGraphId: input.metaGraphId,
      constituentKbIds: input.constituentKbIds,
    })
    .returning();
  return row;
}

export async function listMetaFederations(
  userId: string,
): Promise<MetaGraphFederationRow[]> {
  return db
    .select()
    .from(metaGraphFederations)
    .where(eq(metaGraphFederations.userId, userId))
    .orderBy(desc(metaGraphFederations.createdAt));
}

export async function getMetaFederation(
  userId: string,
  id: string,
): Promise<MetaFederationDetail | null> {
  const [row] = await db
    .select()
    .from(metaGraphFederations)
    .where(
      and(
        eq(metaGraphFederations.id, id),
        eq(metaGraphFederations.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [meta] = await db
    .select()
    .from(metaGraphs)
    .where(eq(metaGraphs.id, row.metaGraphId))
    .limit(1);

  let constituents: Array<{ id: string; name: string }> = [];
  if (row.constituentKbIds.length > 0) {
    const kbs = await db
      .select({ id: knowledgeBase.id, name: knowledgeBase.name })
      .from(knowledgeBase)
      .where(inArray(knowledgeBase.id, row.constituentKbIds));
    constituents = kbs.map((k) => ({ id: k.id, name: k.name ?? "(unnamed)" }));
  }

  return {
    ...row,
    metaGraph: meta ?? null,
    constituents,
  };
}

export async function updateMetaFederation(
  userId: string,
  id: string,
  patch: UpdateMetaFederationInput,
): Promise<MetaGraphFederationRow | null> {
  const updates: any = { updatedAt: new Date() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.constituentKbIds !== undefined) {
    updates.constituentKbIds = patch.constituentKbIds;
  }
  const [row] = await db
    .update(metaGraphFederations)
    .set(updates)
    .where(
      and(
        eq(metaGraphFederations.id, id),
        eq(metaGraphFederations.userId, userId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteMetaFederation(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(metaGraphFederations)
    .where(
      and(
        eq(metaGraphFederations.id, id),
        eq(metaGraphFederations.userId, userId),
      ),
    )
    .returning();
  return result.length > 0;
}
