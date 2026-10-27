"use strict";

/**
 * Sheaf Theory Module — Living Knowledge Graph Engine
 *
 * WS2: Sheaf Theory and Topological Quality (Mathematical Engine)
 *
 * This module implements the mathematical core for measuring and resolving
 * consistency across federated knowledge graphs using cellular sheaf theory.
 *
 * Architecture:
 *   sheaf-construction.ts  → Builds cellular sheaf F over a knowledge graph
 *   sheaf-laplacian.ts     → Computes L_F = (δ^0)^T δ^0 and spectral data
 *   sheaf-cohomology.ts    → Computes H^0, H^1 for conflict detection
 *   sheaf-diffusion.ts     → Runs dh/dt = -L_F h for automated resolution
 *
 * Usage:
 *   1. constructCellularSheaf(graphName) → CellularSheaf
 *   2. computeSheafLaplacian(sheaf)      → SheafLaplacian (consistency score)
 *   3. computeSheafCohomology(sheaf)     → CohomologyResult (conflict cycles)
 *   4. runSheafDiffusion(sheaf)          → DiffusionResult (smoothed sections)
 *
 * @module sheaf
 * @citation Gebhart, T. et al. "Knowledge Sheaves." arXiv:2110.03789, 2023.
 * @citation Hansen, J. and Ghrist, R. "Toward a Spectral Theory of Cellular Sheaves." 2019.
 * @citation Bodnar, C. et al. "Neural Sheaf Diffusion." NeurIPS 2022.
 * @citation Robinson, M. "Sheaves Are the Canonical Data Structure for Sensor Integration." 2017.
 * @citation Ayzenberg, A. et al. "Sheaf Theory: From Deep Geometry to Deep Learning." 2025.
 */

// ── Sheaf Construction (WS2-T1.1) ──
export {
  constructCellularSheaf,
  constructCellularSheafFromData,
  constructSheafForKnowledgeBase,
  loadVerticesFromGraph,
  loadEdgesFromGraph,
  buildRestrictionMap,
  applyRestrictionMap,
  localConsistencyError,
  totalConflictEnergy,
  // Linear algebra helpers
  dot,
  norm,
  normalizeInPlace,
  matVecMul,
  outerProduct,
  identityMatrix,
  hashEmbedding,
  projectToStalkDim,
  // Constants
  DEFAULT_STALK_DIM,
  DENSE_THRESHOLD,
} from "./sheaf-construction";

export type {
  SheafVertex,
  SheafEdge,
  RestrictionMap,
  CellularSheaf,
  SheafConstructionConfig,
} from "./sheaf-construction";

// ── Sheaf Laplacian (WS2-T1.2) ──
export {
  computeSheafLaplacian,
  computeConflictEnergyFast,
  assembleCoboundaryOperator,
  assembleDenseLaplacian,
  applyLaplacianMatrixFree,
  flattenSectionVector,
  spectralGap,
} from "./sheaf-laplacian";

export type {
  SheafLaplacian,
  LaplacianConfig,
} from "./sheaf-laplacian";

// ── Sheaf Cohomology (WS2-T2.1) ──
export {
  computeSheafCohomology,
  isGloballyConsistent,
  cohomologySummary,
} from "./sheaf-cohomology";

export type {
  ConflictCycle,
  CohomologyResult,
} from "./sheaf-cohomology";

// ── Sheaf Diffusion (WS2-T2.2) ──
export {
  runSheafDiffusion,
  applyDiffusionToSheaf,
  diffusionStep,
  estimateConvergenceIterations,
  diffusionReport,
} from "./sheaf-diffusion";

export type {
  DiffusionConfig,
  DiffusionStep,
  DiffusionResult,
  ResidualConflict,
} from "./sheaf-diffusion";
