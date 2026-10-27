"use strict";

/**
 * CMMC Configuration Management (CM) Domain Evidence Collection
 *
 * Collects real evidence from the database for CM controls:
 *   CM.2.061 — Configuration baselines (claw policy templates + assignment)
 *   CM.2.062 — Change tracking (RBAC audit events)
 *   CM.2.064 — Least functionality (per-agent security posture)
 *
 * Uses Drizzle ORM for all queries. Every evidence item contains real data.
 */

import { db } from "../../db";
import {
  clawPolicyTemplates,
  claws,
  rbacAuditEvents,
  users,
} from "@wtrops/shared";
import { eq, or, desc, count } from "drizzle-orm";
import { logger } from "../../utils/logger";

const SOURCE = "CmEvidence";

// ── Types ──

export interface CollectedEvidenceItem {
  type: "audit_log_sample" | "config_check" | "database_query" | "opa_evaluation" | "system_check";
  title: string;
  description: string;
  passed: boolean;
  data: any;
  sampleSize?: number;
  totalRecords?: number;
}

export interface CollectedEvidence {
  controlId: string;
  framework: string;
  controlType: "platform" | "configurable" | "evidence";
  status: "pass" | "partial" | "fail";
  summary: string;
  items: CollectedEvidenceItem[];
  requiredActions: string[];
  collectedAt: string;
}

// ════════════════════════════════════════════════════════════════════════════════
// CM.2.061 — Establish and maintain baseline configurations
// ════════════════════════════════════════════════════════════════════════════════

