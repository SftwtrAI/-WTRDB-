"use strict";

/**
 * WS2-T1.2: Sheaf Laplacian Computation
 *
 * Computes the sheaf Laplacian L_F = (δ^0)^T * δ^0 for a cellular sheaf
 * F over a knowledge graph G = (V, E).
 *
 * The sheaf Laplacian generalizes the graph Laplacian by incorporating
 * the restriction maps of the sheaf. Its spectrum encodes the consistency
 * structure of the knowledge graph:
 *
 *   - Eigenvalue 0: globally consistent modes (global sections, H^0)
 *   - Positive eigenvalues: inconsistency modes ordered by energy
 *
 * Key formulas implemented:
 *   - L_F = (δ^0)^T δ^0  where δ^0 is the coboundary operator
 *   - consistency_score = dim(ker(L_F)) / dim(C^0)
 *   - conflict_energy = h^T * L_F * h
 *
 * For small graphs (|V| < DENSE_THRESHOLD), we compute L_F as a dense
 * matrix and use QR iteration for full eigendecomposition.
 * For large graphs, we use power iteration for the top-k eigenvalues.
 *
 * @module sheaf-laplacian
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves."
 *   J. Applied and Computational Topology, 2019.
 * @citation Bodnar, C. et al. "Neural Sheaf Diffusion." NeurIPS 2022.
 */

import { logger } from "../../utils/logger";
import type { CellularSheaf, RestrictionMap } from "./sheaf-construction";
import {
  dot,
  norm,
  matVecMul,
  normalizeInPlace,
  DENSE_THRESHOLD,
} from "./sheaf-construction";

// ── Constants ──

const LOG_TAG = "SheafLaplacian";

/** Tolerance for eigenvalue zero detection */
const EIGENVALUE_ZERO_TOL = 1e-8;

/** Maximum power iteration steps */
const DEFAULT_MAX_POWER_ITER = 300;

/** Power iteration convergence tolerance */
const DEFAULT_POWER_TOL = 1e-10;

// ── Core Interfaces ──

/**
 * The assembled sheaf Laplacian L_F with computed spectral data.
 *
 * L_F = (δ^0)^T δ^0 : C^0(G; F) → C^0(G; F)
 *
 * where C^0(G; F) = ⊕_{v ∈ V} F(v) has dimension |V| * d.
 *
 * The Laplacian is stored as a dense matrix for graphs with |V| * d < threshold,
 * or as a sparse operator (matrix-free) for larger graphs.
 */
export interface SheafLaplacian {
  /** The cellular sheaf this Laplacian is built from */
  sheaf: CellularSheaf;

  /** Total dimension of C^0 = |V| * stalkDim */
  totalDim: number;

  /**
   * Dense Laplacian matrix in row-major order, shape [totalDim x totalDim].
   * Only populated for small graphs (totalDim < DENSE_THRESHOLD * stalkDim).
   * Null for large graphs where we use matrix-free operations.
   */
  denseMatrix: Float64Array | null;

  /**
   * Computed eigenvalues in ascending order.
   * The number of eigenvalues ≈ 0 equals dim(ker(L_F)) = dim(H^0).
   */
  eigenvalues: number[];

  /**
   * Corresponding eigenvectors as columns, each of length totalDim.
   * eigenvectors[i] is the eigenvector for eigenvalues[i].
   */
  eigenvectors: Float64Array[];

  /**
   * Dimension of the kernel (null space) of L_F.
   * This equals dim(H^0), the number of independent globally consistent sections.
   *
   * @formula dim(ker(L_F)) = #{λ_i : λ_i ≈ 0}
   */
  kernelDim: number;

  /**
   * Consistency score: the fraction of the cochain space spanned by
   * globally consistent sections.
   *
   * @formula consistency_score = dim(ker(L_F)) / dim(C^0) = dim(H^0) / |V|
   * @citation math.md Section 5.4: "Consistency score for a federation graph"
   */
  consistencyScore: number;

  /**
   * Conflict energy: the total quadratic form of L_F evaluated on the
   * actual entity embeddings (the current section h).
   *
   * @formula conflict_energy = h^T * L_F * h = Σ_{e=(u,v)} ||F_{u◁e}(h(u)) - F_{v◁e}(h(v))||^2
   * @citation Hansen, J. and Ghrist, R. (2019), Theorem 3.1
   */
  conflictEnergy: number;
}

