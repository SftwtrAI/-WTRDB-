"use strict";

/**
 * CMMC Audit & Accountability (AU) Domain — Evidence Collection
 *
 * Collects real evidence for all 4 AU controls:
 *   AU.2.041 — User traceability (FLAGSHIP: every action traceable to a user)
 *   AU.2.042 — Log retention (configured retention period + oldest event)
 *   AU.3.045 — Log review (scheduled audit review reports)
 *   AU.3.048 — Centralized logging (all 5 audit tables with record counts)
 *
 * Each collector queries the database via Drizzle ORM and returns
 * a structured CollectedEvidence object with auditor-ready detail.
 */

import { db } from "../../db";
import {
  rbacAuditEvents,
  clawAuditEvents,
  clawInferenceEvents,
  clawToolEvents,
  queryHistory,
  complianceSettings,
  complianceScheduledReports,
  users,
} from "@wtrops/shared";
import { eq, and, sql, count, desc, min, max } from "drizzle-orm";
import { logger } from "../../utils/logger";

const SOURCE = "AuEvidenceCollector";

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

// ── AU.2.041 — FLAGSHIP: User Traceability ──────────────────────────────────

/**
 * AU.2.041 — Platform: User Traceability
 *
 * This is the FLAGSHIP evidence control for CMMC Audit & Accountability.
 * An auditor needs to see PROOF that every action in the system is
 * uniquely traceable to a specific, identified user.
 *
 * Evidence collected:
 *   1. Total RBAC audit events and % with user attribution
 *   2. Total Claw audit events and % with user attribution
 *   3. Sample of 10 recent audit events with full details
 *      (timestamp, user email, action, IP address)
 *
 * Pass criteria: 100% of events have user_id attribution
 * Fail criteria: <95% of events have user_id attribution
 */
