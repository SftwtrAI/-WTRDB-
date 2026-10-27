"use strict";

/**
 * Policy Test Service
 *
 * Evaluates policy data against sample inputs using the OPA REST API.
 * Used for:
 *   - Pre-deployment testing of policy changes
 *   - Running test suites against templates
 *   - Debugging policy decisions with rule-level explanations
 */

import { logger } from "../../../utils/logger";
import { ClawConfig } from "../config";
import {
  compilePolicyBundle,
  type TemplateName,
  type PolicyDataDocument,
} from "./policy-compiler";

const SOURCE = "PolicyTestService";

// ── Types ──

export type PolicyAction =
  | "inference"
  | "workflow_invoke"
  | "mcp_invoke"
  | "skill_install"
  | "network_request"
  | "voice_dispatch"
  | "invoke_model"
  | "invoke_skill"
  | "execute_workflow"
  | "connect_mcp";

export interface PolicyTestInput {
  action: PolicyAction;
  org_id?: string;
  claw_id?: string;
  /** For network_request */
  destination?: string;
  /** For invoke_model */
  provider?: string;
  model?: string;
  /** For invoke_skill / skill_install */
  skill_id?: string;
  skill_grade?: string;
  /** For execute_workflow */
  workflow_id?: string;
  workflow_scope?: string;
  /** For connect_mcp / mcp_invoke */
  mcp_server_id?: string;
  mcp_scope?: string;
  /** For voice_dispatch */
  voice_dispatches_today?: number;
  /** Additional context */
  [key: string]: any;
}

export interface PolicyTestResult {
  allow: boolean;
  reason: string;
  matchedRules: string[];
  failedRules: string[];
  requiresApproval?: boolean;
  evaluationMs: number;
}

export interface TestCase {
  name: string;
  description?: string;
  input: PolicyTestInput;
  expectedAllow: boolean;
}

export interface TestSuiteResult {
  templateName: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: Array<{
    testCase: TestCase;
    actual: PolicyTestResult;
    passed: boolean;
  }>;
  durationMs: number;
}

// ── OPA Evaluation via REST ──

async function opaQuery(
  policyPath: string,
  input: Record<string, any>,
): Promise<any> {
  const url = `${ClawConfig.opa.url}${policyPath}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OPA returned HTTP ${response.status}`);
    }

    const body = await response.json();
    return body.result;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ── Local Policy Evaluation (no OPA required) ──

/**
 * Evaluate a policy data document against an input locally.
 * This mirrors the Rego logic in TypeScript for offline testing.
 */