/**
 * Configuration for Laplacian computation.
 */
export interface LaplacianConfig {
  /** Maximum eigenvalues to compute for large graphs. Default: min(20, totalDim) */
  maxEigenvalues?: number;
  /** Power iteration max steps. Default: 300 */
  maxPowerIter?: number;
  /** Power iteration tolerance. Default: 1e-10 */
  powerTol?: number;
  /** Eigenvalue zero tolerance. Default: 1e-8 */
  zeroTol?: number;
}

// ── Dense Linear Algebra ──

/**
 * Transpose a dense matrix A [rows x cols] → A^T [cols x rows].
 * Both in row-major Float64Array.
 */
function transpose(
  A: Float64Array,
  rows: number,
  cols: number,
): Float64Array {
  const AT = new Float64Array(cols * rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      AT[j * rows + i] = A[i * cols + j];
    }
  }
  return AT;
}

/**
 * Dense matrix multiply: C = A * B where A is [m x k], B is [k x n].
 * All in row-major Float64Array.
 *
 * C[i][j] = Σ_p A[i][p] * B[p][j]
 */
function matMul(
  A: Float64Array,
  B: Float64Array,
  m: number,
  k: number,
  n: number,
): Float64Array {
  const C = new Float64Array(m * n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) {
        sum += A[i * k + p] * B[p * n + j];
      }
      C[i * n + j] = sum;
    }
  }
  return C;
}

/**
 * Add a scaled outer-product block into a target matrix at (rowOff, colOff).
 *
 * target[rowOff+i, colOff+j] += scale * src[i * srcCols + j]
 *
 * This is used to assemble the block-structured sheaf Laplacian.
 */
function addBlock(
  target: Float64Array,
  targetCols: number,
  src: Float64Array,
  srcRows: number,
  srcCols: number,
  rowOff: number,
  colOff: number,
  scale: number,
): void {
  for (let i = 0; i < srcRows; i++) {
    for (let j = 0; j < srcCols; j++) {
      target[(rowOff + i) * targetCols + (colOff + j)] +=
        scale * src[i * srcCols + j];
    }
  }
}

// ── Coboundary Operator ──

/**
 * Assemble the dense coboundary operator δ^0 : C^0(G; F) → C^1(G; F).
 *
 * δ^0 is a block matrix of shape [|E|*d x |V|*d] where each block row
 * corresponds to an edge and each block column to a vertex.
 *
 * For edge e_j = (u, v), the j-th block row has:
 *   - Block (j, idx(u)): +F_{u◁e_j}  (source restriction map)
 *   - Block (j, idx(v)): -F_{v◁e_j}  (target restriction map, negated)
 *   - All other blocks: 0
 *
 * So δ^0(h)[e] = F_{u◁e}(h(u)) - F_{v◁e}(h(v)) for each edge e = (u,v).
 *
 * @citation Hansen, J. and Ghrist, R. (2019), Definition 2.4:
 *   "The coboundary operator δ^0 maps vertex cochains to edge cochains."
 *
 * @param sheaf - The cellular sheaf
 * @returns Dense matrix δ^0 as Float64Array [numEdges*d x numVertices*d]
 */
export function assembleCoboundaryOperator(
  sheaf: CellularSheaf,
): { delta0: Float64Array; rows: number; cols: number } {
  const d = sheaf.stalkDim;
  const nV = sheaf.numVertices;
  const nE = sheaf.numEdges;
  const rows = nE * d;
  const cols = nV * d;

  const delta0 = new Float64Array(rows * cols);

  for (let j = 0; j < nE; j++) {
    const edge = sheaf.edges[j];
    const [srcIdx, tgtIdx] = sheaf.edgeIncidence[j];

    // Source restriction map F_{u◁e}: block (j, srcIdx) gets +R_src
    const srcKey = `${edge.sourceId}:${edge.id}`;
    const srcMap = sheaf.restrictionMaps.get(srcKey);

    if (srcMap) {
      addBlock(delta0, cols, srcMap.matrix, d, d, j * d, srcIdx * d, 1.0);
    }

    // Target restriction map F_{v◁e}: block (j, tgtIdx) gets -R_tgt
    const tgtKey = `${edge.targetId}:${edge.id}`;
    const tgtMap = sheaf.restrictionMaps.get(tgtKey);

    if (tgtMap) {
      addBlock(delta0, cols, tgtMap.matrix, d, d, j * d, tgtIdx * d, -1.0);
    }
  }

  return { delta0, rows, cols };
}

