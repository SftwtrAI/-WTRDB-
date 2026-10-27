"use strict";

import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  rbacAuditEvents,
  organizationMembers,
  userRoles,
} from "@wtrops/shared";
import { eq, and } from "drizzle-orm";
import { permissionService } from "../engines/rbac/services/permission.service";
import { scopeService, type ScopeResult } from "../engines/rbac/services/scope.service";
import { logger } from "../utils/logger";

// ════════════════════════════════════════════════════════════════════════════════
// Extended Request type with RBAC context
// ════════════════════════════════════════════════════════════════════════════════

export interface RbacRequest extends Request {
  userId?: string;
  userRole?: string;
  /** Organization ID resolved from the user's membership. */
  organizationId?: string;
  /** Team scope information injected by the RBAC middleware. */
  teamScopes?: ScopeResult;
  /** All permissions the user has in this org (populated by requirePermission). */
  userPermissions?: string[];
}

// ════════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the organization ID for a user.
 * Checks request header/query first, then falls back to the user's first org membership.
 */
async function resolveOrgId(req: RbacRequest): Promise<string | null> {
  // Allow explicit org ID via header or query
  const explicit =
    (req.headers["x-organization-id"] as string) ||
    (req.query.organizationId as string);
  if (explicit) return explicit;

  // Fall back to the user's first org membership
  if (!req.userId) return null;
  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, req.userId))
    .limit(1);

  return membership?.organizationId ?? null;
}

/**
 * Log a permission denial to the rbac_audit_events table.
 */
async function logDenial(
  orgId: string,
  userId: string,
  permission: string,
  ipAddress: string | undefined,
): Promise<void> {
  try {
    await db.insert(rbacAuditEvents).values({
      organizationId: orgId,
      actorUserId: userId,
      eventType: "permission_denied",
      eventData: { permission, reason: "missing_permission" },
      ipAddress: ipAddress ?? null,
    });
  } catch (err: any) {
    logger.warn(
      `Failed to log RBAC denial audit: ${err.message}`,
      undefined,
      "RBAC",
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Middleware Factory
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware factory that checks if the authenticated user has the
 * given permission for their organization.
 *
 * Usage:
 *   router.post("/teams", authenticateToken, requirePermission("teams.create"), handler);
 *
 * On denial:
 *   - Logs the event to rbac_audit_events
 *   - Returns 403 with a structured error
 *
 * On success:
 *   - Sets req.organizationId
 *   - Sets req.teamScopes (scope info for downstream filtering)
 *   - Sets req.userPermissions
 */
export function requirePermission(permission: string) {
  return async (
    req: RbacRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      // Resolve organization
      const orgId = await resolveOrgId(req);

      // If no org context, allow platform admins through, or pass through
      // with limited context (org model is being adopted incrementally)
      if (!orgId) {
        if (req.userRole === "admin") {
          req.organizationId = undefined;
          req.teamScopes = { isOrgWide: true, visibleOwnerIds: [], accessibleTeamIds: [] };
          next();
          return;
        }
        // For non-admin users without an org, allow read-only access
        // so the UI can render empty states instead of hard errors
        if (permission.endsWith(".read") || permission.endsWith(".list")) {
          req.organizationId = undefined;
          req.teamScopes = { isOrgWide: false, visibleOwnerIds: [], accessibleTeamIds: [] };
          next();
          return;
        }
        res.status(403).json({
          error: "No organization context. Create or join an organization first.",
          code: "NO_ORG_CONTEXT",
        });
        return;
      }

      req.organizationId = orgId;

      // Platform admins bypass RBAC
      if (req.userRole === "admin") {
        req.teamScopes = { isOrgWide: true, visibleOwnerIds: [], accessibleTeamIds: [] };
        next();
        return;
      }

      // Check permission
      const hasPermission = await permissionService.checkPermission(
        userId,
        orgId,
        permission,
      );

      if (!hasPermission) {
        const clientIp =
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          req.socket.remoteAddress;

        await logDenial(orgId, userId, permission, clientIp);

        logger.warn(
          `Permission denied: user=${userId} org=${orgId} permission=${permission}`,
          undefined,
          "RBAC",
        );

        res.status(403).json({
          error: "You do not have permission to perform this action.",
          code: "PERMISSION_DENIED",
          requiredPermission: permission,
        });
        return;
      }

      // Inject team scopes for downstream route handlers to filter results
      const scopes = await scopeService.getUserScope(userId, orgId);
      req.teamScopes = scopes;

      // Cache all user permissions on the request for convenience
      const allPerms = await permissionService.getUserPermissions(userId, orgId);
      req.userPermissions = allPerms;

      next();
    } catch (err: any) {
      logger.error(
        `RBAC middleware error: ${err.message}`,
        { stack: err.stack },
        "RBAC",
      );
      res.status(500).json({
        error: "Internal error during permission check",
        code: "RBAC_INTERNAL_ERROR",
      });
    }
  };
}

/**
 * Middleware that resolves org context and injects team scopes
 * WITHOUT checking a specific permission. Useful for routes that
 * just need the org/scope context.
 */
export function resolveRbacContext() {
  return async (
    req: RbacRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        next();
        return;
      }

      const orgId = await resolveOrgId(req);
      if (!orgId) {
        next();
        return;
      }

      req.organizationId = orgId;

      if (req.userRole === "admin") {
        req.teamScopes = { isOrgWide: true, visibleOwnerIds: [], accessibleTeamIds: [] };
      } else {
        req.teamScopes = await scopeService.getUserScope(userId, orgId);
      }

      req.userPermissions = await permissionService.getUserPermissions(
        userId,
        orgId,
      );

      next();
    } catch (err: any) {
      logger.error(
        `RBAC context resolution error: ${err.message}`,
        undefined,
        "RBAC",
      );
      next();
    }
  };
}