function evaluateLocally(
  policy: PolicyDataDocument,
  input: PolicyTestInput,
): PolicyTestResult {
  const start = Date.now();
  const matchedRules: string[] = [];
  const failedRules: string[] = [];
  let requiresApproval = false;

  // ── Network request check ──
  if (input.action === "network_request") {
    if (policy.network.mode === "deny_all") {
      failedRules.push("network.deny_all");
    } else if (policy.network.mode === "whitelist") {
      if (input.destination && !policy.network.whitelist.includes(input.destination)) {
        failedRules.push(`network.whitelist: "${input.destination}" not in whitelist`);
      } else {
        matchedRules.push("network.whitelist: destination allowed");
      }
    } else {
      matchedRules.push("network.allow_all");
    }
  }

  // ── Provider check ──
  if (input.action === "invoke_model" || input.action === "inference") {
    if (input.provider && !policy.providers.allowed.includes(input.provider)) {
      failedRules.push(`providers.allowed: "${input.provider}" not in allowed providers`);
    } else if (input.provider) {
      matchedRules.push(`providers.allowed: "${input.provider}" permitted`);
    }

    if (policy.models.allowed !== null && input.model) {
      if (!policy.models.allowed.includes(input.model)) {
        failedRules.push(`models.allowed: "${input.model}" not in allowed models`);
      } else {
        matchedRules.push(`models.allowed: "${input.model}" permitted`);
      }
    }
  }

  // ── Skill check ──
  if (input.action === "invoke_skill" || input.action === "skill_install") {
    // Security score check
    if (policy.skills.minSecurityScore && input.skill_grade) {
      const scoreOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };
      const required = scoreOrder[policy.skills.minSecurityScore] ?? 99;
      const actual = scoreOrder[input.skill_grade] ?? 99;
      if (actual > required) {
        failedRules.push(
          `skills.minSecurityScore: grade "${input.skill_grade}" below required "${policy.skills.minSecurityScore}"`,
        );
      } else {
        matchedRules.push(`skills.minSecurityScore: grade "${input.skill_grade}" meets requirement`);
      }
    }

    // Blocklist check
    if (input.skill_id && policy.skills.blocklist.includes(input.skill_id)) {
      failedRules.push(`skills.blocklist: "${input.skill_id}" is blocked`);
    }

    // Allowlist check (if set, must be in list)
    if (policy.skills.allowlist !== null && input.skill_id) {
      if (!policy.skills.allowlist.includes(input.skill_id)) {
        failedRules.push(`skills.allowlist: "${input.skill_id}" not in allowlist`);
      } else {
        matchedRules.push(`skills.allowlist: "${input.skill_id}" allowed`);
      }
    }

    // Approval required
    if (policy.skills.installApprovalRequired && input.action === "skill_install") {
      requiresApproval = true;
      matchedRules.push("skills.installApprovalRequired: approval needed");
    }
  }

  // ── Workflow check ──
  if (input.action === "execute_workflow" || input.action === "workflow_invoke") {
    if (policy.workflows.allowed !== null && policy.workflows.allowed.length === 0) {
      failedRules.push("workflows.allowed: all workflows denied");
    } else if (
      policy.workflows.allowed !== null &&
      input.workflow_id &&
      !policy.workflows.allowed.includes(input.workflow_id)
    ) {
      failedRules.push(`workflows.allowed: "${input.workflow_id}" not in allowed list`);
    } else if (input.workflow_id) {
      matchedRules.push(`workflows.allowed: "${input.workflow_id}" permitted`);
    }

    if (policy.workflows.approvalRequired) {
      requiresApproval = true;
      matchedRules.push("workflows.approvalRequired: approval needed");
    }

    if (
      policy.workflows.maxExecutionsPerDay !== null &&
      input.workflow_executions_today !== undefined &&
      input.workflow_executions_today >= policy.workflows.maxExecutionsPerDay
    ) {
      failedRules.push(
        `workflows.maxExecutionsPerDay: limit ${policy.workflows.maxExecutionsPerDay} reached`,
      );
    }
  }

  // ── MCP check ──
  if (input.action === "connect_mcp" || input.action === "mcp_invoke") {
    if (policy.mcp.allowed !== null && policy.mcp.allowed.length === 0) {
      failedRules.push("mcp.allowed: all MCP connections denied");
    } else if (
      policy.mcp.allowed !== null &&
      input.mcp_server_id &&
      !policy.mcp.allowed.includes(input.mcp_server_id)
    ) {
      failedRules.push(`mcp.allowed: "${input.mcp_server_id}" not in allowed list`);
    } else if (input.mcp_server_id) {
      matchedRules.push(`mcp.allowed: "${input.mcp_server_id}" permitted`);
    }

    if (policy.mcp.toolApprovalRequired) {
      requiresApproval = true;
      matchedRules.push("mcp.toolApprovalRequired: approval needed");
    }

    if (
      policy.mcp.maxCallsPerDay !== null &&
      input.mcp_calls_today !== undefined &&
      input.mcp_calls_today >= policy.mcp.maxCallsPerDay
    ) {
      failedRules.push(
        `mcp.maxCallsPerDay: limit ${policy.mcp.maxCallsPerDay} reached`,
      );
    }
  }

  // ── Voice dispatch check ──
  if (input.action === "voice_dispatch") {
    // If the template is restrictive, voice is outright denied
    if (policy.template === "restrictive") {
      failedRules.push("voice_dispatch: denied by restrictive policy");
    }
  }

  // ── Determine result ──
  const allow = failedRules.length === 0;
  const reason = allow
    ? "Allowed by policy"
    : `Denied: ${failedRules.join("; ")}`;

  return {
    allow,
    reason,
    matchedRules,
    failedRules,
    requiresApproval: allow ? requiresApproval : undefined,
    evaluationMs: Date.now() - start,
  };
}

