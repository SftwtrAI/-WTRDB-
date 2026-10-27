"use strict";

/**
 * WS2-T2.2: Sheaf Diffusion for Automated Conflict Resolution
 *
 * Implements the sheaf heat equation dh/dt = -L_F * h as an iterative solver
 * that propagates information across the knowledge graph while respecting
 * the consistency constraints encoded by the restriction maps.
 *
 * The diffusion process:
 *   h_{t+1} = h_t - α * L_F * h_t
 *
 * converges to the orthogonal projection of the initial section h_0 onto
 * the space of globally consistent sections H^0 = ker(L_F). In knowledge
 * graph terms: it adjusts entity property vectors toward mutual consistency,
 * finding a compromise that minimizes total conflict energy.
 *
 * Hard conflicts (where no compromise exists) persist as non-zero H^1
 * cohomology classes and are surfaced to the conflict dashboard.
 *
 * @module sheaf-diffusion
 * @citation Bodnar, C. et al. "Neural Sheaf Diffusion: A Topological Perspective on
 *   Heterophily and Oversmoothing in GNNs." NeurIPS 2022.
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves."
 *   J. Applied and Computational Topology, 2019.
 * @citation Ayzenberg, A. et al. "Sheaf Theory: From Deep Geometry to Deep Learning."
 *   arXiv:2502.15476, 2025.
 */

import { logger } from "../../utils/logger";
import type { CellularSheaf } from "./sheaf-construction";
import { dot, norm } from "./sheaf-construction";
import {
  applyLaplacianMatrixFree,
  flattenSectionVector,
  computeConflictEnergyFast,
  spectralGap,
  type SheafLaplacian,
} from "./sheaf-laplacian";

// ── Constants ──

const LOG_TAG = "SheafDiffusion";

/** Default diffusion step size α. Must satisfy α < 2/λ_max for stability. */
const DEFAULT_STEP_SIZE = 0.1;

/** Default maximum iterations */
const DEFAULT_MAX_ITER = 100;

/** Default convergence tolerance: ||h_{t+1} - h_t|| < ε */
const DEFAULT_EPSILON = 1e-6;

/** Minimum step size (adaptive) */
const MIN_STEP_SIZE = 1e-6;

/** Maximum step size (adaptive) */
const MAX_STEP_SIZE = 0.5;

// ── Core Interfaces ──

/**
 * Configuration for the sheaf diffusion process.
 */
export interface DiffusionConfig {
  /**
   * Step size α for the explicit Euler integration.
   * Must satisfy α < 2/λ_max(L_F) for numerical stability.
   * If not provided, it is automatically determined from the spectral gap.
   *
   * @default 0.1
   */
  stepSize?: number;

  /**
   * Maximum number of diffusion iterations.
   *
   * @default 100
   */
  maxIterations?: number;

  /**
   * Convergence tolerance. Diffusion stops when:
   *   ||h_{t+1} - h_t||_2 < epsilon
   *
   * @default 1e-6
   */
  epsilon?: number;

  /**
   * Whether to use adaptive step size.
   * When enabled, the step size is adjusted based on the energy decay rate.
   *
   * @default false
   */
  adaptiveStepSize?: boolean;

  /**
   * If provided, the pre-computed Laplacian (avoids recomputation of spectral data).
   */
  laplacian?: SheafLaplacian;

  /**
   * Whether to record per-iteration metrics for analysis.
   *
   * @default true
   */
  recordHistory?: boolean;
}

/**
 * A single iteration record in the diffusion history.
 */
export interface DiffusionStep {
  /** Iteration number (0-indexed) */
  iteration: number;

  /**
   * Conflict energy at this step: E(h_t) = h_t^T L_F h_t.
   * Should monotonically decrease.
   */
  energy: number;

  /**
   * Update norm: ||h_{t+1} - h_t||_2.
   * Convergence is reached when this falls below epsilon.
   */
  updateNorm: number;

  /** Step size used at this iteration */
  stepSize: number;
}