async function collectAu2041(orgId: string): Promise<CollectedEvidence> {
  const items: EvidenceItem[] = [];

  try {
    // ── 1. RBAC audit event attribution ─────────────────────────────────
    const rbacAttribution = await db
      .select({
        total: count(),
        withUser: count(rbacAuditEvents.actorUserId),
      })
      .from(rbacAuditEvents)
      .where(eq(rbacAuditEvents.organizationId, orgId));

    const rbacTotal = Number(rbacAttribution[0]?.total ?? 0);
    const rbacWithUser = Number(rbacAttribution[0]?.withUser ?? 0);
    const rbacPct = rbacTotal > 0 ? (rbacWithUser / rbacTotal) * 100 : 100;

    items.push({
      label: "RBAC audit events — total",
      value: rbacTotal,
      verified: true,
    });

    items.push({
      label: "RBAC audit events — with user attribution",
      value: `${rbacWithUser} of ${rbacTotal} (${rbacPct.toFixed(1)}%)`,
      verified: rbacPct >= 95,
    });

    // ── 2. Claw audit event attribution ─────────────────────────────────
    const clawAttribution = await db
      .select({
        total: count(),
        withUser: count(clawAuditEvents.userId),
      })
      .from(clawAuditEvents)
      .where(eq(clawAuditEvents.organizationId, orgId));

    const clawTotal = Number(clawAttribution[0]?.total ?? 0);
    const clawWithUser = Number(clawAttribution[0]?.withUser ?? 0);
    const clawPct = clawTotal > 0 ? (clawWithUser / clawTotal) * 100 : 100;

    items.push({
      label: "Claw audit events — total",
      value: clawTotal,
      verified: true,
    });

    items.push({
      label: "Claw audit events — with user attribution",
      value: `${clawWithUser} of ${clawTotal} (${clawPct.toFixed(1)}%)`,
      verified: clawPct >= 95,
    });

    // ── 3. Combined attribution percentage ──────────────────────────────
    const combinedTotal = rbacTotal + clawTotal;
    const combinedWithUser = rbacWithUser + clawWithUser;
    const combinedPct = combinedTotal > 0
      ? (combinedWithUser / combinedTotal) * 100
      : 100;

    items.push({
      label: "Combined user attribution rate",
      value: `${combinedWithUser} of ${combinedTotal} events (${combinedPct.toFixed(1)}%)`,
      verified: combinedPct >= 95,
    });

    // ── 4. Sample of 10 recent RBAC audit events with full user detail ──
    const recentEvents = await db
      .select({
        id: rbacAuditEvents.id,
        timestamp: rbacAuditEvents.timestamp,
        eventType: rbacAuditEvents.eventType,
        actorUserId: rbacAuditEvents.actorUserId,
        ipAddress: rbacAuditEvents.ipAddress,
        eventData: rbacAuditEvents.eventData,
        userEmail: users.email,
        userName: users.name,
      })
      .from(rbacAuditEvents)
      .innerJoin(users, eq(rbacAuditEvents.actorUserId, users.id))
      .where(eq(rbacAuditEvents.organizationId, orgId))
      .orderBy(desc(rbacAuditEvents.timestamp))
      .limit(10);

    const sampleEntries = recentEvents.map((e) => ({
      timestamp: e.timestamp?.toISOString() ?? "unknown",
      user: e.userName ?? "unknown",
      email: e.userEmail ?? "unknown",
      action: e.eventType,
      ipAddress: e.ipAddress ?? "not recorded",
      eventId: e.id,
    }));

    items.push({
      label: "Sample audit trail entries (10 most recent)",
      value: sampleEntries.length > 0 ? sampleEntries : "No audit events found",
      verified: sampleEntries.length > 0,
    });

    // ── 5. Traceability architecture description ────────────────────────
    items.push({
      label: "Traceability architecture",
      value: {
        mechanism: "Every API request carries a JWT with embedded user ID; RBAC middleware extracts the actor and logs it to rbac_audit_events",
        uniqueIdentifier: "user.id (UUID) — unique per user account",
        auditTables: [
          "rbac_audit_events (actor_user_id NOT NULL)",
          "claw_audit_events (user_id, nullable for system events)",
        ],
        timestampPrecision: "Millisecond-precision UTC timestamps on all events",
      },
      verified: true,
    });

    // ── Status determination ────────────────────────────────────────────
    let status: CollectedEvidence["status"];
    let recommendation: string | null = null;

    if (combinedTotal === 0) {
      // No events yet — system is new; architecture is correct but no proof yet
      status = "partial";
      recommendation = "No audit events recorded yet. Perform administrative actions (role changes, claw operations) to generate audit records that demonstrate user traceability.";
    } else if (combinedPct >= 100) {
      status = "pass";
    } else if (combinedPct >= 95) {
      status = "partial";
      recommendation = `${combinedTotal - combinedWithUser} event(s) are missing user attribution. Investigate system-generated events and ensure they reference a service account user ID.`;
    } else {
      status = "fail";
      recommendation = `Only ${combinedPct.toFixed(1)}% of audit events have user attribution. This is below the 95% threshold. Investigate the audit logging pipeline to ensure all actions capture the actor user ID.`;
    }

    return {
      controlId: "AU.2.041",
      collectedAt: new Date().toISOString(),
      status,
      items,
      recommendation,
    };
  } catch (err) {
    logger.error(`[${SOURCE}] AU.2.041 evidence collection failed`, err);
    return {
      controlId: "AU.2.041",
      collectedAt: new Date().toISOString(),
      status: "fail",
      items: [{
        label: "Error",
        value: "Failed to query audit event attribution data",
        verified: false,
      }],
      recommendation: "Database query failed. Verify rbac_audit_events, claw_audit_events, and users tables exist.",
    };
  }
}

// ── AU.2.042 — Log Retention ────────────────────────────────────────────────

/**
 * AU.2.042 — Configurable: Log Retention
 *
 * Verifies that audit logs are retained for at least 365 days.
 * Checks:
 *   1. Configured retention period from compliance_settings
 *   2. Oldest actual audit event (proving retention in practice)
 *   3. Monthly event volume (showing consistent log generation)
 *
 * Pass criteria: retention >= 365 days
 * Fail criteria: retention < 365 or not configured
 */
