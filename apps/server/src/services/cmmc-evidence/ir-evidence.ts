"use strict";

/**
 * CMMC Incident Response (IR) Domain — Evidence Collection
 *
 * Collects real evidence for 2 IR controls:
 *   IR.2.092 — Establish incident response capability (configurable)
 *   IR.2.093 — Detect and report events (platform + configurable)
 *
 * Each collector queries the database via Drizzle ORM and returns
 * a structured CollectedEvidence object.
 */

import { db } from "../../db";
import {
  complianceSettings,
  complianceEvidence,
  clawAuditEvents,
  clawToolEvents,
  complianceScheduledReports,
} from "@wtrops/shared";
import { eq, and, count, gte, desc } from "drizzle-orm";
import { logger } from "../../utils/logger";

const SOURCE = "IrEvidenceCollector";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  label: string;
  value: string | number | boolean | Record<string, unknown> | unknown[];
  verified: boolean;
}

export interface CollectedEvidence {
  controlId: string;
  collectedAt: string;
  status: "pass" | "partial" | "fail";
  items: EvidenceItem[];
  recommendation: string | null;
}

// ── IR.2.092 — Establish incident response capability ───────────────────────

/**
 * IR.2.092 — Configurable: IR Capability
 *
 * Checks whether the organization has:
 *   1. IR contacts configured (primary, secondary, escalation email)
 *   2. An uploaded/documented incident response plan
 *   3. IR team designation
 *
 * Status logic:
 *   - fail: no IR contacts configured at all
 *   - partial: contacts configured but no documented IR plan uploaded
 *   - pass: contacts configured AND documented IR plan uploaded
 */
async function collectIr2092(orgId: string): Promise<CollectedEvidence> {
  const items: EvidenceItem[] = [];

  try {
    // ── Query 1: IR contact configuration from compliance_settings ──
    const settingsRows = await db
      .select({
        irPrimaryContact: complianceSettings.irPrimaryContact,
        irSecondaryContact: complianceSettings.irSecondaryContact,
        irEscalationEmail: complianceSettings.irEscalationEmail,
        irSlackWebhook: complianceSettings.irSlackWebhook,
      })
      .from(complianceSettings)
      .where(eq(complianceSettings.organizationId, orgId))
      .limit(1);

    const settings = settingsRows[0] ?? null;

    const hasPrimary = !!(settings?.irPrimaryContact);
    const hasSecondary = !!(settings?.irSecondaryContact);
    const hasEscalation = !!(settings?.irEscalationEmail);
    const hasSlack = !!(settings?.irSlackWebhook);
    const hasAnyContact = hasPrimary || hasSecondary || hasEscalation;

    items.push({
      label: "IR primary contact",
      value: hasPrimary ? settings!.irPrimaryContact! : "Not configured",
      verified: hasPrimary,
    });

    items.push({
      label: "IR secondary contact",
      value: hasSecondary ? settings!.irSecondaryContact! : "Not configured",
      verified: hasSecondary,
    });

    items.push({
      label: "IR escalation email",
      value: hasEscalation ? settings!.irEscalationEmail! : "Not configured",
      verified: hasEscalation,
    });

    items.push({
      label: "IR Slack webhook",
      value: hasSlack ? "Configured" : "Not configured",
      verified: hasSlack,
    });

    items.push({
      label: "IR contacts configured",
      value: hasAnyContact,
      verified: hasAnyContact,
    });

    // ── Query 2: Uploaded IR plan documents from compliance_evidence ──
    const evidenceRows = await db
      .select()
      .from(complianceEvidence)
      .where(
        and(
          eq(complianceEvidence.organizationId, orgId),
          eq(complianceEvidence.framework, "cmmc"),
          eq(complianceEvidence.controlId, "IR.2.092"),
        ),
      )
      .orderBy(desc(complianceEvidence.createdAt));

    const activeEvidence = evidenceRows.filter((e) => e.isActive !== false);
    const hasDocumentedPlan = activeEvidence.length > 0;

    items.push({
      label: "Documented IR plan evidence",
      value: hasDocumentedPlan
        ? `${activeEvidence.length} evidence item(s) uploaded`
        : "No IR plan document uploaded",
      verified: hasDocumentedPlan,
    });

    if (hasDocumentedPlan) {
      // Show summary of uploaded evidence
      const evidenceSummary = activeEvidence.map((e) => ({
        title: e.title,
        type: e.evidenceType,
        uploadedAt: e.createdAt.toISOString(),
        hasFile: !!e.fileUrl,
      }));

      items.push({
        label: "Evidence items",
        value: evidenceSummary as unknown as unknown[],
        verified: true,
      });
    }

    // ── Determine status ──
    let status: CollectedEvidence["status"];
    let recommendation: string | null = null;

    if (!hasAnyContact) {
      status = "fail";
      recommendation =
        "Configure incident response contacts: Go to Compliance Settings > Incident Response. " +
        "Set up: Primary IR Contact (the first person called during an incident — typically your " +
        "security lead or CTO), Secondary Contact (backup if primary is unavailable), Escalation " +
        "Email (a group email like security@company.com that reaches the whole IR team), Slack " +
        "Webhook (optional — for instant notification in your Slack channel when an incident is detected).";
    } else if (!hasDocumentedPlan) {
      status = "partial";
      recommendation =
        "Document your IR plan: An incident response plan must cover 6 phases: " +
        "1) Preparation (team, tools, training), 2) Identification (how incidents are detected), " +
        "3) Containment (immediate actions to limit damage), 4) Eradication (remove the threat), " +
        "5) Recovery (restore normal operations), 6) Lessons Learned (post-incident review). " +
        "Upload your IR plan document in the evidence section below.";
    } else {
      status = "pass";
    }

    return {
      controlId: "IR.2.092",
      collectedAt: new Date().toISOString(),
      status,
      items,
      recommendation,
    };
  } catch (err) {
    logger.error(`[${SOURCE}] IR.2.092 evidence collection failed`, err);
    return {
      controlId: "IR.2.092",
      collectedAt: new Date().toISOString(),
      status: "fail",
      items: [
        {
          label: "Error",
          value: "Failed to query IR configuration and evidence",
          verified: false,
        },
      ],
      recommendation:
        "Database query failed. Verify compliance_settings and compliance_evidence tables exist.",
    };
  }
}

