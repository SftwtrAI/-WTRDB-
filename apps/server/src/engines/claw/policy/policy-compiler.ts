"use strict";

/**
 * Policy Compiler Service
 *
 * Compiles OPA policy data documents by merging:
 *   1. A base template (restrictive / standard / permissive) from filesystem bundles
 *   2. Org-level overrides from the clawPolicyTemplates table
 *   3. Optional claw-level overrides
 *
 * Conflict resolution: most restrictive rule always wins (default deny).
 * Output: JSON data document loaded into OPA as `data.policy.<orgId>`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { db } from "../../../db";
import { clawPolicyTemplates, claws } from "@wtrops/shared";
import { eq, and } from "drizzle-orm";
import { logger } from "../../../utils/logger";

const SOURCE = "PolicyCompiler";

// ── Types ──

export type TemplateName = "restrictive" | "standard" | "permissive";

/** The shape of an OPA data document that backs claw policy evaluation. */
export interface PolicyDataDocument {
  template: TemplateName;
  network: {
    mode: "deny_all" | "whitelist" | "allow_all";
    whitelist: string[];
  };
  providers: {
    allowed: string[];
  };
  models: {
    allowed: string[] | null; // null = all allowed
  };
  skills: {
    minSecurityScore: string | null; // "A" | "B" | "C" | null
    allowlist: string[] | null; // null = template default
    blocklist: string[];
    installApprovalRequired: boolean;
  };
  workflows: {
    allowed: string[] | null; // null = all allowed per template
    approvalRequired: boolean;
    maxExecutionsPerDay: number | null;
  };
  mcp: {
    allowed: string[] | null; // null = all allowed per template
    toolApprovalRequired: boolean;
    maxCallsPerDay: number | null;
  };
  routing: Record<string, any> | null;
  credits: {
    maxPerCall: number | null;
  };
  metadata: {
    compiledAt: string;
    orgOverrideId: string | null;
    clawOverrideId: string | null;
  };
}

// ── Template Defaults ──

const TEMPLATE_DEFAULTS: Record<TemplateName, Omit<PolicyDataDocument, "metadata">> = {
  restrictive: {
    template: "restrictive",
    network: { mode: "deny_all", whitelist: [] },
    providers: { allowed: ["local_nemotron"] },
    models: { allowed: null },
    skills: {
      minSecurityScore: "A",
      allowlist: ["search_knowledge_base", "read_document", "summarize_text", "extract_entities"],
      blocklist: [],
      installApprovalRequired: true,
    },
    workflows: { allowed: [], approvalRequired: true, maxExecutionsPerDay: 0 },
    mcp: { allowed: [], toolApprovalRequired: true, maxCallsPerDay: 0 },
    routing: null,
    credits: { maxPerCall: null },
  },
  standard: {
    template: "standard",
    network: {
      mode: "whitelist",
      whitelist: [
        "api.openai.com",
        "api.anthropic.com",
        "api.cohere.com",
        "api.mistral.ai",
        "generativelanguage.googleapis.com",
        "api.together.xyz",
        "api.groq.com",
        "api.deepseek.com",
        "api.fireworks.ai",
      ],
    },
    providers: {
      allowed: [
        "openai", "anthropic", "google", "mistral", "cohere",
        "together", "groq", "deepseek", "fireworks", "local_nemotron",
      ],
    },
    models: { allowed: null },
    skills: {
      minSecurityScore: "B",
      allowlist: null,
      blocklist: [],
      installApprovalRequired: true,
    },
    workflows: { allowed: null, approvalRequired: false, maxExecutionsPerDay: null },
    mcp: { allowed: null, toolApprovalRequired: false, maxCallsPerDay: null },
    routing: null,
    credits: { maxPerCall: null },
  },
  permissive: {
    template: "permissive",
    network: { mode: "allow_all", whitelist: [] },
    providers: {
      allowed: [
        "openai", "anthropic", "google", "mistral", "cohere",
        "together", "groq", "deepseek", "fireworks", "local_nemotron",
      ],
    },
    models: { allowed: null },
    skills: {
      minSecurityScore: null,
      allowlist: null,
      blocklist: [],
      installApprovalRequired: false,
    },
    workflows: { allowed: null, approvalRequired: false, maxExecutionsPerDay: null },
    mcp: { allowed: null, toolApprovalRequired: false, maxCallsPerDay: null },
    routing: null,
    credits: { maxPerCall: null },
  },
};