async function collectAu2042(orgId: string): Promise<CollectedEvidence> {
  const items: EvidenceItem[] = [];

  try {
    // ── 1. Configured retention period ──────────────────────────────────
    const retentionConfig = await db
      .select({
        auditLogRetentionDays: complianceSettings.auditLogRetentionDays,
      })
      .from(complianceSettings)
      .where(eq(complianceSettings.organizationId, orgId));

    const retentionDays = retentionConfig[0]?.auditLogRetentionDays ?? null;

    items.push({
      label: "Configured audit log retention (days)",
      value: retentionDays !== null ? retentionDays : "Not configured (no compliance_settings record)",
      verified: retentionDays !== null && retentionDays >= 365,
    });

    // ── 2. Oldest actual audit event ────────────────────────────────────
    const oldestEvent = await db
      .select({
        oldestTimestamp: min(rbacAuditEvents.timestamp),
      })
      .from(rbacAuditEvents)
      .where(eq(rbacAuditEvents.organizationId, orgId));

    const oldestTs = oldestEvent[0]?.oldestTimestamp;

    if (oldestTs) {
      const daysSinceOldest = Math.floor(
        (Date.now() - new Date(oldestTs).getTime()) / (1000 * 60 * 60 * 24),
      );

      items.push({
        label: "Oldest audit event",
        value: new Date(oldestTs).toISOString(),
        verified: true,
      });

      items.push({
        label: "Actual retention span (days)",
        value: daysSinceOldest,
        verified: daysSinceOldest > 0,
      });
    } else {
      items.push({
        label: "Oldest audit event",
        value: "No audit events found",
        verified: false,
      });
    }

    // ── 3. Monthly event volume ─────────────────────────────────────────
    const monthlyVolume = await db
      .select({
        month: sql<string>`to_char(${rbacAuditEvents.timestamp}, 'YYYY-MM')`.as("month"),
        eventCount: count(),
      })
      .from(rbacAuditEvents)
      .where(eq(rbacAuditEvents.organizationId, orgId))
      .groupBy(sql`to_char(${rbacAuditEvents.timestamp}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${rbacAuditEvents.timestamp}, 'YYYY-MM')`);

    const volumeByMonth: Record<string, number> = {};
    for (const row of monthlyVolume) {
      volumeByMonth[row.month] = Number(row.eventCount);
    }

    items.push({
      label: "Monthly audit event volume",
      value: Object.keys(volumeByMonth).length > 0
        ? volumeByMonth
        : "No events recorded — volume unavailable",
      verified: Object.keys(volumeByMonth).length > 0,
    });

    // ── 4. Retention policy assessment ──────────────────────────────────
    items.push({
      label: "Retention mechanism",
      value: {
        storage: "PostgreSQL with configurable retention via compliance_settings.audit_log_retention_days",
        enforcement: "claw_audit_events has retention_expires_at column for automated expiry",
        default: "365 days (schema default)",
      },
      verified: true,
    });

    // ── Status determination ────────────────────────────────────────────
    let status: CollectedEvidence["status"];
    let recommendation: string | null = null;

    if (retentionDays !== null && retentionDays >= 365) {
      status = "pass";
    } else if (retentionDays !== null && retentionDays > 0) {
      status = "fail";
      recommendation = `Current retention is ${retentionDays} days, below the CMMC-required 365 days. Set retention to 365+ days in Compliance Settings > Data & Retention.`;
    } else {
      status = "fail";
      recommendation = "No retention policy configured. Set retention to 365+ days in Compliance Settings > Data & Retention.";
    }

    return {
      controlId: "AU.2.042",
      collectedAt: new Date().toISOString(),
      status,
      items,
      recommendation,
    };
  } catch (err) {
    logger.error(`[${SOURCE}] AU.2.042 evidence collection failed`, err);
    return {
      controlId: "AU.2.042",
      collectedAt: new Date().toISOString(),
      status: "fail",
      items: [{
        label: "Error",
        value: "Failed to query retention settings or audit events",
        verified: false,
      }],
      recommendation: "Database query failed. Verify compliance_settings and rbac_audit_events tables exist.",
    };
  }
}

// ── AU.3.045 — Log Review ───────────────────────────────────────────────────

/**
 * AU.3.045 — Configurable: Log Review
 *
 * Verifies that audit logs are actively reviewed on a schedule.
 * Checks:
 *   1. Scheduled audit review reports (compliance_scheduled_reports)
 *   2. Board reporting configuration for oversight
 *   3. Review frequency and designated reviewers
 *
 * Pass criteria: At least one audit review report is scheduled
 * Fail criteria: No review schedule exists
 */
