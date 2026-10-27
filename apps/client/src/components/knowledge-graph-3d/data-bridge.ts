/**
 * 3D Knowledge Graph — Data Bridge.
 *
 * Transforms raw API entities and relationships into Node3D and Edge3D
 * arrays ready for the Three.js scene. Handles entity-type-to-meshframe
 * mapping, connection counting, scale calculation, and edge filtering.
 */

import * as THREE from "three";

import type {
  Node3D,
  Edge3D,
  GraphEntity,
  GraphRelationship,
  MeshframeType,
} from "./types";
import {
  ENTITY_TYPE_TO_MESHFRAME,
  MESHFRAME_COLORS,
  EDGE_TYPE_COLORS,
  COLORS,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_NODES = 300;
const BASE_SCALE = 0.6;
const SCALE_PER_CONNECTION = 0.12;
const MAX_SCALE = 3.0;
const DEFAULT_MESHFRAME: MeshframeType = "containmentGrid";
const DEFAULT_EDGE_COLOR = COLORS.edgeBase; // 0x1a2a4a
const PULSE_PROBABILITY = 0.65;
const BASE_PULSE_SPEED = 0.002;
const PULSE_SPEED_VARIANCE = 0.003;

// ── Exported interface ────────────────────────────────────────────────────────

export interface DataBridge {
  /**
   * Transform API data into 3D-ready node and edge arrays.
   * Limits to maxNodes most-connected entities.
   */
  transform(
    entities: GraphEntity[],
    relationships: GraphRelationship[],
    maxNodes?: number,
  ): { nodes: Node3D[]; edges: Edge3D[] };

  /**
   * Get summary statistics about the transformed data.
   */
  getStats(
    nodes: Node3D[],
    edges: Edge3D[],
  ): {
    nodeCount: number;
    edgeCount: number;
    typeDistribution: Record<string, number>;
    avgConnections: number;
    maxConnections: number;
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createDataBridge(): DataBridge {
  /**
   * Count how many relationships reference each entity (as source or target).
   */
  function countConnections(
    entities: GraphEntity[],
    relationships: GraphRelationship[],
  ): Map<string, number> {
    const counts = new Map<string, number>();

    // Initialize all entities to 0
    for (const entity of entities) {
      counts.set(entity.id, 0);
    }

    // Count each relationship's endpoints
    for (const rel of relationships) {
      const sc = counts.get(rel.sourceEntityId);
      if (sc !== undefined) counts.set(rel.sourceEntityId, sc + 1);

      const tc = counts.get(rel.targetEntityId);
      if (tc !== undefined) counts.set(rel.targetEntityId, tc + 1);
    }

    return counts;
  }

  /**
   * Resolve the meshframe type for a given entity label.
   */
  function resolveMeshframe(label: string): MeshframeType {
    return ENTITY_TYPE_TO_MESHFRAME[label] ?? DEFAULT_MESHFRAME;
  }

  /**
   * Compute node scale from connection count.
   * scale = 0.6 + connectionCount * 0.12, clamped to max 3.0
   */
  function computeScale(connectionCount: number): number {
    return Math.min(BASE_SCALE + connectionCount * SCALE_PER_CONNECTION, MAX_SCALE);
  }

  /**
   * Deterministic seed for visual variation.
   * seed = (nodeIndex * 7.3 + 2.1) % 10
   */
  function computeSeed(nodeIndex: number): number {
    return (nodeIndex * 7.3 + 2.1) % 10;
  }

  /**
   * Transform API data into 3D-ready node and edge arrays.
   */
  function transform(
    entities: GraphEntity[],
    relationships: GraphRelationship[],
    maxNodes: number = DEFAULT_MAX_NODES,
  ): { nodes: Node3D[]; edges: Edge3D[] } {
    // 1. Count connections for each entity
    const connectionCounts = countConnections(entities, relationships);

    // 2. Sort entities by connection count descending
    const sorted = [...entities].sort((a, b) => {
      const ca = connectionCounts.get(a.id) ?? 0;
      const cb = connectionCounts.get(b.id) ?? 0;
      return cb - ca;
    });

    // 3. Take top maxNodes
    const topEntities = sorted.slice(0, maxNodes);

    // 4. Create Node3D objects
    const nodes: Node3D[] = topEntities.map((entity, index) => {
      const meshframeType = resolveMeshframe(entity.label);
      const connCount = connectionCounts.get(entity.id) ?? 0;

      return {
        id: entity.id,
        entity,
        meshframeType,
        color: MESHFRAME_COLORS[meshframeType],
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        scale: computeScale(connCount),
        connectionCount: connCount,
        group: null,
        seed: computeSeed(index),
      };
    });

    // 5. Build set of included node IDs
    const includedIds = new Set<string>(nodes.map((n) => n.id));

    // 6. Filter relationships to only those with both endpoints included
    const filteredRels = relationships.filter(
      (rel) =>
        includedIds.has(rel.sourceEntityId) && includedIds.has(rel.targetEntityId),
    );

    // 7. Create Edge3D objects
    const edges: Edge3D[] = filteredRels.map((rel) => ({
      id: rel.id,
      relationship: rel,
      sourceId: rel.sourceEntityId,
      targetId: rel.targetEntityId,
      color: EDGE_TYPE_COLORS[rel.type] ?? DEFAULT_EDGE_COLOR,
      curve: null,
      line: null,
      pulse: null,
      pulseTrail: null,
      pulseT: Math.random(),
      pulseSpeed: BASE_PULSE_SPEED + Math.random() * PULSE_SPEED_VARIANCE,
      hasPulse: Math.random() < PULSE_PROBABILITY,
    }));

    return { nodes, edges };
  }

  /**
   * Get summary statistics about the transformed data.
   */
  function getStats(
    nodes: Node3D[],
    edges: Edge3D[],
  ): {
    nodeCount: number;
    edgeCount: number;
    typeDistribution: Record<string, number>;
    avgConnections: number;
    maxConnections: number;
  } {
    const typeDistribution: Record<string, number> = {};
    let totalConnections = 0;
    let maxConnections = 0;

    for (const node of nodes) {
      const t = node.meshframeType;
      typeDistribution[t] = (typeDistribution[t] ?? 0) + 1;

      totalConnections += node.connectionCount;
      if (node.connectionCount > maxConnections) {
        maxConnections = node.connectionCount;
      }
    }

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      typeDistribution,
      avgConnections: nodes.length > 0 ? totalConnections / nodes.length : 0,
      maxConnections,
    };
  }

  return { transform, getStats };
}
