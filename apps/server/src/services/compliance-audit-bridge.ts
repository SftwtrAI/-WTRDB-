import { db } from "../db";
import {
  rbacAuditEvents,
  queryHistory,
} from "@wtrops/shared";

export async function auditEvent(params: {
  orgId: string;
  userId: string;
  table: "rbac" | "claw" | "inference" | "tool" | "query";
  eventType: string;
  eventData?: any;
  ipAddress?: string;
  // For claw events
  clawId?: string;
  // For inference events
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  creditsConsumed?: string;
  // For tool events
  toolSource?: string;
  toolId?: string;
  toolName?: string;
  status?: string;
  denyReason?: string;
  executionMs?: number;
  // For query events
  connectionId?: string;
  generatedSql?: string;
  naturalLanguageQuery?: string;
  executionTimeMs?: number;
  rowsReturned?: number;
}): Promise<void> {
  try {
    switch (params.table) {
      case "rbac":
        await db.insert(rbacAuditEvents).values({
          organizationId: params.orgId,
          actorUserId: params.userId,
          eventType: params.eventType,
          eventData: params.eventData || {},
          ipAddress: params.ipAddress || null,
        });
        break;
      case "claw":
        await db.insert(clawAuditEvents).values({
          organizationId: params.orgId,
          userId: params.userId,
          clawId: params.clawId || null,
          eventType: params.eventType,
          eventData: params.eventData || {},
          ipAddress: params.ipAddress || null,
        });
        break;
      case "inference":
        await db.insert(clawInferenceEvents).values({
          organizationId: params.orgId,
          clawId: params.clawId || "system",
          provider: params.provider || "unknown",
          model: params.model || "unknown",
          tokensIn: params.tokensIn || 0,
          tokensOut: params.tokensOut || 0,
          creditsConsumed: params.creditsConsumed || "0",
          eventType: params.eventType,
          metadata: params.eventData,
        });
        break;
      case "tool":
        await db.insert(clawToolEvents).values({
          organizationId: params.orgId,
          clawId: params.clawId || "system",
          toolSource: params.toolSource || "platform",
          toolId: params.toolId || params.eventType,
          toolName: params.toolName || params.eventType,
          status: params.status || "success",
          denyReason: params.denyReason || null,
          creditsConsumed: params.creditsConsumed || "0",
          executionMs: params.executionMs || 0,
          metadata: params.eventData,
        });
        break;
      case "query":
        await db.insert(queryHistory).values({
          organizationId: params.orgId,
          connectionId: params.connectionId || "system",
          userId: params.userId,
          naturalLanguageQuery: params.naturalLanguageQuery || null,
          generatedSql: params.generatedSql || params.eventType,
          executionTimeMs: params.executionTimeMs || 0,
          rowsReturned: params.rowsReturned || 0,
          status: params.status || "success",
        });
        break;
    }
  } catch (error: any) {
    // Never let audit logging crash the request
    console.error(
      `[AuditBridge] Failed to log ${params.table}.${params.eventType}: ${error.message}`,
    );
  }
}

// Convenience helpers
export const auditRbac = (
  orgId: string,
  userId: string,
  eventType: string,
  eventData?: any,
  ipAddress?: string,
) =>
  auditEvent({ orgId, userId, table: "rbac", eventType, eventData, ipAddress });

export const auditClaw = (
  orgId: string,
  userId: string,
  eventType: string,
  clawId?: string,
  eventData?: any,
) =>
  auditEvent({ orgId, userId, table: "claw", eventType, clawId, eventData });

export const auditTool = (
  orgId: string,
  clawId: string,
  toolName: string,
  status: string,
  eventData?: any,
) =>
  auditEvent({
    orgId,
    userId: "system",
    table: "tool",
    eventType: "tool.invocation",
    clawId,
    toolName,
    toolId: toolName,
    toolSource: "platform",
    status,
    eventData,
  });