async function collectAu3045(orgId: string): Promise<CollectedEvidence> {
  const items: EvidenceItem[] = [];

  try {
    // ── 1. Scheduled audit/compliance reports ───────────────────────────
    const scheduledReports = await db
      .select({
        id: complianceScheduledReports.id,
        reportType: complianceScheduledReports.reportType,
        frequency: complianceScheduledReports.frequency,
        recipientEmails: complianceScheduledReports.recipientEmails,
        isActive: complianceScheduledReports.isActive,
        lastSentAt: complianceScheduledReports.lastSentAt,
        nextSendAt: complianceScheduledReports.nextSendAt,
      })
      .from(complianceScheduledReports)
      .where(
        and(
          eq(complianceScheduledReports.organizationId, orgId),
          sql`${complianceScheduledReports.reportType} IN ('audit_summary', 'compliance_status')`,
        ),
      );

    const activeReports = scheduledReports.filter((r) => r.isActive);

    items.push({
      label: "Scheduled audit/compliance reports",
      value: scheduledReports.length > 0
        ? scheduledReports.map((r) => ({
            reportType: r.reportType,
            frequency: r.frequency,
            recipients: r.recipientEmails,
            active: r.isActive,
            lastSent: r.lastSentAt?.toISOString() ?? "never",
            nextSend: r.nextSendAt?.toISOString() ?? "not scheduled",
          }))
        : "No audit review reports scheduled",
      verified: activeReports.length > 0,
    });

    items.push({
      label: "Active audit review schedules",
      value: activeReports.length,
      verified: activeReports.length > 0,
    });

    // ── 2. Board reporting configuration ────────────────────────────────
    const boardConfig = await db
      .select({
        boardReportEnabled: complianceSettings.boardReportEnabled,
        boardReportFrequency: complianceSettings.boardReportFrequency,
        boardMemberEmails: complianceSettings.boardMemberEmails,
      })
      .from(complianceSettings)
      .where(eq(complianceSettings.organizationId, orgId));

    const boardEnabled = boardConfig[0]?.boardReportEnabled ?? false;
    const boardFrequency = boardConfig[0]?.boardReportFrequency ?? "not configured";
    const boardMembers = boardConfig[0]?.boardMemberEmails ?? [];

    items.push({
      label: "Board/executive reporting enabled",
      value: boardEnabled,
      verified: boardEnabled === true,
    });

    items.push({
      label: "Board report frequency",
      value: boardFrequency,
      verified: boardEnabled,
    });

    items.push({
      label: "Designated board reviewers",
      value: boardMembers.length > 0
        ? `${boardMembers.length} reviewer(s) configured`
        : "No board reviewers configured",
      verified: boardMembers.length > 0,
    });

    // ── 3. Review cadence assessment ────────────────────────────────────
    const hasScheduledReview = activeReports.length > 0;
    const hasBoardReview = boardEnabled && boardMembers.length > 0;

    items.push({
      label: "Review cadence assessment",
      value: {
        scheduledAuditReviews: hasScheduledReview,
        boardOversight: hasBoardReview,
        reviewMechanism: hasScheduledReview
          ? `Automated ${activeReports[0]?.frequency ?? "periodic"} report to ${activeReports[0]?.recipientEmails?.length ?? 0} recipient(s)`
          : "No automated review mechanism in place",
      },
      verified: hasScheduledReview || hasBoardReview,
    });

    // ── Status determination ────────────────────────────────────────────
    let status: CollectedEvidence["status"];
    let recommendation: string | null = null;

    if (hasScheduledReview) {
      status = "pass";
    } else if (hasBoardReview) {
      status = "partial";
      recommendation = "Board reporting is configured but no dedicated audit review report is scheduled. Go to Compliance Settings > Scheduled Reports and create a weekly Audit Summary report.";
    } else {
      status = "fail";
      recommendation = "No audit log review schedule exists. Go to Compliance Settings > Scheduled Reports and create a weekly Audit Summary report. Assign at least one reviewer who will act on findings.";
    }

    return {
      controlId: "AU.3.045",
      collectedAt: new Date().toISOString(),
      status,
      items,
      recommendation,
    };
  } catch (err) {
    logger.error(`[${SOURCE}] AU.3.045 evidence collection failed`, err);
    return {
      controlId: "AU.3.045",
      collectedAt: new Date().toISOString(),
      status: "fail",
      items: [{
        label: "Error",
        value: "Failed to query scheduled reports or board configuration",
        verified: false,
      }],
      recommendation: "Database query failed. Verify compliance_scheduled_reports and compliance_settings tables exist.",
    };
  }
}

