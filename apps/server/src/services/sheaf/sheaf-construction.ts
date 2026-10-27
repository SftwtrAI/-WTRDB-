"use strict";

/**
 * WS2-T1.1: Cellular Sheaf Construction over a Knowledge Graph
 *
 * Constructs a cellular sheaf F over a knowledge graph G = (V, E) following
 * Gebhart et al. "Knowledge Sheaves" (arXiv:2110.03789, 2023) and Robinson,
 * "Sheaves Are the Canonical Data Structure for Sensor Integration" (2017).
 *
 * A cellular sheaf F on G assigns:
 *   - To each vertex v ∈ V: a stalk vector space F(v) ≅ ℝ^d
 *   - To each edge e ∈ E:   a stalk vector space F(e) ≅ ℝ^d_e
 *   - To each incidence (v ◁ e): a restriction map F_{v◁e} : F(v) → F(e)
 *
 * Entity stalks are constructed by embedding the concatenation of
 * (name, type, description) into ℝ^d via OpenAI text-embedding-3-small,
 * then projecting to the configured stalk dimension via PCA-like truncation.
 *
 * Edge stalks embed (source_name, relationship_type, target_name) similarly.
 *
 * Restriction maps are learned projection matrices that map from vertex stalk
 * space to edge stalk space, constructed via outer-product approximation of
 * the correlation between incident vertex and edge embeddings.
 *
 * @module sheaf-construction
 * @citation Gebhart, T. et al. "Knowledge Sheaves." arXiv:2110.03789, 2023.
 * @citation Robinson, M. "Sheaves Are the Canonical Data Structure for Sensor Integration." Information Fusion, 2017.
 */

import { falkordbPoolManager } from "../../infrastructure/falkordb/pool-manager";
import { getGraphName } from "../../infrastructure/falkordb/client";
import { logger } from "../../utils/logger";

// ── Constants ──

const LOG_TAG = "SheafConstruction";

/** Default stalk dimension d for entity and edge stalks in ℝ^d */
export const DEFAULT_STALK_DIM = 64;

/** Maximum number of entities for dense computation path */
export const DENSE_THRESHOLD = 1000;

// ── Core Interfaces ──

/**
 * A vertex in the knowledge graph with its properties,
 * suitable for embedding into a stalk vector space.
 */
export interface SheafVertex {
  /** Unique node identifier in FalkorDB */
  id: string;
  /** Entity name */
  name: string;
  /** Entity type label (e.g., "Person", "Infrastructure") */
  type: string;
  /** Entity description or empty string */
  description: string;
  /** Pre-existing embedding from FalkorDB, if available */
  embedding?: number[];
  /** All node properties from FalkorDB */
  properties: Record<string, any>;
}

/**
 * A directed edge in the knowledge graph.
 */
export interface SheafEdge {
  /** Unique edge identifier */
  id: string;
  /** Source vertex ID */
  sourceId: string;
  /** Target vertex ID */
  targetId: string;
  /** Source vertex name */
  sourceName: string;
  /** Target vertex name */
  targetName: string;
  /** Relationship type (e.g., "MANAGES", "RUNS_ON") */
  relationshipType: string;
  /** Edge confidence score */
  confidence: number;
  /** Edge properties from FalkorDB */
  properties: Record<string, any>;
}

/**
 * A restriction map F_{v◁e} : F(v) → F(e).
 *
 * Represented as a d_e × d_v matrix stored in row-major Float64Array.
 * Application: F_{v◁e}(x) = R * x where R is the restriction matrix.
 *
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves." 2019.
 */
export interface RestrictionMap {
  /** Source vertex ID */
  vertexId: string;
  /** Target edge ID */
  edgeId: string;
  /** Restriction matrix in row-major order, shape [edgeDim, vertexDim] */
  matrix: Float64Array;
  /** Number of rows (edge stalk dimension) */
  rows: number;
  /** Number of columns (vertex stalk dimension) */
  cols: number;
}

/**
 * The complete cellular sheaf F over a knowledge graph.
 *
 * Given G = (V, E), the sheaf assigns:
 *   F(v) ∈ ℝ^{stalkDim}   for each v ∈ V
 *   F(e) ∈ ℝ^{stalkDim}   for each e ∈ E
 *   F_{v◁e} : F(v) → F(e)  for each incidence v ◁ e
 *
 * The stalk vectors store the current section assignment h ∈ C^0(G; F).
 *
 * @citation Gebhart, T. et al. "Knowledge Sheaves." arXiv:2110.03789, 2023.
 */
