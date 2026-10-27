"use strict";

/**
 * Policy Sync Service
 *
 * Pushes compiled policy data to the OPA sidecar via its Management REST API.
 * Handles create, update, and delete of policy data documents at
 * `data.policy.<orgId>` in OPA.
 *
 * Sync flow:
 *   1. Compile policy data using the PolicyCompiler
 *   2. PUT the data document to OPA at /v1/data/policy/{orgId}
 *   3. Log the operation for audit
 */

import { db } from "../../../db";
import { clawPolicyTemplates, claws } from "@wtrops/shared";
import { eq } from "drizzle-orm";
import { logger } from "../../../utils/logger";
import { ClawConfig } from "../config";
import {
  compileOrgBundle,
  compileClawBundle,
  type PolicyDataDocument,
} from "./policy-compiler";

const SOURCE = "PolicySyncService";

// ── Types ──

export interface SyncResult {
  success: boolean;
  orgId: string;
  clawId?: string;
  templateCount?: number;
  error?: string;
  durationMs: number;
}

// ── Internal HTTP Helpers ──

async function opaPut(path: string, data: unknown): Promise<{ ok: boolean; status: number }> {
  const url = `${ClawConfig.opa.url}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { ok: response.ok, status: response.status };
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw new Error(`OPA PUT ${path} failed: ${error.message}`);
  }
}

async function opaDelete(path: string): Promise<{ ok: boolean; status: number }> {
  const url = `${ClawConfig.opa.url}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "DELETE",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { ok: response.ok, status: response.status };
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw new Error(`OPA DELETE ${path} failed: ${error.message}`);
  }
}