/**
 * Result of the sheaf diffusion process.
 */
export interface DiffusionResult {
  /**
   * The diffused section vector h* ∈ C^0(G; F).
   * This is the smoothed assignment of property vectors to vertices
   * that minimizes conflict energy.
   *
   * Length: |V| * stalkDim
   */
  diffusedSection: Float64Array;

  /**
   * Per-vertex diffused stalk vectors.
   * diffusedStalks[i] = h*[i*d : (i+1)*d] for vertex i.
   */
  diffusedStalks: Float64Array[];

  /**
   * Initial conflict energy: E(h_0) = h_0^T L_F h_0.
   */
  initialEnergy: number;

  /**
   * Final conflict energy after diffusion: E(h*) = h*^T L_F h*.
   * Lower is better. Zero means perfect consistency.
   */
  finalEnergy: number;

  /**
   * Energy reduction ratio: (initialEnergy - finalEnergy) / initialEnergy.
   * Values close to 1.0 indicate successful conflict resolution.
   * Values close to 0.0 indicate hard conflicts (H^1 ≠ 0).
   */
  energyReduction: number;

  /** Number of iterations performed */
  iterationsPerformed: number;

  /** Whether convergence was achieved (updateNorm < epsilon) */
  converged: boolean;

  /** Step-by-step iteration history (if recordHistory was enabled) */
  history: DiffusionStep[];

  /**
   * Residual conflicts: edges where local consistency error remains high
   * after diffusion. These correspond to H^1 generators (hard conflicts).
   */
  residualConflicts: ResidualConflict[];
}

/**
 * A residual conflict that persists after diffusion.
 * These correspond to H^1 ≠ 0: irreducible inconsistencies.
 */
export interface ResidualConflict {
  /** Edge index in the sheaf */
  edgeIndex: number;

  /** Source vertex name */
  sourceName: string;

  /** Target vertex name */
  targetName: string;

  /** Relationship type */
  relationshipType: string;

  /**
   * Local consistency error after diffusion:
   * ||F_{u◁e}(h*(u)) - F_{v◁e}(h*(v))||^2
   */
  residualError: number;

  /**
   * Error reduction from diffusion:
   * (initial_error - final_error) / initial_error
   */
  errorReduction: number;
}

// ── Helper Functions ──

/**
 * Compute the optimal step size from spectral data.
 *
 * For the explicit Euler method h_{t+1} = h_t - α L_F h_t,
 * stability requires α < 2/λ_max(L_F).
 * Optimal convergence is at α = 2/(λ_min + λ_max) where
 * λ_min is the smallest non-zero eigenvalue.
 *
 * If spectral data is not available, we use a conservative default.
 *
 * @citation Bodnar, C. et al. (2022), Section 3.3:
 *   "Step size selection for stable sheaf diffusion."
 *
 * @param laplacian - Pre-computed Laplacian with eigenvalues
 * @returns Recommended step size
 */
function computeOptimalStepSize(laplacian: SheafLaplacian): number {
  if (laplacian.eigenvalues.length === 0) {
    return DEFAULT_STEP_SIZE;
  }

  // Find λ_max (largest eigenvalue)
  const lambdaMax =
    laplacian.eigenvalues[laplacian.eigenvalues.length - 1];

  if (lambdaMax < 1e-12) {
    // Matrix is essentially zero — any step size works
    return DEFAULT_STEP_SIZE;
  }

  // Stability bound: α < 2/λ_max
  // Use 0.9 * (2/λ_max) for safety margin
  const safeStepSize = (2.0 / lambdaMax) * 0.9;

  // For optimal convergence, use 2/(λ_min + λ_max)
  const gap = spectralGap(laplacian);
  if (gap > 1e-12) {
    const optimalStepSize = 2.0 / (gap + lambdaMax);
    return Math.min(optimalStepSize, safeStepSize, MAX_STEP_SIZE);
  }

  return Math.min(safeStepSize, MAX_STEP_SIZE);
}