// ── Bundle Directory ──

const BUNDLES_DIR = path.resolve(__dirname, "bundles");

// ── Helpers: Most-Restrictive Merging ──

/**
 * Intersect two string arrays. If either is null (meaning "all allowed"),
 * take the other. If both non-null, intersect. This is the most-restrictive merge.
 */
function intersectNullable(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  const setB = new Set(b);
  return a.filter((v) => setB.has(v));
}

/**
 * Union two blocklists — blocking more is more restrictive.
 */
function unionArrays(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/**
 * Pick the more restrictive network mode.
 * deny_all > whitelist > allow_all
 */
function moreRestrictiveNetworkMode(
  a: "deny_all" | "whitelist" | "allow_all",
  b: "deny_all" | "whitelist" | "allow_all",
): "deny_all" | "whitelist" | "allow_all" {
  const precedence = { deny_all: 0, whitelist: 1, allow_all: 2 };
  return precedence[a] <= precedence[b] ? a : b;
}

/**
 * Pick the higher (more restrictive) security score.
 * A > B > C > null
 */
function moreRestrictiveScore(a: string | null, b: string | null): string | null {
  const precedence: Record<string, number> = { A: 0, B: 1, C: 2 };
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  const pa = precedence[a] ?? 99;
  const pb = precedence[b] ?? 99;
  return pa <= pb ? a : b;
}

/**
 * Pick the lower numeric cap (more restrictive). Null means "no cap".
 */
function lowerCap(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

// ── Core Merge Logic ──

/**
 * Merge an override layer on top of a base document with most-restrictive-wins semantics.
 */
function mergeOverride(
  base: Omit<PolicyDataDocument, "metadata">,
  override: Partial<Omit<PolicyDataDocument, "metadata">>,
): Omit<PolicyDataDocument, "metadata"> {
  const merged = { ...base };

  // Network
  if (override.network) {
    merged.network = {
      mode: override.network.mode
        ? moreRestrictiveNetworkMode(base.network.mode, override.network.mode)
        : base.network.mode,
      whitelist:
        override.network.mode === "deny_all"
          ? []
          : intersectNullable(
              base.network.whitelist.length > 0 ? base.network.whitelist : null,
              override.network.whitelist.length > 0 ? override.network.whitelist : null,
            ) ?? [],
    };
  }

  // Providers
  if (override.providers) {
    merged.providers = {
      allowed: intersectNullable(base.providers.allowed, override.providers.allowed) ?? base.providers.allowed,
    };
  }

  // Models
  if (override.models) {
    merged.models = {
      allowed: intersectNullable(base.models.allowed, override.models.allowed),
    };
  }

  // Skills
  if (override.skills) {
    merged.skills = {
      minSecurityScore: moreRestrictiveScore(
        base.skills.minSecurityScore,
        override.skills.minSecurityScore ?? null,
      ),
      allowlist: intersectNullable(base.skills.allowlist, override.skills.allowlist ?? null),
      blocklist: unionArrays(base.skills.blocklist, override.skills.blocklist ?? []),
      installApprovalRequired:
        base.skills.installApprovalRequired || (override.skills.installApprovalRequired ?? false),
    };
  }

  // Workflows
  if (override.workflows) {
    merged.workflows = {
      allowed: intersectNullable(base.workflows.allowed, override.workflows.allowed ?? null),
      approvalRequired:
        base.workflows.approvalRequired || (override.workflows.approvalRequired ?? false),
      maxExecutionsPerDay: lowerCap(
        base.workflows.maxExecutionsPerDay,
        override.workflows.maxExecutionsPerDay ?? null,
      ),
    };
  }

  // MCP
  if (override.mcp) {
    merged.mcp = {
      allowed: intersectNullable(base.mcp.allowed, override.mcp.allowed ?? null),
      toolApprovalRequired:
        base.mcp.toolApprovalRequired || (override.mcp.toolApprovalRequired ?? false),
      maxCallsPerDay: lowerCap(
        base.mcp.maxCallsPerDay,
        override.mcp.maxCallsPerDay ?? null,
      ),
    };
  }

  // Routing — override replaces (not a security control)
  if (override.routing !== undefined) {
    merged.routing = override.routing;
  }

  // Credits — more restrictive (lower cap)
  if (override.credits) {
    merged.credits = {
      maxPerCall: lowerCap(base.credits.maxPerCall, override.credits.maxPerCall ?? null),
    };
  }

  return merged;
}

// ── DB Row -> Override Layer ──

function dbRowToOverride(
  row: typeof clawPolicyTemplates.$inferSelect,
): Partial<Omit<PolicyDataDocument, "metadata">> {
  const override: Partial<Omit<PolicyDataDocument, "metadata">> = {};

  // Network
  if (row.networkMode || (row.networkWhitelist && row.networkWhitelist.length > 0)) {
    override.network = {
      mode: (row.networkMode as "deny_all" | "whitelist" | "allow_all") ?? "whitelist",
      whitelist: row.networkWhitelist ?? [],
    };
  }

  // Providers
  if (row.allowedProviders) {
    override.providers = { allowed: row.allowedProviders };
  }

  // Models
  if (row.allowedModels) {
    override.models = { allowed: row.allowedModels };
  }

  // Skills
  if (
    row.minSkillSecurityScore ||
    row.allowedSkills ||
    row.blockedSkills ||
    row.skillInstallApprovalRequired !== null
  ) {
    override.skills = {
      minSecurityScore: row.minSkillSecurityScore ?? null,
      allowlist: row.allowedSkills ?? null,
      blocklist: row.blockedSkills ?? [],
      installApprovalRequired: row.skillInstallApprovalRequired ?? true,
    };
  }

  // Workflows
  if (
    row.allowedWorkflows ||
    row.workflowApprovalRequired !== null ||
    row.maxWorkflowExecutionsPerDay !== null
  ) {
    override.workflows = {
      allowed: row.allowedWorkflows ?? null,
      approvalRequired: row.workflowApprovalRequired ?? false,
      maxExecutionsPerDay: row.maxWorkflowExecutionsPerDay ?? null,
    };
  }

  // MCP
  if (
    row.allowedMcpServers ||
    row.mcpToolApprovalRequired !== null ||
    row.maxMcpCallsPerDay !== null
  ) {
    override.mcp = {
      allowed: row.allowedMcpServers ?? null,
      toolApprovalRequired: row.mcpToolApprovalRequired ?? false,
      maxCallsPerDay: row.maxMcpCallsPerDay ?? null,
    };
  }

  // Routing
  if (row.routingPolicy) {
    override.routing = row.routingPolicy as Record<string, any>;
  }

  // Credits
  if (row.maxCreditsPerCall !== null) {
    override.credits = { maxPerCall: row.maxCreditsPerCall };
  }

  return override;
}

// ── Public API ──

/**
 * Compile a policy bundle from a template + optional overrides.
 * Returns a complete OPA data document.
 */
export function compilePolicyBundle(
  templateName: TemplateName,
  orgOverrides?: Partial<Omit<PolicyDataDocument, "metadata">>,
  clawOverrides?: Partial<Omit<PolicyDataDocument, "metadata">>,
): PolicyDataDocument {
  const base = { ...TEMPLATE_DEFAULTS[templateName] };

  let merged = base;

  if (orgOverrides) {
    merged = mergeOverride(merged, orgOverrides);
  }

  if (clawOverrides) {
    merged = mergeOverride(merged, clawOverrides);
  }

  return {
    ...merged,
    metadata: {
      compiledAt: new Date().toISOString(),
      orgOverrideId: null,
      clawOverrideId: null,
    },
  };
}

/**
 * Compile all policy data for an organization from the database.
 *
 * Reads the org's policy templates from clawPolicyTemplates,
 * determines the base template, applies org-level overrides,
 * and returns a map of templateId -> compiled data document.
 */
export async function compileOrgBundle(
  orgId: string,
): Promise<Map<string, PolicyDataDocument>> {
  const results = new Map<string, PolicyDataDocument>();

  // Fetch all policy templates for this org (including system defaults the org might use)
  const templates = await db
    .select()
    .from(clawPolicyTemplates)
    .where(eq(clawPolicyTemplates.organizationId, orgId));

  // Also fetch system-default templates (no orgId) that claws in this org may reference
  const systemDefaults = await db
    .select()
    .from(clawPolicyTemplates)
    .where(eq(clawPolicyTemplates.isSystemDefault, true));

  const allTemplates = [...systemDefaults, ...templates];

  for (const template of allTemplates) {
    // Determine the base template name from the template's name field
    const baseName = resolveBaseTemplate(template.name);
    const base = { ...TEMPLATE_DEFAULTS[baseName] };

    // Build override from the DB row
    const orgOverride = dbRowToOverride(template);

    // Merge with most-restrictive-wins
    const merged = mergeOverride(base, orgOverride);

    const document: PolicyDataDocument = {
      ...merged,
      metadata: {
        compiledAt: new Date().toISOString(),
        orgOverrideId: template.id,
        clawOverrideId: null,
      },
    };

    results.set(template.id, document);

    logger.debug(
      `Compiled policy bundle for template "${template.name}" (id=${template.id}) org=${orgId}`,
      undefined,
      SOURCE,
    );
  }

  return results;
}

/**
 * Compile a policy document for a specific claw, merging template + org + claw overrides.
 */
export async function compileClawBundle(
  clawId: string,
): Promise<PolicyDataDocument | null> {
  const [claw] = await db
    .select()
    .from(claws)
    .where(eq(claws.id, clawId))
    .limit(1);

  if (!claw) {
    logger.warn(`Claw ${clawId} not found`, undefined, SOURCE);
    return null;
  }

  if (!claw.policyTemplateId) {
    // No policy template assigned — use standard defaults
    return compilePolicyBundle("standard");
  }

  const [template] = await db
    .select()
    .from(clawPolicyTemplates)
    .where(eq(clawPolicyTemplates.id, claw.policyTemplateId))
    .limit(1);

  if (!template) {
    logger.warn(
      `Policy template ${claw.policyTemplateId} not found for claw ${clawId} — falling back to standard`,
      undefined,
      SOURCE,
    );
    return compilePolicyBundle("standard");
  }

  const baseName = resolveBaseTemplate(template.name);
  const orgOverride = dbRowToOverride(template);
  const merged = mergeOverride({ ...TEMPLATE_DEFAULTS[baseName] }, orgOverride);

  return {
    ...merged,
    metadata: {
      compiledAt: new Date().toISOString(),
      orgOverrideId: template.id,
      clawOverrideId: clawId,
    },
  };
}

/**
 * Get the raw Rego source for a template from the filesystem bundles.
 */
export async function getTemplateRego(templateName: TemplateName): Promise<string> {
  const regoPath = path.join(BUNDLES_DIR, "system", templateName, "policy.rego");
  return fs.readFile(regoPath, "utf-8");
}

/**
 * List available system templates by scanning the bundles directory.
 */
export async function listTemplates(): Promise<TemplateName[]> {
  const systemDir = path.join(BUNDLES_DIR, "system");
  const entries = await fs.readdir(systemDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name as TemplateName)
    .filter((name) => name in TEMPLATE_DEFAULTS);
}

// ── Internal Helpers ──

/**
 * Resolve a template name string (potentially a custom name) to one of the
 * three base templates. Falls back to "standard" if unrecognized.
 */
function resolveBaseTemplate(name: string): TemplateName {
  const lower = name.toLowerCase().trim();
  if (lower.includes("restrictive") || lower.includes("strict")) return "restrictive";
  if (lower.includes("permissive") || lower.includes("open")) return "permissive";
  return "standard";
}
