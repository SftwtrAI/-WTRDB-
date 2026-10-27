"use strict";

/**
 * Brain Endpoint Access Middleware
 *
 * Gates every public /api/brain/:apiKey/* request through the RBAC system,
 * accepting two credential shapes so external integrations still work:
 *
 *   1. No Authorization header
 *      → authenticate as the endpoint's creator (the API key is the
 *        credential). This is what wtropsai / Claude Desktop / curl scripts
 *        use. The endpoint's owner identity runs RBAC.
 *
 *   2. Authorization: Bearer <JWT>
 *      → authenticate as that specific user. Enables a Managing Director,
 *        admin, or a user with a brain_endpoint_access grant to query KGs
 *        they don't own. If the token is present but invalid we 401 — we
 *        don't silently downgrade to creator-mode, since that would mask
 *        auth bugs in clients.
 *
 * After the caller is identified, RBAC fires:
 *   - admin (platform role) → pass
 *   - endpoint creator       → pass (own plant's KG)
 *   - brain.query_any_kg     → pass, as long as the creator is in the
 *                              caller's org (MD cross-plant)
 *   - brain.query_own_kg + userHasBrainAccess(endpoint, user) → pass
 *                              (Regional Manager / Safety Inspector / …)
 *   - otherwise              → 403
 */

import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { organizationMembers, type BrainEndpointRow } from "@wtrops/shared";
import { eq, and } from "drizzle-orm";
import { type HybridAuthRequest } from "./hybrid-auth";
import { permissionService } from "../engines/rbac/services/permission.service";
import { userHasBrainAccess } from "../services/brain-endpoints";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable must be set in production",
      );
    }
    return "insecure-dev-secret-CHANGE-ME";
  })();

export interface BrainAccessRequest extends HybridAuthRequest {
  brainEndpoint?: BrainEndpointRow;
  organizationId?: string;
  /**
   * True when the caller authenticated purely via the endpoint's API key
   * (no JWT). In that mode req.userId is set to the endpoint creator's id.
   */
  brainApiKeyAuth?: boolean;
}

async function resolveFirstOrg(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return row?.organizationId ?? null;
}

async function userIsMemberOfOrg(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, orgId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Express middleware factory. Loader is injected so this module doesn't
 * import the brain-endpoints service directly (keeps the dep graph shallow).
 */
export function requireBrainAccess(
  loadEndpointByApiKey: (apiKey: string) => Promise<BrainEndpointRow | null>,
) {
  return async (
    req: BrainAccessRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Step 1 — load endpoint. The API key itself is a credential, so we
    // need the endpoint row before we can decide how to authenticate.
    const apiKey = (req.params as { apiKey?: string }).apiKey;
    if (!apiKey) {
      res.status(400).json({ error: "apiKey required" });
      return;
    }
    const endpoint = await loadEndpointByApiKey(apiKey);
    if (!endpoint) {
      res.status(401).json({ error: "Invalid or expired API key" });
      return;
    }
    req.brainEndpoint = endpoint;

    // Step 2 — identify the caller.
    //
    // Two accepted shapes:
    //   (a) Authorization: Bearer <JWT>  → verify and use the user's identity.
    //       Invalid JWT → 401 (no silent downgrade).
    //   (b) No Authorization header      → caller is the endpoint's creator,
    //       authenticated purely by possession of the API key.
    const authHeader = req.headers["authorization"];
    const bearer =
      authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;

    // A Bearer that equals the endpoint's API key (or matches the `brn_`
    // prefix) is just the API key sent redundantly — downgrade to API-key
    // auth rather than attempting JWT verification. This is how external
    // integrations like wtropsai send the brain token.
    const bearerIsApiKey =
      bearer !== null && (bearer === endpoint.apiKey || bearer.startsWith("brn_"));

    if (bearer && !bearerIsApiKey) {
      try {
        const decoded = jwt.verify(bearer, JWT_SECRET) as {
          userId: string;
          role: string;
        };
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        req.brainApiKeyAuth = false;
      } catch {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
    } else {
      // API-key-only auth (no Bearer, or Bearer is the API key): impersonate
      // the endpoint creator.
      req.userId = endpoint.userId;
      req.userRole = undefined;
      req.brainApiKeyAuth = true;
    }

    // Step 3 — resolve caller's org (falling back to creator's org when the
    // caller has no membership row — covers dev setups and api-key-only auth).
    let callerOrg = await resolveFirstOrg(req.userId!);
    if (!callerOrg && req.userId === endpoint.userId) {
      callerOrg = await resolveFirstOrg(endpoint.userId);
    }

    // Step 4 — RBAC.
    //
    // 4a. Platform admin bypass (only meaningful on the JWT path; API-key
    //     auth never sets userRole).
    if (req.userRole === "admin") {
      req.organizationId = callerOrg ?? undefined;
      next();
      return;
    }

    // 4b. Creator bypass. Covers:
    //     - API-key-only callers (wtropsai, Claude Desktop, curl) — they ARE
    //       the creator from the server's POV.
    //     - Logged-in creators testing their own endpoint in the app.
    if (endpoint.userId === req.userId) {
      req.organizationId = callerOrg ?? undefined;
      next();
      return;
    }

    // 4c. Non-creator JWT callers must have org context + a brain permission.
    if (!callerOrg) {
      res.status(403).json({
        error: "No organization context for caller",
        code: "NO_ORG_CONTEXT",
      });
      return;
    }
    req.organizationId = callerOrg;

    const perms = await permissionService.getUserPermissions(
      req.userId!,
      callerOrg,
    );

    // Managing Director (or anyone else with query_any_kg): any endpoint in
    // their org.
    if (perms.includes("brain.query_any_kg")) {
      const creatorInOrg = await userIsMemberOfOrg(endpoint.userId, callerOrg);
      if (!creatorInOrg) {
        res.status(403).json({
          error: "This brain endpoint is not part of your organization.",
          code: "CROSS_ORG_DENIED",
        });
        return;
      }
      next();
      return;
    }

    // query_own_kg: only endpoints the caller owns or has been granted on.
    if (perms.includes("brain.query_own_kg")) {
      const allowed = await userHasBrainAccess(endpoint, req.userId!);
      if (!allowed) {
        res.status(403).json({
          error: "You do not have access to this brain endpoint.",
          code: "BRAIN_ACCESS_NOT_GRANTED",
        });
        return;
      }
      next();
      return;
    }

    res.status(403).json({
      error: "You do not have permission to query brain endpoints.",
      code: "BRAIN_PERMISSION_DENIED",
      requiredPermission: "brain.query_own_kg or brain.query_any_kg",
    });
  };
}