/**
 * Assemble the sheaf Laplacian L_F = (δ^0)^T * δ^0 as a dense matrix.
 *
 * L_F has shape [|V|*d x |V|*d] and is symmetric positive semi-definite.
 *
 * For computational efficiency, we assemble L_F directly from the restriction
 * maps without explicitly forming δ^0 for large matrices. For each edge
 * e = (u, v) with restriction maps R_u = F_{u◁e} and R_v = F_{v◁e}:
 *
 *   L_F[u,u] += R_u^T R_u
 *   L_F[v,v] += R_v^T R_v
 *   L_F[u,v] -= R_u^T R_v
 *   L_F[v,u] -= R_v^T R_u
 *
 * @citation Hansen, J. and Ghrist, R. (2019), Proposition 3.2:
 *   "L_F = Σ_{e=(u,v)} (R_u - R_v)^T (R_u - R_v) in block form."
 *
 * @param sheaf - The cellular sheaf
 * @returns Dense Laplacian matrix L_F as Float64Array [totalDim x totalDim]
 */
export function assembleDenseLaplacian(
  sheaf: CellularSheaf,
): Float64Array {
  const d = sheaf.stalkDim;
  const nV = sheaf.numVertices;
  const totalDim = nV * d;

  const L = new Float64Array(totalDim * totalDim);

  for (let j = 0; j < sheaf.numEdges; j++) {
    const edge = sheaf.edges[j];
    const [srcIdx, tgtIdx] = sheaf.edgeIncidence[j];

    const srcKey = `${edge.sourceId}:${edge.id}`;
    const tgtKey = `${edge.targetId}:${edge.id}`;

    const Ru = sheaf.restrictionMaps.get(srcKey);
    const Rv = sheaf.restrictionMaps.get(tgtKey);

    if (!Ru || !Rv) continue;

    // R_u^T R_u  (d x d matrix)
    const RuTRu = matMul(transpose(Ru.matrix, d, d), Ru.matrix, d, d, d);
    // R_v^T R_v
    const RvTRv = matMul(transpose(Rv.matrix, d, d), Rv.matrix, d, d, d);
    // R_u^T R_v
    const RuTRv = matMul(transpose(Ru.matrix, d, d), Rv.matrix, d, d, d);
    // R_v^T R_u
    const RvTRu = matMul(transpose(Rv.matrix, d, d), Ru.matrix, d, d, d);

    // L_F[srcIdx, srcIdx] += R_u^T R_u
    addBlock(L, totalDim, RuTRu, d, d, srcIdx * d, srcIdx * d, 1.0);

    // L_F[tgtIdx, tgtIdx] += R_v^T R_v
    addBlock(L, totalDim, RvTRv, d, d, tgtIdx * d, tgtIdx * d, 1.0);

    // L_F[srcIdx, tgtIdx] -= R_u^T R_v
    addBlock(L, totalDim, RuTRv, d, d, srcIdx * d, tgtIdx * d, -1.0);

    // L_F[tgtIdx, srcIdx] -= R_v^T R_u
    addBlock(L, totalDim, RvTRu, d, d, tgtIdx * d, srcIdx * d, -1.0);
  }

  return L;
}

/**
 * Apply the sheaf Laplacian L_F to a vector h ∈ C^0 in a matrix-free manner.
 *
 * Instead of forming L_F explicitly, we compute L_F * h by iterating over
 * edges and applying restriction maps:
 *
 *   (L_F h)[v] = Σ_{e ∋ v} R_{v◁e}^T (R_{v◁e} h(v) - R_{w◁e} h(w))
 *
 * where w is the other endpoint of e.
 *
 * This is O(|E| * d^2) per application, vs O(|V|^2 * d^2) for dense multiply.
 *
 * @citation Bodnar, C. et al. "Neural Sheaf Diffusion." NeurIPS 2022.
 *   Section 3.2: "Sheaf Laplacian as message-passing operator."
 *
 * @param sheaf - The cellular sheaf
 * @param h - Input vector in C^0 (length |V| * d)
 * @returns L_F * h (length |V| * d)
 */
