/**
 * Shared types for the 3D Knowledge Graph Visualization System.
 * All modules import from this file to ensure interface consistency.
 */

import type * as THREE from "three";

// ── Entity types from the API ──

export interface GraphEntity {
  id: string;
  label: string;
  name: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
  sourceChunkIndex: number;
}

export interface GraphRelationship {
  id: string;
  type: string;
  sourceEntityId: string;
  targetEntityId: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
}

// ── Meshframe type mapping ──

export type MeshframeType =
  | "stationCore"     // Server / Organization
  | "subspaceAnomaly" // Ticket / Event
  | "deltaShield"     // User / Person
  | "deflectorArray"  // Resolution / Document
  | "warpAssembly"    // Service / Product
  | "redAlertBeacon"  // Alert / Concept (critical)
  | "sensorPod"       // Device / Location
  | "containmentGrid"; // Policy / Concept (governance)

export const ENTITY_TYPE_TO_MESHFRAME: Record<string, MeshframeType> = {
  Organization: "stationCore",
  Person: "deltaShield",
  Event: "subspaceAnomaly",
  Document: "deflectorArray",
  Product: "warpAssembly",
  Location: "sensorPod",
  Concept: "containmentGrid",
};

// ── Color system ──

export const COLORS = {
  void: 0x0b1014,            // Platform bg: #0B1014
  panelSurface: 0x111a21,    // Platform card: #111A21
  panelBorder: 0x243645,     // Platform border: #243645
  gridLine: 0x1c2a36,        // Platform accent surface

  stationCore: 0x07a288,     // Platform primary teal: #07A288
  subspaceAnomaly: 0xff4f79, // Ticket red
  deltaShield: 0xffd60a,     // User gold
  deflectorArray: 0x5ac8fa,  // Resolution blue
  warpAssembly: 0xbf5af2,    // Service purple
  redAlertBeacon: 0xff6533,  // Alert orange
  sensorPod: 0x0a84ff,       // Device blue
  containmentGrid: 0xff375f, // Policy red

  edgeBase: 0x1a2a4a,
  gridFill: 0x0a1628,
} as const;

export const MESHFRAME_COLORS: Record<MeshframeType, number> = {
  stationCore: COLORS.stationCore,
  subspaceAnomaly: COLORS.subspaceAnomaly,
  deltaShield: COLORS.deltaShield,
  deflectorArray: COLORS.deflectorArray,
  warpAssembly: COLORS.warpAssembly,
  redAlertBeacon: COLORS.redAlertBeacon,
  sensorPod: COLORS.sensorPod,
  containmentGrid: COLORS.containmentGrid,
};

// ── Edge type colors ──

export const EDGE_TYPE_COLORS: Record<string, number> = {
  WORKS_AT: COLORS.deltaShield,
  RELATED_TO: COLORS.sensorPod,
  PART_OF: COLORS.warpAssembly,
  LOCATED_IN: COLORS.sensorPod,
  CREATED_BY: COLORS.deflectorArray,
  DEPENDS_ON: COLORS.redAlertBeacon,
  MENTIONS: COLORS.containmentGrid,
  MANAGES: COLORS.deltaShield,
  OWNS: COLORS.stationCore,
  PARTICIPATES_IN: COLORS.subspaceAnomaly,
  PRODUCES: COLORS.warpAssembly,
  USED_BY: COLORS.sensorPod,
  FUNDED_BY: COLORS.stationCore,
  COLLABORATES_WITH: COLORS.deflectorArray,
  REPORTS_TO: COLORS.deltaShield,
};

// ── 3D Node (positioned entity in the scene) ──

export interface Node3D {
  id: string;
  entity: GraphEntity;
  meshframeType: MeshframeType;
  color: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  scale: number;
  connectionCount: number;
  group: THREE.Group | null;
  seed: number;
}

// ── 3D Edge (curve between two nodes) ──

export interface Edge3D {
  id: string;
  relationship: GraphRelationship;
  sourceId: string;
  targetId: string;
  color: number;
  curve: THREE.QuadraticBezierCurve3 | null;
  line: THREE.Line | null;
  pulse: THREE.Mesh | null;
  pulseTrail: THREE.Mesh | null;
  pulseT: number;
  pulseSpeed: number;
  hasPulse: boolean;
}

// ── Scene state for React bridge ──

export interface SceneState {
  nodeCount: number;
  edgeCount: number;
  selectedNode: Node3D | null;
  hoveredNode: Node3D | null;
  isLayoutComplete: boolean;
  fps: number;
}

// ── Controls config ──

export interface ControlsConfig {
  autoRotate: boolean;
  autoRotateSpeed: number;
  showLabels: boolean;
  showEdges: boolean;
  showPulses: boolean;
  showGrid: boolean;
  showNebula: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  nodeScale: number;
  edgeOpacity: number;
  simulationSpeed: number;
}

export const DEFAULT_CONTROLS: ControlsConfig = {
  autoRotate: true,
  autoRotateSpeed: 0.15,
  showLabels: true,
  showEdges: true,
  showPulses: true,
  showGrid: true,
  showNebula: true,
  bloomStrength: 1.3,
  bloomRadius: 0.5,
  bloomThreshold: 0.2,
  nodeScale: 1.0,
  edgeOpacity: 0.12,
  simulationSpeed: 1.0,
};
