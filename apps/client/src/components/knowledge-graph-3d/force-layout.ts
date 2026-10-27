/**
 * 3D Knowledge Graph — NaN-Impossible Force-Directed Layout Simulation.
 *
 * Custom 3D force simulation with full Y-axis support. Every arithmetic
 * path is guarded so that NaN can never propagate into node positions:
 *
 *   - No `.normalize()` calls (zero-length vectors produce NaN)
 *   - All force magnitudes clamped to MAX_FORCE (5.0)
 *   - All velocity components clamped to MAX_VELOCITY (3.0)
 *   - All position components clamped to POSITION_BOUND (50)
 *   - Deterministic initial positions (no Math.random)
 *   - Final NaN sweep after simulation as a last-resort safety net
 *
 * Runs synchronously — fast enough for up to ~500 nodes.
 */

import * as THREE from "three";

import type { Node3D, Edge3D } from "./types";

// ── Constants ────────────────────────────────────────────────────────────────

const REPULSION_STRENGTH = 18;
const ATTRACTION_STRENGTH = 0.014;
const CENTER_GRAVITY = -0.006;
const DEFAULT_DAMPING = 0.8;
const MAX_ITERATIONS = 350;
const REDUCED_ITERATIONS = 300;
const LARGE_GRAPH_THRESHOLD = 200;
const INITIAL_SPREAD_XZ = 15;
const INITIAL_SPREAD_Y = 11;
const MIN_DIST_SQ = 0.1;
const SKIP_DISTANCE_SQ = 2500; // 50^2 — skip pairs farther than 50 units

const MAX_FORCE = 5.0;
const MAX_VELOCITY = 3.0;
const POSITION_BOUND = 50;
const SAFE_LENGTH_EPSILON = 0.001;

// ── Exported interface ───────────────────────────────────────────────────────

export interface ForceLayout {
  /** Run the full simulation. Modifies node.position in place. */
  simulate(nodes: Node3D[], edges: Edge3D[]): void;

  /** Run one iteration. Returns max velocity for convergence checks. */
  step(nodes: Node3D[], edges: Edge3D[], damping?: number): number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deterministic pseudo-random value in [-1, 1] based on node index and axis.
 * Uses a sin-hash so the layout is reproducible and Math.random-free.
 */
function deterministicPos(index: number, axis: "x" | "y" | "z"): number {
  const seed = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const hash = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return (hash - Math.floor(hash)) * 2 - 1; // [-1, 1]
}

/** Clamp a single number to [-bound, bound]. */
function clamp(value: number, bound: number): number {
  return value > bound ? bound : value < -bound ? -bound : value;
}

/**
 * Safe direction + length extraction.
 * Writes a unit-length direction into `out` and returns the original length.
 * If the vector length is below SAFE_LENGTH_EPSILON, `out` is zeroed and 0 is
 * returned — this avoids the NaN that THREE.normalize() would produce.
 */
function safeDirection(v: THREE.Vector3, out: THREE.Vector3): number {
  const len = v.length();
  if (len > SAFE_LENGTH_EPSILON) {
    out.copy(v).divideScalar(len);
  } else {
    out.set(0, 0, 0);
  }
  return len;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createForceLayout(): ForceLayout {
  // Reusable temp vectors — allocated once, never inside the hot loop.
  const _diff = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _force = new THREE.Vector3();

  /** Map node IDs to array indices for O(1) edge lookups. */
  function buildNodeIndex(nodes: Node3D[]): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
      map.set(nodes[i].id, i);
    }
    return map;
  }