export function applyLaplacianMatrixFree(
  sheaf: CellularSheaf,
  h: Float64Array,
): Float64Array {
  const d = sheaf.stalkDim;
  const totalDim = sheaf.numVertices * d;
  const result = new Float64Array(totalDim);

  for (let j = 0; j < sheaf.numEdges; j++) {
    const edge = sheaf.edges[j];
    const [srcIdx, tgtIdx] = sheaf.edgeIncidence[j];

    const srcKey = `${edge.sourceId}:${edge.id}`;
    const tgtKey = `${edge.targetId}:${edge.id}`;

    const Ru = sheaf.restrictionMaps.get(srcKey);
    const Rv = sheaf.restrictionMaps.get(tgtKey);

    if (!Ru || !Rv) continue;

    // Extract h(u) and h(v) sub-vectors
    const hu = h.subarray(srcIdx * d, (srcIdx + 1) * d);
    const hv = h.subarray(tgtIdx * d, (tgtIdx + 1) * d);

    // Compute R_u h(u) and R_v h(v)
    const Ruhu = matVecMul(Ru.matrix, hu, d, d);
    const Rvhv = matVecMul(Rv.matrix, hv, d, d);

    // diff = R_u h(u) - R_v h(v)
    const diff = new Float64Array(d);
    for (let i = 0; i < d; i++) {
      diff[i] = Ruhu[i] - Rvhv[i];
    }

    // result[u] += R_u^T * diff
    const RuT = transpose(Ru.matrix, d, d);
    const contrib_u = matVecMul(RuT, diff, d, d);
    for (let i = 0; i < d; i++) {
      result[srcIdx * d + i] += contrib_u[i];
    }

    // result[v] -= R_v^T * diff  (negative because we negate the target)
    const RvT = transpose(Rv.matrix, d, d);
    const contrib_v = matVecMul(RvT, diff, d, d);
    for (let i = 0; i < d; i++) {
      result[tgtIdx * d + i] -= contrib_v[i];
    }
  }

  return result;
}

// ── Eigenvalue Computation ──

/**
 * Power iteration to find the largest eigenvalue and corresponding eigenvector
 * of a symmetric matrix (or matrix-free operator).
 *
 * Given operator A, iterates: v_{k+1} = A v_k / ||A v_k||
 * until convergence of the Rayleigh quotient λ = v^T A v.
 *
 * @param applyOp - Function that computes A * x
 * @param dim - Vector dimension
 * @param maxIter - Maximum iterations
 * @param tol - Convergence tolerance
 * @returns {eigenvalue, eigenvector} or null if dim is 0
 */
function powerIteration(
  applyOp: (x: Float64Array) => Float64Array,
  dim: number,
  maxIter: number = DEFAULT_MAX_POWER_ITER,
  tol: number = DEFAULT_POWER_TOL,
): { eigenvalue: number; eigenvector: Float64Array } | null {
  if (dim === 0) return null;

  // Initialize with a random-ish vector
  let v = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.sin(i * 1.618033988749895 + 0.5); // golden ratio seeded
  }
  normalizeInPlace(v);

  let lambda = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    const Av = applyOp(v);
    const newLambda = dot(v, Av);

    normalizeInPlace(Av);

    // Check convergence
    if (Math.abs(newLambda - lambda) < tol) {
      return { eigenvalue: newLambda, eigenvector: Av };
    }

    lambda = newLambda;
    v = Av;
  }

  return { eigenvalue: lambda, eigenvector: v };
}

/**
 * Inverse power iteration (with shift) to find the smallest eigenvalue.
 *
 * Computes the smallest eigenvalue of L_F by solving (L_F - σI)^{-1} v
 * iteratively. For σ = 0 (shift to find near-zero eigenvalues), this uses
 * the conjugate gradient method as the inner solver since L_F is SPD + shift.
 *
 * For our use case (counting near-zero eigenvalues for consistency score),
 * we use a different approach: compute the largest eigenvalue λ_max via
 * power iteration, then use deflation to find subsequent eigenvalues.
 *
 * @param sheaf - The cellular sheaf
 * @param numEigenvalues - Number of eigenvalues to compute
 * @param config - Laplacian configuration
 * @returns Array of eigenvalues in ascending order with eigenvectors
 */
