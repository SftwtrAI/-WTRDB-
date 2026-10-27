/**
 * 3D Knowledge Graph — NaN-Proof Edge Rendering & Energy Pulse System.
 *
 * Edges are quadratic Bezier curves connecting nodes with a controlled
 * midpoint offset for visual separation. ~65% of edges carry animated
 * energy pulses that travel along the curve with additive-blended glow.
 *
 * Every geometry path validates inputs with Number.isFinite() before
 * creating BufferGeometry, and calls computeBoundingSphere() immediately
 * after creation to guarantee no NaN leaks into the render loop.
 */

import * as THREE from "three";

import { EDGE_TYPE_COLORS } from "./types";

// ── Seeded random (deterministic, keyed on edgeIndex) ───────────────────────

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Validation helpers ──────────────────────────────────────────────────────

/** Returns true only when every component of v is a finite number. */
function isValid(v: THREE.Vector3): boolean {
  return (
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
  );
}

/** Validate that all six coordinates of source and target are finite. */
function arePositionsValid(
  source: THREE.Vector3,
  target: THREE.Vector3,
): boolean {
  return isValid(source) && isValid(target);
}

// ── Edge result type ────────────────────────────────────────────────────────

export interface EdgeResult {
  line: THREE.Line;
  curve: THREE.QuadraticBezierCurve3;
  pulse: THREE.Mesh | null;
  trail: THREE.Mesh | null;
  hasPulse: boolean;
  pulseSpeed: number;
}

// ── Exported interface ──────────────────────────────────────────────────────

export interface EdgeManager {
  createEdge(
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3,
    edgeType: string,
    sourceColor: number,
    edgeIndex: number,
  ): EdgeResult;

  updatePulse(
    pulse: THREE.Mesh,
    trail: THREE.Mesh | null,
    curve: THREE.QuadraticBezierCurve3,
    t: number,
    globalTime: number,
  ): void;

  dispose(): void;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createEdgeManager(): EdgeManager {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Shared pulse geometries — reused across all pulses to save memory.
  const pulseGeo = new THREE.SphereGeometry(0.08, 6, 6);
  pulseGeo.computeBoundingSphere();
  const trailGeo = new THREE.SphereGeometry(0.2, 6, 6);
  trailGeo.computeBoundingSphere();
  geometries.push(pulseGeo, trailGeo);

  // ── Dummy result for invalid inputs ─────────────────────────────────────

  /** Build an invisible, zero-cost dummy result so callers never get null. */
  function createDummyResult(): EdgeResult {
    const origin = new THREE.Vector3(0, 0, 0);
    const curve = new THREE.QuadraticBezierCurve3(
      origin.clone(),
      origin.clone(),
      origin.clone(),
    );
    const geo = new THREE.BufferGeometry().setFromPoints([
      origin.clone(),
      origin.clone(),
    ]);
    geo.computeBoundingSphere();

    const mat = new THREE.LineBasicMaterial({ visible: false });
    const line = new THREE.Line(geo, mat);
    line.visible = false;

    // Track for disposal
    geometries.push(geo);
    materials.push(mat);

    return {
      line,
      curve,
      pulse: null,
      trail: null,
      hasPulse: false,
      pulseSpeed: 0,
    };
  }

  // ── Curve construction ──────────────────────────────────────────────────

  /**
   * Compute the Bezier control point (midpoint + seeded offset).
   * Offsets are clamped to +/-1.0 per axis to prevent extreme arcs.
   */
  function computeControlPoint(
    source: THREE.Vector3,
    target: THREE.Vector3,
    edgeIndex: number,
  ): THREE.Vector3 {
    const mid = new THREE.Vector3()
      .addVectors(source, target)
      .multiplyScalar(0.5);

    // Seeded offsets clamped to +/-1.0
    const offsetX = (seededRandom(edgeIndex * 3) - 0.5) * 2.0;
    const offsetY = (seededRandom(edgeIndex * 3 + 1) - 0.5) * 2.0;
    const offsetZ = (seededRandom(edgeIndex * 3 + 2) - 0.5) * 2.0;

    mid.x += Math.max(-1.0, Math.min(1.0, offsetX));
    mid.y += Math.max(-1.0, Math.min(1.0, offsetY));
    mid.z += Math.max(-1.0, Math.min(1.0, offsetZ));

    return mid;
  }

  /**
   * Build a QuadraticBezierCurve3 from validated, cloned positions.
   * Returns the curve and its sampled BufferGeometry (40 sample points).
   */
  function buildCurve(
    source: THREE.Vector3,
    target: THREE.Vector3,
    edgeIndex: number,
  ): { curve: THREE.QuadraticBezierCurve3; geometry: THREE.BufferGeometry } {
    const s = source.clone();
    const t = target.clone();
    const control = computeControlPoint(s, t, edgeIndex);

    const curve = new THREE.QuadraticBezierCurve3(s, control, t);
    const points = curve.getPoints(40);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingSphere();

    return { curve, geometry };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function createEdge(
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3,
    edgeType: string,
    sourceColor: number,
    edgeIndex: number,
  ): EdgeResult {
    // Reject any edge whose source or target contains non-finite values.
    if (!arePositionsValid(sourcePos, targetPos)) {
      return createDummyResult();
    }

    // Determine edge color from type, falling back to the default dark blue.
    const edgeColor = EDGE_TYPE_COLORS[edgeType] ?? 0x1a2a4a;

    // Build the Bezier curve and line geometry.
    const { curve, geometry } = buildCurve(sourcePos, targetPos, edgeIndex);
    geometries.push(geometry);

    const material = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    materials.push(material);

    const line = new THREE.Line(geometry, material);

    // Energy pulse — ~65% of edges get one (seeded, not Math.random).
    const hasPulse = seededRandom(edgeIndex * 7 + 13) < 0.65;
    let pulse: THREE.Mesh | null = null;
    let trail: THREE.Mesh | null = null;
    let pulseSpeed = 0;

    if (hasPulse) {
      pulseSpeed =
        0.002 + seededRandom(edgeIndex * 11 + 37) * 0.003;

      const pulseMat = new THREE.MeshBasicMaterial({
        color: sourceColor,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materials.push(pulseMat);

      const trailMat = new THREE.MeshBasicMaterial({
        color: sourceColor,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materials.push(trailMat);

      pulse = new THREE.Mesh(pulseGeo, pulseMat);
      trail = new THREE.Mesh(trailGeo, trailMat);
    }

    return { line, curve, pulse, trail, hasPulse, pulseSpeed };
  }

  function updatePulse(
    pulse: THREE.Mesh,
    trail: THREE.Mesh | null,
    curve: THREE.QuadraticBezierCurve3,
    t: number,
    _globalTime: number,
  ): void {
    // Clamp t to the valid curve parameter range.
    const clampedT = Math.max(0, Math.min(1, t));
    const pos = curve.getPointAt(clampedT);

    // Guard against NaN from degenerate curves (zero-length, etc.)
    if (!isValid(pos)) {
      return;
    }

    pulse.position.copy(pos);

    // Animate pulse opacity with a sine wobble.
    const pulseMaterial = pulse.material as THREE.MeshBasicMaterial;
    pulseMaterial.opacity = 0.6 + Math.sin(t * 8) * 0.3;

    if (trail) {
      trail.position.copy(pos);
    }
  }

  function dispose(): void {
    for (const geo of geometries) {
      geo.dispose();
    }
    for (const mat of materials) {
      mat.dispose();
    }
    geometries.length = 0;
    materials.length = 0;
  }

  return { createEdge, updatePulse, dispose };
}