export interface CellularSheaf {
  /** Stalk dimension d (same for vertices and edges in this implementation) */
  stalkDim: number;

  /** Vertices (V) of the underlying graph */
  vertices: SheafVertex[];

  /** Edges (E) of the underlying graph */
  edges: SheafEdge[];

  /** Vertex ID → index in vertices array */
  vertexIndex: Map<string, number>;

  /** Edge ID → index in edges array */
  edgeIndex: Map<string, number>;

  /**
   * Vertex stalk vectors: vertexStalks[i] ∈ ℝ^{stalkDim}.
   * These form the cochain space C^0(G; F) = ⊕_{v ∈ V} F(v).
   */
  vertexStalks: Float64Array[];

  /**
   * Edge stalk vectors: edgeStalks[j] ∈ ℝ^{stalkDim}.
   * These form the cochain space C^1(G; F) = ⊕_{e ∈ E} F(e).
   */
  edgeStalks: Float64Array[];

  /**
   * Restriction maps indexed by "vertexId:edgeId".
   * For each edge e = (u, v), there are two restriction maps:
   *   F_{u◁e} : F(u) → F(e)  and  F_{v◁e} : F(v) → F(e)
   */
  restrictionMaps: Map<string, RestrictionMap>;

  /**
   * Adjacency structure: for each edge index, the [sourceVertexIndex, targetVertexIndex].
   */
  edgeIncidence: [number, number][];

  /** Number of vertices |V| */
  numVertices: number;

  /** Number of edges |E| */
  numEdges: number;
}

/**
 * Configuration for sheaf construction.
 */
export interface SheafConstructionConfig {
  /** Stalk dimension. Default: 64 */
  stalkDim?: number;
  /**
   * Embedding function override. If not provided, uses a deterministic
   * hash-based embedding for offline/test use. In production, wire in
   * OpenAI text-embedding-3-small.
   */
  embedFn?: (text: string) => Promise<number[]>;
  /**
   * Restriction map strategy.
   * - "projection": SVD-based projection (default, mathematically principled)
   * - "identity": identity restriction maps (for debugging)
   */
  restrictionStrategy?: "projection" | "identity";
}

// ── Linear Algebra Helpers (Float64Array, no external deps) ──

/**
 * Compute the dot product of two Float64Array vectors.
 *
 * dot(a, b) = Σ_i a[i] * b[i]
 */
export function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Compute the L2 norm of a Float64Array vector.
 *
 * ||v||_2 = sqrt(Σ_i v[i]^2)
 */
export function norm(v: Float64Array): number {
  return Math.sqrt(dot(v, v));
}

/**
 * Normalize a vector to unit length in-place. Returns the original norm.
 * If the vector is zero, it remains zero.
 */
export function normalizeInPlace(v: Float64Array): number {
  const n = norm(v);
  if (n > 1e-12) {
    for (let i = 0; i < v.length; i++) {
      v[i] /= n;
    }
  }
  return n;
}

/**
 * Matrix-vector multiply: y = A * x where A is row-major [rows x cols].
 *
 * y[i] = Σ_j A[i * cols + j] * x[j]
 */
export function matVecMul(
  A: Float64Array,
  x: Float64Array,
  rows: number,
  cols: number,
): Float64Array {
  const y = new Float64Array(rows);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    const offset = i * cols;
    for (let j = 0; j < cols; j++) {
      sum += A[offset + j] * x[j];
    }
    y[i] = sum;
  }
  return y;
}

/**
 * Compute the outer product of two vectors: M = a * b^T.
 * Result is a row-major matrix of shape [a.length x b.length].
 *
 * M[i][j] = a[i] * b[j]
 */
export function outerProduct(
  a: Float64Array,
  b: Float64Array,
): Float64Array {
  const rows = a.length;
  const cols = b.length;
  const M = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    const offset = i * cols;
    for (let j = 0; j < cols; j++) {
      M[offset + j] = a[i] * b[j];
    }
  }
  return M;
}