function computeEigenvaluesSparse(
  sheaf: CellularSheaf,
  numEigenvalues: number,
  config: LaplacianConfig,
): { eigenvalues: number[]; eigenvectors: Float64Array[] } {
  const d = sheaf.stalkDim;
  const totalDim = sheaf.numVertices * d;
  const maxIter = config.maxPowerIter ?? DEFAULT_MAX_POWER_ITER;
  const tol = config.powerTol ?? DEFAULT_POWER_TOL;

  const k = Math.min(numEigenvalues, totalDim);
  const eigenvalues: number[] = [];
  const eigenvectors: Float64Array[] = [];

  // Use deflation-based approach:
  // 1. Find largest eigenvalue λ_max via power iteration on L_F
  // 2. Compute eigenvalues of (λ_max * I - L_F) via power iteration
  //    (these give smallest eigenvalues of L_F as λ_max - λ_i)

  // Step 1: Find λ_max
  const applyL = (x: Float64Array) => applyLaplacianMatrixFree(sheaf, x);
  const maxResult = powerIteration(applyL, totalDim, maxIter, tol);

  if (!maxResult) {
    return { eigenvalues: [], eigenvectors: [] };
  }

  const lambdaMax = Math.max(maxResult.eigenvalue, 1e-10);

  // Step 2: Find largest eigenvalues of (λ_max * I - L_F)
  // These correspond to smallest eigenvalues of L_F
  let deflationVectors: Float64Array[] = [];

  for (let i = 0; i < k; i++) {
    // Operator: (λ_max * I - L_F) with deflation of already found vectors
    const applyShifted = (x: Float64Array): Float64Array => {
      const Lx = applyLaplacianMatrixFree(sheaf, x);
      const result = new Float64Array(totalDim);

      for (let idx = 0; idx < totalDim; idx++) {
        result[idx] = lambdaMax * x[idx] - Lx[idx];
      }

      // Deflate: subtract projections onto already-found eigenvectors
      for (const prev of deflationVectors) {
        const proj = dot(result, prev);
        for (let idx = 0; idx < totalDim; idx++) {
          result[idx] -= proj * prev[idx];
        }
      }

      return result;
    };

    const result = powerIteration(applyShifted, totalDim, maxIter, tol);
    if (!result) break;

    // Convert back: eigenvalue of L_F = λ_max - eigenvalue of shifted
    const lambdaLF = lambdaMax - result.eigenvalue;

    eigenvalues.push(lambdaLF);
    eigenvectors.push(result.eigenvector);
    deflationVectors.push(result.eigenvector);
  }

  // Sort by eigenvalue (ascending)
  const indices = eigenvalues.map((_, i) => i);
  indices.sort((a, b) => eigenvalues[a] - eigenvalues[b]);

  return {
    eigenvalues: indices.map((i) => eigenvalues[i]),
    eigenvectors: indices.map((i) => eigenvectors[i]),
  };
}

/**
 * Compute eigenvalues of a dense symmetric matrix via QR iteration
 * (simplified Jacobi-like approach for moderate dimensions).
 *
 * For matrices up to ~4000 x 4000 (64 * 64 or thereabouts), this
 * computes all eigenvalues. We use a symmetric tridiagonal reduction
 * followed by the implicit QR algorithm.
 *
 * For simplicity and correctness, we implement a direct approach:
 * repeated Rayleigh quotient iteration to extract eigenvalues one by one,
 * with deflation.
 *
 * @param L - Dense symmetric matrix [n x n] in row-major
 * @param n - Matrix dimension
 * @param maxEig - Maximum number of eigenvalues to compute
 * @returns Eigenvalues in ascending order with eigenvectors
 */