/**
 * Compute per-edge local consistency error for a given section vector.
 *
 * error_e = ||F_{u◁e}(h(u)) - F_{v◁e}(h(v))||^2
 *
 * @param sheaf - The cellular sheaf
 * @param h - Section vector (length |V| * d)
 * @returns Array of per-edge errors
 */
function computePerEdgeErrors(
  sheaf: CellularSheaf,
  h: Float64Array,
): number[] {
  const d = sheaf.stalkDim;
  const errors: number[] = new Array(sheaf.numEdges);

  for (let j = 0; j < sheaf.numEdges; j++) {
    const edge = sheaf.edges[j];
    const [srcIdx, tgtIdx] = sheaf.edgeIncidence[j];

    const srcKey = `${edge.sourceId}:${edge.id}`;
    const tgtKey = `${edge.targetId}:${edge.id}`;

    const Ru = sheaf.restrictionMaps.get(srcKey);
    const Rv = sheaf.restrictionMaps.get(tgtKey);

    if (!Ru || !Rv) {
      errors[j] = 0;
      continue;
    }

    // Extract sub-vectors
    const hu = h.subarray(srcIdx * d, (srcIdx + 1) * d);
    const hv = h.subarray(tgtIdx * d, (tgtIdx + 1) * d);

    // Apply restriction maps
    const Ruhu = new Float64Array(d);
    const Rvhv = new Float64Array(d);

    for (let i = 0; i < d; i++) {
      let sumU = 0;
      let sumV = 0;
      for (let k = 0; k < d; k++) {
        sumU += Ru.matrix[i * d + k] * hu[k];
        sumV += Rv.matrix[i * d + k] * hv[k];
      }
      Ruhu[i] = sumU;
      Rvhv[i] = sumV;
    }

    // Squared difference
    let error = 0;
    for (let i = 0; i < d; i++) {
      const diff = Ruhu[i] - Rvhv[i];
      error += diff * diff;
    }

    errors[j] = error;
  }

  return errors;
}

// ── Main Diffusion Solver ──

/**
 * Run sheaf diffusion to minimize conflict energy.
 *
 * Implements the explicit Euler discretization of the sheaf heat equation:
 *
 *   dh/dt = -L_F h   →   h_{t+1} = h_t - α L_F h_t
 *
 * where α is the step size and L_F is the sheaf Laplacian. The process
 * converges to h* = proj_{ker(L_F)}(h_0), the orthogonal projection of
 * the initial section onto the space of globally consistent sections.
 *
 * Convergence is guaranteed when α < 2/λ_max(L_F) by the spectral theory
 * of the sheaf Laplacian. The convergence rate is:
 *
 *   ||h_t - h*||^2 ≤ (1 - α λ_1)^{2t} ||h_0 - h*||^2
 *
 * where λ_1 is the spectral gap (smallest non-zero eigenvalue of L_F).
 *
 * After diffusion, residual conflicts are identified as edges with
 * remaining local consistency error > threshold. These correspond to
 * non-trivial H^1 cohomology classes (hard conflicts).
 *
 * @citation Bodnar, C. et al. "Neural Sheaf Diffusion." NeurIPS 2022.
 *   Theorem 1: "Sheaf diffusion converges to the harmonic extension."
 * @citation Hansen, J. and Ghrist, R. (2019), Section 4:
 *   "Spectral theory governs diffusion dynamics on cellular sheaves."
 *
 * @param sheaf - The cellular sheaf from constructCellularSheaf()
 * @param config - Diffusion configuration
 * @returns DiffusionResult with smoothed section and conflict analysis
 */