async function collectCm2061(orgId: string): Promise<CollectedEvidence> {
  const now = new Date().toISOString();
  const items: CollectedEvidenceItem[] = [];

  // Query 1: Baseline templates (system defaults + org-specific)
  const templates = await db
    .select({
      id: clawPolicyTemplates.id,
      name: clawPolicyTemplates.name,
      description: clawPolicyTemplates.description,
      networkMode: clawPolicyTemplates.networkMode,
      isSystemDefault: clawPolicyTemplates.isSystemDefault,
    })
    .from(clawPolicyTemplates)
    .where(
      or(
        eq(clawPolicyTemplates.organizationId, orgId),
        eq(clawPolicyTemplates.isSystemDefault, true),
      ),
    );

  items.push({
    type: "database_query",
    title: "Configuration Baseline Templates",
    description: `Found ${templates.length} policy template(s) available as configuration baselines.`,
    passed: templates.length > 0,
    data: {
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        networkMode: t.networkMode,
        isSystemDefault: t.isSystemDefault,
      })),
      totalTemplates: templates.length,
      systemDefaults: templates.filter((t) => t.isSystemDefault).length,
      orgSpecific: templates.filter((t) => !t.isSystemDefault).length,
    },
    sampleSize: templates.length,
    totalRecords: templates.length,
  });

  // Query 2: Claws and their assigned baselines
  const clawsWithPolicy = await db
    .select({
      clawName: claws.name,
      clawStatus: claws.status,
      policyName: clawPolicyTemplates.name,
    })
    .from(claws)
    .leftJoin(
      clawPolicyTemplates,
      eq(claws.policyTemplateId, clawPolicyTemplates.id),
    )
    .where(eq(claws.organizationId, orgId));

  const totalClaws = clawsWithPolicy.length;
  const assignedClaws = clawsWithPolicy.filter((c) => c.policyName !== null);
  const unassignedClaws = clawsWithPolicy.filter((c) => c.policyName === null);

  items.push({
    type: "config_check",
    title: "Claw-to-Baseline Assignment Audit",
    description: `${assignedClaws.length} of ${totalClaws} claw agent(s) have a policy baseline assigned.`,
    passed: totalClaws > 0 && unassignedClaws.length === 0,
    data: {
      totalClaws,
      assignedCount: assignedClaws.length,
      unassignedCount: unassignedClaws.length,
      clawDetails: clawsWithPolicy.map((c) => ({
        name: c.clawName,
        status: c.clawStatus,
        assignedPolicy: c.policyName || "NONE — no baseline assigned",
      })),
      unassignedAgents: unassignedClaws.map((c) => c.clawName),
    },
    sampleSize: totalClaws,
    totalRecords: totalClaws,
  });

  // Determine status
  let status: CollectedEvidence["status"];
  if (templates.length === 0) {
    status = "fail";
  } else if (totalClaws === 0) {
    // No claws yet — templates exist but nothing to assign
    status = "partial";
  } else if (unassignedClaws.length === 0) {
    status = "pass";
  } else if (assignedClaws.length > 0) {
    status = "partial";
  } else {
    status = "fail";
  }

  const summaryParts: string[] = [];
  summaryParts.push(`${templates.length} baseline template(s) available`);
  if (totalClaws > 0) {
    summaryParts.push(`${assignedClaws.length}/${totalClaws} agents assigned to a baseline`);
  } else {
    summaryParts.push("no claw agents deployed yet");
  }

  return {
    controlId: "CM.2.061",
    framework: "cmmc",
    controlType: "configurable",
    status,
    summary: summaryParts.join("; ") + ".",
    items,
    requiredActions: [
      "Define your security baseline: Go to Claw Policies and review the 3 system templates (Restrictive, Standard, Permissive). For CMMC, 'Standard' or 'Restrictive' is recommended as your baseline.",
      "Assign baselines to all agents: In Claw Fleet, ensure every agent has a policy template assigned. Agents without a template operate with no policy governance.",
    ],
    collectedAt: now,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// CM.2.062 — Track, review, approve/disapprove, and log changes
// ════════════════════════════════════════════════════════════════════════════════

async function collectCm2062(orgId: string): Promise<CollectedEvidence> {
  const now = new Date().toISOString();
  const items: CollectedEvidenceItem[] = [];

  // Query 1: Event type distribution
  const eventDistribution = await db
    .select({
      eventType: rbacAuditEvents.eventType,
      count: count(),
    })
    .from(rbacAuditEvents)
    .where(eq(rbacAuditEvents.organizationId, orgId))
    .groupBy(rbacAuditEvents.eventType)
    .orderBy(desc(count()));

  const totalEvents = eventDistribution.reduce(
    (sum, row) => sum + Number(row.count),
    0,
  );

  items.push({
    type: "database_query",
    title: "Configuration Change Event Distribution",
    description: `${totalEvents} total audit event(s) across ${eventDistribution.length} event type(s) tracked in the change log.`,
    passed: totalEvents > 0,
    data: {
      totalEvents,
      eventTypes: eventDistribution.map((row) => ({
        type: row.eventType,
        count: Number(row.count),
      })),
      changeTypesTracked: eventDistribution.length,
    },
    sampleSize: eventDistribution.length,
    totalRecords: totalEvents,
  });

  // Query 2: Recent config change events with who/what/when
  const recentChanges = await db
    .select({
      eventType: rbacAuditEvents.eventType,
      eventData: rbacAuditEvents.eventData,
      timestamp: rbacAuditEvents.timestamp,
      email: users.email,
    })
    .from(rbacAuditEvents)
    .innerJoin(users, eq(rbacAuditEvents.actorUserId, users.id))
    .where(eq(rbacAuditEvents.organizationId, orgId))
    .orderBy(desc(rbacAuditEvents.timestamp))
    .limit(15);

  items.push({
    type: "audit_log_sample",
    title: "Recent Configuration Changes (Who / What / When)",
    description: `${recentChanges.length} most recent configuration change(s) with actor attribution.`,
    passed: recentChanges.length > 0,
    data: {
      recentChanges: recentChanges.map((row) => ({
        who: row.email,
        what: row.eventType,
        when: row.timestamp,
        details: row.eventData,
      })),
      sampleCount: recentChanges.length,
    },
    sampleSize: recentChanges.length,
    totalRecords: totalEvents,
  });

  // Status: pass if change events exist
  const status: CollectedEvidence["status"] = totalEvents > 0 ? "pass" : "fail";

  return {
    controlId: "CM.2.062",
    framework: "cmmc",
    controlType: "platform",
    status,
    summary: totalEvents > 0
      ? `Change tracking active: ${totalEvents} audit event(s) across ${eventDistribution.length} event type(s). Last ${recentChanges.length} change(s) shown with full attribution.`
      : "No configuration change events found in the audit trail. Perform system configuration actions to generate audit records.",
    items,
    requiredActions: [
      "Configuration changes are automatically tracked (automated - system logs all role, permission, policy, and team changes to the audit trail)",
      "Review recent changes: Navigate to the Compliance dashboard to review configuration change history",
    ],
    collectedAt: now,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// CM.2.064 — Employ least functionality
// ════════════════════════════════════════════════════════════════════════════════

async function collectCm2064(orgId: string): Promise<CollectedEvidence> {
  const now = new Date().toISOString();
  const items: CollectedEvidenceItem[] = [];

  // Query: Per-agent security posture with policy details
  const agentPosture = await db
    .select({
      clawName: claws.name,
      clawStatus: claws.status,
      policyName: clawPolicyTemplates.name,
      networkMode: clawPolicyTemplates.networkMode,
      allowedProviders: clawPolicyTemplates.allowedProviders,
      minSkillSecurityScore: clawPolicyTemplates.minSkillSecurityScore,
    })
    .from(claws)
    .leftJoin(
      clawPolicyTemplates,
      eq(claws.policyTemplateId, clawPolicyTemplates.id),
    )
    .where(eq(claws.organizationId, orgId));

  const totalAgents = agentPosture.length;

  // Flag agents using permissive template or allow_all network mode
  const flaggedAgents = agentPosture.filter((a) => {
    const policyLower = (a.policyName || "").toLowerCase();
    const networkMode = (a.networkMode || "").toLowerCase();
    return (
      policyLower.includes("permissive") ||
      networkMode === "allow_all" ||
      a.policyName === null // no policy = no restrictions = permissive by default
    );
  });

  const secureAgents = agentPosture.filter((a) => {
    const policyLower = (a.policyName || "").toLowerCase();
    const networkMode = (a.networkMode || "").toLowerCase();
    return (
      a.policyName !== null &&
      !policyLower.includes("permissive") &&
      networkMode !== "allow_all"
    );
  });

  items.push({
    type: "config_check",
    title: "Per-Agent Security Posture Analysis",
    description: `${secureAgents.length} of ${totalAgents} agent(s) enforce least-functionality policies. ${flaggedAgents.length} agent(s) flagged.`,
    passed: totalAgents > 0 && flaggedAgents.length === 0,
    data: {
      totalAgents,
      secureCount: secureAgents.length,
      flaggedCount: flaggedAgents.length,
      agentDetails: agentPosture.map((a) => {
        const policyLower = (a.policyName || "").toLowerCase();
        const networkMode = (a.networkMode || "").toLowerCase();
        const isFlagged =
          policyLower.includes("permissive") ||
          networkMode === "allow_all" ||
          a.policyName === null;

        return {
          name: a.clawName,
          status: a.clawStatus,
          policy: a.policyName || "NONE",
          networkMode: a.networkMode || "N/A",
          allowedProviders: a.allowedProviders || "unrestricted",
          minSkillSecurityScore: a.minSkillSecurityScore || "not set",
          flagged: isFlagged,
          flagReason: isFlagged
            ? a.policyName === null
              ? "No policy template assigned"
              : policyLower.includes("permissive")
                ? "Uses Permissive policy template"
                : networkMode === "allow_all"
                  ? "Network mode is allow_all (unrestricted outbound access)"
                  : undefined
            : undefined,
        };
      }),
      flaggedAgentNames: flaggedAgents.map((a) => a.clawName),
    },
    sampleSize: totalAgents,
    totalRecords: totalAgents,
  });

  // Summary statistics item
  const policyBreakdown: Record<string, number> = {};
  for (const a of agentPosture) {
    const key = a.policyName || "No Policy";
    policyBreakdown[key] = (policyBreakdown[key] || 0) + 1;
  }

  const networkModeBreakdown: Record<string, number> = {};
  for (const a of agentPosture) {
    const key = a.networkMode || "N/A (no policy)";
    networkModeBreakdown[key] = (networkModeBreakdown[key] || 0) + 1;
  }

  items.push({
    type: "system_check",
    title: "Functionality Restriction Summary",
    description: `Policy distribution and network mode breakdown across all agents.`,
    passed: flaggedAgents.length === 0 && totalAgents > 0,
    data: {
      policyDistribution: policyBreakdown,
      networkModeDistribution: networkModeBreakdown,
      leastFunctionalityMet: flaggedAgents.length === 0 && totalAgents > 0,
    },
  });

  // Determine status
  let status: CollectedEvidence["status"];
  if (totalAgents === 0) {
    status = "fail";
  } else if (flaggedAgents.length === 0) {
    status = "pass";
  } else {
    // Any flagged agent means fail for least functionality
    status = "fail";
  }

  const summaryParts: string[] = [];
  if (totalAgents === 0) {
    summaryParts.push("No claw agents deployed");
  } else {
    summaryParts.push(`${totalAgents} agent(s) analyzed`);
    if (flaggedAgents.length > 0) {
      summaryParts.push(
        `${flaggedAgents.length} agent(s) violate least-functionality (${flaggedAgents.map((a) => a.clawName).join(", ")})`,
      );
    } else {
      summaryParts.push("all agents enforce restrictive or standard policies");
    }
  }

  return {
    controlId: "CM.2.064",
    framework: "cmmc",
    controlType: "configurable",
    status,
    summary: summaryParts.join("; ") + ".",
    items,
    requiredActions: [
      "Apply restrictive policies to production agents: Go to Claw Fleet, for each production agent, assign the 'Standard' or 'Restrictive' policy template. The Restrictive template blocks all outbound network access and limits to local AI models only \u2014 ideal for CUI-handling agents.",
      "Review agent functionality: In Claw Fleet, for each agent review the installed skills list. Remove any skills not required for the agent's specific function. The principle of least functionality means agents should only have the capabilities they need.",
    ],
    collectedAt: now,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Collect evidence for a specific CM control.
 *
 * @param orgId      Organization ID
 * @param controlId  Control identifier (e.g. "CM.2.061")
 * @returns          Collected evidence with real database data
 */
export async function collectCmEvidence(
  orgId: string,
  controlId: string,
): Promise<CollectedEvidence> {
  const id = controlId.toUpperCase();
  logger.info(`Collecting CM evidence for ${id} (org: ${orgId})`, undefined, SOURCE);

  switch (id) {
    case "CM.2.061":
      return collectCm2061(orgId);
    case "CM.2.062":
      return collectCm2062(orgId);
    case "CM.2.064":
      return collectCm2064(orgId);
    default:
      throw new Error(`Unknown CM control: ${controlId}. Supported: CM.2.061, CM.2.062, CM.2.064`);
  }
}