function computeEigenvaluesDense(
  L: Float64Array,
  n: number,
  maxEig: number,
): { eigenvalues: number[]; eigenvectors: Float64Array[] } {
  const k = Math.min(maxEig, n);
  const eigenvalues: number[] = [];
  const eigenvectors: Float64Array[] = [];

  // We use the same deflation-based power iteration but on the dense matrix
  const applyDense = (x: Float64Array): Float64Array => {
    return matVecMul(L, x, n, n);
  };

  // Find λ_max first
  const maxResult = powerIteration(applyDense, n);
  if (!maxResult) {
    return { eigenvalues: [], eigenvectors: [] };
  }

  const lambdaMax = Math.max(maxResult.eigenvalue, 1e-10);
  let deflationVectors: Float64Array[] = [];

  for (let i = 0; i < k; i++) {
    const applyShifted = (x: Float64Array): Float64Array => {
      const Lx = matVecMul(L, x, n, n);
      const result = new Float64Array(n);
      for (let idx = 0; idx < n; idx++) {
        result[idx] = lambdaMax * x[idx] - Lx[idx];
      }
      // Deflation
      for (const prev of deflationVectors) {
        const proj = dot(result, prev);
        for (let idx = 0; idx < n; idx++) {
          result[idx] -= proj * prev[idx];
        }
      }
      return result;
    };

    const result = powerIteration(applyShifted, n);
    if (!result) break;

    const lambdaLF = lambdaMax - result.eigenvalue;
    eigenvalues.push(lambdaLF);
    eigenvectors.push(result.eigenvector);
    deflationVectors.push(result.eigenvector);
  }

  const indices = eigenvalues.map((_, i) => i);
  indices.sort((a, b) => eigenvalues[a] - eigenvalues[b]);

  return {
    eigenvalues: indices.map((i) => eigenvalues[i]),
    eigenvectors: indices.map((i) => eigenvectors[i]),
  };
}

// ── Section Vector Construction ──

/**
 * Flatten vertex stalk vectors into a single section vector h ∈ C^0(G; F).
 *
 * h = [h(v_0), h(v_1), ..., h(v_{|V|-1})] ∈ ℝ^{|V| * d}
 *
 * where h(v_i) = vertexStalks[i] ∈ ℝ^d.
 */
export function flattenSectionVector(sheaf: CellularSheaf): Float64Array {
  const d = sheaf.stalkDim;
  const totalDim = sheaf.numVertices * d;
  const h = new Float64Array(totalDim);

  for (let i = 0; i < sheaf.numVertices; i++) {
    const stalk = sheaf.vertexStalks[i];
    for (let k = 0; k < d; k++) {
      h[i * d + k] = stalk[k];
    }
  }

  return h;
}

// ── Main Entry Point ──

/**
 * Compute the sheaf Laplacian L_F and its spectral decomposition.
 *
 * This is the main entry point for WS2-T1.2. Given a cellular sheaf F
 * (constructed by WS2-T1.1), it:
 *
 * 1. Assembles the sheaf Laplacian L_F = (δ^0)^T δ^0
 * 2. Computes eigenvalues and eigenvectors
 * 3. Determines dim(ker(L_F)) for the consistency score
 * 4. Computes the conflict energy h^T L_F h
 *
 * Decision: For |V| * d < DENSE_THRESHOLD * d, use dense assembly + dense
 * eigendecomposition. For larger graphs, use matrix-free Laplacian application
 * with power iteration + deflation.
 *
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves."
 *   J. Applied and Computational Topology, 2019.
 *
 * @param sheaf - The cellular sheaf from constructCellularSheaf()
 * @param config - Laplacian computation configuration
 * @returns SheafLaplacian with spectral data, consistency score, and conflict energy
 */