async function opaGet(path: string): Promise<{ ok: boolean; status: number; data?: any }> {
  const url = `${ClawConfig.opa.url}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const body = await response.json();
      return { ok: true, status: response.status, data: body.result };
    }
    return { ok: false, status: response.status };
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw new Error(`OPA GET ${path} failed: ${error.message}`);
  }
}

// ── Public API ──

/**
 * Sync all compiled policy data for an org to OPA.
 *
 * Compiles all policy templates for the org, then PUTs each to OPA
 * at /v1/data/policy/{orgId}/{templateId}.
 *
 * If a clawId is provided, only that claw's specific policy is synced
 * at /v1/data/policy/{orgId}/claws/{clawId}.
 */
export async function syncPolicyToOpa(orgId: string, clawId?: string): Promise<SyncResult> {
  const start = Date.now();

  try {
    if (clawId) {
      // Sync a single claw's compiled policy
      const document = await compileClawBundle(clawId);
      if (!document) {
        return {
          success: false,
          orgId,
          clawId,
          error: `Claw ${clawId} not found or has no policy`,
          durationMs: Date.now() - start,
        };
      }

      const opaPath = `/v1/data/policy/${orgId}/claws/${clawId}`;
      const result = await opaPut(opaPath, document);

      if (!result.ok) {
        logger.error(
          `Failed to sync claw policy to OPA: org=${orgId} claw=${clawId} status=${result.status}`,
          undefined,
          SOURCE,
        );
        return {
          success: false,
          orgId,
          clawId,
          error: `OPA returned HTTP ${result.status}`,
          durationMs: Date.now() - start,
        };
      }

      logger.info(
        `Synced claw policy to OPA: org=${orgId} claw=${clawId}`,
        undefined,
        SOURCE,
      );
      return { success: true, orgId, clawId, templateCount: 1, durationMs: Date.now() - start };
    }

    // Sync all templates for the org
    const bundles = await compileOrgBundle(orgId);

    if (bundles.size === 0) {
      logger.info(`No policy templates found for org=${orgId} — nothing to sync`, undefined, SOURCE);
      return { success: true, orgId, templateCount: 0, durationMs: Date.now() - start };
    }

    // Build a single data document for the org containing all templates
    const orgData: Record<string, PolicyDataDocument> = {};
    for (const [templateId, document] of bundles) {
      orgData[templateId] = document;
    }

    const opaPath = `/v1/data/policy/${orgId}`;
    const result = await opaPut(opaPath, orgData);

    if (!result.ok) {
      logger.error(
        `Failed to sync org policy to OPA: org=${orgId} status=${result.status}`,
        undefined,
        SOURCE,
      );
      return {
        success: false,
        orgId,
        error: `OPA returned HTTP ${result.status}`,
        durationMs: Date.now() - start,
      };
    }

    logger.info(
      `Synced ${bundles.size} policy template(s) to OPA for org=${orgId}`,
      undefined,
      SOURCE,
    );
    return { success: true, orgId, templateCount: bundles.size, durationMs: Date.now() - start };
  } catch (error: any) {
    logger.error(
      `Policy sync error for org=${orgId}: ${error.message}`,
      undefined,
      SOURCE,
    );
    return {
      success: false,
      orgId,
      clawId,
      error: error.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Recompile and sync policy data for ALL organizations.
 * Returns an array of results, one per org.
 */
export async function syncAllOrgs(): Promise<SyncResult[]> {
  const start = Date.now();

  // Get all distinct org IDs that have policy templates
  const orgRows = await db
    .selectDistinct({ organizationId: clawPolicyTemplates.organizationId })
    .from(clawPolicyTemplates);

  const orgIds = orgRows
    .map((r) => r.organizationId)
    .filter((id): id is string => id !== null);

  logger.info(
    `Starting full policy sync for ${orgIds.length} organization(s)`,
    undefined,
    SOURCE,
  );

  const results: SyncResult[] = [];

  // Sync sequentially to avoid overwhelming OPA
  for (const orgId of orgIds) {
    const result = await syncPolicyToOpa(orgId);
    results.push(result);
  }

  const successes = results.filter((r) => r.success).length;
  const failures = results.filter((r) => !r.success).length;

  logger.info(
    `Full policy sync complete: ${successes} succeeded, ${failures} failed, took ${Date.now() - start}ms`,
    undefined,
    SOURCE,
  );

  return results;
}

/**
 * Remove all policy data for an org from OPA.
 */
export async function removePolicyFromOpa(orgId: string): Promise<SyncResult> {
  const start = Date.now();

  try {
    const opaPath = `/v1/data/policy/${orgId}`;
    const result = await opaDelete(opaPath);

    if (!result.ok && result.status !== 404) {
      logger.error(
        `Failed to remove policy from OPA: org=${orgId} status=${result.status}`,
        undefined,
        SOURCE,
      );
      return {
        success: false,
        orgId,
        error: `OPA returned HTTP ${result.status}`,
        durationMs: Date.now() - start,
      };
    }

    logger.info(`Removed policy data from OPA for org=${orgId}`, undefined, SOURCE);
    return { success: true, orgId, durationMs: Date.now() - start };
  } catch (error: any) {
    logger.error(
      `Failed to remove policy from OPA: org=${orgId} error=${error.message}`,
      undefined,
      SOURCE,
    );
    return {
      success: false,
      orgId,
      error: error.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Handle a policy template change.
 *
 * When a template is updated, find all claws using that template and
 * re-sync their policies to OPA.
 */
export async function onPolicyTemplateChange(templateId: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Find the template to get the org
  const [template] = await db
    .select()
    .from(clawPolicyTemplates)
    .where(eq(clawPolicyTemplates.id, templateId))
    .limit(1);

  if (!template) {
    logger.warn(`Template ${templateId} not found — skipping resync`, undefined, SOURCE);
    return results;
  }

  // If it's a system default, resync all orgs that have claws using it
  if (template.isSystemDefault) {
    const affectedClawRows = await db
      .select({ organizationId: claws.organizationId })
      .from(claws)
      .where(eq(claws.policyTemplateId, templateId));

    const orgIds = [...new Set(affectedClawRows.map((r) => r.organizationId))];

    logger.info(
      `System template ${templateId} changed — resyncing ${orgIds.length} org(s)`,
      undefined,
      SOURCE,
    );

    for (const orgId of orgIds) {
      const result = await syncPolicyToOpa(orgId);
      results.push(result);
    }
  } else if (template.organizationId) {
    // Org-specific template — just resync that org
    const result = await syncPolicyToOpa(template.organizationId);
    results.push(result);
  }

  // Also resync individual claws that directly reference this template
  const affectedClaws = await db
    .select({ id: claws.id, organizationId: claws.organizationId })
    .from(claws)
    .where(eq(claws.policyTemplateId, templateId));

  for (const claw of affectedClaws) {
    const result = await syncPolicyToOpa(claw.organizationId, claw.id);
    results.push(result);
  }

  logger.info(
    `Template change resync complete: templateId=${templateId}, ${results.length} sync(s) performed`,
    undefined,
    SOURCE,
  );

  return results;
}

/**
 * Retrieve the current policy data for an org from OPA (for verification/debugging).
 */
export async function getPolicyFromOpa(orgId: string): Promise<any | null> {
  try {
    const opaPath = `/v1/data/policy/${orgId}`;
    const result = await opaGet(opaPath);
    return result.ok ? result.data : null;
  } catch (error: any) {
    logger.error(
      `Failed to read policy from OPA: org=${orgId} error=${error.message}`,
      undefined,
      SOURCE,
    );
    return null;
  }
}
