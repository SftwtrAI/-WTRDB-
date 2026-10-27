"use strict";

import type { Express } from "express";
import { logger } from "../../utils/logger";

/**
 * Claw Engine (wtrdb subset)
 *
 * Retains OPA policy enforcement and context resolution.
 * Sandbox, fleet, metering, tool-bridge, skill-manager, and voice-dispatch
 * have been removed as part of the wtrdb extraction.
 */

export function initClawEngine(app: Express): void {
  logger.info("Claw policy engine initialized", undefined, "ClawEngine");
}

// ── Configuration ──
export { ClawConfig } from "./config";

// ── Context Resolver ──
export {
  resolveClawContexts,
  validateContextAssignment,
  previewResolvedContext,
  resolveKnowledgeGraphRefs,
} from "./services/context-resolver.service";
export type {
  ContextManifest,
  ContextToolRef,
  RuntimeAugmentation,
  ResolvedContext,
  ResolvedKnowledgeGraphRef,
} from "./services/context-resolver.service";

// ── OPA Policy ──
export {
  evaluate as opaEvaluate,
  evaluateBatch as opaEvaluateBatch,
  healthCheck as opaHealthCheck,
  resetCircuitBreaker as opaResetCircuitBreaker,
} from "./policy/opa-client";
export type { OpaInput, OpaPolicyResult } from "./policy/opa-client";

export {
  compilePolicyBundle,
  compileOrgBundle,
  compileClawBundle,
  getTemplateRego,
  listTemplates,
} from "./policy/policy-compiler";

export {
  syncPolicyToOpa,
  syncAllOrgs,
  removePolicyFromOpa,
  onPolicyTemplateChange,
  getPolicyFromOpa,
} from "./policy/policy-sync.service";

export {
  testPolicy,
  testPolicyTemplate,
  runTestSuite,
  explainDecision,
  generateStandardTestCases,
} from "./policy/policy-test.service";