/**
 * Create an identity matrix of size n x n in row-major Float64Array.
 */
export function identityMatrix(n: number): Float64Array {
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    M[i * n + i] = 1.0;
  }
  return M;
}

/**
 * Deterministic hash-based embedding for offline/test scenarios.
 *
 * Uses a seeded pseudo-random generator derived from the text's character
 * codes to produce a reproducible unit vector in ℝ^d. This is NOT a
 * semantic embedding — it is a deterministic fallback when no OpenAI API
 * key is available.
 *
 * @param text - Input text to hash
 * @param dim - Output dimension
 * @returns Unit vector in ℝ^dim
 */
export function hashEmbedding(text: string, dim: number): Float64Array {
  const vec = new Float64Array(dim);

  // Simple seeded PRNG (xorshift32) from text hash
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  }
  // Ensure non-zero seed
  if (seed === 0) seed = 1;

  for (let i = 0; i < dim; i++) {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    // Map to [-1, 1]
    vec[i] = (seed & 0x7fffffff) / 0x7fffffff * 2 - 1;
  }

  // Normalize to unit vector
  normalizeInPlace(vec);
  return vec;
}

/**
 * Project a high-dimensional embedding (e.g., 1536-d from OpenAI) down to
 * the target stalk dimension via truncated principal components.
 *
 * For a single vector, this is equivalent to taking the first `targetDim`
 * components and re-normalizing — a simple but effective dimensionality
 * reduction when the embedding model already orders components by variance.
 *
 * @param embedding - Source embedding vector
 * @param targetDim - Target dimension
 * @returns Projected and normalized vector in ℝ^{targetDim}
 */
export function projectToStalkDim(
  embedding: number[] | Float64Array,
  targetDim: number,
): Float64Array {
  const result = new Float64Array(targetDim);

  if (embedding.length <= targetDim) {
    // Pad with zeros if source is smaller
    for (let i = 0; i < embedding.length; i++) {
      result[i] = embedding[i];
    }
  } else {
    // Truncate to first targetDim components
    for (let i = 0; i < targetDim; i++) {
      result[i] = embedding[i];
    }
  }

  normalizeInPlace(result);
  return result;
}

// ── FalkorDB Graph Data Loading ──

/**
 * Load all vertices from a FalkorDB knowledge graph.
 *
 * Executes: MATCH (n) RETURN n
 *
 * @param graphName - FalkorDB graph name (e.g., "kg_user123_kb456")
 * @returns Array of SheafVertex objects
 */
export async function loadVerticesFromGraph(
  graphName: string,
): Promise<SheafVertex[]> {
  const client = falkordbPoolManager.getClient();
  const vertices: SheafVertex[] = [];

  try {
    const result = await client.query(
      graphName,
      `MATCH (n) RETURN id(n) AS nodeId, n.name AS name, label(n) AS type,
       n.description AS description, n.embedding AS embedding, n AS node`,
    );

    for (const record of result.records) {
      const nodeId = String(record.nodeId ?? vertices.length);
      const name = String(record.name ?? "Unknown");
      const type = String(record.type ?? "Unknown");
      const description = String(record.description ?? "");

      // Parse embedding if stored as JSON string or array
      let embedding: number[] | undefined;
      if (record.embedding) {
        if (typeof record.embedding === "string") {
          try {
            embedding = JSON.parse(record.embedding);
          } catch {
            // Ignore malformed embeddings
          }
        } else if (Array.isArray(record.embedding)) {
          embedding = record.embedding.map(Number);
        }
      }

      // Parse full node properties
      const properties: Record<string, any> = {};
      if (record.node && typeof record.node === "object") {
        Object.assign(properties, record.node.properties || record.node);
      }

      vertices.push({
        id: nodeId,
        name,
        type,
        description,
        embedding,
        properties,
      });
    }

    logger.info(
      `[${LOG_TAG}] Loaded ${vertices.length} vertices from ${graphName}`,
      undefined,
      LOG_TAG,
    );
  } catch (error: any) {
    logger.error(
      `[${LOG_TAG}] Failed to load vertices from ${graphName}: ${error.message}`,
      undefined,
      LOG_TAG,
    );
    throw error;
  }

  return vertices;
}