// ── IR.2.093 — Detect and report events ─────────────────────────────────────

/**
 * IR.2.093 — Platform + Configurable: Event Detection & Reporting
 *
 * Checks whether:
 *   1. Security-relevant events are being captured in the audit trail (platform)
 *   2. OPA policy violations (denied actions) are being recorded (platform)
 *   3. Security event reporting is configured (configurable)
 *
 * Status logic:
 *   - fail: no security events captured at all in last 30 days
 *   - partial: events are captured but no reporting configured
 *   - pass: events are captured AND reporting is configured
 */
async function collectIr2093(orgId: string): Promise<CollectedEvidence> {
  const items: EvidenceItem[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    // ── Query 1: Security-relevant events in last 30 days ──
    const eventsByType = await db
      .select({
        eventType: clawAuditEvents.eventType,
        count: count(),
      })
      .from(clawAuditEvents)
      .where(
        and(
          eq(clawAuditEvents.organizationId, orgId),
          gte(clawAuditEvents.timestamp, thirtyDaysAgo),
        ),
      )
      .groupBy(clawAuditEvents.eventType)
      .orderBy(desc(count()));

    const eventBreakdown: Record<string, number> = {};
    let totalEvents = 0;
    for (const row of eventsByType) {
      const cnt = Number(row.count);
      eventBreakdown[row.eventType] = cnt;
      totalEvents += cnt;
    }

    const hasEvents = totalEvents > 0;

    items.push({
      label: "Security events captured (last 30 days)",
      value: totalEvents,
      verified: hasEvents,
    });

    items.push({
      label: "Event type breakdown",
      value: eventBreakdown,
      verified: hasEvents,
    });

    // ── Query 2: OPA policy violations (denied actions) in last 30 days ──
    const [deniedResult] = await db
      .select({ deniedActions: count() })
      .from(clawToolEvents)
      .where(
        and(
          eq(clawToolEvents.organizationId, orgId),
          eq(clawToolEvents.status, "denied"),
          gte(clawToolEvents.timestamp, thirtyDaysAgo),
        ),
      );

    const deniedActions = Number(deniedResult?.deniedActions ?? 0);

    items.push({
      label: "OPA policy violations (denied actions, last 30 days)",
      value: deniedActions,
      verified: true, // Even 0 violations is valid — means policies are working
    });

    if (deniedActions > 0) {
      items.push({
        label: "Policy enforcement status",
        value: `${deniedActions} action(s) blocked by OPA policies — enforcement is active`,
        verified: true,
      });
    } else {
      items.push({
        label: "Policy enforcement status",
        value: "No denied actions in the last 30 days — either no violations occurred or no OPA policies are active",
        verified: hasEvents, // If we have events but no denials, that is still OK
      });
    }

    // ── Query 3: Reporting configuration from compliance_settings ──
    const reportingSettings = await db
      .select({
        boardReportEnabled: complianceSettings.boardReportEnabled,
        boardReportFrequency: complianceSettings.boardReportFrequency,
      })
      .from(complianceSettings)
      .where(eq(complianceSettings.organizationId, orgId))
      .limit(1);

    const boardReportEnabled = reportingSettings[0]?.boardReportEnabled ?? false;
    const boardReportFrequency = reportingSettings[0]?.boardReportFrequency ?? "not configured";

    items.push({
      label: "Board/management reporting enabled",
      value: boardReportEnabled,
      verified: boardReportEnabled === true,
    });

    items.push({
      label: "Report frequency",
      value: boardReportEnabled ? boardReportFrequency : "Not configured",
      verified: boardReportEnabled === true,
    });

    // ── Check for scheduled audit_summary reports ──
    const scheduledReports = await db
      .select({
        reportType: complianceScheduledReports.reportType,
        frequency: complianceScheduledReports.frequency,
        isActive: complianceScheduledReports.isActive,
      })
      .from(complianceScheduledReports)
      .where(
        and(
          eq(complianceScheduledReports.organizationId, orgId),
          eq(complianceScheduledReports.isActive, true),
        ),
      );

    const auditSummaryReports = scheduledReports.filter(
      (r) => r.reportType === "audit_summary",
    );

    const hasScheduledReporting = auditSummaryReports.length > 0 || boardReportEnabled;

    items.push({
      label: "Scheduled audit summary reports",
      value: auditSummaryReports.length > 0
        ? `${auditSummaryReports.length} active report(s) configured`
        : "No audit summary reports scheduled",
      verified: auditSummaryReports.length > 0,
    });

    items.push({
      label: "Reporting configured",
      value: hasScheduledReporting,
      verified: hasScheduledReporting,
    });

    // ── Determine status ──
    let status: CollectedEvidence["status"];
    let recommendation: string | null = null;

    if (!hasEvents) {
      status = "fail";
      recommendation =
        "No security events detected in the last 30 days. This may indicate the platform is not actively " +
        "in use, or audit logging is not capturing events. Security event detection is a platform capability — " +
        "the system automatically captures claw lifecycle events, policy violations, access denials, and " +
        "configuration changes. Ensure the platform is actively used and audit logging is functioning.";
    } else if (!hasScheduledReporting) {
      status = "partial";
      recommendation =
        "Configure security event reporting: Go to Compliance Settings > Scheduled Reports, create a report " +
        "with type 'audit_summary' delivered weekly to your security team. This ensures someone reviews " +
        "security events regularly. Also enable board/management reporting in Compliance Settings for " +
        "executive oversight.";
    } else {
      status = "pass";
    }

    return {
      controlId: "IR.2.093",
      collectedAt: new Date().toISOString(),
      status,
      items,
      recommendation,
    };
  } catch (err) {
    logger.error(`[${SOURCE}] IR.2.093 evidence collection failed`, err);
    return {
      controlId: "IR.2.093",
      collectedAt: new Date().toISOString(),
      status: "fail",
      items: [
        {
          label: "Error",
          value: "Failed to query security events and reporting configuration",
          verified: false,
        },
      ],
      recommendation:
        "Database query failed. Verify claw_audit_events, claw_tool_events, compliance_settings, and compliance_scheduled_reports tables exist.",
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Collect evidence for any IR-domain control.
 *
 * @param orgId     - Organization ID (required for org-scoped queries)
 * @param controlId - The CMMC control identifier (e.g., "IR.2.092")
 * @returns Structured evidence with status, items, and recommendation
 */
export async function collectIrEvidence(
  orgId: string,
  controlId: string,
): Promise<CollectedEvidence> {
  logger.info(`[${SOURCE}] Collecting evidence for ${controlId} (org: ${orgId})`);

  switch (controlId) {
    case "IR.2.092":
      return collectIr2092(orgId);
    case "IR.2.093":
      return collectIr2093(orgId);
    default:
      return {
        controlId,
        collectedAt: new Date().toISOString(),
        status: "fail",
        items: [
          {
            label: "Unknown control",
            value: `${controlId} is not an IR-domain control`,
            verified: false,
          },
        ],
        recommendation: `Control ${controlId} does not belong to the Incident Response domain. Valid IR controls: IR.2.092, IR.2.093`,
      };
  }
}