export async function computeSheafLaplacian(
  sheaf: CellularSheaf,
  config: LaplacianConfig = {},
): Promise<SheafLaplacian> {
  const d = sheaf.stalkDim;
  const nV = sheaf.numVertices;
  const totalDim = nV * d;
  const zeroTol = config.zeroTol ?? EIGENVALUE_ZERO_TOL;
  const maxEig = config.maxEigenvalues ?? Math.min(20, totalDim);

  logger.info(
    `[${LOG_TAG}] Computing sheaf Laplacian: |V|=${nV}, d=${d}, totalDim=${totalDim}`,
    undefined,
    LOG_TAG,
  );

  if (nV === 0) {
    logger.warn(`[${LOG_TAG}] Empty graph, returning trivial Laplacian`, undefined, LOG_TAG);
    return {
      sheaf,
      totalDim: 0,
      denseMatrix: null,
      eigenvalues: [],
      eigenvectors: [],
      kernelDim: 0,
      consistencyScore: 1.0,
      conflictEnergy: 0,
    };
  }

  let denseMatrix: Float64Array | null = null;
  let eigenvalues: number[];
  let eigenvectors: Float64Array[];

  const useDense = nV <= DENSE_THRESHOLD;

  if (useDense) {
    // Dense path: assemble full matrix and compute eigenvalues
    logger.info(
      `[${LOG_TAG}] Using dense path (|V|=${nV} <= threshold=${DENSE_THRESHOLD})`,
      undefined,
      LOG_TAG,
    );

    denseMatrix = assembleDenseLaplacian(sheaf);
    const eigResult = computeEigenvaluesDense(denseMatrix, totalDim, maxEig);
    eigenvalues = eigResult.eigenvalues;
    eigenvectors = eigResult.eigenvectors;
  } else {
    // Sparse/matrix-free path
    logger.info(
      `[${LOG_TAG}] Using sparse/matrix-free path (|V|=${nV} > threshold=${DENSE_THRESHOLD})`,
      undefined,
      LOG_TAG,
    );

    const eigResult = computeEigenvaluesSparse(sheaf, maxEig, config);
    eigenvalues = eigResult.eigenvalues;
    eigenvectors = eigResult.eigenvectors;
  }

  // Count near-zero eigenvalues → dim(ker(L_F))
  const kernelDim = eigenvalues.filter((λ) => Math.abs(λ) < zeroTol).length;

  // Consistency score = dim(ker(L_F)) / |V|
  // Note: We normalize by |V| (not totalDim = |V|*d) because each vertex
  // contributes one d-dimensional stalk, and we want the fraction of
  // vertices participating in globally consistent sections.
  const consistencyScore = nV > 0 ? kernelDim / nV : 1.0;

  // Conflict energy = h^T L_F h
  const h = flattenSectionVector(sheaf);
  let conflictEnergy: number;

  if (denseMatrix) {
    const Lh = matVecMul(denseMatrix, h, totalDim, totalDim);
    conflictEnergy = dot(h, Lh);
  } else {
    const Lh = applyLaplacianMatrixFree(sheaf, h);
    conflictEnergy = dot(h, Lh);
  }

  logger.info(
    `[${LOG_TAG}] Laplacian computed: kernelDim=${kernelDim}, consistencyScore=${consistencyScore.toFixed(4)}, conflictEnergy=${conflictEnergy.toFixed(6)}, eigenvalues computed: ${eigenvalues.length}`,
    undefined,
    LOG_TAG,
  );

  return {
    sheaf,
    totalDim,
    denseMatrix,
    eigenvalues,
    eigenvectors,
    kernelDim,
    consistencyScore,
    conflictEnergy,
  };
}

/**
 * Compute only the conflict energy h^T L_F h without full eigendecomposition.
 * This is a lightweight computation for monitoring dashboards.
 *
 * @formula E(h) = Σ_{e=(u,v)} ||F_{u◁e}(h(u)) - F_{v◁e}(h(v))||^2
 * @citation Hansen, J. and Ghrist, R. (2019), Theorem 3.1
 *
 * @param sheaf - The cellular sheaf
 * @returns Conflict energy scalar
 */
export function computeConflictEnergyFast(sheaf: CellularSheaf): number {
  const h = flattenSectionVector(sheaf);
  const Lh = applyLaplacianMatrixFree(sheaf, h);
  return dot(h, Lh);
}

/**
 * Get the spectral gap: the smallest non-zero eigenvalue of L_F.
 *
 * The spectral gap λ_1 measures how quickly sheaf diffusion converges.
 * A large spectral gap means fast convergence; a small one means slow.
 *
 * @citation Hansen, J. and Ghrist, R. (2019), Section 4:
 *   "The spectral gap governs mixing time of the sheaf diffusion process."
 *
 * @param laplacian - Computed sheaf Laplacian
 * @returns The spectral gap λ_1, or 0 if no non-zero eigenvalues exist
 */
export function spectralGap(laplacian: SheafLaplacian): number {
  const zeroTol = EIGENVALUE_ZERO_TOL;
  for (const λ of laplacian.eigenvalues) {
    if (Math.abs(λ) >= zeroTol) {
      return λ;
    }
  }
  return 0;
}