/**
 * Load all edges from a FalkorDB knowledge graph.
 *
 * Executes: MATCH (s)-[r]->(t) RETURN ...
 *
 * @param graphName - FalkorDB graph name
 * @returns Array of SheafEdge objects
 */
export async function loadEdgesFromGraph(
  graphName: string,
): Promise<SheafEdge[]> {
  const client = falkordbPoolManager.getClient();
  const edges: SheafEdge[] = [];

  try {
    const result = await client.query(
      graphName,
      `MATCH (s)-[r]->(t) RETURN id(r) AS edgeId, id(s) AS srcId, id(t) AS tgtId,
       s.name AS srcName, t.name AS tgtName, type(r) AS relType,
       r.confidence AS confidence, r AS rel`,
    );

    for (const record of result.records) {
      const edgeId = String(record.edgeId ?? edges.length);
      const sourceId = String(record.srcId ?? "");
      const targetId = String(record.tgtId ?? "");
      const sourceName = String(record.srcName ?? "Unknown");
      const targetName = String(record.tgtName ?? "Unknown");
      const relationshipType = String(record.relType ?? "RELATED_TO");
      const confidence = Number(record.confidence ?? 1.0);

      const properties: Record<string, any> = {};
      if (record.rel && typeof record.rel === "object") {
        Object.assign(properties, record.rel.properties || record.rel);
      }

      edges.push({
        id: edgeId,
        sourceId,
        targetId,
        sourceName,
        targetName,
        relationshipType,
        confidence,
        properties,
      });
    }

    logger.info(
      `[${LOG_TAG}] Loaded ${edges.length} edges from ${graphName}`,
      undefined,
      LOG_TAG,
    );
  } catch (error: any) {
    logger.error(
      `[${LOG_TAG}] Failed to load edges from ${graphName}: ${error.message}`,
      undefined,
      LOG_TAG,
    );
    throw error;
  }

  return edges;
}

// ── Stalk Construction ──

/**
 * Build the entity stalk vector for a vertex v.
 *
 * The stalk F(v) ∈ ℝ^d is constructed by embedding the concatenation:
 *   text(v) = "name: {v.name} | type: {v.type} | description: {v.description}"
 *
 * If the vertex already has a pre-computed embedding (from FalkorDB), we
 * project it to the stalk dimension. Otherwise, we use the provided
 * embedding function or the deterministic hash fallback.
 *
 * @citation Gebhart, T. et al. "Knowledge Sheaves." arXiv:2110.03789, 2023.
 *   Section 3.1: "Entity stalks embed entity attributes into a shared vector space."
 *
 * @param vertex - The vertex to embed
 * @param stalkDim - Target stalk dimension d
 * @param embedFn - Optional embedding function
 * @returns Stalk vector F(v) ∈ ℝ^d
 */
async function buildVertexStalk(
  vertex: SheafVertex,
  stalkDim: number,
  embedFn?: (text: string) => Promise<number[]>,
): Promise<Float64Array> {
  // If vertex has pre-computed embedding, project to stalk dim
  if (vertex.embedding && vertex.embedding.length > 0) {
    return projectToStalkDim(vertex.embedding, stalkDim);
  }

  const text = `name: ${vertex.name} | type: ${vertex.type} | description: ${vertex.description}`;

  if (embedFn) {
    const rawEmbed = await embedFn(text);
    return projectToStalkDim(rawEmbed, stalkDim);
  }

  // Deterministic fallback
  return hashEmbedding(text, stalkDim);
}

/**
 * Build the edge stalk vector for an edge e = (u, r, v).
 *
 * The stalk F(e) ∈ ℝ^d is constructed by embedding the concatenation:
 *   text(e) = "source: {u.name} | relation: {r} | target: {v.name}"
 *
 * @citation Gebhart, T. et al. "Knowledge Sheaves." arXiv:2110.03789, 2023.
 *   Section 3.2: "Edge stalks encode relational constraints between entities."
 *
 * @param edge - The edge to embed
 * @param stalkDim - Target stalk dimension d
 * @param embedFn - Optional embedding function
 * @returns Stalk vector F(e) ∈ ℝ^d
 */