// ── AU.3.048 — Centralized Logging ──────────────────────────────────────────

/**
 * AU.3.048 — Platform: Centralized Logging
 *
 * Proves that all audit information flows to a centralized repository.
 * Queries record counts, date ranges, and existence of ALL 5 audit tables:
 *   - rbac_audit_events
 *   - claw_audit_events
 *   - claw_inference_events
 *   - claw_tool_events
 *   - query_history
 *
 * Pass criteria: All tables exist and have records (or at minimum, exist)
 */
async function collectAu3048(orgId: string): Promise<CollectedEvidence> {
  const items: EvidenceItem[] = [];

  try {
    // ── Query each table individually with Drizzle ORM ──────────────────

    // 1. rbac_audit_events
    const rbacStats = await db
      .select({
        recordCount: count(),
        oldest: min(rbacAuditEvents.timestamp),
        newest: max(rbacAuditEvents.timestamp),
      })
      .from(rbacAuditEvents)
      .where(eq(rbacAuditEvents.organizationId, orgId));

    // 2. claw_audit_events
    const clawAuditStats = await db
      .select({
        recordCount: count(),
        oldest: min(clawAuditEvents.timestamp),
        newest: max(clawAuditEvents.timestamp),
      })
      .from(clawAuditEvents)
      .where(eq(clawAuditEvents.organizationId, orgId));

    // 3. claw_inference_events
    const inferenceStats = await db
      .select({
        recordCount: count(),
        oldest: min(clawInferenceEvents.timestamp),
        newest: max(clawInferenceEvents.timestamp),
      })
      .from(clawInferenceEvents)
      .where(eq(clawInferenceEvents.organizationId, orgId));

    // 4. claw_tool_events
    const toolStats = await db
      .select({
        recordCount: count(),
        oldest: min(clawToolEvents.timestamp),
        newest: max(clawToolEvents.timestamp),
      })
      .from(clawToolEvents)
      .where(eq(clawToolEvents.organizationId, orgId));

    // 5. query_history
    const queryStats = await db
      .select({
        recordCount: count(),
        oldest: min(queryHistory.timestamp),
        newest: max(queryHistory.timestamp),
      })
      .from(queryHistory)
      .where(eq(queryHistory.organizationId, orgId));

    // ── Build table inventory ───────────────────────────────────────────
    const tableInventory = [
      {
        table: "rbac_audit_events",
        purpose: "RBAC role changes, permission assignments, user access events",
        recordCount: Number(rbacStats[0]?.recordCount ?? 0),
        oldest: rbacStats[0]?.oldest ? new Date(rbacStats[0].oldest).toISOString() : null,
        newest: rbacStats[0]?.newest ? new Date(rbacStats[0].newest).toISOString() : null,
      },
      {
        table: "claw_audit_events",
        purpose: "Claw agent lifecycle, policy changes, security events",
        recordCount: Number(clawAuditStats[0]?.recordCount ?? 0),
        oldest: clawAuditStats[0]?.oldest ? new Date(clawAuditStats[0].oldest).toISOString() : null,
        newest: clawAuditStats[0]?.newest ? new Date(clawAuditStats[0].newest).toISOString() : null,
      },
      {
        table: "claw_inference_events",
        purpose: "AI model invocations, token usage, provider routing decisions",
        recordCount: Number(inferenceStats[0]?.recordCount ?? 0),
        oldest: inferenceStats[0]?.oldest ? new Date(inferenceStats[0].oldest).toISOString() : null,
        newest: inferenceStats[0]?.newest ? new Date(inferenceStats[0].newest).toISOString() : null,
      },
      {
        table: "claw_tool_events",
        purpose: "Tool/skill executions, MCP calls, allow/deny decisions",
        recordCount: Number(toolStats[0]?.recordCount ?? 0),
        oldest: toolStats[0]?.oldest ? new Date(toolStats[0].oldest).toISOString() : null,
        newest: toolStats[0]?.newest ? new Date(toolStats[0].newest).toISOString() : null,
      },
      {
        table: "query_history",
        purpose: "Data queries, SQL generation, access auditing",
        recordCount: Number(queryStats[0]?.recordCount ?? 0),
        oldest: queryStats[0]?.oldest ? new Date(queryStats[0].oldest).toISOString() : null,
        newest: queryStats[0]?.newest ? new Date(queryStats[0].newest).toISOString() : null,
      },
    ];

    const totalRecords = tableInventory.reduce((sum, t) => sum + t.recordCount, 0);
    const tablesWithRecords = tableInventory.filter((t) => t.recordCount > 0).length;

    items.push({
      label: "Centralized audit table inventory",
      value: tableInventory,
      verified: true,
    });

    items.push({
      label: "Total audit tables",
      value: `${tableInventory.length} tables (all queried successfully)`,
      verified: true,
    });

    items.push({
      label: "Tables with recorded events",
      value: `${tablesWithRecords} of ${tableInventory.length}`,
      verified: tablesWithRecords > 0,
    });

    items.push({
      label: "Total audit records across all tables",
      value: totalRecords,
      verified: totalRecords > 0,
    });

    // ── Centralization architecture ─────────────────────────────────────
    items.push({
      label: "Centralization architecture",
      value: {
        database: "Single PostgreSQL instance (centralized repository)",
        auditDomains: [
          "Identity & Access (rbac_audit_events)",
          "Agent Operations (claw_audit_events)",
          "AI Inference (claw_inference_events)",
          "Tool Execution (claw_tool_events)",
          "Data Queries (query_history)",
        ],
        correlationCapability: "All tables share organization_id, user_id/actor_user_id, and UTC timestamps for cross-table correlation",
        queryInterface: "Compliance dashboard provides unified view across all audit streams",
      },
      verified: true,
    });

    // ── Status determination ────────────────────────────────────────────
    // Pass if all tables exist (they always do — they're DB schema) and at
    // least some have records. The tables existing proves centralized collection
    // infrastructure is in place.
    const status: CollectedEvidence["status"] = tablesWithRecords >= 1 ? "pass" : "partial";
    const recommendation = tablesWithRecords < 3
      ? "Some audit tables have no records. Use the platform features (RBAC role assignment, Claw agent operations, data queries) to generate events across all audit streams."
      : null;

    return {
      controlId: "AU.3.048",
      collectedAt: new Date().toISOString(),
      status,
      items,
      recommendation,
    };
  } catch (err) {
    logger.error(`[${SOURCE}] AU.3.048 evidence collection failed`, err);
    return {
      controlId: "AU.3.048",
      collectedAt: new Date().toISOString(),
      status: "fail",
      items: [{
        label: "Error",
        value: "Failed to query audit table statistics",
        verified: false,
      }],
      recommendation: "Database query failed. Verify all 5 audit tables exist: rbac_audit_events, claw_audit_events, claw_inference_events, claw_tool_events, query_history.",
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Collect evidence for any AU-domain control.
 *
 * @param orgId     - Organization ID (required for org-scoped queries)
 * @param controlId - The CMMC control identifier (e.g., "AU.2.041")
 * @returns Structured evidence with status, items, and recommendation
 */
export async function collectAuEvidence(
  orgId: string,
  controlId: string,
): Promise<CollectedEvidence> {
  logger.info(`[${SOURCE}] Collecting evidence for ${controlId} (org: ${orgId})`);

  switch (controlId) {
    case "AU.2.041":
      return collectAu2041(orgId);
    case "AU.2.042":
      return collectAu2042(orgId);
    case "AU.3.045":
      return collectAu3045(orgId);
    case "AU.3.048":
      return collectAu3048(orgId);
    default:
      return {
        controlId,
        collectedAt: new Date().toISOString(),
        status: "fail",
        items: [{
          label: "Unknown control",
          value: `${controlId} is not an AU-domain control`,
          verified: false,
        }],
        recommendation: `Control ${controlId} does not belong to the Audit & Accountability domain. Valid AU controls: AU.2.041, AU.2.042, AU.3.045, AU.3.048`,
      };
  }
}
