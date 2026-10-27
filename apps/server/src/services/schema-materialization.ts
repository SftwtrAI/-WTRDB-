"use strict";

/**
 * Schema Materialization Service
 *
 * When a schema proposal is accepted, this service applies the change to the
 * actual FalkorDB graph:
 *
 *  - type_synonym (entity): rename label `OldLabel` → canonical label across all nodes
 *  - relationship_canonicalization: rename rel type `OLD_TYPE` → canonical type across all edges
 *  - new_entity_type / new_relationship_type: no graph mutation needed (just curation)
 *
 * FalkorDB Cypher quirks:
 *  - Label rename: REMOVE n:Old SET n:New works
 *  - Relationship type rename: not natively supported — must delete + recreate
 *    (FalkorDB does not allow SET on a relationship's type)
 */

import Redis from "ioredis";
import { createFalkorDBClient, getGraphName, type FalkorDBClient } from "../infrastructure/falkordb/client";
import type { SchemaProposalRow } from "@wtrops/shared";

let falkordbClient: FalkorDBClient | null = null;

async function getClient(): Promise<FalkorDBClient> {
  if (falkordbClient) return falkordbClient;
  const url = process.env.FALKORDB_URL || "redis://localhost:6379";
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  await redis.connect();
  falkordbClient = createFalkorDBClient(redis);
  return falkordbClient;
}

function escapeCypher(s: string): string {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sanitizeLabel(s: string): string {
  return String(s).replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Materialize a schema proposal into the FalkorDB graph.
 * Returns a summary of what was changed.
 */
export async function materializeAcceptedProposal(
  proposal: SchemaProposalRow,
  userId: string,
): Promise<{
  applied: boolean;
  type: "label_rename" | "rel_rename" | "no_op";
  affected: number;
  message: string;
}> {
  const knowledgeBaseId = proposal.graphId;
  const definition = proposal.proposedDefinition as { mergeTarget?: string } | null;
  const mergeTarget = definition?.mergeTarget;

  // No graph mutation for new-type proposals — they just confirm the type as canonical
  if (
    proposal.proposalType === "new_entity_type" ||
    proposal.proposalType === "new_relationship_type"
  ) {
    return {
      applied: true,
      type: "no_op",
      affected: 0,
      message: "Type added to canonical schema",
    };
  }

  // For synonyms/canonicalizations, we need a merge target
  if (!mergeTarget) {
    return {
      applied: false,
      type: "no_op",
      affected: 0,
      message: "No merge target specified",
    };
  }

  const client = await getClient();
  const graphName = getGraphName(userId, knowledgeBaseId);
  const oldName = sanitizeLabel(proposal.proposedName);
  const newName = sanitizeLabel(mergeTarget);

  if (oldName === newName) {
    return { applied: true, type: "no_op", affected: 0, message: "Already canonical" };
  }

  if (proposal.proposalType === "type_synonym") {
    // Rename entity label across all matching nodes
    try {
      const result = await client.query(
        graphName,
        `MATCH (n:${oldName}) REMOVE n:${oldName} SET n:${newName} RETURN count(n) AS cnt`,
      );
      const affected = Number(result.records[0]?.cnt ?? 0);
      console.log(
        `[Schema Materialization] Renamed label ${oldName} → ${newName} on ${affected} nodes in ${graphName}`,
      );
      return {
        applied: true,
        type: "label_rename",
        affected,
        message: `Renamed ${affected} nodes from ${oldName} to ${newName}`,
      };
    } catch (err: any) {
      console.error(
        `[Schema Materialization] Label rename failed: ${err.message}`,
      );
      return {
        applied: false,
        type: "label_rename",
        affected: 0,
        message: `Rename failed: ${err.message}`,
      };
    }
  }

  if (proposal.proposalType === "relationship_canonicalization") {
    // Relationship type rename: delete old + create new with same properties
    try {
      // Step 1: copy each old-typed edge into a new edge with the canonical type
      await client.query(
        graphName,
        `MATCH (a)-[r:${oldName}]->(b) CREATE (a)-[r2:${newName}]->(b) SET r2 = properties(r)`,
      );
      // Step 2: delete the old edges
      const deleted = await client.query(
        graphName,
        `MATCH ()-[r:${oldName}]->() DELETE r RETURN count(r) AS cnt`,
      );
      const affected = Number(deleted.records[0]?.cnt ?? 0);
      console.log(
        `[Schema Materialization] Renamed rel type ${oldName} → ${newName} on ${affected} edges in ${graphName}`,
      );
      return {
        applied: true,
        type: "rel_rename",
        affected,
        message: `Renamed ${affected} edges from ${oldName} to ${newName}`,
      };
    } catch (err: any) {
      console.error(
        `[Schema Materialization] Relationship rename failed: ${err.message}`,
      );
      return {
        applied: false,
        type: "rel_rename",
        affected: 0,
        message: `Rename failed: ${err.message}`,
      };
    }
  }

  return {
    applied: false,
    type: "no_op",
    affected: 0,
    message: `Unknown proposal type: ${proposal.proposalType}`,
  };
}