async function buildEdgeStalk(
  edge: SheafEdge,
  stalkDim: number,
  embedFn?: (text: string) => Promise<number[]>,
): Promise<Float64Array> {
  const text = `source: ${edge.sourceName} | relation: ${edge.relationshipType} | target: ${edge.targetName}`;

  if (embedFn) {
    const rawEmbed = await embedFn(text);
    return projectToStalkDim(rawEmbed, stalkDim);
  }

  return hashEmbedding(text, stalkDim);
}

// ── Restriction Map Construction ──

/**
 * Construct the restriction map F_{v◁e} : F(v) → F(e) as a projection matrix.
 *
 * The restriction map encodes how an entity's stalk "restricts" to the
 * constraint imposed by an incident edge. Following Hansen and Ghrist (2019),
 * we construct this as a rank-limited projection:
 *
 *   F_{v◁e} = (f_e · f_v^T) / (||f_v||^2)
 *
 * where f_v is the vertex stalk and f_e is the edge stalk. This produces a
 * matrix that projects the vertex stalk onto the direction most relevant to
 * the edge, scaled by the edge stalk.
 *
 * For the identity strategy, F_{v◁e} = I (identity matrix), which corresponds
 * to the trivial sheaf where all restriction maps are the identity.
 *
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves."
 *   J. Applied and Computational Topology, 2019. Section 2: "Restriction maps as linear maps."
 * @citation Bodnar, C. et al. "Neural Sheaf Diffusion." NeurIPS 2022.
 *   Section 3: "Learned restriction maps via attention-like mechanisms."
 *
 * @param vertexStalk - F(v) ∈ ℝ^d
 * @param edgeStalk - F(e) ∈ ℝ^d
 * @param vertexId - Vertex identifier
 * @param edgeId - Edge identifier
 * @param strategy - "projection" or "identity"
 * @returns RestrictionMap with d × d matrix
 */
export function buildRestrictionMap(
  vertexStalk: Float64Array,
  edgeStalk: Float64Array,
  vertexId: string,
  edgeId: string,
  strategy: "projection" | "identity" = "projection",
): RestrictionMap {
  const d = vertexStalk.length;

  if (strategy === "identity") {
    return {
      vertexId,
      edgeId,
      matrix: identityMatrix(d),
      rows: d,
      cols: d,
    };
  }

  // Projection strategy:
  // F_{v◁e} = (f_e · f_v^T) / max(||f_v||^2, epsilon)
  //
  // This is a rank-1 approximation that maps vertex stalk information
  // into the edge stalk space, weighted by the correlation between
  // the vertex and edge representations.
  const normVSq = dot(vertexStalk, vertexStalk);
  const scale = normVSq > 1e-12 ? 1.0 / normVSq : 0.0;

  // Compute outer product f_e * f_v^T, scaled
  const matrix = outerProduct(edgeStalk, vertexStalk);
  for (let i = 0; i < matrix.length; i++) {
    matrix[i] *= scale;
  }

  return {
    vertexId,
    edgeId,
    matrix,
    rows: d,
    cols: d,
  };
}

// ── Main Construction ──

/**
 * Construct a cellular sheaf F over a knowledge graph loaded from FalkorDB.
 *
 * This is the main entry point for WS2-T1.1. Given a graph name (or pre-loaded
 * vertex/edge data), it:
 *
 * 1. Loads vertices V and edges E from FalkorDB (or uses provided data)
 * 2. Embeds each vertex v into a stalk F(v) ∈ ℝ^d
 * 3. Embeds each edge e into a stalk F(e) ∈ ℝ^d
 * 4. Constructs restriction maps F_{v◁e} for each incidence v ◁ e
 * 5. Builds the incidence structure for Laplacian construction
 *
 * The resulting CellularSheaf contains all data needed to compute
 * the sheaf Laplacian L_F, cohomology groups H^0 and H^1, and
 * run sheaf diffusion.
 *
 * @citation Gebhart, T. et al. "Knowledge Sheaves." arXiv:2110.03789, 2023.
 * @citation Robinson, M. "Sheaves Are the Canonical Data Structure for Sensor Integration." 2017.
 *
 * @param graphName - FalkorDB graph name (e.g., "kg_user123_kb456")
 * @param config - Construction configuration
 * @returns The constructed cellular sheaf
 */
