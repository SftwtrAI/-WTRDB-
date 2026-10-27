/** Shared domain types for the video-KG pipeline. */

export interface VideoMeta {
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
  sizeBytes: number;
}

/** A temporal window (derived from scene cuts, bounded for vision batching). */
export interface Window {
  index: number;
  startSec: number;
  endSec: number;
}

export interface SampledFrame {
  id: string; // e.g. "w0_f00001"
  path: string; // absolute path on disk
  ptsSec: number; // real timestamp in the video
  windowIndex: number;
}

// ── Per-window multimodal analysis (LLM output, zod-validated) ──

export interface WindowPerson {
  localId: string;
  appearance: string;
  role?: string;
}
export interface WindowObject {
  localId: string;
  type: string;
}
export interface WindowLocation {
  name: string;
}
export interface WindowEvent {
  action: string;
  actorLocalId: string | null;
  objectLocalIds: string[];
  locationName: string | null;
  confidence: number;
  timestampStartSec: number;
  timestampEndSec: number;
  evidenceFrameIds: string[];
}
export interface WindowInteraction {
  personLocalId: string;
  objectLocalId: string;
  confidence: number;
}
export interface WindowAnalysis {
  windowIndex: number;
  startSec: number;
  endSec: number;
  persons: WindowPerson[];
  objects: WindowObject[];
  locations: WindowLocation[];
  events: WindowEvent[];
  interactions: WindowInteraction[];
}

// ── Reconciled, video-global graph (what we write into FalkorDB) ──

export interface GraphPerson {
  trackId: number;
  name: string; // human-readable, e.g. "Person 1 (red jacket)"
  appearance: string;
  firstSeenSec: number;
  lastSeenSec: number;
}
export interface GraphObjectNode {
  key: string; // dedup key (lowercased type)
  name: string; // e.g. "backpack"
  type: string;
}
export interface GraphLocationNode {
  key: string; // dedup key (lowercased name)
  name: string;
}
export interface GraphEventNode {
  eventId: string;
  name: string; // action summary @ timestamp
  action: string;
  timestampStartSec: number;
  timestampEndSec: number;
  confidence: number;
  evidenceFrames: string[];
  actorTrackId: number | null;
  objectKeys: string[];
  locationKey: string | null;
}
export interface GraphInteraction {
  personTrackId: number;
  objectKey: string;
  firstSec: number;
  lastSec: number;
  confidence: number;
}

export interface VideoGraph {
  persons: GraphPerson[];
  objects: GraphObjectNode[];
  locations: GraphLocationNode[];
  events: GraphEventNode[];
  interactions: GraphInteraction[];
}

// ── Job state ──

export type JobStage =
  | "uploaded"
  | "probing"
  | "normalizing"
  | "scene_detect"
  | "sampling"
  | "vision"
  | "reconcile"
  | "graph_build"
  | "injecting"
  | "completed"
  | "failed";

export interface JobArtifacts {
  sourcePath?: string;
  normalizedPath?: string;
  meta?: VideoMeta;
  windows?: Window[];
  framesManifestPath?: string;
  analyzedWindowIndexes?: number[]; // for resume
  graphPath?: string;
  entityCount?: number;
  relationshipCount?: number;
}

export interface Job {
  id: string;
  videoId: string;
  kbId: string;
  userId: string;
  title: string;
  status: JobStage;
  progress: number; // 0..100
  error: string | null;
  artifacts: JobArtifacts;
  createdAt: string;
  updatedAt: string;
}