// ── Public API ──

/**
 * Test a policy data document against a sample input.
 *
 * First attempts to evaluate via OPA's REST API. If OPA is unavailable,
 * falls back to local TypeScript-based evaluation.
 */
export async function testPolicy(
  policyData: PolicyDataDocument,
  input: PolicyTestInput,
): Promise<PolicyTestResult> {
  const start = Date.now();

  try {
    // Try OPA evaluation first — push temporary data then query
    const tempPath = `/v1/data/policy/_test`;
    const putUrl = `${ClawConfig.opa.url}${tempPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const putResp = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policyData),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (putResp.ok) {
      // Query OPA against the system template
      const templatePath = `/v1/data/claw/system/${policyData.template}`;
      const result = await opaQuery(templatePath, input);

      // Clean up temp data
      try {
        await fetch(putUrl, { method: "DELETE" });
      } catch {
        // Best-effort cleanup
      }

      if (result) {
        return {
          allow: result.allow === true,
          reason: result.allow
            ? "Allowed by OPA policy"
            : `Denied: ${(result.audit_reasons ? Object.values(result.audit_reasons) : []).join("; ") || "policy denied"}`,
          matchedRules: result.allow ? ["policy.allow"] : [],
          failedRules: result.deny
            ? Object.values(result.deny).map(String)
            : [],
          requiresApproval: result.requires_approval,
          evaluationMs: Date.now() - start,
        };
      }
    }
  } catch {
    // OPA unavailable — fall back to local evaluation
    logger.debug(
      "OPA unavailable for test — falling back to local evaluation",
      undefined,
      SOURCE,
    );
  }

  // Local fallback evaluation
  return evaluateLocally(policyData, input);
}

/**
 * Load a template and evaluate it against sample input.
 */
export async function testPolicyTemplate(
  templateName: TemplateName,
  input: PolicyTestInput,
): Promise<PolicyTestResult> {
  const policyData = compilePolicyBundle(templateName);
  return testPolicy(policyData, input);
}

/**
 * Run a suite of test cases against a template.
 */
export async function runTestSuite(
  templateName: TemplateName,
  testCases: TestCase[],
): Promise<TestSuiteResult> {
  const start = Date.now();
  const policyData = compilePolicyBundle(templateName);

  const results: TestSuiteResult["results"] = [];

  for (const testCase of testCases) {
    const actual = await testPolicy(policyData, testCase.input);
    const passed = actual.allow === testCase.expectedAllow;

    results.push({
      testCase,
      actual,
      passed,
    });

    if (!passed) {
      logger.warn(
        `Test FAILED: "${testCase.name}" — expected allow=${testCase.expectedAllow}, got allow=${actual.allow}. Reason: ${actual.reason}`,
        undefined,
        SOURCE,
      );
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  logger.info(
    `Test suite for "${templateName}": ${passed}/${testCases.length} passed, ${failed} failed`,
    undefined,
    SOURCE,
  );

  return {
    templateName,
    totalTests: testCases.length,
    passed,
    failed,
    results,
    durationMs: Date.now() - start,
  };
}

/**
 * Explain a policy decision in detail.
 * Returns which specific rules matched/failed and why.
 */
export async function explainDecision(
  policyData: PolicyDataDocument,
  input: PolicyTestInput,
): Promise<PolicyTestResult & { explanation: string[] }> {
  const result = await testPolicy(policyData, input);

  const explanation: string[] = [];

  explanation.push(`Template: ${policyData.template}`);
  explanation.push(`Action: ${input.action}`);
  explanation.push(`Decision: ${result.allow ? "ALLOW" : "DENY"}`);

  if (result.requiresApproval) {
    explanation.push("Note: This action requires human approval before execution.");
  }

  if (result.matchedRules.length > 0) {
    explanation.push("");
    explanation.push("Rules that matched (passed):");
    for (const rule of result.matchedRules) {
      explanation.push(`  + ${rule}`);
    }
  }

  if (result.failedRules.length > 0) {
    explanation.push("");
    explanation.push("Rules that failed (caused denial):");
    for (const rule of result.failedRules) {
      explanation.push(`  - ${rule}`);
    }
  }

  // Add context about the policy configuration that affected the decision
  explanation.push("");
  explanation.push("Effective policy configuration:");
  explanation.push(`  Network mode: ${policyData.network.mode}`);
  if (policyData.network.whitelist.length > 0) {
    explanation.push(`  Network whitelist: ${policyData.network.whitelist.length} entries`);
  }
  explanation.push(`  Allowed providers: ${policyData.providers.allowed.join(", ")}`);
  explanation.push(
    `  Models: ${policyData.models.allowed ? policyData.models.allowed.join(", ") : "all allowed"}`,
  );
  explanation.push(
    `  Min skill score: ${policyData.skills.minSecurityScore ?? "none"}`,
  );
  explanation.push(
    `  Skill approval required: ${policyData.skills.installApprovalRequired}`,
  );
  explanation.push(
    `  Workflow approval required: ${policyData.workflows.approvalRequired}`,
  );
  explanation.push(
    `  MCP approval required: ${policyData.mcp.toolApprovalRequired}`,
  );

  return { ...result, explanation };
}

/**
 * Generate a set of standard test cases for a given template.
 * Useful for quick smoke testing.
 */
export function generateStandardTestCases(templateName: TemplateName): TestCase[] {
  const cases: TestCase[] = [];

  // Network requests
  cases.push({
    name: "Network: allowed API destination",
    input: { action: "network_request", destination: "api.openai.com" },
    expectedAllow: templateName !== "restrictive",
  });

  cases.push({
    name: "Network: unknown external destination",
    input: { action: "network_request", destination: "evil.example.com" },
    expectedAllow: templateName === "permissive",
  });

  // Provider checks
  cases.push({
    name: "Provider: OpenAI allowed",
    input: { action: "invoke_model", provider: "openai", model: "gpt-4o" },
    expectedAllow: templateName !== "restrictive",
  });

  cases.push({
    name: "Provider: local Nemotron always allowed",
    input: { action: "invoke_model", provider: "local_nemotron", model: "nemotron-local" },
    expectedAllow: true,
  });

  // Skill checks
  cases.push({
    name: "Skill: A-grade knowledge base skill",
    input: { action: "invoke_skill", skill_id: "search_knowledge_base", skill_grade: "A" },
    expectedAllow: true,
  });

  cases.push({
    name: "Skill: C-grade unknown skill",
    input: { action: "invoke_skill", skill_id: "unknown_skill", skill_grade: "C" },
    expectedAllow: templateName === "permissive",
  });

  // Workflow checks
  cases.push({
    name: "Workflow: org-scope workflow",
    input: {
      action: "execute_workflow",
      workflow_id: "wf-1",
      workflow_scope: "org",
    },
    expectedAllow: templateName !== "restrictive",
  });

  // MCP checks
  cases.push({
    name: "MCP: org-scope MCP server",
    input: {
      action: "connect_mcp",
      mcp_server_id: "mcp-1",
      mcp_scope: "org",
    },
    expectedAllow: templateName !== "restrictive",
  });

  // Voice dispatch
  cases.push({
    name: "Voice: dispatch within daily cap",
    input: { action: "voice_dispatch", voice_dispatches_today: 10 },
    expectedAllow: templateName !== "restrictive",
  });

  return cases;
}
