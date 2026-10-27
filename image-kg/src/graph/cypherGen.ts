import { sanitizePropertyKey } from "./cypherEscape.js";
import type { GraphFragment, FragNode, FragEdge, Provenance } from "./graphBuilder.js";

/**
 * Deterministic, parameterized Cypher generation for a whole fragment
 * (GRAPH_DB_SPEC §7). Given the same fragment + kbId it emits byte-identical
 * query text and params. The entire fragment is ONE query (executed atomically
 * by FalkorDB — §8): Image node → domain nodes (per label) → DERIVED_FROM edges
 * → domain edges (per type). Labels/edge-types are the only model strings that
 * appear as identifiers (already whitelisted upstream); every value is a param.
 */

export interface FragmentWrite {
  query: string;
  params: Record<string, any>;
}

/** Param-name-safe token derived from an already-sanitized label/type. */
function paramKey(token: string): string {
  return token.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

function stripUndefined<T extends Record<string, any>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

function nodeProps(n: FragNode, prov: Provenance, kbId: string): Record<string, any> {
  const props: Record<string, any> = {
    id: n.id,
    name: n.name,
    confidence: n.confidence,
    source_image_id: n.sourceImageId,
    model_name: prov.model_name,
    model_version: prov.model_version,
    extraction_version: prov.extraction_version,
    prompt_version: prov.prompt_version,
    created_at: prov.created_at,
    // v2-compat fields so existing v2 node renderers show something sensible.
    sourceKnowledgeBaseId: kbId,
    sourceChunkIndex: 0,
    status: "Active",
    type: n.label,
    description: n.name,
    _updatedAt: prov.created_at,
  };
  if (n.bbox && n.bbox.length === 4) props.bbox = JSON.stringify(n.bbox);
  // Custom visible attributes; sanitized keys, never clobbering reserved keys.
  for (const [k, v] of Object.entries(n.properties)) {
    const key = sanitizePropertyKey(k);
    if (!(key in props)) props[key] = v;
  }
  return stripUndefined(props);
}

function edgeProps(e: FragEdge, imageId: string, prov: Provenance, kbId: string): Record<string, any> {
  return {
    id: e.id,
    confidence: e.confidence,
    source_image_id: imageId,
    extraction_version: prov.extraction_version,
    created_at: prov.created_at,
    sourceKnowledgeBaseId: kbId,
    status: "Active",
    _updatedAt: prov.created_at,
  };
}

export function generateFragmentWrite(frag: GraphFragment, kbId: string): FragmentWrite {
  const prov = frag.provenance;
  const params: Record<string, any> = {};
  const clauses: string[] = [];

  // 1. Image anchor first (the provenance backbone must exist).
  params.imageId = frag.image.id;
  params.imageProps = stripUndefined({
    id: frag.image.id,
    hash: frag.image.hash,
    source_image_id: frag.image.id,
    size_bytes: frag.image.sizeBytes,
    width: frag.image.width,
    height: frag.image.height,
    created_at: prov.created_at,
    sourceKnowledgeBaseId: kbId,
    status: "Active",
    type: "Image",
    _updatedAt: prov.created_at,
  });
  clauses.push("MERGE (img:`Image` {id:$imageId}) ON CREATE SET img += $imageProps");

  // 2. Domain nodes, grouped by label, each group sorted; labels sorted.
  const byLabel = new Map<string, FragNode[]>();
  for (const n of frag.nodes) {
    const arr = byLabel.get(n.label);
    if (arr) arr.push(n);
    else byLabel.set(n.label, [n]);
  }
  for (const label of [...byLabel.keys()].sort()) {
    const key = `nodes_${paramKey(label)}`;
    params[key] = byLabel.get(label)!.map((n) => ({ id: n.id, props: nodeProps(n, prov, kbId) }));
    clauses.push("WITH DISTINCT img");
    clauses.push(
      `UNWIND $${key} AS n MERGE (x:\`${label}\` {id:n.id}) ON CREATE SET x += n.props ` +
        `ON MATCH SET x.confidence = CASE WHEN n.props.confidence > x.confidence THEN n.props.confidence ELSE x.confidence END`,
    );
  }

  // 3. DERIVED_FROM provenance edges for every domain node.
  if (frag.nodes.length) {
    params.derived = frag.nodes.map((n) => ({ id: n.id }));
    clauses.push("WITH DISTINCT img");
    clauses.push(
      "UNWIND $derived AS d MATCH (a {id:d.id}) MERGE (a)-[:`DERIVED_FROM`]->(img)",
    );
  }

  // 4. Domain edges, grouped by relationship type, each group sorted; types sorted.
  const byType = new Map<string, FragEdge[]>();
  for (const e of frag.edges) {
    const arr = byType.get(e.type);
    if (arr) arr.push(e);
    else byType.set(e.type, [e]);
  }
  for (const type of [...byType.keys()].sort()) {
    const key = `edges_${paramKey(type)}`;
    params[key] = byType.get(type)!.map((e) => ({
      s: e.sourceId,
      t: e.targetId,
      props: edgeProps(e, frag.image.id, prov, kbId),
    }));
    clauses.push("WITH DISTINCT img");
    clauses.push(
      `UNWIND $${key} AS e MATCH (a {id:e.s}) MATCH (b {id:e.t}) MERGE (a)-[r:\`${type}\`]->(b) ` +
        `ON CREATE SET r += e.props ` +
        `ON MATCH SET r.confidence = CASE WHEN e.props.confidence > r.confidence THEN e.props.confidence ELSE r.confidence END`,
    );
  }

  clauses.push("WITH DISTINCT img RETURN img.id AS imageId");
  return { query: clauses.join("\n"), params };
}