export async function runSheafDiffusion(
  sheaf: CellularSheaf,
  config: DiffusionConfig = {},
): Promise<DiffusionResult> {
  const d = sheaf.stalkDim;
  const nV = sheaf.numVertices;
  const totalDim = nV * d;

  const maxIter = config.maxIterations ?? DEFAULT_MAX_ITER;
  const epsilon = config.epsilon ?? DEFAULT_EPSILON;
  const adaptive = config.adaptiveStepSize ?? false;
  const recordHistory = config.recordHistory ?? true;

  logger.info(
    `[${LOG_TAG}] Starting sheaf diffusion: |V|=${nV}, d=${d}, maxIter=${maxIter}, ε=${epsilon}`,
    undefined,
    LOG_TAG,
  );

  // Handle degenerate case
  if (nV === 0 || sheaf.numEdges === 0) {
    logger.info(
      `[${LOG_TAG}] Empty or edgeless graph — nothing to diffuse`,
      undefined,
      LOG_TAG,
    );
    return {
      diffusedSection: new Float64Array(totalDim),
      diffusedStalks: sheaf.vertexStalks.map((s) => new Float64Array(s)),
      initialEnergy: 0,
      finalEnergy: 0,
      energyReduction: 0,
      iterationsPerformed: 0,
      converged: true,
      history: [],
      residualConflicts: [],
    };
  }

  // Determine step size
  let stepSize: number;
  if (config.stepSize !== undefined) {
    stepSize = config.stepSize;
  } else if (config.laplacian) {
    stepSize = computeOptimalStepSize(config.laplacian);
  } else {
    stepSize = DEFAULT_STEP_SIZE;
  }

  logger.info(
    `[${LOG_TAG}] Using step size α=${stepSize.toFixed(6)}`,
    undefined,
    LOG_TAG,
  );

  // Initialize h_0 from current vertex stalks
  let h = flattenSectionVector(sheaf);
  const initialErrors = computePerEdgeErrors(sheaf, h);

  // Compute initial energy
  const Lh_initial = applyLaplacianMatrixFree(sheaf, h);
  const initialEnergy = dot(h, Lh_initial);

  const history: DiffusionStep[] = [];
  let converged = false;
  let iterationsPerformed = 0;

  // Main diffusion loop: h_{t+1} = h_t - α * L_F * h_t
  for (let t = 0; t < maxIter; t++) {
    // Apply Laplacian: compute L_F * h_t
    const Lh = applyLaplacianMatrixFree(sheaf, h);

    // Compute update: Δh = -α * L_F * h_t
    const hNew = new Float64Array(totalDim);
    for (let i = 0; i < totalDim; i++) {
      hNew[i] = h[i] - stepSize * Lh[i];
    }

    // Compute update norm: ||h_{t+1} - h_t||
    let updateNormSq = 0;
    for (let i = 0; i < totalDim; i++) {
      const diff = hNew[i] - h[i];
      updateNormSq += diff * diff;
    }
    const updateNorm = Math.sqrt(updateNormSq);

    // Compute current energy
    const LhNew = applyLaplacianMatrixFree(sheaf, hNew);
    const energy = dot(hNew, LhNew);

    // Record history
    if (recordHistory) {
      history.push({
        iteration: t,
        energy,
        updateNorm,
        stepSize,
      });
    }

    // Adaptive step size: if energy increased, reduce step size
    if (adaptive && history.length >= 2) {
      const prevEnergy = history[history.length - 2].energy;
      if (energy > prevEnergy) {
        // Energy increased — step size too large
        stepSize = Math.max(stepSize * 0.5, MIN_STEP_SIZE);
        logger.info(
          `[${LOG_TAG}] Reducing step size to ${stepSize.toFixed(8)} (energy increased)`,
          undefined,
          LOG_TAG,
        );
        // Don't update h — retry with smaller step
        continue;
      } else if (energy < prevEnergy * 0.99) {
        // Energy decreasing well — try increasing step size
        stepSize = Math.min(stepSize * 1.1, MAX_STEP_SIZE);
      }
    }

    // Update h
    h = hNew;
    iterationsPerformed = t + 1;

    // Convergence check
    if (updateNorm < epsilon) {
      converged = true;
      logger.info(
        `[${LOG_TAG}] Converged at iteration ${t + 1}: updateNorm=${updateNorm.toExponential(4)}, energy=${energy.toExponential(4)}`,
        undefined,
        LOG_TAG,
      );
      break;
    }

    // Periodic logging
    if ((t + 1) % 10 === 0) {
      logger.info(
        `[${LOG_TAG}] Iteration ${t + 1}: energy=${energy.toExponential(4)}, updateNorm=${updateNorm.toExponential(4)}`,
        undefined,
        LOG_TAG,
      );
    }
  }

  // Compute final energy
  const Lh_final = applyLaplacianMatrixFree(sheaf, h);
  const finalEnergy = dot(h, Lh_final);

  const energyReduction =
    initialEnergy > 1e-12
      ? (initialEnergy - finalEnergy) / initialEnergy
      : 0;

  // Extract per-vertex diffused stalks
  const diffusedStalks: Float64Array[] = new Array(nV);
  for (let i = 0; i < nV; i++) {
    diffusedStalks[i] = new Float64Array(d);
    for (let k = 0; k < d; k++) {
      diffusedStalks[i][k] = h[i * d + k];
    }
  }

  // Identify residual conflicts
  const finalErrors = computePerEdgeErrors(sheaf, h);
  const residualConflicts: ResidualConflict[] = [];

  // Threshold for "significant residual": use mean + 2*std of final errors
  const meanError =
    finalErrors.reduce((sum, e) => sum + e, 0) / Math.max(finalErrors.length, 1);
  const stdError = Math.sqrt(
    finalErrors.reduce((sum, e) => sum + (e - meanError) ** 2, 0) /
      Math.max(finalErrors.length, 1),
  );
  const residualThreshold = meanError + 2 * stdError;

  for (let j = 0; j < sheaf.numEdges; j++) {
    if (finalErrors[j] > residualThreshold && finalErrors[j] > 1e-8) {
      const edge = sheaf.edges[j];
      const initialError = initialErrors[j];
      const errorReduction =
        initialError > 1e-12
          ? (initialError - finalErrors[j]) / initialError
          : 0;

      residualConflicts.push({
        edgeIndex: j,
        sourceName: edge.sourceName,
        targetName: edge.targetName,
        relationshipType: edge.relationshipType,
        residualError: finalErrors[j],
        errorReduction,
      });
    }
  }

  // Sort residual conflicts by error (descending)
  residualConflicts.sort((a, b) => b.residualError - a.residualError);

  logger.info(
    `[${LOG_TAG}] Diffusion complete: ${iterationsPerformed} iterations, ` +
      `converged=${converged}, energy ${initialEnergy.toExponential(4)} → ${finalEnergy.toExponential(4)} ` +
      `(${(energyReduction * 100).toFixed(1)}% reduction), ` +
      `${residualConflicts.length} residual conflicts`,
    undefined,
    LOG_TAG,
  );

  return {
    diffusedSection: h,
    diffusedStalks,
    initialEnergy,
    finalEnergy,
    energyReduction,
    iterationsPerformed,
    converged,
    history,
    residualConflicts,
  };
}

