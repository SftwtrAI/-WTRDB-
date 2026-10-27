"use strict";

import { db } from "../db";
import { auditLogs } from "@wtrops/shared";

export type AuditAction =
  | "user.login"
  | "user.login_failed"
  | "user.logout"
  | "user.register"
  | "user.password_reset"
  | "user.delete"
  | "admin.login"
  | "admin.user_update"
  | "admin.user_credit_adjust"
  | "admin.plan_update"
  | "admin.settings_update"
  | "admin.api_key_create"
  | "admin.api_key_delete"
  | "payment.subscription_created"
  | "payment.subscription_cancelled"
  | "payment.credits_purchased"
  | "payment.refund"
  | "agent.create"
  | "agent.update"
  | "agent.delete"
  | "campaign.create"
  | "campaign.start"
  | "campaign.pause"
  | "campaign.resume"
  | "campaign.delete"
  | "phone.purchase"
  | "phone.release"
  | "security.rate_limit_exceeded"
  | "security.invalid_token"
  | "security.unauthorized_access"
  | "jd.create"
  | "jd.update"
  | "jd.delete"
  | "jd.embed"
  | "question_set.create"
  | "question_set.update"
  | "question_set.delete"
  | "question_set.generate"
  | "candidate_set.create"
  | "candidate_set.update"
  | "candidate_set.delete"
  | "candidate.upload"
  | "candidate.rank"
  | "candidate.filter"
  | "email_config.create"
  | "email_config.update"
  | "email_config.delete"
  | "email_config.verify"
  | "automation.create"
  | "automation.activate"
  | "automation.pause"
  | "automation.complete"
  | "automation.invite_sent"
  | "automation.interview_started"
  | "automation.interview_completed"
  | "automation.candidate_scored"
  | "candidate_set.create_from_filter";

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  severity?: "info" | "warning" | "error" | "critical";
}

const auditLogQueue: AuditLogEntry[] = [];
let flushTimer: NodeJS.Timeout | null = null;

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  const logEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    severity: entry.severity || getSeverityForAction(entry.action),
  };

  const severityEmoji = {
    info: "ℹ️",
    warning: "⚠️",
    error: "❌",
    critical: "🚨",
  };

  console.log(
    `${severityEmoji[logEntry.severity]} [Audit] ${logEntry.action}`,
    JSON.stringify({
      userId: logEntry.userId,
      targetUserId: logEntry.targetUserId,
      resourceType: logEntry.resourceType,
      resourceId: logEntry.resourceId,
      ip: logEntry.ipAddress,
      ...logEntry.metadata,
    }),
  );

  auditLogQueue.push(logEntry);

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushAuditLogs();
    }, 5000);

    if (flushTimer.unref) {
      flushTimer.unref();
    }
  }
}

function getSeverityForAction(
  action: AuditAction,
): "info" | "warning" | "error" | "critical" {
  const severityMap: Record<string, "info" | "warning" | "error" | "critical"> =
    {
      "security.rate_limit_exceeded": "warning",
      "security.invalid_token": "warning",
      "security.unauthorized_access": "error",
      "user.login_failed": "warning",
      "admin.user_delete": "warning",
      "admin.api_key_delete": "warning",
      "payment.refund": "warning",
      "user.delete": "warning",
      "user.password_reset": "info",
      "user.login": "info",
      "user.register": "info",
      "admin.login": "info",
      "payment.credits_purchased": "info",
      "payment.subscription_created": "info",
    };

  return severityMap[action] || "info";
}

async function flushAuditLogs(): Promise<void> {
  flushTimer = null;

  if (auditLogQueue.length === 0) return;

  const logsToFlush = auditLogQueue.splice(0, auditLogQueue.length);

  try {
    const insertValues = logsToFlush.map((log) => ({
      action: log.action,
      userId: log.userId || null,
      targetUserId: log.targetUserId || null,
      resourceType: log.resourceType || null,
      resourceId: log.resourceId || null,
      ipAddress: log.ipAddress || null,
      userAgent: log.userAgent ? log.userAgent.substring(0, 500) : null,
      metadata: log.metadata || {},
      severity: log.severity || "info",
    }));

    await db.insert(auditLogs).values(insertValues);
  } catch (error: unknown) {
    console.error("[Audit] Failed to flush logs:", error);
  }
}

export function extractRequestInfo(req: any): {
  ipAddress: string;
  userAgent: string;
} {
  const ipAddress =
    req.ip ||
    req.headers?.["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown";

  const userAgent = req.headers?.["user-agent"] || "unknown";

  return { ipAddress, userAgent };
}

export async function logUserLogin(
  userId: string,
  req: any,
  success: boolean,
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(req);

  await logAuditEvent({
    action: success ? "user.login" : "user.login_failed",
    userId: success ? userId : undefined,
    ipAddress,
    userAgent,
    metadata: { email: req.body?.email },
    severity: success ? "info" : "warning",
  });
}

export async function logAdminAction(
  adminUserId: string,
  action: AuditAction,
  targetUserId: string | undefined,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    action,
    userId: adminUserId,
    targetUserId,
    resourceType,
    resourceId,
    metadata,
  });
}

export async function logPaymentEvent(
  userId: string,
  action: AuditAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    action,
    userId,
    resourceType: "payment",
    metadata,
    severity: action === "payment.refund" ? "warning" : "info",
  });
}

export async function logSecurityEvent(
  action: AuditAction,
  req: any,
  userId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(req);

  await logAuditEvent({
    action,
    userId,
    ipAddress,
    userAgent,
    metadata,
    severity: action === "security.unauthorized_access" ? "error" : "warning",
  });
}
