"use strict";

import { db } from "../db";
import { clawPolicyTemplates, roles, userRoles, concurrencyLimits, teams, organizations } from "@wtrops/shared";
import { eq, and, count } from "drizzle-orm";
import { logger } from "../utils/logger";

const SOURCE = "ComplianceAutoConfig";

interface ActionResult { action: string; result: "done" | "skipped" | "failed"; detail: string; }
interface ControlResult { controlId: string; controlName: string; status: "configured" | "skipped" | "manual_required" | "failed"; actions: ActionResult[]; }
export interface AutoConfigResult { framework: string; configured: number; skipped: number; failed: number; manualRequired: number; results: ControlResult[]; }

export async function autoConfigureFramework(orgId: string, userId: string, framework: string): Promise<AutoConfigResult> {
  const results: ControlResult[] = [];
  let configured = 0, skipped = 0, failed = 0, manualRequired = 0;
  logger.info(`Auto-configuring ${framework} for org=${orgId}`, undefined, SOURCE);

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return { framework, configured: 0, skipped: 0, failed: 1, manualRequired: 0, results: [{ controlId: "ORG", controlName: "Organization", status: "failed", actions: [{ action: "Verify org", result: "failed", detail: "Not found" }] }] };

  try {
    const [rc] = await db.select({ cnt: count() }).from(roles).where(eq(roles.isSystemRole, true));
    if (Number(rc.cnt) < 4) {
      for (const sr of [{ name: "owner", displayName: "Owner", priority: 100 }, { name: "admin", displayName: "Admin", priority: 80 }, { name: "team_member", displayName: "Team Member", priority: 40 }, { name: "viewer", displayName: "Viewer", priority: 10 }]) {
        const [ex] = await db.select().from(roles).where(and(eq(roles.name, sr.name), eq(roles.isSystemRole, true))).limit(1);
        if (!ex) await db.insert(roles).values({ name: sr.name, displayName: sr.displayName, isSystemRole: true, priority: sr.priority });
      }
      results.push({ controlId: "RBAC-ROLES", controlName: "System Roles", status: "configured", actions: [{ action: "Seed roles", result: "done", detail: "4 system roles ensured" }] }); configured++;
    } else { results.push({ controlId: "RBAC-ROLES", controlName: "System Roles", status: "skipped", actions: [{ action: "Seed roles", result: "skipped", detail: "Already exist" }] }); skipped++; }
  } catch (e: any) { results.push({ controlId: "RBAC-ROLES", controlName: "System Roles", status: "failed", actions: [{ action: "Seed roles", result: "failed", detail: e.message }] }); failed++; }

  try {
    const [ownerRole] = await db.select().from(roles).where(and(eq(roles.name, "owner"), eq(roles.isSystemRole, true))).limit(1);
    if (ownerRole) {
      const [ex] = await db.select().from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.organizationId, orgId), eq(userRoles.roleId, ownerRole.id))).limit(1);
      if (!ex) { await db.insert(userRoles).values({ userId, organizationId: orgId, roleId: ownerRole.id, assignedBy: userId }); results.push({ controlId: "RBAC-ASSIGN", controlName: "Owner Role", status: "configured", actions: [{ action: "Assign Owner", result: "done", detail: "Assigned" }] }); configured++; }
      else { results.push({ controlId: "RBAC-ASSIGN", controlName: "Owner Role", status: "skipped", actions: [{ action: "Assign Owner", result: "skipped", detail: "Already assigned" }] }); skipped++; }
    }
  } catch (e: any) { results.push({ controlId: "RBAC-ASSIGN", controlName: "Owner Role", status: "failed", actions: [{ action: "Assign Owner", result: "failed", detail: e.message }] }); failed++; }

  try {
    const [pc] = await db.select({ cnt: count() }).from(clawPolicyTemplates);
    if (Number(pc.cnt) === 0) {
      for (const t of [{ name: "restrictive", description: "Max security", networkMode: "deny_all", isSystemDefault: true }, { name: "standard", description: "Balanced", networkMode: "whitelist", isSystemDefault: true }, { name: "permissive", description: "Min restrictions", networkMode: "allow_all", isSystemDefault: true }])
        await db.insert(clawPolicyTemplates).values({ ...t, organizationId: orgId } as any);
      results.push({ controlId: "OPA-POLICIES", controlName: "OPA Policies", status: "configured", actions: [{ action: "Create templates", result: "done", detail: "3 templates created" }] }); configured++;
    } else { results.push({ controlId: "OPA-POLICIES", controlName: "OPA Policies", status: "skipped", actions: [{ action: "Create templates", result: "skipped", detail: `${pc.cnt} exist` }] }); skipped++; }
  } catch (e: any) { results.push({ controlId: "OPA-POLICIES", controlName: "OPA Policies", status: "failed", actions: [{ action: "Create templates", result: "failed", detail: e.message }] }); failed++; }

  try {
    const [ex] = await db.select().from(concurrencyLimits).where(eq(concurrencyLimits.organizationId, orgId)).limit(1);
    if (!ex) { await db.insert(concurrencyLimits).values({ organizationId: orgId, voiceConcurrencyLimit: 10, clawConcurrencyLimit: 10, totalConcurrencyLimit: 25 }); results.push({ controlId: "CONCURRENCY", controlName: "Concurrency", status: "configured", actions: [{ action: "Set limits", result: "done", detail: "25 total" }] }); configured++; }
    else { results.push({ controlId: "CONCURRENCY", controlName: "Concurrency", status: "skipped", actions: [{ action: "Set limits", result: "skipped", detail: "Already set" }] }); skipped++; }
  } catch (e: any) { results.push({ controlId: "CONCURRENCY", controlName: "Concurrency", status: "failed", actions: [{ action: "Set limits", result: "failed", detail: e.message }] }); failed++; }

  try {
    const [tc] = await db.select({ cnt: count() }).from(teams).where(eq(teams.organizationId, orgId));
    if (Number(tc.cnt) === 0) { await db.insert(teams).values({ organizationId: orgId, name: "Default Team", description: "Auto-created", createdBy: userId }); results.push({ controlId: "TEAMS", controlName: "Teams", status: "configured", actions: [{ action: "Create team", result: "done", detail: "Default team created" }] }); configured++; }
    else { results.push({ controlId: "TEAMS", controlName: "Teams", status: "skipped", actions: [{ action: "Create team", result: "skipped", detail: `${tc.cnt} exist` }] }); skipped++; }
  } catch (e: any) { results.push({ controlId: "TEAMS", controlName: "Teams", status: "failed", actions: [{ action: "Create team", result: "failed", detail: e.message }] }); failed++; }

  for (const mc of [
    { id: "DOCS", name: "Security Documentation", action: "Document security policies" },
    { id: "TRAINING", name: "Security Training", action: "Establish training program" },
    { id: "PHYSICAL", name: "Physical Security", action: "Verify cloud provider security" },
    { id: "IR-PLAN", name: "Incident Response", action: "Document IR procedures" },
    { id: "VENDORS", name: "Vendor Management", action: "Review third-party agreements" },
    { id: "BACKUP", name: "Backup & Recovery", action: "Test recovery procedures" },
  ]) { results.push({ controlId: mc.id, controlName: mc.name, status: "manual_required", actions: [{ action: mc.action, result: "skipped", detail: "Requires manual action" }] }); manualRequired++; }

  return { framework, configured, skipped, failed, manualRequired, results };
}