  /** Assign deterministic initial positions; zero all velocities. */
  function initPositions(nodes: Node3D[]): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      node.position.set(
        deterministicPos(i, "x") * INITIAL_SPREAD_XZ,
        deterministicPos(i, "y") * INITIAL_SPREAD_Y,
        deterministicPos(i, "z") * INITIAL_SPREAD_XZ,
      );
      node.velocity.set(0, 0, 0);
    }
  }

  /**
   * One simulation step: repulsion, attraction, gravity, integration.
   * Every force/velocity/position is clamped to prevent divergence.
   */
  function step(
    nodes: Node3D[],
    edges: Edge3D[],
    damping: number = DEFAULT_DAMPING,
  ): number {
    const n = nodes.length;
    const isLarge = n > LARGE_GRAPH_THRESHOLD;

    // Per-node force accumulators (x, y, z packed into a flat Float64Array).
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    const fz = new Float64Array(n);

    // ── Repulsion (all pairs) ──
    for (let i = 0; i < n; i++) {
      const pi = nodes[i].position;
      for (let j = i + 1; j < n; j++) {
        const pj = nodes[j].position;

        _diff.set(pi.x - pj.x, pi.y - pj.y, pi.z - pj.z);
        const distSq = _diff.lengthSq();

        // Skip distant pairs for large graphs.
        if (isLarge && distSq > SKIP_DISTANCE_SQ) continue;

        // Safe direction extraction (never normalizes a zero vector).
        const len = safeDirection(_diff, _dir);

        // If nodes are exactly overlapping, push along a deterministic axis
        // instead of producing a zero-force (which would leave them stuck).
        if (len <= SAFE_LENGTH_EPSILON) {
          _dir.set(
            deterministicPos(i + j, "x"),
            deterministicPos(i + j, "y"),
            deterministicPos(i + j, "z"),
          );
          const jitterLen = _dir.length();
          if (jitterLen > SAFE_LENGTH_EPSILON) _dir.divideScalar(jitterLen);
          else _dir.set(1, 0, 0); // absolute fallback
        }

        const safeDist = Math.max(distSq, MIN_DIST_SQ);
        const mag = Math.min(REPULSION_STRENGTH / safeDist, MAX_FORCE);

        fx[i] += _dir.x * mag;
        fy[i] += _dir.y * mag;
        fz[i] += _dir.z * mag;
        fx[j] -= _dir.x * mag;
        fy[j] -= _dir.y * mag;
        fz[j] -= _dir.z * mag;
      }
    }

    // ── Attraction (edges) ──
    const nodeIndex = buildNodeIndex(nodes);

    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const si = nodeIndex.get(edge.sourceId);
      const ti = nodeIndex.get(edge.targetId);
      if (si === undefined || ti === undefined) continue;

      const ps = nodes[si].position;
      const pt = nodes[ti].position;

      _diff.set(pt.x - ps.x, pt.y - ps.y, pt.z - ps.z);
      const dist = safeDirection(_diff, _dir);

      if (dist <= SAFE_LENGTH_EPSILON) continue; // overlapping — skip

      const mag = Math.min(dist * ATTRACTION_STRENGTH, MAX_FORCE);

      fx[si] += _dir.x * mag;
      fy[si] += _dir.y * mag;
      fz[si] += _dir.z * mag;
      fx[ti] -= _dir.x * mag;
      fy[ti] -= _dir.y * mag;
      fz[ti] -= _dir.z * mag;
    }

    // ── Center gravity + integration ──
    let maxVelocity = 0;

    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const pos = node.position;
      const vel = node.velocity;

      // Gravity pulls toward origin.
      fx[i] += CENTER_GRAVITY * pos.x;
      fy[i] += CENTER_GRAVITY * pos.y;
      fz[i] += CENTER_GRAVITY * pos.z;

      // Integrate: vel = vel * damping + force, then clamp.
      vel.x = clamp(vel.x * damping + fx[i], MAX_VELOCITY);
      vel.y = clamp(vel.y * damping + fy[i], MAX_VELOCITY);
      vel.z = clamp(vel.z * damping + fz[i], MAX_VELOCITY);

      // Update position, then clamp.
      pos.x = clamp(pos.x + vel.x, POSITION_BOUND);
      pos.y = clamp(pos.y + vel.y, POSITION_BOUND);
      pos.z = clamp(pos.z + vel.z, POSITION_BOUND);

      // Track max velocity (per-component max is fine for convergence).
      const vMag = Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(vel.z);
      if (vMag > maxVelocity) maxVelocity = vMag;
    }

    return maxVelocity;
  }

  /** Run the full simulation to convergence. */
  function simulate(nodes: Node3D[], edges: Edge3D[]): void {
    if (nodes.length === 0) return;

    initPositions(nodes);

    const iterations =
      nodes.length > LARGE_GRAPH_THRESHOLD ? REDUCED_ITERATIONS : MAX_ITERATIONS;

    for (let i = 0; i < iterations; i++) {
      step(nodes, edges, DEFAULT_DAMPING);
    }

    // Final NaN sweep — deterministic fallback for any surviving NaN.
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (isNaN(node.position.x) || isNaN(node.position.y) || isNaN(node.position.z)) {
        node.position.set(
          deterministicPos(i, "x") * INITIAL_SPREAD_XZ,
          deterministicPos(i, "y") * INITIAL_SPREAD_Y,
          deterministicPos(i, "z") * INITIAL_SPREAD_XZ,
        );
        node.velocity.set(0, 0, 0);
      }
    }
  }

  return { simulate, step };
}