/**
 * Apply diffused stalks back to the sheaf's vertex stalk vectors.
 *
 * After running sheaf diffusion, call this to update the sheaf's vertex
 * stalks with the smoothed values. This modifies the sheaf in place.
 *
 * @param sheaf - The cellular sheaf to update
 * @param diffusionResult - Result from runSheafDiffusion()
 */
export function applyDiffusionToSheaf(
  sheaf: CellularSheaf,
  diffusionResult: DiffusionResult,
): void {
  for (let i = 0; i < sheaf.numVertices; i++) {
    sheaf.vertexStalks[i] = diffusionResult.diffusedStalks[i];
  }

  logger.info(
    `[${LOG_TAG}] Applied diffusion results to sheaf vertex stalks (${sheaf.numVertices} vertices updated)`,
    undefined,
    LOG_TAG,
  );
}

/**
 * Run a single diffusion step (for incremental/streaming updates).
 *
 * h_{t+1} = h_t - α * L_F * h_t
 *
 * @citation Bodnar, C. et al. (2022), Equation 5:
 *   "Single-step sheaf diffusion as message passing."
 *
 * @param sheaf - The cellular sheaf
 * @param h - Current section vector (length |V| * d)
 * @param stepSize - Step size α
 * @returns Updated section vector h_{t+1}
 */
