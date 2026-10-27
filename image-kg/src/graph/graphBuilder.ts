import crypto from "node:crypto";
import {
  sanitizeLabel,
  sanitizeRelType,
  labelIdPrefix,
} from "./cypherEscape.js";
import type { ValidatedExtraction } from "../extract.js";
import type { PreparedImage } from "../preprocess.js";

/**
 * Turns a validated extraction into a deterministic graph fragment
 * (GRAPH_DB_SPEC §2–§4): open AI-chosen category → label, content-hash ids, full
 * provenance, and a source-Image anchor for the DERIVED_FROM backbone.
 */

// ── Live-stream shapes (consumed by graph/liveStream.ts) ──
export interface LiveNode {
  id: string;
  name: string;
  label: string;
  props: Record<string, string>;
}
export interface LiveEdge {
  id: string;
  type: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
}
export interface GraphDelta {
  nodes: LiveNode[];
  edges: LiveEdge[];
}

// ── Persisted fragment shapes ──
export interface FragImage {
  id: string; // img_<sha256>
  hash: string;
  sizeBytes: number;
  width: number;
  height: number;
}
export interface FragNode {
  id: string; // <category>_<hash12>
  label: string; // sanitized category
  name: string;
  confidence: number;
  bbox: number[] | null;
  sourceImageId: string;
  properties: Record<string, string>;
}
export interface FragEdge {
  id: string;
  type: string; // sanitized relationship type
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  confidence: number;
}
export interface Provenance {
  model_name: string;
  model_version: string;
  extraction_version: string;
  prompt_version: string;
  created_at: string;
}
export interface GraphFragment {
  image: FragImage;
  nodes: FragNode[];
  edges: FragEdge[];
  provenance: Provenance;
}

function hash12(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
}

/**
 * Build the graph fragment. Ids are content-derived and deterministic:
 * domain-node id = <category>_<sha256(category|name|imageId)[:12]>, so the same
 * detection in the same image yields the same id on re-ingest (idempotency).
 * Node and edge lists are emitted in a fixed order for reproducible writes.
 */
export function buildFragment(
  extraction: ValidatedExtraction,
  prepared: PreparedImage,
  provenance: Provenance,
): GraphFragment {
  const image: FragImage = {
    id: prepared.sourceImageId,
    hash: prepared.hash,
    sizeBytes: prepared.sizeBytes,
    width: prepared.width,
    height: prepared.height,
  };

  const byRef = new Map<string, FragNode>();
  const byId = new Map<string, FragNode>();
  for (const o of extraction.objects) {
    const label = sanitizeLabel(o.category);
    const id = `${labelIdPrefix(o.category)}_${hash12(`${label}|${o.name}|${image.id}`)}`;
    // Same category+name in one image collapses to one node (keep max confidence).
    const existing = byId.get(id);
    if (existing) {
      if (o.confidence > existing.confidence) existing.confidence = o.confidence;
      byRef.set(o.local_ref, existing);
      continue;
    }
    const node: FragNode = {
      id,
      label,
      name: o.name,
      confidence: o.confidence,
      bbox: o.bbox,
      sourceImageId: image.id,
      properties: o.properties,
    };
    byId.set(id, node);
    byRef.set(o.local_ref, node);
  }

  const edges: FragEdge[] = [];
  const seen = new Set<string>();
  for (const r of extraction.relationships) {
    const a = byRef.get(r.source_ref);
    const b = byRef.get(r.target_ref);
    if (!a || !b) continue; // validated already, but be defensive
    const type = sanitizeRelType(r.type);
    const key = `${a.id}|${type}|${b.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: `e_${hash12(key)}`,
      type,
      sourceId: a.id,
      sourceName: a.name,
      targetId: b.id,
      targetName: b.name,
      confidence: r.confidence,
    });
  }

  const nodes = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  edges.sort(
    (a, b) =>
      a.sourceId.localeCompare(b.sourceId) ||
      a.targetId.localeCompare(b.targetId) ||
      a.type.localeCompare(b.type),
  );

  return { image, nodes, edges, provenance };
}

/** Distinct category labels in the fragment (for knowledge_graphs.entity_types). */
export function fragmentLabels(frag: GraphFragment): string[] {
  return [...new Set(frag.nodes.map((n) => n.label))].sort();
}

function liveProps(n: FragNode, prov: Provenance): Record<string, string> {
  return {
    confidence: String(n.confidence),
    source_image_id: n.sourceImageId,
    model: prov.model_name,
    ...n.properties,
  };
}

/**
 * Fragment → live delta for the streaming 3D view. Includes the Image anchor and
 * DERIVED_FROM edges so the live graph mirrors what is persisted.
 */
export function fragmentToDelta(frag: GraphFragment): GraphDelta {
  const imageNode: LiveNode = {
    id: frag.image.id,
    name: "source image",
    label: "Image",
    props: { hash: frag.image.hash },
  };
  const domainNodes: LiveNode[] = frag.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    label: n.label,
    props: liveProps(n, frag.provenance),
  }));
  const derivedEdges: LiveEdge[] = frag.nodes.map((n) => ({
    id: `d_${n.id}`,
    type: "DERIVED_FROM",
    sourceId: n.id,
    sourceName: n.name,
    targetId: frag.image.id,
    targetName: "source image",
  }));
  const domainEdges: LiveEdge[] = frag.edges.map((e) => ({
    id: e.id,
    type: e.type,
    sourceId: e.sourceId,
    sourceName: e.sourceName,
    targetId: e.targetId,
    targetName: e.targetName,
  }));

  return {
    nodes: [imageNode, ...domainNodes],
    edges: [...derivedEdges, ...domainEdges],
  };
}