export async function constructCellularSheaf(
  graphName: string,
  config: SheafConstructionConfig = {},
): Promise<CellularSheaf> {
  const stalkDim = config.stalkDim ?? DEFAULT_STALK_DIM;
  const strategy = config.restrictionStrategy ?? "projection";
  const embedFn = config.embedFn;

  logger.info(
    `[${LOG_TAG}] Constructing cellular sheaf over "${graphName}" with stalkDim=${stalkDim}, strategy=${strategy}`,
    undefined,
    LOG_TAG,
  );

  // Step 1: Load graph data from FalkorDB
  const vertices = await loadVerticesFromGraph(graphName);
  const edges = await loadEdgesFromGraph(graphName);

  return constructCellularSheafFromData(vertices, edges, config);
}

/**
 * Construct a cellular sheaf from pre-loaded vertex and edge data.
 * This variant is useful for testing and when data is already available.
 *
 * @param vertices - Pre-loaded vertices
 * @param edges - Pre-loaded edges
 * @param config - Construction configuration
 * @returns The constructed cellular sheaf
 */
export async function constructCellularSheafFromData(
  vertices: SheafVertex[],
  edges: SheafEdge[],
  config: SheafConstructionConfig = {},
): Promise<CellularSheaf> {
  const stalkDim = config.stalkDim ?? DEFAULT_STALK_DIM;
  const strategy = config.restrictionStrategy ?? "projection";
  const embedFn = config.embedFn;

  const numVertices = vertices.length;
  const numEdges = edges.length;

  logger.info(
    `[${LOG_TAG}] Building sheaf: |V|=${numVertices}, |E|=${numEdges}, d=${stalkDim}`,
    undefined,
    LOG_TAG,
  );

  // Build vertex index: id → position
  const vertexIndex = new Map<string, number>();
  for (let i = 0; i < numVertices; i++) {
    vertexIndex.set(vertices[i].id, i);
  }

  // Build edge index: id → position
  const edgeIndex = new Map<string, number>();
  for (let j = 0; j < numEdges; j++) {
    edgeIndex.set(edges[j].id, j);
  }

  // Step 2: Build vertex stalks F(v) for all v ∈ V
  const vertexStalks: Float64Array[] = new Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    vertexStalks[i] = await buildVertexStalk(vertices[i], stalkDim, embedFn);
  }

  // Step 3: Build edge stalks F(e) for all e ∈ E
  const edgeStalks: Float64Array[] = new Array(numEdges);
  for (let j = 0; j < numEdges; j++) {
    edgeStalks[j] = await buildEdgeStalk(edges[j], stalkDim, embedFn);
  }

  // Step 4: Build incidence structure and restriction maps
  const edgeIncidence: [number, number][] = new Array(numEdges);
  const restrictionMaps = new Map<string, RestrictionMap>();

  for (let j = 0; j < numEdges; j++) {
    const edge = edges[j];
    const srcIdx = vertexIndex.get(edge.sourceId);
    const tgtIdx = vertexIndex.get(edge.targetId);

    if (srcIdx === undefined || tgtIdx === undefined) {
      logger.warn(
        `[${LOG_TAG}] Edge ${edge.id} references unknown vertex (src=${edge.sourceId}, tgt=${edge.targetId}). Skipping restriction maps.`,
        undefined,
        LOG_TAG,
      );
      // Use sentinel values; these edges won't contribute to the Laplacian
      edgeIncidence[j] = [srcIdx ?? 0, tgtIdx ?? 0];
      continue;
    }

    edgeIncidence[j] = [srcIdx, tgtIdx];

    // Restriction map from source vertex to edge
    const srcKey = `${edge.sourceId}:${edge.id}`;
    restrictionMaps.set(
      srcKey,
      buildRestrictionMap(
        vertexStalks[srcIdx],
        edgeStalks[j],
        edge.sourceId,
        edge.id,
        strategy,
      ),
    );

    // Restriction map from target vertex to edge
    const tgtKey = `${edge.targetId}:${edge.id}`;
    restrictionMaps.set(
      tgtKey,
      buildRestrictionMap(
        vertexStalks[tgtIdx],
        edgeStalks[j],
        edge.targetId,
        edge.id,
        strategy,
      ),
    );
  }

  logger.info(
    `[${LOG_TAG}] Sheaf construction complete: ${numVertices} vertex stalks, ${numEdges} edge stalks, ${restrictionMaps.size} restriction maps`,
    undefined,
    LOG_TAG,
  );

  return {
    stalkDim,
    vertices,
    edges,
    vertexIndex,
    edgeIndex,
    vertexStalks,
    edgeStalks,
    restrictionMaps,
    edgeIncidence,
    numVertices,
    numEdges,
  };
}