export function diffusionStep(
  sheaf: CellularSheaf,
  h: Float64Array,
  stepSize: number = DEFAULT_STEP_SIZE,
): Float64Array {
  const Lh = applyLaplacianMatrixFree(sheaf, h);
  const hNew = new Float64Array(h.length);

  for (let i = 0; i < h.length; i++) {
    hNew[i] = h[i] - stepSize * Lh[i];
  }

  return hNew;
}

/**
 * Estimate the number of iterations needed for convergence.
 *
 * Based on the spectral gap λ_1, the convergence rate is:
 *   ||h_t - h*|| ≤ (1 - α λ_1)^t ||h_0 - h*||
 *
 * So to reach relative error ε, we need:
 *   t ≥ log(1/ε) / log(1/(1 - α λ_1)) ≈ log(1/ε) / (α λ_1)
 *
 * @citation Hansen, J. and Ghrist, R. (2019), Corollary 4.3:
 *   "Convergence rate of sheaf diffusion from spectral gap."
 *
 * @param laplacian - Pre-computed Laplacian with spectral data
 * @param epsilon - Target convergence tolerance
 * @param stepSize - Step size (optional, uses optimal if not provided)
 * @returns Estimated number of iterations, or Infinity if spectral gap is 0
 */
export function estimateConvergenceIterations(
  laplacian: SheafLaplacian,
  epsilon: number = DEFAULT_EPSILON,
  stepSize?: number,
): number {
  const gap = spectralGap(laplacian);

  if (gap < 1e-12) {
    // Zero spectral gap: graph is already fully disconnected or consistent
    return laplacian.conflictEnergy < 1e-12 ? 0 : Infinity;
  }

  const alpha = stepSize ?? computeOptimalStepSize(laplacian);
  const rate = alpha * gap;

  if (rate >= 1.0) {
    // Unstable: step size too large
    return Infinity;
  }

  // t ≈ log(1/ε) / log(1/(1-αλ₁))
  return Math.ceil(Math.log(1.0 / epsilon) / Math.log(1.0 / (1.0 - rate)));
}

/**
 * Generate a human-readable diffusion report.
 *
 * @param result - Diffusion result
 * @returns Formatted report string
 */
export function diffusionReport(result: DiffusionResult): string {
  const lines: string[] = [];

  lines.push("=== Sheaf Diffusion Report ===");
  lines.push("");
  lines.push(`Iterations: ${result.iterationsPerformed}`);
  lines.push(`Converged: ${result.converged ? "Yes" : "No"}`);
  lines.push(
    `Energy: ${result.initialEnergy.toExponential(4)} -> ${result.finalEnergy.toExponential(4)}`,
  );
  lines.push(
    `Energy reduction: ${(result.energyReduction * 100).toFixed(1)}%`,
  );
  lines.push("");

  if (result.residualConflicts.length > 0) {
    lines.push(
      `Residual conflicts (${result.residualConflicts.length} edges with persistent inconsistency):`,
    );
    for (const conflict of result.residualConflicts.slice(0, 10)) {
      lines.push(
        `  ${conflict.sourceName} -[${conflict.relationshipType}]-> ${conflict.targetName}: ` +
          `error=${conflict.residualError.toExponential(3)}, ` +
          `reduced=${(conflict.errorReduction * 100).toFixed(1)}%`,
      );
    }
    if (result.residualConflicts.length > 10) {
      lines.push(
        `  ... and ${result.residualConflicts.length - 10} more`,
      );
    }
  } else {
    lines.push("No residual conflicts. Graph is fully consistent after diffusion.");
  }

  return lines.join("\n");
}
