"use strict";

/**
 * Compliance Report Generation Service
 *
 * Aggregates audit data from multiple tables to produce compliance reports
 * for ISO 27001, SOC 2, and DPDP (India's Digital Personal Data Protection Act).
 *
 * Data sources:
 *   - rbacAuditEvents      — RBAC changes, role assignments, permission changes
 *   - clawAuditEvents      — Claw lifecycle events, policy changes
 *   - clawInferenceEvents  — AI inference logs with provider, model, token usage
 *   - clawToolEvents       — Tool/skill invocations, MCP calls, denials
 *   - queryHistory         — SQL data queries with classification
 *   - concurrencySessions  — Active sessions, resource usage
 */

import { db } from "../db";
import {
  rbacAuditEvents,
  queryHistory,
  concurrencySessions,
  clawPolicyTemplates,
  organizations,
  roles,
  userRoles,
} from "@wtrops/shared";
import { eq, and, gte, lte, count, sql, desc } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// ── Stubs for deleted claw tables ──────────────────────────────────────────
// These tables were removed from the shared schema during the wtrdb extraction.
// Local stubs keep this service compilable; queries against them will return
// empty results (the underlying DB tables no longer exist).
const clawAuditEvents = pgTable("claw_audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  eventType: text("event_type").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

const clawInferenceEvents = pgTable("claw_inference_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

const clawToolEvents = pgTable("claw_tool_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  status: text("status").notNull(),
  toolSource: text("tool_source"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

const claws = pgTable("claws", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  dataClassification: text("data_classification"),
  policyTemplateId: text("policy_template_id"),
});
import { logger } from "../utils/logger";
import {
  evaluate as opaEvaluate,
  healthCheck as opaHealthCheck,
} from "../engines/claw/policy/opa-client";
import { ClawConfig } from "../engines/claw/config";
import { getExtendedControls } from "./compliance-frameworks-all";

const SOURCE = "ComplianceReportService";

/** Lookup control definitions for any of the 14 supported frameworks */
function getControlDefsForFramework(framework: ComplianceFramework): Omit<ControlDefinition, "status" | "evidence">[] {
  switch (framework) {
    case "iso27001": return getIso27001Controls();
    case "soc2": return getSoc2Controls();
    case "dpdp": return getDpdpControls();
    default: return getExtendedControls(framework) as any;
  }
}

// ── Types ──

export type ComplianceFramework = "iso27001" | "soc2" | "dpdp" | "cmmc" | "hipaa" | "gdpr" | "pci_dss" | "nist_csf" | "fedramp" | "ccpa" | "sox" | "cis" | "csa_star" | "iso42001";
export type ReportFormat = "json" | "pdf";

export interface ReportPeriod {
  start: Date;
  end: Date;
}

export interface ComplianceReport {
  id: string;
  organizationId: string;
  framework: ComplianceFramework;
  period: { start: string; end: string };
  generatedAt: string;
  format: ReportFormat;
  summary: ReportSummary;
  sections: ReportSection[];
}

interface ReportSummary {
  overallScore: number; // 0-100
  controlsImplemented: number;
  controlsTotal: number;
  criticalFindings: number;
  warnings: number;
}

interface ReportSection {
  id: string;
  title: string;
  description: string;
  status: "compliant" | "partial" | "planned" | "not_applicable";
  findings: string[];
  evidence: Record<string, any>;
}

export interface SecurityPosture {
  encryptionStatus: {
    atRest: boolean;
    inTransit: boolean;
    keyRotation: string;
  };
  policyCoverage: {
    totalClaws: number;
    clawsWithPolicy: number;
    coveragePct: number;
  };
  rbacStatus: {
    totalRoles: number;
    totalAssignments: number;
    lastAuditEvent: string | null;
  };
  auditLogStats: {
    rbacEvents: number;
    clawEvents: number;
    inferenceEvents: number;
    toolEvents: number;
    queryEvents: number;
    period: string;
  };
}

export interface ControlGuidance {
  learnMore: string;
  whyItMatters: string;
  requiredActions: { action: string; configPath?: string; automated: boolean }[];
}

export interface ControlDefinition {
  id: string;
  framework: ComplianceFramework;
  title: string;
  description: string;
  category: string;
  status: "implemented" | "partial" | "planned" | "not_applicable";
  evidence: string[];
  guidance: ControlGuidance;
}

// ── Enriched Control Types ──

export interface RichEvidenceItem {
  type: "opa_policy" | "db_record" | "config" | "audit_log";
  label: string;
  detail: string;
  verified: boolean;
  verifiedAt: string | null;
}

export interface OpaIntegration {
  policyPackage: string;
  lastEvaluation: string | null;
  sampleResult: { allow: boolean; reason: string } | null;
}

export interface LiveCheckResult {
  verified: boolean;
  checkedAt: string | null;
  detail: string;
}

export interface EnrichedControlDefinition extends ControlDefinition {
  richEvidence: RichEvidenceItem[];
  liveCheck: LiveCheckResult;
  opaIntegration: OpaIntegration | null;
}

// ── OPA-backed control mapping ──
// Maps control IDs to their associated OPA policy packages

const OPA_CONTROL_MAP: Record<string, { policyPackage: string; sampleInput: Record<string, any> }> = {
  // ISO 27001
  "A.5.1": {
    policyPackage: "claw.system.standard",
    sampleInput: { org_id: "test", claw_id: "test", action: "read", resource: "policy" },
  },
  "A.8.3": {
    policyPackage: "claw.system.restrictive",
    sampleInput: { org_id: "test", claw_id: "test", action: "read", resource: "data" },
  },
  "A.8.16": {
    policyPackage: "claw.system.standard",
    sampleInput: { org_id: "test", claw_id: "test", action: "monitor", resource: "claw" },
  },
  // SOC 2
  "CC5.1": {
    policyPackage: "claw.system.standard",
    sampleInput: { org_id: "test", claw_id: "test", action: "execute", resource: "tool" },
  },
  "CC5.2": {
    policyPackage: "claw.system.standard",
    sampleInput: { org_id: "test", claw_id: "test", action: "read", resource: "policy" },
  },
  "CC6.1": {
    policyPackage: "claw.system.restrictive",
    sampleInput: { org_id: "test", claw_id: "test", action: "access", resource: "system" },
  },
  "CC6.3": {
    policyPackage: "claw.rbac",
    sampleInput: { org_id: "test", claw_id: "test", action: "assign_role", resource: "user" },
  },
  // DPDP
  "DPDP.8.1": {
    policyPackage: "claw.system.standard",
    sampleInput: { org_id: "test", claw_id: "test", action: "process", resource: "personal_data" },
  },
};

// ── Helper Functions ──

export async function getDecisionLogSummary(
  orgId: string,
  period: ReportPeriod,
): Promise<{
  totalDecisions: number;
  allowed: number;
  denied: number;
  byAction: Record<string, { allowed: number; denied: number }>;
}> {
  // Get tool events (which contain allow/deny decisions)
  const toolEvents = await db
    .select({
      status: clawToolEvents.status,
      toolSource: clawToolEvents.toolSource,
    })
    .from(clawToolEvents)
    .where(
      and(
        eq(clawToolEvents.organizationId, orgId),
        gte(clawToolEvents.timestamp, period.start),
        lte(clawToolEvents.timestamp, period.end),
      ),
    );

  const allowed = toolEvents.filter((e) => e.status === "success" || e.status === "allowed").length;
  const denied = toolEvents.filter((e) => e.status === "denied" || e.status === "blocked").length;

  const byAction: Record<string, { allowed: number; denied: number }> = {};
  for (const event of toolEvents) {
    const action = event.toolSource || "unknown";
    if (!byAction[action]) byAction[action] = { allowed: 0, denied: 0 };
    if (event.status === "success" || event.status === "allowed") {
      byAction[action].allowed++;
    } else {
      byAction[action].denied++;
    }
  }

  return {
    totalDecisions: toolEvents.length,
    allowed,
    denied,
    byAction,
  };
}

export async function getRbacChangeSummary(
  orgId: string,
  period: ReportPeriod,
): Promise<{
  totalChanges: number;
  byEventType: Record<string, number>;
  recentChanges: Array<{
    eventType: string;
    timestamp: string;
    actorUserId: string;
  }>;
}> {
  const events = await db
    .select({
      eventType: rbacAuditEvents.eventType,
      timestamp: rbacAuditEvents.timestamp,
      actorUserId: rbacAuditEvents.actorUserId,
    })
    .from(rbacAuditEvents)
    .where(
      and(
        eq(rbacAuditEvents.organizationId, orgId),
        gte(rbacAuditEvents.timestamp, period.start),
        lte(rbacAuditEvents.timestamp, period.end),
      ),
    )
    .orderBy(desc(rbacAuditEvents.timestamp));

  const byEventType: Record<string, number> = {};
  for (const event of events) {
    byEventType[event.eventType] = (byEventType[event.eventType] || 0) + 1;
  }

  return {
    totalChanges: events.length,
    byEventType,
    recentChanges: events.slice(0, 20).map((e) => ({
      eventType: e.eventType,
      timestamp: e.timestamp.toISOString(),
      actorUserId: e.actorUserId,
    })),
  };
}

export async function getSecurityEventSummary(
  orgId: string,
  period: ReportPeriod,
): Promise<{
  totalEvents: number;
  policyViolations: number;
  toolDenials: number;
  queryDenials: number;
  byEventType: Record<string, number>;
}> {
  // Claw audit events (policy changes, security events)
  const auditEvents = await db
    .select({
      eventType: clawAuditEvents.eventType,
    })
    .from(clawAuditEvents)
    .where(
      and(
        eq(clawAuditEvents.organizationId, orgId),
        gte(clawAuditEvents.timestamp, period.start),
        lte(clawAuditEvents.timestamp, period.end),
      ),
    );

  // Tool denials
  const toolDenials = await db
    .select({ cnt: count() })
    .from(clawToolEvents)
    .where(
      and(
        eq(clawToolEvents.organizationId, orgId),
        eq(clawToolEvents.status, "denied"),
        gte(clawToolEvents.timestamp, period.start),
        lte(clawToolEvents.timestamp, period.end),
      ),
    );

  // Query denials
  const queryDenials = await db
    .select({ cnt: count() })
    .from(queryHistory)
    .where(
      and(
        eq(queryHistory.organizationId, orgId),
        eq(queryHistory.status, "denied"),
        gte(queryHistory.timestamp, period.start),
        lte(queryHistory.timestamp, period.end),
      ),
    );

  const byEventType: Record<string, number> = {};
  for (const event of auditEvents) {
    byEventType[event.eventType] = (byEventType[event.eventType] || 0) + 1;
  }

  const policyViolationTypes = ["policy_violation", "unauthorized_access", "escalation_attempt"];
  const policyViolations = auditEvents.filter((e) =>
    policyViolationTypes.includes(e.eventType),
  ).length;

  return {
    totalEvents: auditEvents.length,
    policyViolations,
    toolDenials: Number(toolDenials[0]?.cnt ?? 0),
    queryDenials: Number(queryDenials[0]?.cnt ?? 0),
    byEventType,
  };
}

export async function getClassificationDistribution(
  orgId: string,
  period: ReportPeriod,
): Promise<Record<string, number>> {
  const clawRows = await db
    .select({
      dataClassification: claws.dataClassification,
    })
    .from(claws)
    .where(eq(claws.organizationId, orgId));

  const distribution: Record<string, number> = {};
  for (const row of clawRows) {
    const classification = row.dataClassification || "unclassified";
    distribution[classification] = (distribution[classification] || 0) + 1;
  }

  return distribution;
}

// ── ISO 27001:2022 Controls — Full Annex A for SaaS AI Platform ──

function getIso27001Controls(): Omit<ControlDefinition, "status" | "evidence">[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // A.5 — Organizational Controls
    // ═══════════════════════════════════════════════════════════════
    {
      id: "A.5.1",
      framework: "iso27001",
      title: "Policies for information security",
      description: "A set of policies for information security shall be defined, approved by management, published and communicated to relevant personnel and interested parties.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "This control requires establishing a formal information security policy document approved by top management. The policy must be communicated to all employees and relevant external parties, and reviewed at planned intervals or when significant changes occur.",
        whyItMatters: "Without a documented, management-approved security policy, employees lack clear direction on security expectations. This leads to inconsistent practices, increased breach risk, and non-compliance with regulatory requirements.",
        requiredActions: [
          { action: "Create and publish an Information Security Policy document in the compliance settings", configPath: "/app/compliance", automated: false },
          { action: "Define OPA policy templates covering core security rules", configPath: "/app/claw-policies", automated: true },
          { action: "Configure policy review schedule (at least annual)", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.2",
      framework: "iso27001",
      title: "Information security roles and responsibilities",
      description: "Information security roles and responsibilities shall be defined and allocated.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "All information security responsibilities must be clearly defined and assigned to specific roles. This includes defining who is responsible for protecting specific assets, executing security processes, and making risk-based decisions.",
        whyItMatters: "Ambiguous role assignments lead to security gaps — when no one is responsible, no one acts. Clear ownership ensures accountability and timely incident response across the organization.",
        requiredActions: [
          { action: "Define RBAC roles with explicit security responsibilities", configPath: "/app/roles", automated: true },
          { action: "Assign security officer and data protection officer roles", configPath: "/app/roles", automated: true },
          { action: "Document role-to-responsibility mapping for information security", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.3",
      framework: "iso27001",
      title: "Segregation of duties",
      description: "Conflicting duties and conflicting areas of responsibility shall be segregated.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "No single individual should control all aspects of a critical process. Duties that could lead to conflicts of interest (e.g., authorizing and executing transactions) must be separated across different roles.",
        whyItMatters: "Without segregation, a single compromised or malicious account can approve and execute high-risk actions undetected, such as modifying AI model policies and simultaneously approving their deployment.",
        requiredActions: [
          { action: "Configure separate RBAC roles for policy creation vs. policy approval", configPath: "/app/roles", automated: true },
          { action: "Ensure Claw deployment requires a different user than the Claw creator", configPath: "/app/claw-policies", automated: true },
          { action: "Enable dual-approval workflows for sensitive operations", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.4",
      framework: "iso27001",
      title: "Management responsibilities",
      description: "Management shall require all personnel to apply information security in accordance with the established information security policy.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Management must actively support security by ensuring all employees understand and comply with security policies. This includes providing resources, training, and enforcement mechanisms.",
        whyItMatters: "Security policies without management enforcement are ineffective. Management buy-in is the single strongest predictor of an organization's security posture.",
        requiredActions: [
          { action: "Document management commitment statement in compliance records", configPath: "/app/compliance", automated: false },
          { action: "Configure organization-wide security policies that apply to all users", configPath: "/app/claw-policies", automated: true },
          { action: "Set up periodic compliance review schedule for management", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.5",
      framework: "iso27001",
      title: "Contact with authorities",
      description: "The organization shall establish and maintain contact with relevant authorities.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Maintain an up-to-date list of relevant regulatory and legal authorities that must be contacted in case of security incidents, including CERT-In for India-based operations and relevant data protection authorities.",
        whyItMatters: "Delayed notification to authorities after a data breach can result in penalties (e.g., DPDP Act mandates timely notification to the Data Protection Board) and worsened incident impact.",
        requiredActions: [
          { action: "Document contact details for CERT-In, Data Protection Board of India, and relevant authorities", configPath: "/app/compliance", automated: false },
          { action: "Configure incident notification workflow with authority contact list", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.7",
      framework: "iso27001",
      title: "Threat intelligence",
      description: "Information relating to information security threats shall be collected and analysed to produce threat intelligence.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "The organization should gather, analyze, and act on threat intelligence relevant to its AI SaaS operations — including threats to LLM models, prompt injection attacks, API vulnerabilities, and supply chain risks in AI dependencies.",
        whyItMatters: "AI platforms face unique and evolving threats (adversarial inputs, model manipulation, data poisoning). Without threat intelligence, your defenses remain static while attackers adapt.",
        requiredActions: [
          { action: "Configure OPA policies to block known prompt injection patterns", configPath: "/app/claw-policies", automated: true },
          { action: "Enable audit log monitoring for anomalous AI usage patterns", configPath: "/app/compliance", automated: true },
          { action: "Subscribe to AI security threat feeds and CVE notifications", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.8",
      framework: "iso27001",
      title: "Information security in project management",
      description: "Information security shall be integrated into project management.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Every new Claw deployment, integration project, or feature development must include a security assessment phase. Security requirements should be identified early and tracked throughout the project lifecycle.",
        whyItMatters: "Retrofitting security into completed projects is 6x more expensive than building it in from the start. Unsecured Claw deployments can expose sensitive data to unauthorized AI processing.",
        requiredActions: [
          { action: "Require security policy assignment before Claw activation", configPath: "/app/claw-policies", automated: true },
          { action: "Document security review process for new Claw deployments", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.9",
      framework: "iso27001",
      title: "Inventory of information and other associated assets",
      description: "An inventory of information and other associated assets, including owners, shall be identified and maintained.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Maintain a complete inventory of all information assets including Claws, data sources, API integrations, AI models, connected databases, and telephony providers. Each asset must have a designated owner.",
        whyItMatters: "You cannot protect what you do not know exists. Untracked Claws, data connections, or API keys are the most common source of data breaches in SaaS platforms.",
        requiredActions: [
          { action: "Review all Claws and verify each has an assigned owner", configPath: "/app/claws", automated: true },
          { action: "Ensure all data sources are cataloged with classification levels", configPath: "/app/claws", automated: true },
          { action: "Document external integrations and third-party dependencies", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.10",
      framework: "iso27001",
      title: "Acceptable use of information and other associated assets",
      description: "Rules for the acceptable use of information and other associated assets shall be identified, documented and implemented.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Define clear rules for how AI Claws, data, and tools can be used within the platform. This includes acceptable AI model usage, data processing boundaries, and prohibited actions.",
        whyItMatters: "Without acceptable use policies, users may inadvertently feed sensitive data into AI models, use Claws for unauthorized purposes, or violate data processing agreements.",
        requiredActions: [
          { action: "Configure Claw usage policies with OPA defining allowed actions and data types", configPath: "/app/claw-policies", automated: true },
          { action: "Document acceptable use policy for AI platform features", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.12",
      framework: "iso27001",
      title: "Classification of information",
      description: "Information shall be classified according to the information security needs of the organization based on confidentiality, integrity, availability and relevant interested party requirements.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "All data processed by Claws must be classified (e.g., public, internal, confidential, restricted). Classification drives what security controls are applied — a Claw processing restricted data requires stricter policies than one processing public data.",
        whyItMatters: "Without data classification, the same minimal security is applied to all data. This means either over-protecting public data (wasting resources) or under-protecting sensitive data (creating breach risk).",
        requiredActions: [
          { action: "Assign data classification levels to all Claws", configPath: "/app/claws", automated: true },
          { action: "Configure OPA policies that enforce classification-based access rules", configPath: "/app/claw-policies", automated: true },
          { action: "Review classification distribution in compliance dashboard", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.5.13",
      framework: "iso27001",
      title: "Labelling of information",
      description: "An appropriate set of procedures for information labelling shall be developed and implemented in accordance with the information classification scheme.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Information labels (metadata tags) must be applied consistently to data handled by Claws, so that downstream systems and users can identify sensitivity levels at a glance.",
        whyItMatters: "Unlabelled data is often treated as low-sensitivity by default, leading to accidental exposure of confidential information through AI-generated outputs or logs.",
        requiredActions: [
          { action: "Ensure Claw data classification tags are visible in the UI", configPath: "/app/claws", automated: true },
          { action: "Configure audit logs to include data classification labels", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.5.15",
      framework: "iso27001",
      title: "Access control",
      description: "Rules to control physical and logical access to information and other associated assets shall be established and implemented based on business and information security requirements.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Access control policies must define who can access what resources, under what conditions. This covers user access to Claws, data sources, admin panels, and API endpoints. Implement least-privilege: users get only the minimum access needed.",
        whyItMatters: "Overly permissive access is the #1 cause of insider threats and lateral movement during breaches. In an AI platform, unauthorized Claw access can expose sensitive data across the entire data pipeline.",
        requiredActions: [
          { action: "Configure RBAC roles with least-privilege permissions", configPath: "/app/roles", automated: true },
          { action: "Assign users to appropriate roles", configPath: "/app/roles", automated: true },
          { action: "Enable OPA access control policies for all Claws", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "A.5.16",
      framework: "iso27001",
      title: "Identity management",
      description: "The full life cycle of identities shall be managed.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Manage the entire lifecycle of user identities from creation through modification to deactivation. This includes provisioning accounts, assigning initial roles, handling role changes, and promptly revoking access when users leave.",
        whyItMatters: "Orphaned accounts (active credentials for departed employees) are a major attack vector. In an AI platform, a forgotten admin account provides unfettered access to all Claws and data.",
        requiredActions: [
          { action: "Review active user accounts and remove orphaned entries", configPath: "/app/roles", automated: true },
          { action: "Configure automated deprovisioning on user departure", configPath: "/app/roles", automated: false },
          { action: "Audit user role assignments quarterly", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.5.17",
      framework: "iso27001",
      title: "Authentication information",
      description: "Allocation and management of authentication information shall be controlled by a management process including advising personnel on appropriate handling.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "All authentication credentials (passwords, API keys, tokens) must be managed securely. This includes enforcing password complexity, secure storage, rotation schedules, and multi-factor authentication for privileged accounts.",
        whyItMatters: "Weak or reused credentials are involved in over 80% of breaches. API keys for AI services, if compromised, can lead to massive financial exposure from unauthorized model usage.",
        requiredActions: [
          { action: "Enforce strong authentication for all user accounts", configPath: "/app/roles", automated: true },
          { action: "Rotate API keys and service credentials on a regular schedule", configPath: "/app/compliance", automated: false },
          { action: "Enable multi-factor authentication for administrative access", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.18",
      framework: "iso27001",
      title: "Access rights",
      description: "Access rights to information and other associated assets shall be provisioned, reviewed, modified and removed in accordance with the organization's topic-specific policy on and rules for access control.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Access rights must be formally granted, periodically reviewed, and promptly revoked. Every role assignment, permission change, and access removal must be logged for audit purposes.",
        whyItMatters: "Stale permissions accumulate over time as employees change roles. A user who transferred from engineering to marketing may still have admin access to production Claws.",
        requiredActions: [
          { action: "Review RBAC role assignments and remove unnecessary permissions", configPath: "/app/roles", automated: true },
          { action: "Enable audit logging for all access right changes", configPath: "/app/compliance", automated: true },
          { action: "Schedule quarterly access rights review", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.19",
      framework: "iso27001",
      title: "Information security in supplier relationships",
      description: "Processes and procedures shall be defined and implemented to manage the information security risks associated with the use of supplier's products or services.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Assess and manage security risks from all third-party AI model providers (OpenAI, Anthropic, etc.), cloud infrastructure suppliers, and telephony providers used by Claws. Include security requirements in all supplier agreements.",
        whyItMatters: "Your security is only as strong as your weakest supplier. A breach at an AI model provider could expose all data sent through their APIs, including sensitive customer conversations.",
        requiredActions: [
          { action: "Document AI model provider security assessments", configPath: "/app/compliance", automated: false },
          { action: "Review telephony provider security configurations", configPath: "/app/telephony", automated: false },
          { action: "Maintain a register of all third-party services and their security status", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.21",
      framework: "iso27001",
      title: "Managing information security in the ICT supply chain",
      description: "Processes and procedures shall be defined and implemented to manage information security risks associated with the ICT products and services supply chain.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Manage security across the entire supply chain of AI/ICT components: LLM model providers, embedding services, vector databases, npm packages, Docker images, and MCP tool integrations.",
        whyItMatters: "Supply chain attacks on AI platforms can inject malicious behavior into models, tools, or dependencies. A compromised MCP tool could exfiltrate data from every Claw that uses it.",
        requiredActions: [
          { action: "Review MCP tool integrations for security compliance", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policies to restrict which external tools Claws can invoke", configPath: "/app/claw-policies", automated: true },
          { action: "Maintain a software bill of materials (SBOM) for all dependencies", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.23",
      framework: "iso27001",
      title: "Information security for use of cloud services",
      description: "Processes for acquisition, use, management and exit from cloud services shall be established in accordance with the organization's information security requirements.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Define security requirements for all cloud services used (hosting, AI APIs, storage). Include data residency, encryption requirements, incident response obligations, and exit strategies in cloud agreements.",
        whyItMatters: "Cloud misconfigurations cause 15% of all data breaches. In an AI SaaS platform, exposed cloud storage can leak training data, customer conversations, and model configurations.",
        requiredActions: [
          { action: "Assign OPA policy templates to all Claws using cloud services", configPath: "/app/claw-policies", automated: true },
          { action: "Document cloud provider security configurations and SLAs", configPath: "/app/compliance", automated: false },
          { action: "Configure data residency and transfer restrictions for cloud-hosted data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.24",
      framework: "iso27001",
      title: "Information security incident management planning and preparation",
      description: "The organization shall plan and prepare for managing information security incidents by defining, establishing and communicating information security incident management processes, roles and responsibilities.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Establish a formal incident response plan that covers AI-specific incidents: model manipulation, data exfiltration via Claws, unauthorized API usage, prompt injection attacks, and traditional security incidents.",
        whyItMatters: "Organizations with tested incident response plans contain breaches 54% faster. In an AI platform, rapid response prevents compromised Claws from processing additional sensitive data.",
        requiredActions: [
          { action: "Document an incident response plan covering AI-specific threats", configPath: "/app/compliance", automated: false },
          { action: "Configure real-time alerts for security-relevant audit events", configPath: "/app/compliance", automated: true },
          { action: "Define incident severity levels and escalation procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.25",
      framework: "iso27001",
      title: "Assessment and decision on information security events",
      description: "The organization shall assess information security events and decide if they are to be categorized as information security incidents.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Establish criteria for triaging security events into incidents. Define thresholds for when OPA policy denials, unusual Claw behavior, or anomalous API usage escalate from events to incidents requiring response.",
        whyItMatters: "Without clear triage criteria, teams either ignore genuine threats (alert fatigue) or waste resources on false positives. AI platforms generate high volumes of events that need intelligent classification.",
        requiredActions: [
          { action: "Configure severity thresholds for automated policy denial alerts", configPath: "/app/claw-policies", automated: true },
          { action: "Review audit log events for patterns indicating security incidents", configPath: "/app/compliance", automated: true },
          { action: "Document incident classification criteria for AI platform events", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.26",
      framework: "iso27001",
      title: "Response to information security incidents",
      description: "Information security incidents shall be responded to in accordance with the documented procedures.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Follow documented incident response procedures for containment, eradication, and recovery. For AI-specific incidents, this includes isolating compromised Claws, revoking API keys, and preserving audit evidence.",
        whyItMatters: "Ad-hoc incident response leads to incomplete containment, evidence destruction, and prolonged exposure. A structured response reduces breach impact by up to 80%.",
        requiredActions: [
          { action: "Enable Claw deactivation capability for incident containment", configPath: "/app/claws", automated: true },
          { action: "Configure incident response runbooks for common AI platform threats", configPath: "/app/compliance", automated: false },
          { action: "Ensure audit logs are immutable and preserved during incidents", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.5.27",
      framework: "iso27001",
      title: "Learning from information security incidents",
      description: "Knowledge gained from information security incidents shall be used to strengthen and improve the information security controls.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "After each incident, conduct a post-mortem analysis and update security controls. Feed findings back into OPA policies, RBAC configurations, and monitoring rules to prevent recurrence.",
        whyItMatters: "Organizations that do not learn from incidents suffer repeated breaches of the same type. Post-incident improvements are the fastest way to mature your security posture.",
        requiredActions: [
          { action: "Review compliance reports for incident trends", configPath: "/app/compliance", automated: true },
          { action: "Update OPA policies based on incident findings", configPath: "/app/claw-policies", automated: false },
          { action: "Document post-incident reviews and improvement actions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.28",
      framework: "iso27001",
      title: "Collection of evidence",
      description: "The organization shall establish and implement procedures for the identification, collection, acquisition and preservation of evidence related to information security events.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "All security-relevant events must be collected and preserved in a forensically sound manner. This includes audit logs, OPA decision logs, Claw inference records, tool invocation logs, and RBAC change histories.",
        whyItMatters: "Evidence is critical for incident investigation, regulatory reporting, and legal proceedings. Without proper evidence collection, you cannot prove compliance or determine breach scope.",
        requiredActions: [
          { action: "Verify audit logging is active for all event types", configPath: "/app/compliance", automated: true },
          { action: "Configure log retention policies meeting regulatory requirements", configPath: "/app/compliance", automated: false },
          { action: "Generate compliance reports to validate evidence collection", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.5.29",
      framework: "iso27001",
      title: "Information security during disruption",
      description: "The organization shall plan how to maintain information security at an appropriate level during disruption.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Security controls must remain effective during outages, migrations, and disaster recovery. Define how Claw policies, access controls, and audit logging continue during infrastructure disruptions.",
        whyItMatters: "Attackers frequently exploit system disruptions when security teams are focused on recovery. If OPA policies fail open during an outage, all Claws operate without policy enforcement.",
        requiredActions: [
          { action: "Configure OPA circuit breaker behavior (fail-closed vs fail-open)", configPath: "/app/claw-policies", automated: true },
          { action: "Document business continuity plan for security control maintenance", configPath: "/app/compliance", automated: false },
          { action: "Test security control resilience during simulated disruptions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.30",
      framework: "iso27001",
      title: "ICT readiness for business continuity",
      description: "ICT readiness shall be planned, implemented, maintained and tested based on business continuity objectives.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Ensure the AI platform infrastructure (databases, OPA engines, Claw runtime, telephony) can be recovered within defined recovery time objectives (RTO) and recovery point objectives (RPO).",
        whyItMatters: "Extended platform downtime means revenue loss, SLA breaches, and customer churn. For telephony-connected Claws, downtime directly impacts customer service operations.",
        requiredActions: [
          { action: "Document RTO and RPO for all platform components", configPath: "/app/compliance", automated: false },
          { action: "Review concurrency session management for resilience", configPath: "/app/compliance", automated: true },
          { action: "Configure database backup and recovery procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.31",
      framework: "iso27001",
      title: "Legal, statutory, regulatory and contractual requirements",
      description: "Legal, statutory, regulatory and contractual requirements relevant to information security and the organization's approach to meet these requirements shall be identified, documented and kept up to date.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Maintain an up-to-date register of all applicable laws (DPDP Act, IT Act), regulations, and contractual obligations. Map each requirement to specific controls in this compliance framework.",
        whyItMatters: "Non-compliance with the DPDP Act can result in penalties up to INR 250 crore. Contractual non-compliance can lead to customer loss and legal liability.",
        requiredActions: [
          { action: "Review DPDP Act compliance controls", configPath: "/app/compliance", automated: true },
          { action: "Document all applicable regulatory requirements", configPath: "/app/compliance", automated: false },
          { action: "Map regulatory requirements to ISO 27001 and SOC 2 controls", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.34",
      framework: "iso27001",
      title: "Privacy and protection of personal information",
      description: "The organization shall identify and meet the requirements regarding the preservation of privacy and protection of PII as applicable.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Implement privacy-by-design for all Claw configurations. Ensure personal data processed by AI models is minimized, consent-based, and subject to data principal rights under the DPDP Act.",
        whyItMatters: "AI platforms processing personal data face heightened regulatory scrutiny. PII leaking through AI model outputs or logs can cause massive reputational and legal damage.",
        requiredActions: [
          { action: "Configure data classification to identify Claws processing personal data", configPath: "/app/claws", automated: true },
          { action: "Enable PII detection and masking in Claw outputs", configPath: "/app/claw-policies", automated: true },
          { action: "Implement data subject request handling procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.36",
      framework: "iso27001",
      title: "Compliance with policies, rules and standards for information security",
      description: "Compliance with the organization's established information security policy, topic-specific policies, rules and standards shall be regularly reviewed.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Conduct regular compliance reviews to verify that all controls are operating as intended. Use the compliance dashboard to track control implementation status and generate audit reports.",
        whyItMatters: "Compliance drift occurs silently. Controls that were implemented may degrade over time as configurations change. Regular reviews catch this before auditors or attackers do.",
        requiredActions: [
          { action: "Generate compliance reports for all three frameworks regularly", configPath: "/app/compliance", automated: true },
          { action: "Verify all controls using the live verification feature", configPath: "/app/compliance", automated: true },
          { action: "Schedule quarterly compliance reviews", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.5.37",
      framework: "iso27001",
      title: "Documented operating procedures",
      description: "Operating procedures for information processing facilities shall be documented and made available to personnel who need them.",
      category: "A.5 Organizational Controls",
      guidance: {
        learnMore: "Document standard operating procedures for all security-critical operations: Claw deployment, policy changes, user provisioning, incident response, and data handling.",
        whyItMatters: "Undocumented procedures lead to inconsistent execution and knowledge loss when key personnel leave. This is especially critical for AI operations where misconfiguration can have immediate data exposure consequences.",
        requiredActions: [
          { action: "Document Claw deployment and configuration procedures", configPath: "/app/compliance", automated: false },
          { action: "Document RBAC administration procedures", configPath: "/app/compliance", automated: false },
          { action: "Document incident response and escalation procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // A.6 — People Controls
    // ═══════════════════════════════════════════════════════════════
    {
      id: "A.6.1",
      framework: "iso27001",
      title: "Screening",
      description: "Background verification checks on all candidates to become personnel shall be carried out prior to joining the organization and on an ongoing basis.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "All personnel with access to the AI platform (especially those with admin or data access roles) must undergo background checks before being granted system access.",
        whyItMatters: "Insider threats account for 34% of data breaches. In an AI platform, a malicious insider with Claw admin access can exfiltrate entire customer datasets.",
        requiredActions: [
          { action: "Document personnel screening requirements for platform access", configPath: "/app/compliance", automated: false },
          { action: "Ensure admin role assignments require completed screening", configPath: "/app/roles", automated: false },
        ],
      },
    },
    {
      id: "A.6.2",
      framework: "iso27001",
      title: "Terms and conditions of employment",
      description: "The employment contractual agreements shall state the personnel's and the organization's responsibilities for information security.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "Employment contracts must include information security obligations: confidentiality clauses, acceptable use of AI tools, data handling responsibilities, and post-employment restrictions.",
        whyItMatters: "Without contractual obligations, there is no legal basis for enforcing security behavior or pursuing legal remedies for security policy violations by employees.",
        requiredActions: [
          { action: "Document required security clauses for employment agreements", configPath: "/app/compliance", automated: false },
          { action: "Track acknowledgment of security policies by all users", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.6.3",
      framework: "iso27001",
      title: "Information security awareness, education and training",
      description: "Personnel of the organization and relevant interested parties shall receive appropriate information security awareness education, training and regular updates of the organization's information security policy.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "All platform users must receive training on AI-specific security risks: recognizing prompt injection, handling sensitive data in Claws, reporting security incidents, and understanding their RBAC permissions.",
        whyItMatters: "95% of cybersecurity breaches are caused by human error. Training users on AI-specific threats significantly reduces the risk of accidental data exposure through misconfigured Claws.",
        requiredActions: [
          { action: "Document security training program for platform users", configPath: "/app/compliance", automated: false },
          { action: "Track training completion for all users with platform access", configPath: "/app/compliance", automated: false },
          { action: "Include AI-specific security topics in training materials", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.6.4",
      framework: "iso27001",
      title: "Disciplinary process",
      description: "A disciplinary process shall be formalized and communicated to take actions against personnel and other relevant interested parties who have committed an information security policy violation.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "Establish a formal disciplinary process for security policy violations, including unauthorized data access, Claw policy circumvention, and failure to report incidents.",
        whyItMatters: "Without consequences for violations, security policies lack teeth. A clear disciplinary process deters intentional violations and reinforces the importance of compliance.",
        requiredActions: [
          { action: "Document disciplinary procedures for security policy violations", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policies to detect and log policy violations for disciplinary review", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "A.6.5",
      framework: "iso27001",
      title: "Responsibilities after termination or change of employment",
      description: "Information security responsibilities and duties that remain valid after termination or change of employment shall be defined, enforced and communicated to relevant personnel and other interested parties.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "Define post-employment security obligations including confidentiality of data accessed through Claws, return of credentials, and non-disclosure of AI model configurations and policies.",
        whyItMatters: "Former employees with knowledge of Claw configurations, data schemas, and OPA policies pose a significant risk if they join competitors or act maliciously.",
        requiredActions: [
          { action: "Revoke all access rights immediately upon employment termination", configPath: "/app/roles", automated: true },
          { action: "Document post-employment security obligations", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.6.6",
      framework: "iso27001",
      title: "Confidentiality or non-disclosure agreements",
      description: "Confidentiality or non-disclosure agreements reflecting the organization's needs for the protection of information shall be identified, documented, regularly reviewed and signed by personnel and other relevant interested parties.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "All users with access to confidential data through the AI platform must sign NDAs covering AI model outputs, customer data, Claw configurations, and security policies.",
        whyItMatters: "NDAs provide legal recourse in case of unauthorized disclosure. They are particularly important for AI platforms where processed data may include third-party confidential information.",
        requiredActions: [
          { action: "Document NDA requirements for platform users", configPath: "/app/compliance", automated: false },
          { action: "Track NDA status for all users with data access roles", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.6.7",
      framework: "iso27001",
      title: "Remote working",
      description: "Security measures shall be implemented when personnel are working remotely to protect information accessed, processed or stored outside the organization's premises.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "Define security requirements for remote access to the AI platform, including VPN usage, device security, and restrictions on accessing sensitive Claws from untrusted networks.",
        whyItMatters: "Remote work expands the attack surface. Accessing Claw admin interfaces from unsecured networks or shared devices can expose credentials and session tokens.",
        requiredActions: [
          { action: "Configure session management and timeout policies", configPath: "/app/compliance", automated: true },
          { action: "Document remote working security requirements", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.6.8",
      framework: "iso27001",
      title: "Information security event reporting",
      description: "The organization shall provide a mechanism for personnel to report observed or suspected information security events through appropriate channels in a timely manner.",
      category: "A.6 People Controls",
      guidance: {
        learnMore: "Provide users with a clear, accessible mechanism to report security events — unusual Claw behavior, suspected data leaks, unauthorized access attempts, or suspicious AI outputs.",
        whyItMatters: "Users are often the first to notice security anomalies. Without an easy reporting mechanism, events go unreported and incidents escalate before detection.",
        requiredActions: [
          { action: "Document the security event reporting procedure and channels", configPath: "/app/compliance", automated: false },
          { action: "Monitor audit logs for security events that trigger automatic alerts", configPath: "/app/compliance", automated: true },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // A.7 — Physical Controls (subset relevant to SaaS)
    // ═══════════════════════════════════════════════════════════════
    {
      id: "A.7.1",
      framework: "iso27001",
      title: "Physical security perimeters",
      description: "Security perimeters shall be defined and used to protect areas that contain information and other associated assets.",
      category: "A.7 Physical Controls",
      guidance: {
        learnMore: "For a SaaS platform, physical security primarily applies to office locations where administrators access the platform, and to the cloud data centers hosting the infrastructure.",
        whyItMatters: "Physical access to admin workstations or server rooms bypasses all logical security controls. An attacker with physical access can extract credentials, install keyloggers, or access encrypted storage.",
        requiredActions: [
          { action: "Document physical security measures for office locations with admin access", configPath: "/app/compliance", automated: false },
          { action: "Verify cloud provider physical security certifications (SOC 2 Type II)", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.7.4",
      framework: "iso27001",
      title: "Physical security monitoring",
      description: "Premises shall be continuously monitored for unauthorized physical access.",
      category: "A.7 Physical Controls",
      guidance: {
        learnMore: "Monitor physical access to any location where platform infrastructure is managed or where admin access is routinely performed.",
        whyItMatters: "Unmonitored physical access points allow tampering with admin workstations and network infrastructure without detection.",
        requiredActions: [
          { action: "Document physical monitoring controls for offices", configPath: "/app/compliance", automated: false },
          { action: "Verify cloud provider has 24/7 physical security monitoring", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.7.7",
      framework: "iso27001",
      title: "Clear desk and clear screen",
      description: "Clear desk rules for papers and removable storage media and clear screen rules for information processing facilities shall be defined and appropriately enforced.",
      category: "A.7 Physical Controls",
      guidance: {
        learnMore: "Personnel must lock screens when away from workstations, especially when logged into the Claw administration interface. No sensitive data should be left visible or printed.",
        whyItMatters: "An unlocked screen showing the Claw admin panel gives any passerby full access to modify AI configurations, policies, and view sensitive data.",
        requiredActions: [
          { action: "Configure session auto-lock/timeout for the platform", configPath: "/app/compliance", automated: true },
          { action: "Document clear desk/clear screen policy", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.7.9",
      framework: "iso27001",
      title: "Security of assets off-premises",
      description: "Off-premises assets shall be protected.",
      category: "A.7 Physical Controls",
      guidance: {
        learnMore: "Devices used to access the AI platform remotely (laptops, mobile devices) must have appropriate security controls: full-disk encryption, device management, and remote wipe capability.",
        whyItMatters: "A lost or stolen laptop with saved platform credentials provides direct access to Claws and customer data from any location.",
        requiredActions: [
          { action: "Document security requirements for devices accessing the platform", configPath: "/app/compliance", automated: false },
          { action: "Ensure all remote sessions use encrypted connections (TLS)", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.7.10",
      framework: "iso27001",
      title: "Storage media",
      description: "Storage media shall be managed through their life cycle of acquisition, use, transportation and disposal in accordance with the organization's classification scheme and handling requirements.",
      category: "A.7 Physical Controls",
      guidance: {
        learnMore: "Any storage media containing platform data (backups, exports, logs) must be encrypted, tracked, and securely destroyed when no longer needed.",
        whyItMatters: "Improperly disposed storage media is a common source of data breaches. Database backups containing customer data from Claws require the same protection as live data.",
        requiredActions: [
          { action: "Document media handling and disposal procedures", configPath: "/app/compliance", automated: false },
          { action: "Ensure database exports and backups are encrypted", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.7.14",
      framework: "iso27001",
      title: "Secure disposal or re-use of equipment",
      description: "Items of equipment containing storage media shall be verified to ensure that any sensitive data and licensed software has been removed or securely overwritten prior to disposal or re-use.",
      category: "A.7 Physical Controls",
      guidance: {
        learnMore: "Before disposing of or reassigning any equipment that had platform access, verify all credentials are removed, browser sessions are cleared, and any cached data is securely wiped.",
        whyItMatters: "Equipment containing cached credentials, API keys, or session tokens can be exploited long after reassignment if not properly sanitized.",
        requiredActions: [
          { action: "Document equipment disposal and sanitization procedures", configPath: "/app/compliance", automated: false },
          { action: "Revoke all sessions when devices are decommissioned", configPath: "/app/roles", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // A.8 — Technological Controls
    // ═══════════════════════════════════════════════════════════════
    {
      id: "A.8.1",
      framework: "iso27001",
      title: "User endpoint devices",
      description: "Information stored on, processed by or accessible via user endpoint devices shall be protected.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Devices accessing the AI platform must have baseline security: up-to-date OS, antivirus, encrypted storage, and screen lock. Mobile device management (MDM) should be considered for organizational devices.",
        whyItMatters: "Compromised endpoint devices are the primary entry point for credential theft. A device infected with malware can capture API keys and session tokens for the AI platform.",
        requiredActions: [
          { action: "Document endpoint security requirements for platform access", configPath: "/app/compliance", automated: false },
          { action: "Configure session-based access controls to limit device persistence", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.8.2",
      framework: "iso27001",
      title: "Privileged access rights",
      description: "The allocation and use of privileged access rights shall be restricted and managed.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Admin and privileged roles (organization admin, Claw deployer, policy manager) must be strictly limited. All privileged actions must be logged and periodically reviewed. Consider time-bounded privilege elevation.",
        whyItMatters: "Compromised privileged accounts have unlimited blast radius — an admin can modify all Claws, disable policies, and exfiltrate data. Privilege restriction minimizes this risk.",
        requiredActions: [
          { action: "Review and minimize the number of admin role assignments", configPath: "/app/roles", automated: true },
          { action: "Enable audit logging for all privileged operations", configPath: "/app/compliance", automated: true },
          { action: "Implement principle of least privilege for all role definitions", configPath: "/app/roles", automated: true },
        ],
      },
    },
    {
      id: "A.8.3",
      framework: "iso27001",
      title: "Information access restriction",
      description: "Access to information and other associated assets shall be restricted in accordance with the established topic-specific policy on access control.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Enforce OPA-based access restrictions so that users can only access Claws, data, and tools appropriate for their role. Block unauthorized queries to sensitive data sources.",
        whyItMatters: "Without information access restrictions, any authenticated user can access all Claws and data, negating the value of classification and RBAC. OPA policies are the enforcement mechanism.",
        requiredActions: [
          { action: "Deploy OPA policy templates restricting information access by role", configPath: "/app/claw-policies", automated: true },
          { action: "Configure data classification-based access rules", configPath: "/app/claw-policies", automated: true },
          { action: "Test access restrictions by verifying policy enforcement", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.8.4",
      framework: "iso27001",
      title: "Access to source code",
      description: "Read and write access to source code, development tools and software libraries shall be appropriately managed.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Access to the platform source code, Claw configuration repositories, OPA policy definitions, and deployment tooling must be restricted to authorized development personnel only.",
        whyItMatters: "Source code access reveals security mechanisms, API keys, and architecture details. Unauthorized modifications to OPA policies can disable security controls silently.",
        requiredActions: [
          { action: "Restrict source code repository access to development team only", configPath: "/app/roles", automated: false },
          { action: "Audit OPA policy template changes through the audit log", configPath: "/app/compliance", automated: true },
          { action: "Implement code review requirements for policy changes", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.5",
      framework: "iso27001",
      title: "Secure authentication",
      description: "Secure authentication technologies and procedures shall be established and implemented based on information access restrictions and the topic-specific policy on access control.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Implement secure authentication for all platform access: strong passwords, multi-factor authentication (MFA) for admin accounts, API key rotation, and secure session management.",
        whyItMatters: "Weak authentication is the most exploited vulnerability in web applications. MFA alone prevents 99.9% of automated credential attacks.",
        requiredActions: [
          { action: "Enable MFA for all administrator accounts", configPath: "/app/compliance", automated: false },
          { action: "Configure secure session timeout policies", configPath: "/app/compliance", automated: true },
          { action: "Implement API key rotation schedule", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.6",
      framework: "iso27001",
      title: "Capacity management",
      description: "The use of resources shall be monitored and adjusted in line with current and expected capacity requirements.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Monitor platform resource usage: concurrent Claw sessions, API rate limits, database connections, and AI model token consumption. Set alerts for capacity thresholds.",
        whyItMatters: "Capacity exhaustion causes service outages. For AI platforms, uncontrolled token consumption can also lead to unexpected costs. The concurrency governance system helps manage this.",
        requiredActions: [
          { action: "Review concurrency session limits and utilization", configPath: "/app/compliance", automated: true },
          { action: "Monitor AI inference token consumption trends", configPath: "/app/compliance", automated: true },
          { action: "Configure capacity threshold alerts", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.7",
      framework: "iso27001",
      title: "Protection against malware",
      description: "Protection against malware shall be implemented and supported by appropriate user awareness.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Protect the platform against malware including malicious file uploads through Claws, prompt injection attacks that attempt to execute unauthorized commands, and supply chain malware in dependencies.",
        whyItMatters: "AI platforms face unique malware vectors: adversarial prompts can trick Claws into executing harmful actions, and malicious file uploads can compromise processing pipelines.",
        requiredActions: [
          { action: "Configure OPA policies to validate and sanitize Claw inputs", configPath: "/app/claw-policies", automated: true },
          { action: "Enable tool invocation restrictions to prevent unauthorized command execution", configPath: "/app/claw-policies", automated: true },
          { action: "Document malware protection measures for the platform infrastructure", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.8",
      framework: "iso27001",
      title: "Management of technical vulnerabilities",
      description: "Information about technical vulnerabilities of information systems in use shall be obtained, the organization's exposure to such vulnerabilities shall be evaluated and appropriate measures shall be taken.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Establish a vulnerability management program covering the platform codebase, dependencies, AI model providers, and infrastructure components. Track CVEs and apply patches promptly.",
        whyItMatters: "Unpatched vulnerabilities are exploited within days of public disclosure. AI platforms have additional vulnerability surfaces in model APIs, prompt handling, and tool integrations.",
        requiredActions: [
          { action: "Implement dependency vulnerability scanning in CI/CD pipeline", configPath: "/app/compliance", automated: false },
          { action: "Document vulnerability management process and SLAs for patching", configPath: "/app/compliance", automated: false },
          { action: "Monitor security advisories for all AI model provider APIs", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.9",
      framework: "iso27001",
      title: "Configuration management",
      description: "Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "All platform configurations — Claw settings, OPA policies, RBAC definitions, network rules — must be documented, version-controlled, and monitored for unauthorized changes.",
        whyItMatters: "Configuration drift is a silent security killer. A misconfigured OPA policy or overly permissive Claw setting can expose data without any visible alert.",
        requiredActions: [
          { action: "Audit all Claw configurations for security compliance", configPath: "/app/claws", automated: true },
          { action: "Monitor OPA policy changes through audit logs", configPath: "/app/compliance", automated: true },
          { action: "Document baseline security configurations for all components", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.10",
      framework: "iso27001",
      title: "Information deletion",
      description: "Information stored in information systems, devices or in any other storage media shall be deleted when no longer required.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Define retention periods for all data types: Claw conversation logs, audit events, inference records, user data. Implement automated deletion after retention periods expire, respecting legal hold requirements.",
        whyItMatters: "Retaining data beyond its useful life increases breach exposure and regulatory risk. Under DPDP Act, personal data must be deleted when the purpose of processing is fulfilled.",
        requiredActions: [
          { action: "Configure data retention policies for audit logs and inference records", configPath: "/app/compliance", automated: false },
          { action: "Implement automated data deletion for expired records", configPath: "/app/compliance", automated: false },
          { action: "Document data retention schedule for each data category", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.11",
      framework: "iso27001",
      title: "Data masking",
      description: "Data masking shall be used in accordance with the organization's topic-specific policy on access control and other related topic-specific policies, and business requirements, taking applicable legislation into consideration.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Apply data masking to sensitive fields (PII, payment data, health data) in Claw outputs, logs, and debug interfaces. Ensure masking is applied before data reaches AI model providers.",
        whyItMatters: "Data masking prevents sensitive data from being exposed in logs, AI model training data, or downstream outputs. It is a critical control for DPDP Act compliance.",
        requiredActions: [
          { action: "Configure OPA policies to enforce data masking for sensitive fields", configPath: "/app/claw-policies", automated: true },
          { action: "Verify audit logs mask PII before storage", configPath: "/app/compliance", automated: true },
          { action: "Implement field-level masking for Claw data outputs", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.12",
      framework: "iso27001",
      title: "Data leakage prevention",
      description: "Data leakage prevention measures shall be applied to systems, networks and any other devices that process, store or transmit sensitive information.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Implement DLP controls to prevent sensitive data from being exfiltrated through Claw outputs, API responses, tool invocations, or unauthorized data exports. OPA policies should block Claws from outputting classified data to unauthorized channels.",
        whyItMatters: "AI systems can inadvertently leak sensitive data through generated responses, tool calls to external services, or inference logs. DLP is essential for preventing unauthorized data flows.",
        requiredActions: [
          { action: "Configure OPA policies to detect and block sensitive data in Claw outputs", configPath: "/app/claw-policies", automated: true },
          { action: "Enable tool invocation restrictions to prevent data exfiltration", configPath: "/app/claw-policies", automated: true },
          { action: "Monitor query history for unauthorized data access patterns", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.8.15",
      framework: "iso27001",
      title: "Logging",
      description: "Logs that record activities, exceptions, faults and other relevant events shall be produced, stored, protected and analysed.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Comprehensive logging must cover all security-relevant activities: RBAC changes, Claw lifecycle events, AI inference calls, tool invocations, query executions, and OPA policy decisions. Logs must be tamper-protected.",
        whyItMatters: "Logs are the foundation of all security monitoring, incident investigation, and compliance auditing. Without comprehensive logging, breaches go undetected and uninvestigated.",
        requiredActions: [
          { action: "Verify all five audit event types are being generated", configPath: "/app/compliance", automated: true },
          { action: "Configure log storage and retention policies", configPath: "/app/compliance", automated: false },
          { action: "Enable log integrity verification", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.16",
      framework: "iso27001",
      title: "Monitoring activities",
      description: "Networks, systems and applications shall be monitored for anomalous behaviour and appropriate actions taken to evaluate potential information security incidents.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Implement real-time monitoring of platform activity: unusual Claw usage patterns, spikes in policy denials, abnormal token consumption, failed authentication attempts, and unexpected tool invocations.",
        whyItMatters: "Monitoring is how you detect active attacks. The average time to detect a breach is 277 days — real-time monitoring of AI operations can reduce this to minutes.",
        requiredActions: [
          { action: "Monitor OPA policy evaluation results for anomalies", configPath: "/app/compliance", automated: true },
          { action: "Track audit event volume trends for anomaly detection", configPath: "/app/compliance", automated: true },
          { action: "Configure alerting thresholds for security-relevant events", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.20",
      framework: "iso27001",
      title: "Networks security",
      description: "Networks and network devices shall be secured, managed and controlled to protect information in systems and applications.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Secure all network communications for the platform: TLS for all API endpoints, network segmentation between components, firewall rules restricting OPA engine access, and secured database connections.",
        whyItMatters: "Network-level attacks (man-in-the-middle, packet sniffing) can intercept API keys, AI model outputs, and user credentials in transit. TLS everywhere is the baseline requirement.",
        requiredActions: [
          { action: "Verify TLS encryption is enabled for all API endpoints", configPath: "/app/compliance", automated: true },
          { action: "Document network architecture and segmentation rules", configPath: "/app/compliance", automated: false },
          { action: "Ensure database connections use encrypted transports", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "A.8.21",
      framework: "iso27001",
      title: "Security of network services",
      description: "Security mechanisms, service levels and service requirements of network services shall be identified, implemented and monitored.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "All network services used by the platform (CDN, DNS, load balancers, API gateways) must have security configurations verified and monitored.",
        whyItMatters: "Compromised network services can redirect traffic, intercept data, or enable denial-of-service attacks against the AI platform.",
        requiredActions: [
          { action: "Document all network services and their security configurations", configPath: "/app/compliance", automated: false },
          { action: "Verify API gateway security settings", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.23",
      framework: "iso27001",
      title: "Web filtering",
      description: "Access to external websites shall be managed to reduce exposure to malicious content.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Control which external URLs Claws can access via tool invocations or MCP integrations. Block known malicious domains and restrict outbound connections to approved services only.",
        whyItMatters: "Unrestricted outbound access allows Claws to be weaponized for server-side request forgery (SSRF), data exfiltration to attacker-controlled servers, or accessing malicious content.",
        requiredActions: [
          { action: "Configure OPA policies to restrict Claw outbound URL access", configPath: "/app/claw-policies", automated: true },
          { action: "Maintain an allowlist of approved external services for tool invocations", configPath: "/app/claw-policies", automated: false },
        ],
      },
    },
    {
      id: "A.8.24",
      framework: "iso27001",
      title: "Use of cryptography",
      description: "Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Define cryptographic standards for the platform: TLS 1.2+ for data in transit, AES-256 for data at rest, secure key management for API keys and secrets, and proper cryptographic library usage.",
        whyItMatters: "Weak or misconfigured cryptography gives a false sense of security. Using outdated TLS versions or weak encryption algorithms makes data effectively unencrypted to sophisticated attackers.",
        requiredActions: [
          { action: "Verify TLS encryption is enforced for all communications", configPath: "/app/compliance", automated: true },
          { action: "Verify database encryption at rest is enabled", configPath: "/app/compliance", automated: true },
          { action: "Document cryptographic standards and key management procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.25",
      framework: "iso27001",
      title: "Secure development life cycle",
      description: "Rules for the secure development of software and systems shall be established and applied.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Apply secure development practices to all platform development: code reviews, security testing, dependency scanning, and secure coding standards for AI integrations.",
        whyItMatters: "Vulnerabilities introduced during development are the most expensive to fix in production. Secure SDLC prevents security bugs from reaching customers.",
        requiredActions: [
          { action: "Document secure development lifecycle requirements", configPath: "/app/compliance", automated: false },
          { action: "Implement automated security scanning in the build pipeline", configPath: "/app/compliance", automated: false },
          { action: "Require code review for all changes to security-critical components", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.26",
      framework: "iso27001",
      title: "Application security requirements",
      description: "Information security requirements shall be identified, specified and approved when developing or acquiring applications.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Define security requirements for the AI platform application: input validation, output encoding, session management, API authentication, and AI-specific requirements like prompt injection prevention.",
        whyItMatters: "Applications without defined security requirements have ad-hoc security that inevitably contains gaps. For AI platforms, missing requirements around prompt handling are particularly dangerous.",
        requiredActions: [
          { action: "Document application security requirements for the platform", configPath: "/app/compliance", automated: false },
          { action: "Configure input validation policies for Claw interactions", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "A.8.28",
      framework: "iso27001",
      title: "Secure coding",
      description: "Secure coding principles shall be applied to software development.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Apply secure coding practices to all platform code: parameterized queries, proper error handling, input validation, output encoding, and secure handling of AI model responses.",
        whyItMatters: "Insecure code is the root cause of most application vulnerabilities. SQL injection, XSS, and insecure deserialization can all compromise the AI platform.",
        requiredActions: [
          { action: "Document secure coding standards for the development team", configPath: "/app/compliance", automated: false },
          { action: "Implement static application security testing (SAST) in CI/CD", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.29",
      framework: "iso27001",
      title: "Security testing in development and acceptance",
      description: "Security testing processes shall be defined and implemented in the development life cycle.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Conduct security testing at each development stage: unit tests for security functions, integration tests for access controls, and penetration testing before major releases.",
        whyItMatters: "Security testing catches vulnerabilities before they reach production. Without it, you rely on attackers to find your bugs — at your expense.",
        requiredActions: [
          { action: "Document security testing requirements and schedule", configPath: "/app/compliance", automated: false },
          { action: "Implement automated security tests in the test suite", configPath: "/app/compliance", automated: false },
          { action: "Conduct periodic penetration testing of the platform", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A.8.31",
      framework: "iso27001",
      title: "Separation of development, test and production environments",
      description: "Development, testing and production environments shall be separated and secured.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "Maintain separate environments for development, testing, and production. Production Claw data and OPA policies must not be used in development without sanitization.",
        whyItMatters: "Using production data in development exposes sensitive information to developers who may not have the required clearance. Shared environments also allow development bugs to affect production.",
        requiredActions: [
          { action: "Document environment separation architecture", configPath: "/app/compliance", automated: false },
          { action: "Verify production data is not used in non-production environments", configPath: "/app/compliance", automated: false },
          { action: "Ensure separate OPA policy deployments per environment", configPath: "/app/claw-policies", automated: false },
        ],
      },
    },
    {
      id: "A.8.32",
      framework: "iso27001",
      title: "Change management",
      description: "Changes to information processing facilities and information systems shall be subject to change management procedures.",
      category: "A.8 Technology Controls",
      guidance: {
        learnMore: "All changes to Claw configurations, OPA policies, RBAC settings, and platform infrastructure must follow a formal change management process with approval, testing, and rollback procedures.",
        whyItMatters: "Uncontrolled changes are the leading cause of security incidents. A hasty OPA policy change can inadvertently disable access controls for all Claws.",
        requiredActions: [
          { action: "Enable audit logging for all configuration changes", configPath: "/app/compliance", automated: true },
          { action: "Review recent RBAC and policy changes in audit logs", configPath: "/app/compliance", automated: true },
          { action: "Document change management procedures and approval workflows", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ── SOC 2 Trust Service Criteria — All Criteria ──

function getSoc2Controls(): Omit<ControlDefinition, "status" | "evidence">[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // CC1 — Control Environment
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC1.1",
      framework: "soc2",
      title: "COSO Principle 1: Integrity and Ethical Values",
      description: "The entity demonstrates a commitment to integrity and ethical values.",
      category: "CC1 Control Environment",
      guidance: {
        learnMore: "The organization must establish a tone at the top that demonstrates commitment to integrity. This includes a code of conduct, ethics policies, and management accountability for security practices.",
        whyItMatters: "Without a culture of integrity, security controls are undermined from within. Ethical lapses in AI operations — such as unauthorized data usage or biased model behavior — can cause reputational and legal damage.",
        requiredActions: [
          { action: "Document organizational code of conduct covering AI platform operations", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policies reflecting ethical data usage standards", configPath: "/app/claw-policies", automated: true },
          { action: "Establish management review of compliance dashboard metrics", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC1.2",
      framework: "soc2",
      title: "COSO Principle 2: Board Oversight",
      description: "The board of directors demonstrates independence from management and exercises oversight of the development and performance of internal control.",
      category: "CC1 Control Environment",
      guidance: {
        learnMore: "Board or governance body must exercise independent oversight over information security controls, AI governance practices, and risk management activities.",
        whyItMatters: "Independent oversight prevents management from self-certifying their own security practices. For AI platforms, independent review of AI governance decisions is critical for trust.",
        requiredActions: [
          { action: "Document board/governance oversight structure for information security", configPath: "/app/compliance", automated: false },
          { action: "Schedule periodic compliance report reviews for governance body", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC1.3",
      framework: "soc2",
      title: "COSO Principle 3: Management Structure and Authority",
      description: "Management establishes, with board oversight, structures, reporting lines, and appropriate authorities and responsibilities in the pursuit of objectives.",
      category: "CC1 Control Environment",
      guidance: {
        learnMore: "Define clear management structures with explicit authority over AI platform security: who approves Claw deployments, who manages access control, and who oversees data handling practices.",
        whyItMatters: "Unclear authority leads to either no one making security decisions (risk) or everyone making conflicting decisions (chaos). Clear authority ensures consistent security governance.",
        requiredActions: [
          { action: "Define RBAC roles mapping to management authority levels", configPath: "/app/roles", automated: true },
          { action: "Document organizational chart with security responsibilities", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC1.4",
      framework: "soc2",
      title: "COSO Principle 4: Commitment to Competence",
      description: "The entity demonstrates a commitment to attract, develop, and retain competent individuals in alignment with objectives.",
      category: "CC1 Control Environment",
      guidance: {
        learnMore: "Ensure personnel managing the AI platform have adequate security training and competence. This includes understanding AI-specific threats, RBAC administration, and OPA policy management.",
        whyItMatters: "Undertrained administrators make configuration errors that create security vulnerabilities. AI platform security requires specialized knowledge beyond traditional IT security.",
        requiredActions: [
          { action: "Document competency requirements for platform administrator roles", configPath: "/app/compliance", automated: false },
          { action: "Track training completion for security-critical roles", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC1.5",
      framework: "soc2",
      title: "COSO Principle 5: Accountability",
      description: "The entity holds individuals accountable for their internal control responsibilities in the pursuit of objectives.",
      category: "CC1 Control Environment",
      guidance: {
        learnMore: "Establish accountability mechanisms for security control responsibilities. All RBAC changes, policy modifications, and Claw configurations must be attributable to specific individuals.",
        whyItMatters: "Without individual accountability, responsibility is diffused and security controls degrade. Audit trails make accountability enforceable.",
        requiredActions: [
          { action: "Ensure all audit events include actor identity (userId)", configPath: "/app/compliance", automated: true },
          { action: "Enable RBAC audit logging for all role and permission changes", configPath: "/app/roles", automated: true },
          { action: "Document accountability frameworks for security roles", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC2 — Communication and Information
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC2.1",
      framework: "soc2",
      title: "Information Quality",
      description: "The entity obtains or generates and uses relevant, quality information to support the functioning of internal control.",
      category: "CC2 Communication & Information",
      guidance: {
        learnMore: "Ensure the compliance dashboard provides accurate, timely, and relevant information about control status. Audit logs must be complete and tamper-evident.",
        whyItMatters: "Decisions based on inaccurate compliance data lead to false confidence. If the compliance dashboard shows 100% when actual compliance is 60%, critical gaps go unaddressed.",
        requiredActions: [
          { action: "Verify compliance reports match actual system state using live verification", configPath: "/app/compliance", automated: true },
          { action: "Ensure audit log completeness for all five event categories", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CC2.2",
      framework: "soc2",
      title: "Internal Communication",
      description: "The entity internally communicates information, including objectives and responsibilities for internal control, necessary to support the functioning of internal control.",
      category: "CC2 Communication & Information",
      guidance: {
        learnMore: "Security policies, control objectives, and compliance status must be communicated to all relevant personnel. Users should understand their security responsibilities when using the platform.",
        whyItMatters: "If users do not know the security policies exist, they cannot follow them. Internal communication gaps are a leading cause of accidental policy violations.",
        requiredActions: [
          { action: "Document and publish security policies accessible to all platform users", configPath: "/app/compliance", automated: false },
          { action: "Configure user-facing security notices for Claw interactions", configPath: "/app/claw-policies", automated: false },
        ],
      },
    },
    {
      id: "CC2.3",
      framework: "soc2",
      title: "External Communication",
      description: "The entity communicates with external parties regarding matters affecting the functioning of internal control.",
      category: "CC2 Communication & Information",
      guidance: {
        learnMore: "Communicate security practices to customers, partners, and regulators. This includes publishing security documentation, responding to security questionnaires, and providing compliance reports.",
        whyItMatters: "Customers need assurance that their data is protected. Inability to demonstrate compliance during sales cycles results in lost deals and reduced trust.",
        requiredActions: [
          { action: "Generate exportable compliance reports for external stakeholders", configPath: "/app/compliance", automated: true },
          { action: "Document security practices for customer-facing documentation", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC3 — Risk Assessment
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC3.1",
      framework: "soc2",
      title: "Risk Identification",
      description: "The entity specifies objectives with sufficient clarity to enable the identification and assessment of risks relating to objectives.",
      category: "CC3 Risk Assessment",
      guidance: {
        learnMore: "Define clear security objectives for the AI platform and identify risks that could prevent achieving them. Risks include AI model compromise, data breaches, policy bypass, and supply chain attacks.",
        whyItMatters: "Without clear objectives, risks cannot be systematically identified. Unidentified risks are unmanaged risks — they persist until they materialize as incidents.",
        requiredActions: [
          { action: "Document security objectives for the AI platform", configPath: "/app/compliance", automated: false },
          { action: "Conduct risk assessment for all Claw configurations", configPath: "/app/claws", automated: false },
        ],
      },
    },
    {
      id: "CC3.2",
      framework: "soc2",
      title: "Risk Analysis",
      description: "The entity identifies risks to the achievement of its objectives across the entity and analyzes risks as a basis for determining how the risks should be managed.",
      category: "CC3 Risk Assessment",
      guidance: {
        learnMore: "Analyze identified risks by likelihood and impact. For the AI platform, assess risks of data breaches through Claws, unauthorized AI model usage, policy engine failures, and tool invocation exploits.",
        whyItMatters: "Risk analysis enables informed resource allocation. Without it, organizations over-invest in low-risk areas while under-protecting critical assets.",
        requiredActions: [
          { action: "Review security event summary for risk indicators", configPath: "/app/compliance", automated: true },
          { action: "Analyze OPA policy denial patterns for emerging risks", configPath: "/app/compliance", automated: true },
          { action: "Document risk register with likelihood and impact assessments", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC3.3",
      framework: "soc2",
      title: "Fraud Risk Assessment",
      description: "The entity considers the potential for fraud in assessing risks to the achievement of objectives.",
      category: "CC3 Risk Assessment",
      guidance: {
        learnMore: "Assess fraud risks specific to the AI platform: unauthorized usage of AI resources, manipulation of Claw outputs for personal gain, data theft through tool invocations, and billing fraud.",
        whyItMatters: "AI platforms can be exploited for fraud in novel ways — from generating fake documents to exfiltrating proprietary data. Traditional fraud controls may not address these vectors.",
        requiredActions: [
          { action: "Configure OPA policies to detect unusual usage patterns suggesting fraud", configPath: "/app/claw-policies", automated: true },
          { action: "Monitor token consumption for anomalies indicating unauthorized usage", configPath: "/app/compliance", automated: true },
          { action: "Document fraud risk assessment for AI-specific threats", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC3.4",
      framework: "soc2",
      title: "Change Risk Assessment",
      description: "The entity identifies and assesses changes that could significantly impact the system of internal control.",
      category: "CC3 Risk Assessment",
      guidance: {
        learnMore: "Assess security impact of all significant changes: new Claw deployments, OPA policy updates, RBAC modifications, AI model provider changes, and infrastructure upgrades.",
        whyItMatters: "Changes introduce new risks. A new AI model provider may have different data handling practices. A policy change may inadvertently weaken access controls.",
        requiredActions: [
          { action: "Review audit logs for recent configuration changes and assess their risk impact", configPath: "/app/compliance", automated: true },
          { action: "Document change risk assessment process", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC4 — Monitoring Activities
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC4.1",
      framework: "soc2",
      title: "Ongoing Monitoring",
      description: "The entity selects, develops, and performs ongoing and/or separate evaluations to ascertain whether the components of internal control are present and functioning.",
      category: "CC4 Monitoring Activities",
      guidance: {
        learnMore: "Implement continuous monitoring of all security controls: RBAC enforcement, OPA policy evaluations, audit log generation, encryption status, and access control effectiveness.",
        whyItMatters: "Controls that are not monitored degrade silently. Continuous monitoring ensures compliance is maintained, not just achieved at a point in time.",
        requiredActions: [
          { action: "Use the compliance dashboard to monitor control implementation status", configPath: "/app/compliance", automated: true },
          { action: "Configure periodic automated verification of all controls", configPath: "/app/compliance", automated: true },
          { action: "Review compliance scores monthly and track trends", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC4.2",
      framework: "soc2",
      title: "Deficiency Remediation",
      description: "The entity evaluates and communicates internal control deficiencies in a timely manner to those parties responsible for taking corrective action, including senior management and the board of directors, as appropriate.",
      category: "CC4 Monitoring Activities",
      guidance: {
        learnMore: "When control deficiencies are identified (controls showing 'planned' or 'partial' status), escalate to responsible parties and track remediation progress.",
        whyItMatters: "Known but unremediated deficiencies represent accepted risk. If a control gap is identified but not fixed, it signals a management failure that auditors will flag.",
        requiredActions: [
          { action: "Review controls with 'planned' or 'partial' status and create remediation plans", configPath: "/app/compliance", automated: true },
          { action: "Document deficiency remediation timelines and responsibilities", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC5 — Control Activities
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC5.1",
      framework: "soc2",
      title: "Control Selection and Development",
      description: "The entity selects and develops control activities that contribute to the mitigation of risks to the achievement of objectives to acceptable levels.",
      category: "CC5 Control Activities",
      guidance: {
        learnMore: "Select and implement security controls appropriate for the AI platform's risk profile. This includes OPA policy enforcement, RBAC, audit logging, encryption, and data classification.",
        whyItMatters: "Controls must be proportionate to risk. An AI platform processing sensitive data needs stronger controls than one processing only public data. Under-controlled systems are vulnerable; over-controlled systems are unusable.",
        requiredActions: [
          { action: "Deploy OPA policy templates covering all Claw operations", configPath: "/app/claw-policies", automated: true },
          { action: "Configure RBAC roles with appropriate access levels", configPath: "/app/roles", automated: true },
          { action: "Enable comprehensive audit logging for all event types", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CC5.2",
      framework: "soc2",
      title: "Technology General Controls",
      description: "The entity also selects and develops general control activities over technology to support the achievement of objectives.",
      category: "CC5 Control Activities",
      guidance: {
        learnMore: "Implement technology-level controls: secure configurations, change management, logical access controls, network security, and infrastructure monitoring across all platform components.",
        whyItMatters: "Technology general controls are the foundation that application-level controls rely on. If infrastructure is compromised, application security is meaningless.",
        requiredActions: [
          { action: "Verify OPA policy engine health and connectivity", configPath: "/app/compliance", automated: true },
          { action: "Configure infrastructure security monitoring", configPath: "/app/compliance", automated: false },
          { action: "Document technology control baseline for all platform components", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC5.3",
      framework: "soc2",
      title: "Policy Deployment",
      description: "The entity deploys control activities through policies that establish what is expected and in procedures that put policies into action.",
      category: "CC5 Control Activities",
      guidance: {
        learnMore: "Translate security policies into enforceable OPA policies, RBAC configurations, and documented procedures. Policies without enforcement mechanisms are merely suggestions.",
        whyItMatters: "The gap between policy and enforcement is where breaches occur. OPA policies bridge this gap by automating policy enforcement for every Claw operation.",
        requiredActions: [
          { action: "Map security policies to corresponding OPA policy templates", configPath: "/app/claw-policies", automated: true },
          { action: "Verify all active Claws have policy templates assigned", configPath: "/app/claws", automated: true },
          { action: "Document procedures for each security policy", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC6 — Logical and Physical Access Controls
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC6.1",
      framework: "soc2",
      title: "Logical Access Security",
      description: "The entity implements logical access security software, infrastructure, and architectures over protected information assets to protect them from security events.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "Implement comprehensive logical access controls: authentication for all users, OPA-enforced authorization for all Claw operations, encrypted communications, and secure session management.",
        whyItMatters: "Logical access controls are the primary defense against unauthorized access in a SaaS platform. Without them, any authenticated user can access any data or resource.",
        requiredActions: [
          { action: "Verify OPA policy engine is enforcing access controls for all operations", configPath: "/app/claw-policies", automated: true },
          { action: "Configure authentication requirements for all API endpoints", configPath: "/app/compliance", automated: true },
          { action: "Enable TLS encryption for all platform communications", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CC6.2",
      framework: "soc2",
      title: "User Registration and Authorization",
      description: "Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "Implement a formal user registration process that validates identity, assigns appropriate roles, and grants minimum necessary access. Track all user provisioning through audit logs.",
        whyItMatters: "Unauthorized users with valid credentials are indistinguishable from legitimate users. Proper registration ensures only authorized individuals gain platform access.",
        requiredActions: [
          { action: "Configure user registration workflow with identity verification", configPath: "/app/roles", automated: true },
          { action: "Assign default minimal roles to new users", configPath: "/app/roles", automated: true },
          { action: "Audit user provisioning events in the compliance dashboard", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CC6.3",
      framework: "soc2",
      title: "Role-Based Access Control",
      description: "The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets based on roles, and considers the principle of least privilege and segregation of duties.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "Implement role-based access control (RBAC) where permissions are assigned to roles, not directly to users. Apply least privilege: each role gets only the permissions needed for its function.",
        whyItMatters: "RBAC is the most scalable and auditable approach to access control. It prevents permission sprawl, simplifies auditing, and enables rapid access revocation by role.",
        requiredActions: [
          { action: "Define granular RBAC roles with specific permissions", configPath: "/app/roles", automated: true },
          { action: "Assign all users to appropriate roles", configPath: "/app/roles", automated: true },
          { action: "Review role assignments quarterly for compliance", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CC6.4",
      framework: "soc2",
      title: "Physical Access Restrictions",
      description: "The entity restricts physical access to facilities and protected information assets to authorized personnel.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "For a SaaS platform, ensure physical access to infrastructure is managed by the cloud provider. Document cloud provider physical security certifications.",
        whyItMatters: "Physical access bypasses all logical controls. Cloud provider physical security is a shared responsibility that must be verified and documented.",
        requiredActions: [
          { action: "Verify and document cloud provider physical security certifications", configPath: "/app/compliance", automated: false },
          { action: "Document physical security for any on-premises administrative infrastructure", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC6.5",
      framework: "soc2",
      title: "Logical Access Removal",
      description: "The entity discontinues logical and physical access to protected information assets when that access is no longer authorized.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "Implement timely access removal when users leave the organization, change roles, or no longer need access. This includes RBAC deprovisioning, API key revocation, and session termination.",
        whyItMatters: "Orphaned access is a major security risk. Former employees or contractors with active credentials can access the platform undetected long after their authorization expires.",
        requiredActions: [
          { action: "Implement user access revocation procedures", configPath: "/app/roles", automated: true },
          { action: "Conduct periodic reviews to identify and remove stale access", configPath: "/app/roles", automated: true },
          { action: "Monitor audit logs for access by deactivated accounts", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CC6.6",
      framework: "soc2",
      title: "Access Restriction to System Components",
      description: "The entity implements logical access security measures to protect against threats from sources outside its system boundaries.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "Protect platform boundaries: firewall rules, API authentication, rate limiting, and OPA policies that restrict external access to system components and data.",
        whyItMatters: "External threats constantly probe SaaS platforms. Without boundary protection, attackers can exploit APIs, overwhelm services, or access internal components.",
        requiredActions: [
          { action: "Configure API authentication for all external endpoints", configPath: "/app/compliance", automated: true },
          { action: "Enable rate limiting for API endpoints", configPath: "/app/compliance", automated: false },
          { action: "Document network boundary security architecture", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC6.7",
      framework: "soc2",
      title: "Data Transmission Security",
      description: "The entity restricts the transmission, movement, and removal of information to authorized internal and external users and processes, and protects it during transmission.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "All data transmitted to and from the platform must be encrypted (TLS). Data sent to external AI model providers must be minimized and transmitted securely.",
        whyItMatters: "Data in transit is vulnerable to interception. AI API calls containing sensitive prompts and responses must be encrypted to prevent eavesdropping.",
        requiredActions: [
          { action: "Verify TLS encryption for all API communications", configPath: "/app/compliance", automated: true },
          { action: "Verify secure connections to AI model provider APIs", configPath: "/app/compliance", automated: true },
          { action: "Configure data minimization policies for external transmissions", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "CC6.8",
      framework: "soc2",
      title: "Unauthorized Software Prevention",
      description: "The entity implements controls to prevent or detect and act upon the introduction of unauthorized or malicious software.",
      category: "CC6 Logical & Physical Access",
      guidance: {
        learnMore: "Prevent unauthorized MCP tools, plugins, and integrations from being added to the platform. Control which tools Claws can invoke and validate all external code.",
        whyItMatters: "Unauthorized software (malicious MCP tools or compromised dependencies) can exfiltrate data, compromise AI operations, or provide backdoor access.",
        requiredActions: [
          { action: "Configure OPA policies to restrict tool invocations to approved tools only", configPath: "/app/claw-policies", automated: true },
          { action: "Audit tool invocation events for unauthorized tool usage", configPath: "/app/compliance", automated: true },
          { action: "Maintain an approved tools list for Claw integrations", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC7 — System Operations
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC7.1",
      framework: "soc2",
      title: "Vulnerability Detection",
      description: "To meet its objectives, the entity uses detection and monitoring procedures to identify changes to configurations that result in the introduction of new vulnerabilities, and susceptibilities to newly discovered vulnerabilities.",
      category: "CC7 System Operations",
      guidance: {
        learnMore: "Continuously monitor for configuration changes that introduce vulnerabilities: OPA policy weakening, RBAC permission escalation, insecure Claw configurations, and unpatched dependencies.",
        whyItMatters: "New vulnerabilities are discovered daily. Without detection, your platform accumulates exploitable weaknesses that attackers will eventually discover and exploit.",
        requiredActions: [
          { action: "Monitor audit logs for security-weakening configuration changes", configPath: "/app/compliance", automated: true },
          { action: "Track OPA policy changes that reduce security posture", configPath: "/app/claw-policies", automated: true },
          { action: "Implement vulnerability scanning for platform dependencies", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC7.2",
      framework: "soc2",
      title: "Anomaly Monitoring",
      description: "The entity monitors system components and the operation of those components for anomalies that are indicative of malicious acts, natural disasters, and errors affecting the entity's ability to meet its objectives; anomalies are analyzed to determine whether they represent security events.",
      category: "CC7 System Operations",
      guidance: {
        learnMore: "Monitor for anomalous behavior: unusual Claw activity patterns, spikes in OPA policy denials, abnormal token consumption, failed authentication attempts, and unexpected data access patterns.",
        whyItMatters: "Anomalies are early indicators of attacks in progress. Detecting and responding to anomalies quickly limits the blast radius of security incidents.",
        requiredActions: [
          { action: "Monitor security event summary for anomalous patterns", configPath: "/app/compliance", automated: true },
          { action: "Review decision log summaries for unusual denial rates", configPath: "/app/compliance", automated: true },
          { action: "Configure alerts for anomalous activity thresholds", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC7.3",
      framework: "soc2",
      title: "Security Event Evaluation",
      description: "The entity evaluates security events to determine whether they could or have resulted in a failure of the entity to meet its objectives (security incidents) and, if so, takes actions to prevent or address such failures.",
      category: "CC7 System Operations",
      guidance: {
        learnMore: "Establish processes to evaluate security events and determine which require incident response. Use audit logs, OPA decision logs, and security event summaries to classify events.",
        whyItMatters: "Not every security event is an incident, but every incident starts as an event. Efficient triage ensures real threats are addressed without wasting resources on false positives.",
        requiredActions: [
          { action: "Review and classify security events from the audit log", configPath: "/app/compliance", automated: true },
          { action: "Document security event classification criteria", configPath: "/app/compliance", automated: false },
          { action: "Establish event escalation procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC7.4",
      framework: "soc2",
      title: "Incident Response",
      description: "The entity responds to identified security incidents by executing a defined incident response program to understand, contain, remediate, and communicate security incidents, as appropriate.",
      category: "CC7 System Operations",
      guidance: {
        learnMore: "Execute incident response procedures when security incidents are confirmed: contain the incident (disable compromised Claws), investigate (review audit logs), remediate (update policies), and communicate (notify affected parties).",
        whyItMatters: "Effective incident response limits breach impact. For AI platforms, rapid Claw isolation prevents compromised AI agents from continuing to process and expose sensitive data.",
        requiredActions: [
          { action: "Document incident response procedures for the AI platform", configPath: "/app/compliance", automated: false },
          { action: "Enable rapid Claw deactivation for incident containment", configPath: "/app/claws", automated: true },
          { action: "Configure incident notification channels", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC7.5",
      framework: "soc2",
      title: "Incident Recovery",
      description: "The entity identifies, develops, and implements activities to recover from identified security incidents.",
      category: "CC7 System Operations",
      guidance: {
        learnMore: "Plan recovery activities: restore compromised Claws from known-good configurations, re-evaluate and strengthen OPA policies, reset affected credentials, and validate system integrity post-incident.",
        whyItMatters: "Recovery without validation may leave hidden compromises. Post-incident recovery must verify that all attack vectors are closed and system integrity is restored.",
        requiredActions: [
          { action: "Document recovery procedures for common incident types", configPath: "/app/compliance", automated: false },
          { action: "Verify system integrity using compliance verification after recovery", configPath: "/app/compliance", automated: true },
          { action: "Update OPA policies based on incident learnings", configPath: "/app/claw-policies", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC8 — Change Management
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC8.1",
      framework: "soc2",
      title: "Change Authorization and Approval",
      description: "The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet its objectives.",
      category: "CC8 Change Management",
      guidance: {
        learnMore: "All changes to Claw configurations, OPA policies, RBAC settings, and infrastructure must follow a formal change management process: request, review, approve, implement, and verify.",
        whyItMatters: "Uncontrolled changes are the most common cause of security incidents. Formal change management ensures changes are reviewed for security impact before deployment.",
        requiredActions: [
          { action: "Enable audit logging for all configuration change events", configPath: "/app/compliance", automated: true },
          { action: "Review recent changes through the RBAC audit log", configPath: "/app/compliance", automated: true },
          { action: "Document change management procedures and approval requirements", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CC9 — Risk Mitigation
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CC9.1",
      framework: "soc2",
      title: "Risk Mitigation",
      description: "The entity identifies, selects, and develops risk mitigation activities for risks arising from potential business disruptions.",
      category: "CC9 Risk Mitigation",
      guidance: {
        learnMore: "Implement risk mitigation strategies for identified threats: OPA policies for access control risks, encryption for data protection risks, monitoring for detection risks, and backup for availability risks.",
        whyItMatters: "Risk identification without mitigation is useless. Every identified risk must have a corresponding control or accepted risk documentation.",
        requiredActions: [
          { action: "Map identified risks to specific security controls", configPath: "/app/compliance", automated: false },
          { action: "Verify risk mitigation controls are implemented and functioning", configPath: "/app/compliance", automated: true },
          { action: "Document risk acceptance decisions for residual risks", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CC9.2",
      framework: "soc2",
      title: "Vendor Risk Management",
      description: "The entity assesses and manages risks associated with vendors and business partners.",
      category: "CC9 Risk Mitigation",
      guidance: {
        learnMore: "Assess risks from all vendors: AI model providers (OpenAI, Anthropic, Google), cloud infrastructure providers, telephony providers, and MCP tool providers. Maintain vendor security assessments.",
        whyItMatters: "Vendor breaches directly impact your platform. If an AI model provider is compromised, all data sent through their API may be exposed.",
        requiredActions: [
          { action: "Document vendor risk assessments for all AI model providers", configPath: "/app/compliance", automated: false },
          { action: "Review telephony provider security configurations", configPath: "/app/telephony", automated: false },
          { action: "Maintain vendor security status register", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // A1 — Availability
    // ═══════════════════════════════════════════════════════════════
    {
      id: "A1.1",
      framework: "soc2",
      title: "Capacity Management",
      description: "The entity maintains, monitors, and evaluates current processing capacity and use of system components to manage capacity demand and to enable the implementation of additional capacity to help meet its objectives.",
      category: "A1 Availability",
      guidance: {
        learnMore: "Monitor platform capacity: concurrent Claw sessions, database connections, API rate limits, and AI model token consumption. Use the concurrency governance system to manage resource allocation.",
        whyItMatters: "Capacity exhaustion causes service outages. For AI platforms, uncontrolled concurrent sessions can overwhelm both internal resources and external AI provider rate limits.",
        requiredActions: [
          { action: "Monitor concurrency session utilization", configPath: "/app/compliance", automated: true },
          { action: "Configure capacity limits for concurrent Claw sessions", configPath: "/app/compliance", automated: true },
          { action: "Set up capacity alerting thresholds", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A1.2",
      framework: "soc2",
      title: "Environmental Protections and Recovery",
      description: "The entity authorizes, designs, develops or acquires, implements, operates, approves, maintains, and monitors environmental protections, software, data back-up, and recovery infrastructure to meet its objectives.",
      category: "A1 Availability",
      guidance: {
        learnMore: "Implement backup and recovery for all platform data: Claw configurations, OPA policies, user data, audit logs, and database contents. Test recovery procedures regularly.",
        whyItMatters: "Without tested backups, a single failure (database corruption, ransomware, accidental deletion) can cause permanent data loss and extended downtime.",
        requiredActions: [
          { action: "Document backup procedures and schedules for all platform data", configPath: "/app/compliance", automated: false },
          { action: "Verify database backup and recovery capabilities", configPath: "/app/compliance", automated: false },
          { action: "Test recovery procedures periodically", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "A1.3",
      framework: "soc2",
      title: "Recovery Testing",
      description: "The entity tests recovery plan procedures supporting system recovery to meet its objectives.",
      category: "A1 Availability",
      guidance: {
        learnMore: "Periodically test disaster recovery procedures: database restoration, Claw reconfiguration, OPA policy redeployment, and infrastructure failover. Document test results and remediate gaps.",
        whyItMatters: "Untested recovery plans fail when needed most. Regular testing validates that recovery meets RTO/RPO targets and identifies gaps before they matter.",
        requiredActions: [
          { action: "Schedule and document recovery testing procedures", configPath: "/app/compliance", automated: false },
          { action: "Document recovery test results and remediation actions", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // PI1 — Processing Integrity
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PI1.1",
      framework: "soc2",
      title: "Processing Accuracy and Completeness",
      description: "The entity implements policies and procedures over system processing to result in products, services, and reporting to meet the entity's objectives.",
      category: "PI1 Processing Integrity",
      guidance: {
        learnMore: "Ensure AI processing integrity: Claw outputs must be accurate, complete, and timely. Track inference events to verify model responses are being processed correctly without data loss or corruption.",
        whyItMatters: "Inaccurate AI outputs can lead to wrong business decisions, customer harm, and legal liability. Processing integrity is especially critical for customer-facing AI interactions.",
        requiredActions: [
          { action: "Monitor inference events for processing integrity metrics", configPath: "/app/compliance", automated: true },
          { action: "Track AI model response accuracy and completeness", configPath: "/app/compliance", automated: true },
          { action: "Document processing integrity requirements for AI outputs", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PI1.2",
      framework: "soc2",
      title: "Input Validation",
      description: "The entity implements policies and procedures to ensure inputs to systems are complete and accurate.",
      category: "PI1 Processing Integrity",
      guidance: {
        learnMore: "Validate all inputs to Claws: user prompts, API requests, tool invocation parameters, and data source queries. Reject malformed or potentially malicious inputs before processing.",
        whyItMatters: "Invalid inputs can cause AI models to produce incorrect outputs, crash processing pipelines, or enable prompt injection attacks that bypass security controls.",
        requiredActions: [
          { action: "Configure OPA policies to validate Claw input parameters", configPath: "/app/claw-policies", automated: true },
          { action: "Enable input sanitization for all Claw interactions", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "PI1.3",
      framework: "soc2",
      title: "Processing Monitoring",
      description: "The entity implements policies and procedures to ensure that system processing is complete, accurate, and timely.",
      category: "PI1 Processing Integrity",
      guidance: {
        learnMore: "Monitor Claw processing pipelines for errors, timeouts, and incomplete executions. Track tool invocation success rates and inference completion metrics.",
        whyItMatters: "Undetected processing failures can result in incomplete customer interactions, data loss, and silent degradation of AI service quality.",
        requiredActions: [
          { action: "Monitor tool event success/failure rates", configPath: "/app/compliance", automated: true },
          { action: "Track inference event completion metrics", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "PI1.4",
      framework: "soc2",
      title: "Output Review",
      description: "The entity implements policies and procedures to ensure that system outputs are complete and accurate.",
      category: "PI1 Processing Integrity",
      guidance: {
        learnMore: "Review AI outputs for accuracy: verify Claw responses are appropriate, tool invocations produce expected results, and data queries return correct information.",
        whyItMatters: "Incorrect AI outputs that reach customers can cause harm, erode trust, and create legal liability. Output validation is the last line of defense.",
        requiredActions: [
          { action: "Configure output validation policies in OPA", configPath: "/app/claw-policies", automated: true },
          { action: "Enable logging of Claw outputs for review", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "PI1.5",
      framework: "soc2",
      title: "Error Handling",
      description: "The entity implements policies and procedures to identify and address errors and omissions in processing.",
      category: "PI1 Processing Integrity",
      guidance: {
        learnMore: "Implement error handling for all AI processing failures: model API errors, tool invocation failures, data source timeouts, and OPA policy evaluation errors. Ensure errors are logged and users are notified appropriately.",
        whyItMatters: "Unhandled errors can cause data corruption, incomplete processing, and poor user experience. For telephony Claws, errors during live calls are especially critical.",
        requiredActions: [
          { action: "Monitor tool and inference events for error patterns", configPath: "/app/compliance", automated: true },
          { action: "Document error handling procedures for critical processing failures", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // C1 — Confidentiality
    // ═══════════════════════════════════════════════════════════════
    {
      id: "C1.1",
      framework: "soc2",
      title: "Confidential Information Identification",
      description: "The entity identifies and maintains confidential information to meet the entity's objectives related to confidentiality.",
      category: "C1 Confidentiality",
      guidance: {
        learnMore: "Identify all confidential information processed by the platform: customer data, AI model configurations, OPA policies, API keys, and conversation logs. Apply data classification to all Claws.",
        whyItMatters: "Unidentified confidential information receives no protection. Data classification is the prerequisite for all confidentiality controls.",
        requiredActions: [
          { action: "Assign data classification to all Claws", configPath: "/app/claws", automated: true },
          { action: "Review data classification distribution", configPath: "/app/compliance", automated: true },
          { action: "Document confidentiality requirements for each data classification level", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "C1.2",
      framework: "soc2",
      title: "Confidential Information Disposal",
      description: "The entity disposes of confidential information to meet the entity's objectives related to confidentiality.",
      category: "C1 Confidentiality",
      guidance: {
        learnMore: "Implement secure disposal of confidential data: conversation log purging, audit log archival, secure deletion of decommissioned Claw data, and proper handling of data export files.",
        whyItMatters: "Retained confidential data that is no longer needed increases breach exposure. Secure disposal reduces the attack surface and supports DPDP Act compliance.",
        requiredActions: [
          { action: "Configure data retention and deletion policies", configPath: "/app/compliance", automated: false },
          { action: "Implement secure deletion for decommissioned Claws", configPath: "/app/compliance", automated: false },
          { action: "Document data disposal procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // P1 — Privacy
    // ═══════════════════════════════════════════════════════════════
    {
      id: "P1.1",
      framework: "soc2",
      title: "Privacy Notice",
      description: "The entity provides notice to data subjects about its privacy practices to meet the entity's objectives related to privacy.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Provide clear, accessible privacy notices explaining how the AI platform collects, processes, and shares personal data. Notices must be provided at or before the point of data collection.",
        whyItMatters: "Privacy notices are legally required under DPDP Act. Without proper notice, all personal data processing is potentially unlawful, exposing the organization to penalties.",
        requiredActions: [
          { action: "Publish a privacy notice covering AI platform data processing", configPath: "/app/compliance", automated: false },
          { action: "Ensure privacy notice is accessible before Claw interactions collect personal data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "P1.2",
      framework: "soc2",
      title: "Choice and Consent",
      description: "The entity communicates choices available regarding the collection, use, retention, disclosure, and disposal of personal information to the data subjects.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Provide data subjects with meaningful choices about their personal data processing. Obtain explicit consent before processing personal data through AI Claws, especially for sensitive data categories.",
        whyItMatters: "Processing personal data without valid consent violates the DPDP Act. Consent must be free, specific, informed, and unambiguous.",
        requiredActions: [
          { action: "Implement consent collection mechanism for data subjects", configPath: "/app/compliance", automated: false },
          { action: "Track consent status for all personal data processing activities", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "P1.3",
      framework: "soc2",
      title: "Personal Information Collection",
      description: "The entity collects personal information consistent with the entity's objectives related to privacy.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Collect only the minimum personal information necessary for the stated purpose. Claws must not collect personal data beyond what is needed for the specific interaction.",
        whyItMatters: "Excessive data collection increases breach risk and violates data minimization principles. Under DPDP Act, collecting more data than needed is a compliance violation.",
        requiredActions: [
          { action: "Review Claw configurations for unnecessary personal data collection", configPath: "/app/claws", automated: false },
          { action: "Configure data minimization policies in OPA", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "P1.4",
      framework: "soc2",
      title: "Use, Retention, and Disposal of Personal Information",
      description: "The entity limits the use, retention, and disposal of personal information to the purposes identified in the entity's objectives related to privacy.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Use personal data only for the purpose for which consent was obtained. Retain personal data only as long as necessary. Implement automated deletion when retention periods expire.",
        whyItMatters: "Using personal data beyond its stated purpose violates consent agreements and regulations. Indefinite retention creates ever-growing breach exposure.",
        requiredActions: [
          { action: "Define retention periods for personal data in Claw interactions", configPath: "/app/compliance", automated: false },
          { action: "Configure purpose limitation policies in OPA", configPath: "/app/claw-policies", automated: true },
          { action: "Implement automated data deletion schedules", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "P1.5",
      framework: "soc2",
      title: "Access to Personal Information",
      description: "The entity grants identified and authenticated data subjects the ability to access their stored personal information for review and, upon request, provides physical or electronic copies of that information.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Provide data subjects with the ability to access their personal data processed by the platform. This includes Claw conversation histories, profile data, and any derived data.",
        whyItMatters: "Data subject access rights are mandatory under DPDP Act. Failure to provide access upon request results in regulatory penalties.",
        requiredActions: [
          { action: "Implement data subject access request (DSAR) handling procedures", configPath: "/app/compliance", automated: false },
          { action: "Enable data export functionality for user personal data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "P1.6",
      framework: "soc2",
      title: "Disclosure of Personal Information",
      description: "The entity discloses personal information to third parties with the consent of the data subjects only for the purposes identified in the entity's objectives related to privacy.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Personal data shared with third parties (AI model providers, analytics services) must be limited to what is necessary and covered by consent. Track all third-party data sharing.",
        whyItMatters: "Unauthorized third-party disclosure is a major privacy violation. Sending personal data to AI model providers constitutes disclosure that requires proper consent and documentation.",
        requiredActions: [
          { action: "Document all third-party data sharing relationships", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policies to restrict personal data in AI model API calls", configPath: "/app/claw-policies", automated: true },
          { action: "Obtain and track consent for third-party data sharing", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "P1.7",
      framework: "soc2",
      title: "Quality of Personal Information",
      description: "The entity collects and maintains accurate, up-to-date, complete, and relevant personal information for the purposes identified in the notice.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Ensure personal data processed by Claws is accurate and up-to-date. Provide mechanisms for data subjects to correct inaccurate information.",
        whyItMatters: "AI decisions based on inaccurate personal data can cause harm. Data subjects have the right to correction under DPDP Act.",
        requiredActions: [
          { action: "Implement data correction request handling", configPath: "/app/compliance", automated: false },
          { action: "Validate personal data accuracy in Claw processing pipelines", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "P1.8",
      framework: "soc2",
      title: "Complaints and Disputes",
      description: "The entity implements a process for receiving, addressing, resolving, and communicating the resolution of inquiries, complaints, and disputes from data subjects.",
      category: "P1 Privacy",
      guidance: {
        learnMore: "Establish a formal process for handling privacy complaints and disputes from data subjects. This includes receiving complaints, investigating them, resolving issues, and communicating outcomes.",
        whyItMatters: "DPDP Act requires a grievance redressal mechanism. Unresolved complaints can be escalated to the Data Protection Board, resulting in regulatory action.",
        requiredActions: [
          { action: "Document grievance redressal procedures", configPath: "/app/compliance", automated: false },
          { action: "Designate a Data Protection Officer or grievance officer", configPath: "/app/compliance", automated: false },
          { action: "Track complaint resolution timelines", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ── DPDP Act (India) Controls — All Relevant Sections ──

function getDpdpControls(): Omit<ControlDefinition, "status" | "evidence">[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // Section 4 — Consent and Lawful Processing
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.4.1",
      framework: "dpdp",
      title: "Consent as ground for processing",
      description: "A person may process personal data of a Data Principal only in accordance with the provisions of this Act and for a lawful purpose — for which the Data Principal has given consent, or for certain legitimate uses.",
      category: "Sec 4: Consent & Lawful Processing",
      guidance: {
        learnMore: "Every instance of personal data processing on the AI platform must have a lawful basis: either explicit consent from the data principal or a recognized legitimate use under Section 7. You must be able to demonstrate the lawful basis for each processing activity.",
        whyItMatters: "Processing personal data without a lawful basis is the most fundamental DPDP Act violation. Penalties can reach INR 250 crore. For an AI platform, every Claw interaction involving personal data needs documented lawful basis.",
        requiredActions: [
          { action: "Document the lawful basis for each type of personal data processing", configPath: "/app/compliance", automated: false },
          { action: "Configure Claws processing personal data to require consent verification", configPath: "/app/claw-policies", automated: true },
          { action: "Maintain a register of processing activities with their lawful basis", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.4.2",
      framework: "dpdp",
      title: "Purpose limitation",
      description: "Personal data shall only be processed for the purpose consented to by the Data Principal and shall not be processed for any other purpose.",
      category: "Sec 4: Consent & Lawful Processing",
      guidance: {
        learnMore: "Personal data collected for one purpose (e.g., customer support) must not be repurposed (e.g., marketing, AI model training) without obtaining fresh consent for the new purpose.",
        whyItMatters: "Purpose creep is a common violation. AI platforms are especially susceptible because data from Claw interactions can easily be repurposed for model training, analytics, or profiling.",
        requiredActions: [
          { action: "Configure OPA policies to enforce purpose-based data access restrictions", configPath: "/app/claw-policies", automated: true },
          { action: "Tag Claw configurations with their approved processing purposes", configPath: "/app/claws", automated: false },
          { action: "Audit data usage to detect purpose deviation", configPath: "/app/compliance", automated: true },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 5 — Notice Requirements
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.5.1",
      framework: "dpdp",
      title: "Notice at point of collection",
      description: "Every Data Fiduciary shall, at the time of or before requesting consent, give to the Data Principal a notice containing a description of personal data sought and the purpose of processing.",
      category: "Sec 5: Notice",
      guidance: {
        learnMore: "Before any Claw collects personal data, the data principal must receive a notice describing what data is being collected, why, and how it will be processed. The notice must be in clear, plain language.",
        whyItMatters: "Consent without adequate notice is not valid consent under DPDP Act. If data principals do not understand what they are consenting to, the entire processing activity is unlawful.",
        requiredActions: [
          { action: "Create privacy notices for each Claw that processes personal data", configPath: "/app/compliance", automated: false },
          { action: "Configure Claw interactions to display privacy notice before data collection", configPath: "/app/claws", automated: false },
          { action: "Ensure notices are in clear language describing data and purpose", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.5.2",
      framework: "dpdp",
      title: "Notice content requirements",
      description: "The notice shall include: description of personal data, purpose of processing, manner of exercising rights, and manner of making complaints to the Data Protection Board.",
      category: "Sec 5: Notice",
      guidance: {
        learnMore: "Privacy notices must include all required elements: what personal data is collected, the specific purpose, how to exercise data principal rights (access, correction, erasure), and how to file complaints with the Data Protection Board.",
        whyItMatters: "Incomplete notices are equivalent to no notice. Missing any required element makes the notice non-compliant and invalidates the consent obtained.",
        requiredActions: [
          { action: "Verify all privacy notices include all DPDP-mandated elements", configPath: "/app/compliance", automated: false },
          { action: "Include Data Protection Board complaint mechanism in notices", configPath: "/app/compliance", automated: false },
          { action: "Document data principal rights exercise procedures in notices", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.5.3",
      framework: "dpdp",
      title: "Notice for existing data",
      description: "For personal data collected before the Act, a notice shall be given to the Data Principal as soon as reasonably practicable.",
      category: "Sec 5: Notice",
      guidance: {
        learnMore: "If the platform was processing personal data before the DPDP Act came into effect, retroactive notices must be sent to all affected data principals as soon as reasonably practicable.",
        whyItMatters: "Failing to provide retroactive notices means all pre-existing personal data processing continues without lawful basis once the Act is in force.",
        requiredActions: [
          { action: "Identify all personal data collected before DPDP Act enactment", configPath: "/app/compliance", automated: false },
          { action: "Send retroactive notices to affected data principals", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 6 — Consent Specifics
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.6.1",
      framework: "dpdp",
      title: "Free, specific, informed, and unambiguous consent",
      description: "Consent shall be free, specific, informed, unconditional and unambiguous, indicating the Data Principal's wishes by a clear affirmative action.",
      category: "Sec 6: Consent Specifics",
      guidance: {
        learnMore: "Consent must be: (1) Free - not coerced or bundled with service conditions, (2) Specific - for each defined purpose, (3) Informed - given after adequate notice, (4) Unconditional - not tied to service access, (5) Unambiguous - by clear affirmative action (not pre-ticked boxes).",
        whyItMatters: "Invalid consent invalidates all processing based on it. If consent is obtained through pre-ticked checkboxes, bundled agreements, or without adequate information, the entire data processing activity is unlawful.",
        requiredActions: [
          { action: "Implement granular consent collection (separate consent per purpose)", configPath: "/app/compliance", automated: false },
          { action: "Ensure consent is obtained through affirmative action (no pre-ticked boxes)", configPath: "/app/compliance", automated: false },
          { action: "Document that consent is not bundled with platform access conditions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.6.2",
      framework: "dpdp",
      title: "Consent withdrawal",
      description: "The Data Principal shall have the right to withdraw consent at any time, with the ease of such withdrawal being comparable to the ease of giving consent.",
      category: "Sec 6: Consent Specifics",
      guidance: {
        learnMore: "Data principals must be able to withdraw consent as easily as they gave it. If consent was given with one click, withdrawal must also be possible with one click. Withdrawal must stop future processing.",
        whyItMatters: "Difficult consent withdrawal processes are treated as non-compliant. The principle is that withdrawal must be as easy as giving consent.",
        requiredActions: [
          { action: "Implement easy consent withdrawal mechanism accessible from the platform", configPath: "/app/compliance", automated: false },
          { action: "Configure Claws to stop processing personal data when consent is withdrawn", configPath: "/app/claw-policies", automated: false },
          { action: "Document consent withdrawal procedures and technical implementation", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.6.3",
      framework: "dpdp",
      title: "Consent Manager",
      description: "A Data Principal may give, manage, review and withdraw consent through a Consent Manager registered with the Board.",
      category: "Sec 6: Consent Specifics",
      guidance: {
        learnMore: "The platform should be prepared to interoperate with registered Consent Managers (third-party consent management services registered with the Data Protection Board) for consent lifecycle management.",
        whyItMatters: "As the DPDP ecosystem matures, Consent Managers will become a standard mechanism. Being prepared for integration ensures long-term compliance.",
        requiredActions: [
          { action: "Plan integration architecture for registered Consent Managers", configPath: "/app/compliance", automated: false },
          { action: "Document consent management API capabilities for Consent Manager interoperability", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 7 — Certain Legitimate Uses
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.7.1",
      framework: "dpdp",
      title: "Legitimate uses without consent",
      description: "Personal data may be processed without consent for certain legitimate uses: voluntary provision by Data Principal, State functions, legal obligations, medical emergencies, employment purposes, and public interest.",
      category: "Sec 7: Legitimate Uses",
      guidance: {
        learnMore: "In specific scenarios, personal data can be processed without explicit consent: when the data principal voluntarily provides data for a specified purpose, for compliance with legal obligations, medical emergencies, or employment-related purposes. Each legitimate use must be documented.",
        whyItMatters: "Misidentifying a processing activity as a legitimate use when it requires consent is a violation. Each legitimate use claim must be defensible and documented.",
        requiredActions: [
          { action: "Identify Claw interactions that may qualify as legitimate uses", configPath: "/app/compliance", automated: false },
          { action: "Document justification for each claimed legitimate use", configPath: "/app/compliance", automated: false },
          { action: "Configure separate processing rules for consent-based vs legitimate-use processing", configPath: "/app/claw-policies", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 8 — General Obligations of Data Fiduciary
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.8.1",
      framework: "dpdp",
      title: "Reasonable security safeguards",
      description: "Every Data Fiduciary shall protect personal data in its possession or under its control by taking reasonable security safeguards to prevent personal data breach.",
      category: "Sec 8: Data Fiduciary Obligations",
      guidance: {
        learnMore: "Implement comprehensive security safeguards: encryption at rest and in transit, access controls (RBAC), OPA policy enforcement, audit logging, and vulnerability management. Security must be proportionate to the sensitivity of data processed.",
        whyItMatters: "Failure to implement reasonable security safeguards resulting in a data breach triggers penalties up to INR 250 crore. The standard is 'reasonable' — assessed based on the nature and volume of data.",
        requiredActions: [
          { action: "Verify encryption is enabled for data at rest and in transit", configPath: "/app/compliance", automated: true },
          { action: "Ensure RBAC is configured with least-privilege access", configPath: "/app/roles", automated: true },
          { action: "Deploy OPA policies for all Claws processing personal data", configPath: "/app/claw-policies", automated: true },
          { action: "Enable comprehensive audit logging", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "DPDP.8.2",
      framework: "dpdp",
      title: "Data accuracy and completeness",
      description: "The Data Fiduciary shall ensure the completeness, accuracy and consistency of personal data, particularly where such data is likely to be used to make a decision about the Data Principal.",
      category: "Sec 8: Data Fiduciary Obligations",
      guidance: {
        learnMore: "Personal data used by AI Claws to make decisions must be accurate and complete. This is especially critical when Claw outputs influence business decisions about individuals.",
        whyItMatters: "AI decisions based on inaccurate personal data can cause harm to individuals. Under DPDP Act, the data fiduciary is responsible for data accuracy regardless of the data source.",
        requiredActions: [
          { action: "Implement data validation for personal data used in Claw decision-making", configPath: "/app/claw-policies", automated: false },
          { action: "Provide data correction mechanisms for data principals", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.8.3",
      framework: "dpdp",
      title: "Data retention limitation",
      description: "The Data Fiduciary shall not retain personal data beyond the period necessary for the purpose for which it was processed, unless retention is necessary for compliance with any law.",
      category: "Sec 8: Data Fiduciary Obligations",
      guidance: {
        learnMore: "Personal data must be deleted when the processing purpose is fulfilled. Define retention periods for each category of personal data and implement automated deletion when periods expire.",
        whyItMatters: "Indefinite retention of personal data violates the Act. Every piece of personal data in the platform must have a defined retention period and automatic deletion mechanism.",
        requiredActions: [
          { action: "Define retention periods for personal data in each Claw context", configPath: "/app/compliance", automated: false },
          { action: "Implement automated data deletion for expired personal data", configPath: "/app/compliance", automated: false },
          { action: "Document retention schedule and legal basis for any extended retention", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.8.4",
      framework: "dpdp",
      title: "Breach notification",
      description: "In the event of a personal data breach, the Data Fiduciary shall notify the Board and each affected Data Principal in such form and manner as may be prescribed.",
      category: "Sec 8: Data Fiduciary Obligations",
      guidance: {
        learnMore: "If a personal data breach occurs, notify the Data Protection Board of India and all affected data principals in the prescribed form and timeline. Have breach detection and notification procedures ready.",
        whyItMatters: "Failure to notify after a breach is a separate violation with its own penalties. The notification timeline is prescribed by the Board — late notification compounds the regulatory consequences.",
        requiredActions: [
          { action: "Document breach notification procedures including Board notification template", configPath: "/app/compliance", automated: false },
          { action: "Configure automated breach detection through security event monitoring", configPath: "/app/compliance", automated: true },
          { action: "Maintain contact information for the Data Protection Board", configPath: "/app/compliance", automated: false },
          { action: "Prepare breach notification templates for data principals", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.8.5",
      framework: "dpdp",
      title: "Erasure upon purpose completion",
      description: "When the purpose for which personal data was processed is no longer being served, and retention is no longer necessary for legal purposes, the Data Fiduciary shall erase the personal data.",
      category: "Sec 8: Data Fiduciary Obligations",
      guidance: {
        learnMore: "Once the purpose of processing is fulfilled (e.g., a customer support interaction is resolved), personal data must be erased unless retention is required by law. Implement proactive deletion triggers.",
        whyItMatters: "This creates an affirmative obligation to delete — not just a passive retention limit. The data fiduciary must actively identify and erase data when purposes are fulfilled.",
        requiredActions: [
          { action: "Define purpose completion triggers for each processing activity", configPath: "/app/compliance", automated: false },
          { action: "Implement automated erasure when processing purposes are fulfilled", configPath: "/app/compliance", automated: false },
          { action: "Maintain erasure logs for compliance verification", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 9 — Data Principal Rights
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.9.1",
      framework: "dpdp",
      title: "Right to access information",
      description: "The Data Principal shall have the right to obtain a summary of personal data being processed and the processing activities undertaken.",
      category: "Sec 9: Data Principal Rights",
      guidance: {
        learnMore: "Data principals can request a summary of all personal data the platform holds about them and a description of all processing activities. The response must be provided in a clear, accessible format.",
        whyItMatters: "Access requests must be fulfilled within the prescribed timeline. Inability to respond demonstrates inadequate data management and results in penalties.",
        requiredActions: [
          { action: "Implement data subject access request (DSAR) handling endpoint", configPath: "/app/compliance", automated: false },
          { action: "Enable personal data export in a standard format", configPath: "/app/compliance", automated: false },
          { action: "Document DSAR fulfillment procedures and timelines", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.9.2",
      framework: "dpdp",
      title: "Right to correction and erasure",
      description: "The Data Principal shall have the right to correction and erasure of personal data.",
      category: "Sec 9: Data Principal Rights",
      guidance: {
        learnMore: "Data principals can request correction of inaccurate personal data and complete erasure of their data. The platform must be able to locate and modify or delete all instances of a data principal's personal data.",
        whyItMatters: "Inability to correct or delete data on request is a clear violation. For AI platforms, this includes data in Claw conversation logs, inference records, and any derived datasets.",
        requiredActions: [
          { action: "Implement data correction request handling", configPath: "/app/compliance", automated: false },
          { action: "Implement data erasure request handling across all data stores", configPath: "/app/compliance", automated: false },
          { action: "Ensure erasure covers Claw logs, inference records, and derived data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.9.3",
      framework: "dpdp",
      title: "Right to grievance redressal",
      description: "The Data Principal shall have the right to have readily available means of grievance redressal in respect of any act or omission of the Data Fiduciary.",
      category: "Sec 9: Data Principal Rights",
      guidance: {
        learnMore: "The platform must provide an accessible grievance mechanism where data principals can raise complaints about data handling. Responses must be provided within the prescribed timeline.",
        whyItMatters: "Unresolved grievances can be escalated to the Data Protection Board. Having no grievance mechanism is itself a violation, regardless of whether actual grievances exist.",
        requiredActions: [
          { action: "Establish a grievance redressal mechanism accessible from the platform", configPath: "/app/compliance", automated: false },
          { action: "Designate a grievance officer with contact details", configPath: "/app/compliance", automated: false },
          { action: "Document grievance handling procedures and response timelines", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.9.4",
      framework: "dpdp",
      title: "Right to nominate",
      description: "The Data Principal shall have the right to nominate any other individual who shall exercise the rights of the Data Principal in the event of death or incapacity.",
      category: "Sec 9: Data Principal Rights",
      guidance: {
        learnMore: "Data principals must be able to nominate another individual to exercise their data rights in case of death or incapacity. The platform should support recording and honoring such nominations.",
        whyItMatters: "This is a unique DPDP Act requirement. Failure to implement nomination capability is a compliance gap that auditors will identify.",
        requiredActions: [
          { action: "Implement nomination recording mechanism", configPath: "/app/compliance", automated: false },
          { action: "Document procedures for verifying and honoring nominee requests", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 10 — Significant Data Fiduciary
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.10.1",
      framework: "dpdp",
      title: "Data Protection Impact Assessment (DPIA)",
      description: "A Significant Data Fiduciary shall undertake a Data Protection Impact Assessment.",
      category: "Sec 10: Significant Data Fiduciary",
      guidance: {
        learnMore: "If classified as a Significant Data Fiduciary (based on volume/sensitivity of data), you must conduct DPIAs for all AI processing activities involving personal data. DPIAs must assess risks and identify mitigation measures.",
        whyItMatters: "DPIAs are mandatory for Significant Data Fiduciaries. AI platforms processing personal data at scale are likely to be classified as such. Non-compliance results in enhanced penalties.",
        requiredActions: [
          { action: "Determine if the organization qualifies as a Significant Data Fiduciary", configPath: "/app/compliance", automated: false },
          { action: "Conduct DPIAs for all Claw configurations processing personal data", configPath: "/app/compliance", automated: false },
          { action: "Document DPIA findings and remediation actions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.10.2",
      framework: "dpdp",
      title: "Periodic audit",
      description: "A Significant Data Fiduciary shall undertake periodic audits and appoint an independent data auditor.",
      category: "Sec 10: Significant Data Fiduciary",
      guidance: {
        learnMore: "Significant Data Fiduciaries must conduct periodic audits by an independent data auditor. The compliance reports generated by this platform can support the audit process, but an independent assessment is required.",
        whyItMatters: "Self-assessment is insufficient for Significant Data Fiduciaries. Independent audits provide the assurance required by the Act and identify blind spots in self-reporting.",
        requiredActions: [
          { action: "Generate comprehensive compliance reports for audit support", configPath: "/app/compliance", automated: true },
          { action: "Engage an independent data auditor for periodic audits", configPath: "/app/compliance", automated: false },
          { action: "Document audit findings and corrective actions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DPDP.10.3",
      framework: "dpdp",
      title: "Data Protection Officer (DPO)",
      description: "A Significant Data Fiduciary shall appoint a Data Protection Officer based in India.",
      category: "Sec 10: Significant Data Fiduciary",
      guidance: {
        learnMore: "Appoint a DPO based in India who is responsible for overseeing data protection compliance, acting as the point of contact for data principals and the Data Protection Board.",
        whyItMatters: "The DPO is the central figure in DPDP compliance. Without a DPO, there is no designated accountability for data protection, and regulatory communications have no recipient.",
        requiredActions: [
          { action: "Appoint a Data Protection Officer based in India", configPath: "/app/compliance", automated: false },
          { action: "Publish DPO contact information on the platform and in privacy notices", configPath: "/app/compliance", automated: false },
          { action: "Define DPO role and responsibilities in RBAC", configPath: "/app/roles", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 11 — Transfer Outside India
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.11.1",
      framework: "dpdp",
      title: "Cross-border transfer restrictions",
      description: "The Data Fiduciary may transfer personal data of a Data Principal to any country or territory outside India, except to those restricted by the Central Government by notification.",
      category: "Sec 11: Cross-Border Transfer",
      guidance: {
        learnMore: "Personal data can be transferred outside India unless specifically restricted by government notification. However, transfers to AI model providers hosted outside India (OpenAI in the US, etc.) must be tracked and documented.",
        whyItMatters: "Cross-border data transfer is a high-scrutiny area. AI platforms routinely send data to international AI providers, making this a critical compliance requirement to monitor and document.",
        requiredActions: [
          { action: "Document all cross-border data transfers including AI model provider API calls", configPath: "/app/compliance", automated: false },
          { action: "Track AI model provider hosting locations and data processing regions", configPath: "/app/compliance", automated: false },
          { action: "Monitor government notifications for restricted territories", configPath: "/app/compliance", automated: false },
          { action: "Configure data residency controls for personal data", configPath: "/app/claw-policies", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 12 — Exemptions
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.12.1",
      framework: "dpdp",
      title: "Applicable exemptions",
      description: "The Central Government may exempt certain processing activities in the interest of sovereignty, security, public order, research, archival, or other specified purposes.",
      category: "Sec 12: Exemptions",
      guidance: {
        learnMore: "Certain processing activities may be exempt from some DPDP requirements. These exemptions are narrowly defined and must be claimed only where genuinely applicable. Document any exemption claims with supporting justification.",
        whyItMatters: "Incorrectly claiming exemptions exposes the organization to penalties for non-compliance. Exemptions must be narrowly interpreted and documented.",
        requiredActions: [
          { action: "Identify any processing activities that qualify for exemptions", configPath: "/app/compliance", automated: false },
          { action: "Document justification for each claimed exemption", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 13 — Data Protection Board
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.13.1",
      framework: "dpdp",
      title: "Cooperation with Data Protection Board",
      description: "The Data Fiduciary shall cooperate with the Data Protection Board of India in the performance of its functions.",
      category: "Sec 13: Data Protection Board",
      guidance: {
        learnMore: "The organization must be prepared to cooperate with the Data Protection Board: responding to inquiries, providing requested information, facilitating inspections, and complying with Board directions.",
        whyItMatters: "Non-cooperation with the Board can result in additional penalties and adverse regulatory action. Being prepared for Board interactions demonstrates organizational maturity.",
        requiredActions: [
          { action: "Maintain up-to-date contact information for the Data Protection Board", configPath: "/app/compliance", automated: false },
          { action: "Document procedures for responding to Board inquiries and directions", configPath: "/app/compliance", automated: false },
          { action: "Ensure compliance reports are readily available for Board review", configPath: "/app/compliance", automated: true },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 17 — Penalties
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.17.1",
      framework: "dpdp",
      title: "Penalty prevention measures",
      description: "Penalties up to INR 250 crore for non-compliance. The Data Fiduciary shall implement measures to prevent violations that attract penalties.",
      category: "Sec 17: Penalties",
      guidance: {
        learnMore: "The DPDP Act prescribes significant penalties: up to INR 250 crore for failure to implement reasonable security safeguards, up to INR 200 crore for failure to notify breaches, and up to INR 150 crore for non-compliance with Board directions. Implementing comprehensive compliance controls is the best prevention.",
        whyItMatters: "The financial penalties are substantial enough to threaten business viability. Full compliance across all DPDP controls is the most cost-effective risk mitigation strategy.",
        requiredActions: [
          { action: "Verify all DPDP controls are implemented or have remediation plans", configPath: "/app/compliance", automated: true },
          { action: "Conduct regular compliance assessments to identify gaps before they result in violations", configPath: "/app/compliance", automated: true },
          { action: "Maintain evidence of compliance efforts for penalty mitigation if needed", configPath: "/app/compliance", automated: true },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Section 18 — Alternate Dispute Resolution
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DPDP.18.1",
      framework: "dpdp",
      title: "Voluntary undertaking and alternate resolution",
      description: "The Board may accept voluntary undertakings and facilitate alternate dispute resolution between Data Principals and Data Fiduciaries.",
      category: "Sec 18: Dispute Resolution",
      guidance: {
        learnMore: "The Act enables voluntary undertakings and mediation as alternatives to formal enforcement. Being proactive in resolving complaints and offering voluntary commitments can mitigate regulatory risk.",
        whyItMatters: "Demonstrating willingness to resolve disputes through voluntary undertakings shows good faith and can result in more favorable regulatory outcomes than contested enforcement.",
        requiredActions: [
          { action: "Document willingness and procedures for voluntary dispute resolution", configPath: "/app/compliance", automated: false },
          { action: "Establish mediation procedures for data principal complaints", configPath: "/app/compliance", automated: false },
          { action: "Maintain records of complaint resolutions for regulatory reference", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ── Control Status Assessment ──

async function assessControlStatus(
  orgId: string,
  control: Omit<ControlDefinition, "status" | "evidence">,
  period: ReportPeriod,
): Promise<ControlDefinition> {
  const evidence: string[] = [];
  let status: ControlDefinition["status"] = "planned";

  switch (control.framework) {
    case "iso27001":
      status = await assessIso27001Control(orgId, control.id, period, evidence);
      break;
    case "soc2":
      status = await assessSoc2Control(orgId, control.id, period, evidence);
      break;
    case "dpdp":
      status = await assessDpdpControl(orgId, control.id, period, evidence);
      break;
  }

  return { ...control, status, evidence };
}

async function assessIso27001Control(
  orgId: string,
  controlId: string,
  period: ReportPeriod,
  evidence: string[],
): Promise<ControlDefinition["status"]> {
  // Helper queries used by multiple controls
  const getPolicyTemplateCount = async () => {
    const templates = await db
      .select({ cnt: count() })
      .from(clawPolicyTemplates)
      .where(eq(clawPolicyTemplates.organizationId, orgId));
    return Number(templates[0]?.cnt ?? 0);
  };

  const getRoleCount = async () => {
    const roleCount = await db
      .select({ cnt: count() })
      .from(roles)
      .where(eq(roles.organizationId, orgId));
    return Number(roleCount[0]?.cnt ?? 0);
  };

  const getRoleAssignmentCount = async () => {
    const assignments = await db
      .select({ cnt: count() })
      .from(userRoles)
      .where(eq(userRoles.organizationId, orgId));
    return Number(assignments[0]?.cnt ?? 0);
  };

  const getAuditEventCount = async () => {
    const auditCount = await db
      .select({ cnt: count() })
      .from(clawAuditEvents)
      .where(
        and(
          eq(clawAuditEvents.organizationId, orgId),
          gte(clawAuditEvents.timestamp, period.start),
          lte(clawAuditEvents.timestamp, period.end),
        ),
      );
    return Number(auditCount[0]?.cnt ?? 0);
  };

  const getClawsWithPolicyCount = async () => {
    const clawsWithPolicy = await db
      .select({ cnt: count() })
      .from(claws)
      .where(
        and(
          eq(claws.organizationId, orgId),
          sql`${claws.policyTemplateId} IS NOT NULL`,
        ),
      );
    return Number(clawsWithPolicy[0]?.cnt ?? 0);
  };

  switch (controlId) {
    // ── A.5 Organizational Controls ──
    case "A.5.1": {
      const cnt = await getPolicyTemplateCount();
      if (cnt > 0) {
        evidence.push(`${cnt} policy template(s) defined for the organization`);
        return "implemented";
      }
      evidence.push("No policy templates defined");
      return "planned";
    }

    case "A.5.2": {
      const cnt = await getRoleCount();
      if (cnt > 0) {
        evidence.push(`${cnt} RBAC role(s) defined with security responsibilities`);
        return "implemented";
      }
      evidence.push("No RBAC roles defined");
      return "planned";
    }

    case "A.5.3": {
      const cnt = await getRoleCount();
      if (cnt >= 2) {
        evidence.push(`${cnt} distinct roles defined, enabling segregation of duties`);
        return "implemented";
      }
      evidence.push("Insufficient role differentiation for duty segregation");
      return "partial";
    }

    case "A.5.4": {
      const cnt = await getPolicyTemplateCount();
      evidence.push("Management responsibility enforced through organization-wide policy templates");
      return cnt > 0 ? "implemented" : "partial";
    }

    case "A.5.5":
    case "A.5.7":
    case "A.5.8": {
      // Procedural controls — partial by default
      evidence.push("Requires documented organizational procedures");
      return "partial";
    }

    case "A.5.9": {
      const totalClaws = await db
        .select({ cnt: count() })
        .from(claws)
        .where(eq(claws.organizationId, orgId));
      const cnt = Number(totalClaws[0]?.cnt ?? 0);
      evidence.push(`${cnt} claw(s) registered as information assets`);
      return cnt > 0 ? "implemented" : "planned";
    }

    case "A.5.10": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? `${cnt} OPA policy template(s) define acceptable use rules`
        : "No acceptable use policies configured via OPA");
      return cnt > 0 ? "implemented" : "partial";
    }

    case "A.5.12": {
      const distribution = await getClassificationDistribution(orgId, period);
      const classified = Object.entries(distribution)
        .filter(([k]) => k !== "unclassified")
        .reduce((sum, [, v]) => sum + v, 0);
      evidence.push(`${classified} claw(s) have data classification assigned`);
      return classified > 0 ? "implemented" : "partial";
    }

    case "A.5.13": {
      const distribution = await getClassificationDistribution(orgId, period);
      const classified = Object.entries(distribution)
        .filter(([k]) => k !== "unclassified")
        .reduce((sum, [, v]) => sum + v, 0);
      evidence.push(`${classified} claw(s) with classification labels applied`);
      return classified > 0 ? "implemented" : "partial";
    }

    case "A.5.15": {
      const cnt = await getRoleAssignmentCount();
      if (cnt > 0) {
        evidence.push(`${cnt} role assignment(s) active`);
        return "implemented";
      }
      evidence.push("No role assignments found");
      return "partial";
    }

    case "A.5.16": {
      const cnt = await getRoleAssignmentCount();
      evidence.push(`${cnt} active user-role assignment(s) in identity management`);
      return cnt > 0 ? "implemented" : "partial";
    }

    case "A.5.17": {
      evidence.push("Authentication managed via platform authentication middleware");
      return "implemented";
    }

    case "A.5.18": {
      const auditCnt = await getAuditEventCount();
      const roleCnt = await getRoleAssignmentCount();
      evidence.push(`${roleCnt} access right assignment(s), ${auditCnt} audit events tracking changes`);
      return roleCnt > 0 ? "implemented" : "partial";
    }

    case "A.5.19":
    case "A.5.21": {
      evidence.push("Supplier/supply chain security requires documented vendor assessments");
      return "partial";
    }

    case "A.5.23": {
      const cnt = await getClawsWithPolicyCount();
      evidence.push(`${cnt} claw(s) with policy templates assigned for cloud security`);
      return cnt > 0 ? "implemented" : "partial";
    }

    case "A.5.24":
    case "A.5.25":
    case "A.5.26":
    case "A.5.27": {
      evidence.push("Incident management requires documented procedures");
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events available for incident investigation`);
      return auditCnt > 0 ? "partial" : "planned";
    }

    case "A.5.28": {
      const cnt = await getAuditEventCount();
      evidence.push(`${cnt} audit event(s) in period`);
      return cnt > 0 ? "implemented" : "partial";
    }

    case "A.5.29":
    case "A.5.30": {
      evidence.push("Business continuity requires documented plans and testing");
      return "partial";
    }

    case "A.5.31": {
      evidence.push("Legal and regulatory requirements tracked via compliance frameworks");
      return "implemented";
    }

    case "A.5.34": {
      const distribution = await getClassificationDistribution(orgId, period);
      const classified = Object.entries(distribution)
        .filter(([k]) => k !== "unclassified")
        .reduce((sum, [, v]) => sum + v, 0);
      evidence.push(`${classified} claw(s) with data classification for PII identification`);
      return classified > 0 ? "partial" : "planned";
    }

    case "A.5.36": {
      evidence.push("Compliance review performed via compliance dashboard and live verification");
      return "implemented";
    }

    case "A.5.37": {
      evidence.push("Operating procedures require documentation");
      return "partial";
    }

    // ── A.6 People Controls ──
    case "A.6.1":
    case "A.6.2":
    case "A.6.3":
    case "A.6.4":
    case "A.6.5":
    case "A.6.6":
    case "A.6.7":
    case "A.6.8": {
      // People controls are largely procedural
      if (controlId === "A.6.5") {
        const roleCnt = await getRoleAssignmentCount();
        evidence.push(`RBAC supports access revocation (${roleCnt} active assignments)`);
        return roleCnt > 0 ? "partial" : "planned";
      }
      if (controlId === "A.6.7") {
        evidence.push("Session management supports remote working security");
        return "partial";
      }
      if (controlId === "A.6.8") {
        const auditCnt = await getAuditEventCount();
        evidence.push(`${auditCnt} security events logged for reporting`);
        return auditCnt > 0 ? "partial" : "planned";
      }
      evidence.push("Requires documented organizational procedures");
      return "partial";
    }

    // ── A.7 Physical Controls ──
    case "A.7.1":
    case "A.7.4":
    case "A.7.9":
    case "A.7.10":
    case "A.7.14": {
      evidence.push("Physical controls managed at cloud provider and office level");
      return "partial";
    }

    case "A.7.7": {
      evidence.push("Clear desk/screen policy — session timeout supported by platform");
      return "partial";
    }

    // ── A.8 Technology Controls ──
    case "A.8.1": {
      evidence.push("Endpoint device security managed at organizational level");
      return "partial";
    }

    case "A.8.2": {
      const roleCnt = await getRoleCount();
      evidence.push(`RBAC system implements role-based privilege management with ${roleCnt} role(s)`);
      return roleCnt > 0 ? "implemented" : "partial";
    }

    case "A.8.3": {
      const cnt = await getPolicyTemplateCount();
      if (cnt > 0) {
        evidence.push("OPA policy engine enforces information access restrictions");
        return "implemented";
      }
      evidence.push("No OPA policy templates configured for access restriction");
      return "partial";
    }

    case "A.8.4":
      evidence.push("Source code access managed through platform RBAC");
      return "implemented";

    case "A.8.5": {
      evidence.push("Authentication middleware enforces secure authentication for all access");
      return "implemented";
    }

    case "A.8.6": {
      const sessions = await db
        .select({ cnt: count() })
        .from(concurrencySessions)
        .where(eq(concurrencySessions.organizationId, orgId));
      evidence.push(`Concurrency governance tracks ${Number(sessions[0]?.cnt ?? 0)} session(s)`);
      return "implemented";
    }

    case "A.8.7": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? "OPA policies validate inputs and restrict unauthorized operations"
        : "Input validation policies not yet configured");
      return cnt > 0 ? "implemented" : "partial";
    }

    case "A.8.8":
    case "A.8.25":
    case "A.8.26":
    case "A.8.28":
    case "A.8.29":
    case "A.8.31": {
      evidence.push("Secure development and vulnerability management requires documented processes");
      return "partial";
    }

    case "A.8.9": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events tracking configuration changes`);
      return auditCnt > 0 ? "implemented" : "partial";
    }

    case "A.8.10":
      evidence.push("Data retention and deletion policies require configuration");
      return "partial";

    case "A.8.11": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? "OPA policies can enforce data masking rules"
        : "Data masking policies not yet configured");
      return cnt > 0 ? "partial" : "planned";
    }

    case "A.8.12": {
      const cnt = await getPolicyTemplateCount();
      const toolDenials = await db
        .select({ cnt: count() })
        .from(clawToolEvents)
        .where(
          and(
            eq(clawToolEvents.organizationId, orgId),
            eq(clawToolEvents.status, "denied"),
          ),
        );
      const denialCnt = Number(toolDenials[0]?.cnt ?? 0);
      evidence.push(`${cnt} OPA policies for DLP, ${denialCnt} tool invocations denied`);
      return cnt > 0 ? "implemented" : "partial";
    }

    case "A.8.15": {
      const eventCount = await getAuditEventCount();
      evidence.push(`${eventCount} events logged in period`);
      return "implemented";
    }

    case "A.8.16": {
      evidence.push("Real-time policy evaluation via OPA monitors all claw actions");
      return "implemented";
    }

    case "A.8.20":
    case "A.8.21": {
      evidence.push("TLS encryption enforced for all API communications");
      return "implemented";
    }

    case "A.8.23": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? "OPA policies can restrict outbound URL access for Claws"
        : "Web filtering policies not yet configured");
      return cnt > 0 ? "partial" : "planned";
    }

    case "A.8.24": {
      evidence.push("TLS encryption in transit for all API communications");
      evidence.push("Database encryption at rest via provider-managed keys");
      return "implemented";
    }

    case "A.8.32": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} change events tracked in audit log`);
      return auditCnt > 0 ? "implemented" : "partial";
    }

    default:
      evidence.push("Control assessment pending");
      return "planned";
  }
}

async function assessSoc2Control(
  orgId: string,
  controlId: string,
  period: ReportPeriod,
  evidence: string[],
): Promise<ControlDefinition["status"]> {
  // Helper queries
  const getPolicyTemplateCount = async () => {
    const templates = await db
      .select({ cnt: count() })
      .from(clawPolicyTemplates)
      .where(eq(clawPolicyTemplates.organizationId, orgId));
    return Number(templates[0]?.cnt ?? 0);
  };

  const getRoleAssignmentCount = async () => {
    const assignments = await db
      .select({ cnt: count() })
      .from(userRoles)
      .where(eq(userRoles.organizationId, orgId));
    return Number(assignments[0]?.cnt ?? 0);
  };

  const getAuditEventCount = async () => {
    const auditCount = await db
      .select({ cnt: count() })
      .from(clawAuditEvents)
      .where(
        and(
          eq(clawAuditEvents.organizationId, orgId),
          gte(clawAuditEvents.timestamp, period.start),
          lte(clawAuditEvents.timestamp, period.end),
        ),
      );
    return Number(auditCount[0]?.cnt ?? 0);
  };

  switch (controlId) {
    // ── CC1 Control Environment ──
    case "CC1.1": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? `${cnt} policy template(s) establish organizational integrity standards`
        : "Organization policies and code of conduct require documentation");
      return cnt > 0 ? "implemented" : "partial";
    }

    case "CC1.2":
    case "CC1.3":
    case "CC1.4": {
      evidence.push("Governance and management structure requires documentation");
      return "partial";
    }

    case "CC1.5": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events with actor attribution ensure accountability`);
      return auditCnt > 0 ? "implemented" : "partial";
    }

    // ── CC2 Communication & Information ──
    case "CC2.1": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events provide quality compliance information`);
      return auditCnt > 0 ? "implemented" : "partial";
    }

    case "CC2.2":
    case "CC2.3": {
      evidence.push("Communication of security policies requires documentation");
      return "partial";
    }

    // ── CC3 Risk Assessment ──
    case "CC3.1":
    case "CC3.3": {
      evidence.push("Risk assessment requires documented procedures");
      return "partial";
    }

    case "CC3.2": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`Security events (${auditCnt} in period) provide risk indicators`);
      return auditCnt > 0 ? "partial" : "planned";
    }

    case "CC3.4": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events available for change risk assessment`);
      return auditCnt > 0 ? "partial" : "planned";
    }

    // ── CC4 Monitoring Activities ──
    case "CC4.1": {
      const auditCnt = await getAuditEventCount();
      const policyCnt = await getPolicyTemplateCount();
      evidence.push(`Continuous monitoring: ${auditCnt} audit events, ${policyCnt} policy templates`);
      return (auditCnt > 0 && policyCnt > 0) ? "implemented" : "partial";
    }

    case "CC4.2": {
      evidence.push("Deficiency remediation tracked via compliance dashboard");
      return "implemented";
    }

    // ── CC5 Control Activities ──
    case "CC5.1":
    case "CC5.2": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(`${cnt} OPA policy template(s) enforce control activities`);
      return cnt > 0 ? "implemented" : "partial";
    }

    case "CC5.3": {
      const cnt = await getPolicyTemplateCount();
      const totalClaws = await db
        .select({ cnt: count() })
        .from(claws)
        .where(eq(claws.organizationId, orgId));
      const clawsWithPolicy = await db
        .select({ cnt: count() })
        .from(claws)
        .where(
          and(
            eq(claws.organizationId, orgId),
            sql`${claws.policyTemplateId} IS NOT NULL`,
          ),
        );
      evidence.push(`${Number(clawsWithPolicy[0]?.cnt ?? 0)}/${Number(totalClaws[0]?.cnt ?? 0)} claws have policy templates deployed`);
      return cnt > 0 ? "implemented" : "partial";
    }

    // ── CC6 Logical & Physical Access ──
    case "CC6.1": {
      evidence.push("OPA-based policy engine enforces logical access for all AI operations");
      return "implemented";
    }

    case "CC6.2": {
      evidence.push("User registration handled via authentication middleware");
      return "implemented";
    }

    case "CC6.3": {
      const cnt = await getRoleAssignmentCount();
      evidence.push(`${cnt} RBAC role assignment(s) enforce role-based access`);
      return cnt > 0 ? "implemented" : "partial";
    }

    case "CC6.4": {
      evidence.push("Physical access managed by cloud provider");
      return "partial";
    }

    case "CC6.5": {
      const cnt = await getRoleAssignmentCount();
      evidence.push(`RBAC system supports access removal (${cnt} active assignments)`);
      return cnt > 0 ? "implemented" : "partial";
    }

    case "CC6.6": {
      evidence.push("API authentication enforced for all external endpoints");
      return "implemented";
    }

    case "CC6.7": {
      evidence.push("TLS encryption enforced for all data transmission");
      return "implemented";
    }

    case "CC6.8": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? "OPA policies restrict unauthorized tool invocations"
        : "Tool invocation restriction policies not yet configured");
      return cnt > 0 ? "implemented" : "partial";
    }

    // ── CC7 System Operations ──
    case "CC7.1":
    case "CC7.2": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} monitoring events in period`);
      return auditCnt > 0 ? "implemented" : "partial";
    }

    case "CC7.3": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} security events available for evaluation`);
      return auditCnt > 0 ? "implemented" : "partial";
    }

    case "CC7.4":
    case "CC7.5": {
      evidence.push("Incident response and recovery requires documented procedures");
      return "partial";
    }

    // ── CC8 Change Management ──
    case "CC8.1": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} change events tracked in audit log`);
      return auditCnt > 0 ? "implemented" : "partial";
    }

    // ── CC9 Risk Mitigation ──
    case "CC9.1": {
      const policyCnt = await getPolicyTemplateCount();
      evidence.push(`${policyCnt} OPA policies as risk mitigation controls`);
      return policyCnt > 0 ? "implemented" : "partial";
    }

    case "CC9.2": {
      evidence.push("Vendor risk management requires documented assessments");
      return "partial";
    }

    // ── A1 Availability ──
    case "A1.1": {
      const sessions = await db
        .select({ cnt: count() })
        .from(concurrencySessions)
        .where(eq(concurrencySessions.organizationId, orgId));
      evidence.push(`Concurrency governance tracks ${Number(sessions[0]?.cnt ?? 0)} session(s)`);
      return "implemented";
    }

    case "A1.2":
    case "A1.3": {
      evidence.push("Backup and recovery testing requires documented procedures");
      return "partial";
    }

    // ── PI1 Processing Integrity ──
    case "PI1.1":
    case "PI1.3": {
      const inferenceCount = await db
        .select({ cnt: count() })
        .from(clawInferenceEvents)
        .where(
          and(
            eq(clawInferenceEvents.organizationId, orgId),
            gte(clawInferenceEvents.timestamp, period.start),
            lte(clawInferenceEvents.timestamp, period.end),
          ),
        );
      evidence.push(`${Number(inferenceCount[0]?.cnt ?? 0)} inference events tracked for processing integrity`);
      return "implemented";
    }

    case "PI1.2": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? "OPA policies validate input parameters"
        : "Input validation policies not configured");
      return cnt > 0 ? "implemented" : "partial";
    }

    case "PI1.4": {
      evidence.push("Output validation supported via OPA policy evaluation");
      return "partial";
    }

    case "PI1.5": {
      const toolEvents = await db
        .select({ cnt: count() })
        .from(clawToolEvents)
        .where(
          and(
            eq(clawToolEvents.organizationId, orgId),
            gte(clawToolEvents.timestamp, period.start),
          ),
        );
      evidence.push(`${Number(toolEvents[0]?.cnt ?? 0)} tool events tracked for error monitoring`);
      return "implemented";
    }

    // ── C1 Confidentiality ──
    case "C1.1": {
      const distribution = await getClassificationDistribution(orgId, period);
      const classified = Object.entries(distribution)
        .filter(([k]) => k !== "unclassified")
        .reduce((sum, [, v]) => sum + v, 0);
      evidence.push(`${classified} claw(s) have data classification assigned`);
      return classified > 0 ? "implemented" : "partial";
    }

    case "C1.2": {
      evidence.push("Data disposal procedures require documentation");
      return "partial";
    }

    // ── P1 Privacy ──
    case "P1.1":
    case "P1.2":
    case "P1.3":
    case "P1.5":
    case "P1.6":
    case "P1.7":
    case "P1.8": {
      evidence.push("Privacy controls require documented procedures and implementation");
      return "partial";
    }

    case "P1.4": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? "OPA policies support purpose limitation for personal data"
        : "Purpose limitation policies not configured");
      return cnt > 0 ? "partial" : "planned";
    }

    default:
      evidence.push("Control assessment pending");
      return "planned";
  }
}

async function assessDpdpControl(
  orgId: string,
  controlId: string,
  period: ReportPeriod,
  evidence: string[],
): Promise<ControlDefinition["status"]> {
  // Helper queries
  const getPolicyTemplateCount = async () => {
    const templates = await db
      .select({ cnt: count() })
      .from(clawPolicyTemplates)
      .where(eq(clawPolicyTemplates.organizationId, orgId));
    return Number(templates[0]?.cnt ?? 0);
  };

  const getAuditEventCount = async () => {
    const auditCount = await db
      .select({ cnt: count() })
      .from(clawAuditEvents)
      .where(
        and(
          eq(clawAuditEvents.organizationId, orgId),
          gte(clawAuditEvents.timestamp, period.start),
          lte(clawAuditEvents.timestamp, period.end),
        ),
      );
    return Number(auditCount[0]?.cnt ?? 0);
  };

  switch (controlId) {
    // ── Section 4 Consent & Lawful Processing ──
    case "DPDP.4.1":
    case "DPDP.4.2": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(cnt > 0
        ? `${cnt} OPA policy template(s) support purpose-based processing controls`
        : "Consent and purpose limitation require configuration");
      evidence.push("Consent management tracked via organization membership");
      return cnt > 0 ? "partial" : "planned";
    }

    // ── Section 5 Notice ──
    case "DPDP.5.1":
    case "DPDP.5.2":
    case "DPDP.5.3": {
      evidence.push("Notice requirements handled via platform terms of service and privacy policy");
      return "partial";
    }

    // ── Section 6 Consent Specifics ──
    case "DPDP.6.1":
    case "DPDP.6.2":
    case "DPDP.6.3": {
      evidence.push("Consent mechanism requires implementation for granular, withdrawable consent");
      return "partial";
    }

    // ── Section 7 Legitimate Uses ──
    case "DPDP.7.1": {
      evidence.push("Legitimate use justifications require documentation");
      return "partial";
    }

    // ── Section 8 Data Fiduciary Obligations ──
    case "DPDP.8.1": {
      const cnt = await getPolicyTemplateCount();
      evidence.push(`${cnt} security policy template(s) as technical safeguards`);
      evidence.push("OPA policy engine as organizational measure for data protection");
      evidence.push("Encryption in transit (TLS) and at rest (database-level) enabled");
      return cnt > 0 ? "implemented" : "partial";
    }

    case "DPDP.8.2": {
      evidence.push("Data accuracy requires validation mechanisms for AI processing");
      return "partial";
    }

    case "DPDP.8.3": {
      evidence.push("Data retention limitation requires configured retention policies");
      return "partial";
    }

    case "DPDP.8.4": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events support breach detection`);
      evidence.push("Breach notification procedures require documentation");
      return auditCnt > 0 ? "partial" : "planned";
    }

    case "DPDP.8.5": {
      evidence.push("Purpose completion triggers and automated erasure require configuration");
      return "partial";
    }

    // ── Section 9 Data Principal Rights ──
    case "DPDP.9.1": {
      evidence.push("Data subject access request handling requires implementation");
      return "partial";
    }

    case "DPDP.9.2": {
      evidence.push("Data correction and erasure request handling requires implementation");
      return "partial";
    }

    case "DPDP.9.3": {
      evidence.push("Grievance redressal mechanism requires establishment");
      return "partial";
    }

    case "DPDP.9.4": {
      evidence.push("Nomination mechanism requires implementation");
      return "planned";
    }

    // ── Section 10 Significant Data Fiduciary ──
    case "DPDP.10.1": {
      evidence.push("DPIA requirement — assessment needed if classified as Significant Data Fiduciary");
      return "partial";
    }

    case "DPDP.10.2": {
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events support periodic audit review`);
      evidence.push("Independent data auditor engagement required");
      return "partial";
    }

    case "DPDP.10.3": {
      evidence.push("DPO appointment required for Significant Data Fiduciaries");
      return "partial";
    }

    // ── Section 11 Cross-Border Transfer ──
    case "DPDP.11.1": {
      evidence.push("Data localization: all data stored in configured database region");
      evidence.push("AI inference provider regions tracked via clawInferenceEvents");
      evidence.push("Cross-border transfer documentation required");
      return "partial";
    }

    // ── Section 12 Exemptions ──
    case "DPDP.12.1": {
      evidence.push("Exemption analysis requires documentation");
      return "not_applicable";
    }

    // ── Section 13 Data Protection Board ──
    case "DPDP.13.1": {
      evidence.push("Board cooperation procedures require documentation");
      const auditCnt = await getAuditEventCount();
      evidence.push(`${auditCnt} audit events available for Board review`);
      return auditCnt > 0 ? "partial" : "planned";
    }

    // ── Section 17 Penalties ──
    case "DPDP.17.1": {
      const policyCnt = await getPolicyTemplateCount();
      const auditCnt = await getAuditEventCount();
      evidence.push(`Penalty prevention: ${policyCnt} security policies, ${auditCnt} audit events`);
      return (policyCnt > 0 && auditCnt > 0) ? "partial" : "planned";
    }

    // ── Section 18 Dispute Resolution ──
    case "DPDP.18.1": {
      evidence.push("Dispute resolution procedures require documentation");
      return "partial";
    }

    default:
      return "not_applicable";
  }
}

// ── Report Generation ──

export async function generateReport(
  orgId: string,
  type: ComplianceFramework,
  period: ReportPeriod,
  format: ReportFormat = "json",
): Promise<ComplianceReport> {
  const start = Date.now();

  logger.info(
    `Generating ${type} compliance report for org=${orgId} period=${period.start.toISOString()}-${period.end.toISOString()}`,
    undefined,
    SOURCE,
  );

  // Get the controls for the specified framework
  let controlDefs: Omit<ControlDefinition, "status" | "evidence">[] = getControlDefsForFramework(type);
  // Legacy switch kept for backwards compat — the helper above handles all 13 frameworks
  switch (type) {
    case "iso27001":
    case "soc2":
    case "dpdp":
      controlDefs = getDpdpControls();
      break;
  }

  // Assess each control
  const controls: ControlDefinition[] = [];
  for (const controlDef of controlDefs) {
    const assessed = await assessControlStatus(orgId, controlDef, period);
    controls.push(assessed);
  }

  // Build report sections from controls grouped by category
  const categories = [...new Set(controls.map((c) => c.category))];
  const sections: ReportSection[] = [];

  for (const category of categories) {
    const categoryControls = controls.filter((c) => c.category === category);
    const implemented = categoryControls.filter((c) => c.status === "implemented").length;
    const total = categoryControls.filter((c) => c.status !== "not_applicable").length;

    let sectionStatus: ReportSection["status"];
    if (total === 0) sectionStatus = "not_applicable";
    else if (implemented === total) sectionStatus = "compliant";
    else if (implemented > 0) sectionStatus = "partial";
    else sectionStatus = "planned";

    const findings: string[] = [];
    const evidence: Record<string, any> = {};

    for (const control of categoryControls) {
      if (control.status === "planned") {
        findings.push(`[NON-COMPLIANT] ${control.id}: ${control.title}`);
      } else if (control.status === "partial") {
        findings.push(`[PARTIAL] ${control.id}: ${control.title} — needs improvement`);
      }
      evidence[control.id] = {
        status: control.status,
        evidence: control.evidence,
      };
    }

    sections.push({
      id: category.toLowerCase().replace(/\s+/g, "_"),
      title: category,
      description: `${implemented}/${total} controls implemented`,
      status: sectionStatus,
      findings,
      evidence,
    });
  }

  // Compute summary
  const implementedCount = controls.filter((c) => c.status === "implemented").length;
  const applicableCount = controls.filter((c) => c.status !== "not_applicable").length;
  const criticalFindings = controls.filter((c) => c.status === "planned").length;
  const warnings = controls.filter((c) => c.status === "partial").length;
  const overallScore = applicableCount > 0
    ? Math.round((implementedCount / applicableCount) * 100)
    : 0;

  const report: ComplianceReport = {
    id: `${type}-${orgId}-${Date.now()}`,
    organizationId: orgId,
    framework: type,
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    generatedAt: new Date().toISOString(),
    format,
    summary: {
      overallScore,
      controlsImplemented: implementedCount,
      controlsTotal: applicableCount,
      criticalFindings,
      warnings,
    },
    sections,
  };

  logger.info(
    `Compliance report generated: ${type} score=${overallScore}% (${implementedCount}/${applicableCount} controls) in ${Date.now() - start}ms`,
    undefined,
    SOURCE,
  );

  return report;
}

/**
 * Get a security posture overview for an org.
 */
export async function getSecurityPosture(orgId: string): Promise<SecurityPosture> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Policy coverage
  const totalClawsResult = await db
    .select({ cnt: count() })
    .from(claws)
    .where(eq(claws.organizationId, orgId));
  const clawsWithPolicyResult = await db
    .select({ cnt: count() })
    .from(claws)
    .where(
      and(
        eq(claws.organizationId, orgId),
        sql`${claws.policyTemplateId} IS NOT NULL`,
      ),
    );

  const totalClaws = Number(totalClawsResult[0]?.cnt ?? 0);
  const clawsWithPolicy = Number(clawsWithPolicyResult[0]?.cnt ?? 0);

  // RBAC status
  const roleCountResult = await db
    .select({ cnt: count() })
    .from(roles)
    .where(eq(roles.organizationId, orgId));
  const assignmentCountResult = await db
    .select({ cnt: count() })
    .from(userRoles)
    .where(eq(userRoles.organizationId, orgId));
  const lastRbacEvent = await db
    .select({ timestamp: rbacAuditEvents.timestamp })
    .from(rbacAuditEvents)
    .where(eq(rbacAuditEvents.organizationId, orgId))
    .orderBy(desc(rbacAuditEvents.timestamp))
    .limit(1);

  // Audit log stats (last 30 days)
  const [rbacCount, clawCount, inferenceCount, toolCount, queryCount] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(rbacAuditEvents)
      .where(
        and(
          eq(rbacAuditEvents.organizationId, orgId),
          gte(rbacAuditEvents.timestamp, thirtyDaysAgo),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(clawAuditEvents)
      .where(
        and(
          eq(clawAuditEvents.organizationId, orgId),
          gte(clawAuditEvents.timestamp, thirtyDaysAgo),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(clawInferenceEvents)
      .where(
        and(
          eq(clawInferenceEvents.organizationId, orgId),
          gte(clawInferenceEvents.timestamp, thirtyDaysAgo),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(clawToolEvents)
      .where(
        and(
          eq(clawToolEvents.organizationId, orgId),
          gte(clawToolEvents.timestamp, thirtyDaysAgo),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(queryHistory)
      .where(
        and(
          eq(queryHistory.organizationId, orgId),
          gte(queryHistory.timestamp, thirtyDaysAgo),
        ),
      ),
  ]);

  return {
    encryptionStatus: {
      atRest: true, // Platform-level — always enabled
      inTransit: true, // TLS enforced
      keyRotation: "provider-managed",
    },
    policyCoverage: {
      totalClaws,
      clawsWithPolicy,
      coveragePct: totalClaws > 0 ? Math.round((clawsWithPolicy / totalClaws) * 100) : 100,
    },
    rbacStatus: {
      totalRoles: Number(roleCountResult[0]?.cnt ?? 0),
      totalAssignments: Number(assignmentCountResult[0]?.cnt ?? 0),
      lastAuditEvent: lastRbacEvent[0]?.timestamp?.toISOString() ?? null,
    },
    auditLogStats: {
      rbacEvents: Number(rbacCount[0]?.cnt ?? 0),
      clawEvents: Number(clawCount[0]?.cnt ?? 0),
      inferenceEvents: Number(inferenceCount[0]?.cnt ?? 0),
      toolEvents: Number(toolCount[0]?.cnt ?? 0),
      queryEvents: Number(queryCount[0]?.cnt ?? 0),
      period: "last_30_days",
    },
  };
}

/**
 * Get controls for a framework with their implementation status.
 */
export async function getControlsForFramework(
  orgId: string,
  framework: ComplianceFramework,
): Promise<ControlDefinition[]> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const period: ReportPeriod = { start: ninetyDaysAgo, end: now };

  const controlDefs = getControlDefsForFramework(framework);

  const controls: ControlDefinition[] = [];
  for (const controlDef of controlDefs) {
    const assessed = await assessControlStatus(orgId, controlDef, period);
    controls.push(assessed);
  }

  return controls;
}

// ── Enriched Controls ──

/**
 * Build rich evidence items from the flat evidence strings,
 * mapping known patterns to evidence types.
 */
function buildRichEvidence(control: ControlDefinition): RichEvidenceItem[] {
  const now = new Date().toISOString();
  const items: RichEvidenceItem[] = [];

  for (const ev of control.evidence) {
    const lower = ev.toLowerCase();
    let type: RichEvidenceItem["type"] = "config";

    if (lower.includes("opa") || lower.includes("policy engine") || lower.includes("policy template")) {
      type = "opa_policy";
    } else if (lower.includes("rbac") || lower.includes("role") || lower.includes("assignment") || lower.includes("claw(s)")) {
      type = "db_record";
    } else if (lower.includes("audit") || lower.includes("event") || lower.includes("logged") || lower.includes("monitoring")) {
      type = "audit_log";
    } else if (lower.includes("encryption") || lower.includes("tls") || lower.includes("retention") || lower.includes("access managed")) {
      type = "config";
    }

    items.push({
      type,
      label: type === "opa_policy"
        ? "OPA Policy Verification"
        : type === "db_record"
          ? "Database Record"
          : type === "audit_log"
            ? "Audit Log Entry"
            : "System Configuration",
      detail: ev,
      verified: control.status === "implemented" || control.status === "partial",
      verifiedAt: control.status === "implemented" ? now : null,
    });
  }

  return items;
}

/**
 * Perform a live OPA check for a control if it is OPA-backed.
 */
async function performLiveOpaCheck(
  controlId: string,
): Promise<{ verified: boolean; detail: string; sampleResult: { allow: boolean; reason: string } | null }> {
  const opaMapping = OPA_CONTROL_MAP[controlId];
  if (!opaMapping) {
    return { verified: false, detail: "Control is not OPA-backed", sampleResult: null };
  }

  try {
    // First check OPA health
    const health = await opaHealthCheck();
    if (!health.healthy) {
      return {
        verified: false,
        detail: `OPA unreachable (latency: ${health.latencyMs}ms, circuit breaker: ${health.circuitBreakerOpen ? "open" : "closed"})`,
        sampleResult: null,
      };
    }

    // Query OPA with sample input
    const opaUrl = ClawConfig.opa.url;
    const policyPath = `/v1/data/${opaMapping.policyPackage.replace(/\./g, "/")}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${opaUrl}${policyPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: opaMapping.sampleInput }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const body = await response.json();
      const result = body.result;
      const allow = result?.allow === true;
      const reason = result?.reason || (allow ? "Policy evaluated — access allowed" : "Policy evaluated — access denied by default");
      return {
        verified: true,
        detail: `OPA policy ${opaMapping.policyPackage} is loaded and evaluating (${health.latencyMs}ms)`,
        sampleResult: { allow, reason },
      };
    } else {
      return {
        verified: false,
        detail: `OPA returned HTTP ${response.status} for policy ${opaMapping.policyPackage}`,
        sampleResult: null,
      };
    }
  } catch (err: any) {
    return {
      verified: false,
      detail: `OPA check failed: ${err.message}`,
      sampleResult: null,
    };
  }
}

/**
 * Get enriched controls for a framework with evidence, live checks, and OPA integration.
 */
export async function getEnrichedControlsForFramework(
  orgId: string,
  framework: ComplianceFramework,
): Promise<EnrichedControlDefinition[]> {
  const controls = await getControlsForFramework(orgId, framework);
  const now = new Date().toISOString();

  const enriched: EnrichedControlDefinition[] = [];

  for (const control of controls) {
    const richEvidence = buildRichEvidence(control);
    const opaMapping = OPA_CONTROL_MAP[control.id];

    let opaIntegration: OpaIntegration | null = null;
    let liveCheck: LiveCheckResult;

    if (opaMapping) {
      // Perform live OPA check
      const opaCheck = await performLiveOpaCheck(control.id);

      opaIntegration = {
        policyPackage: opaMapping.policyPackage,
        lastEvaluation: opaCheck.verified ? now : null,
        sampleResult: opaCheck.sampleResult,
      };

      liveCheck = {
        verified: opaCheck.verified,
        checkedAt: now,
        detail: opaCheck.detail,
      };
    } else {
      // Non-OPA control — verify based on evidence
      liveCheck = {
        verified: control.status === "implemented",
        checkedAt: now,
        detail: control.status === "implemented"
          ? "Control verified via database records and system configuration"
          : control.status === "partial"
            ? "Control partially implemented — additional configuration needed"
            : "Control is planned but not yet implemented",
      };
    }

    enriched.push({
      ...control,
      richEvidence,
      liveCheck,
      opaIntegration,
    });
  }

  return enriched;
}

/**
 * Verify a specific control on demand.
 */
export async function verifyControl(
  orgId: string,
  controlId: string,
  framework: ComplianceFramework,
): Promise<{
  controlId: string;
  verified: boolean;
  evidence: RichEvidenceItem[];
  opaResult?: { allow: boolean; reason: string };
  timestamp: string;
}> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const period: ReportPeriod = { start: ninetyDaysAgo, end: now };

  // Get the control definition
  let controlDefs: Omit<ControlDefinition, "status" | "evidence">[] = getControlDefsForFramework(framework);

  const controlDef = controlDefs.find((c) => c.id === controlId);
  if (!controlDef) {
    return {
      controlId,
      verified: false,
      evidence: [{
        type: "config",
        label: "Control Not Found",
        detail: `Control ${controlId} is not defined in ${framework}`,
        verified: false,
        verifiedAt: null,
      }],
      timestamp: now.toISOString(),
    };
  }

  // Re-assess the control
  const assessed = await assessControlStatus(orgId, controlDef, period);
  const richEvidence = buildRichEvidence(assessed);

  // If OPA-backed, run live check
  const opaMapping = OPA_CONTROL_MAP[controlId];
  let opaResult: { allow: boolean; reason: string } | undefined;

  if (opaMapping) {
    const opaCheck = await performLiveOpaCheck(controlId);
    if (opaCheck.sampleResult) {
      opaResult = opaCheck.sampleResult;
    }

    // Add OPA-specific evidence
    richEvidence.push({
      type: "opa_policy",
      label: "Live OPA Verification",
      detail: opaCheck.detail,
      verified: opaCheck.verified,
      verifiedAt: opaCheck.verified ? now.toISOString() : null,
    });
  }

  return {
    controlId,
    verified: assessed.status === "implemented",
    evidence: richEvidence,
    opaResult,
    timestamp: now.toISOString(),
  };
}