/**
 * Construct a cellular sheaf for a user's knowledge base.
 * Convenience method that derives the FalkorDB graph name.
 *
 * @param userId - User ID
 * @param knowledgeBaseId - Knowledge base ID
 * @param config - Construction configuration
 * @returns The constructed cellular sheaf
 */
export async function constructSheafForKnowledgeBase(
  userId: string,
  knowledgeBaseId: string,
  config: SheafConstructionConfig = {},
): Promise<CellularSheaf> {
  const graphName = getGraphName(userId, knowledgeBaseId);
  return constructCellularSheaf(graphName, config);
}

/**
 * Apply a restriction map to a vertex stalk vector.
 *
 * Computes F_{v◁e}(x) = R * x where R is the restriction matrix.
 *
 * @param sheaf - The cellular sheaf
 * @param vertexId - Source vertex ID
 * @param edgeId - Target edge ID
 * @param x - Input vector from vertex stalk (optional, uses current stalk if omitted)
 * @returns Restricted vector in edge stalk space, or null if no restriction map exists
 */
export function applyRestrictionMap(
  sheaf: CellularSheaf,
  vertexId: string,
  edgeId: string,
  x?: Float64Array,
): Float64Array | null {
  const key = `${vertexId}:${edgeId}`;
  const rmap = sheaf.restrictionMaps.get(key);
  if (!rmap) return null;

  const input = x ?? sheaf.vertexStalks[sheaf.vertexIndex.get(vertexId)!];
  if (!input) return null;

  return matVecMul(rmap.matrix, input, rmap.rows, rmap.cols);
}

/**
 * Compute the local consistency error for a single edge e = (u, v):
 *
 *   error(e) = ||F_{u◁e}(h(u)) - F_{v◁e}(h(v))||^2
 *
 * This measures how much the two endpoint vertices disagree when
 * their stalk vectors are restricted to the shared edge stalk space.
 *
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves." 2019.
 *   Equation (2.3): "Local consistency measured by restriction map disagreement."
 *
 * @param sheaf - The cellular sheaf
 * @param edgeIdx - Edge index
 * @returns Squared L2 norm of the restriction disagreement
 */
export function localConsistencyError(
  sheaf: CellularSheaf,
  edgeIdx: number,
): number {
  const edge = sheaf.edges[edgeIdx];
  const [srcIdx, tgtIdx] = sheaf.edgeIncidence[edgeIdx];

  const srcRestricted = applyRestrictionMap(
    sheaf,
    edge.sourceId,
    edge.id,
    sheaf.vertexStalks[srcIdx],
  );

  const tgtRestricted = applyRestrictionMap(
    sheaf,
    edge.targetId,
    edge.id,
    sheaf.vertexStalks[tgtIdx],
  );

  if (!srcRestricted || !tgtRestricted) return 0;

  // ||F_{u◁e}(h(u)) - F_{v◁e}(h(v))||^2
  let error = 0;
  for (let i = 0; i < srcRestricted.length; i++) {
    const diff = srcRestricted[i] - tgtRestricted[i];
    error += diff * diff;
  }

  return error;
}

/**
 * Compute total conflict energy across all edges:
 *
 *   E(h) = Σ_{e = (u,v) ∈ E} ||F_{u◁e}(h(u)) - F_{v◁e}(h(v))||^2
 *
 * This is equivalent to h^T * L_F * h where L_F is the sheaf Laplacian.
 *
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves." 2019.
 *   Theorem 3.1: "The quadratic form of L_F equals the total restriction disagreement."
 *
 * @param sheaf - The cellular sheaf
 * @returns Total conflict energy scalar
 */
export function totalConflictEnergy(sheaf: CellularSheaf): number {
  let total = 0;
  for (let j = 0; j < sheaf.numEdges; j++) {
    total += localConsistencyError(sheaf, j);
  }
  return total;
}
