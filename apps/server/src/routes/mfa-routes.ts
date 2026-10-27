"use strict";

import { Router, Response } from "express";
import { RouteContext, AuthRequest } from "./common";
import { logger } from "../utils/logger";
import {
  setupMfa,
  verifyMfaSetup,
  verifyMfaLogin,
  disableMfa,
  getMfaStatus,
} from "../services/mfa.service";
import { auditRbac } from "../services/compliance-audit-bridge";

// ════════════════════════════════════════════════════════════════════════════════
// MFA Routes — TOTP-based Multi-Factor Authentication
// CMMC IA.2.081: Multi-factor authentication for local and network access
// ════════════════════════════════════════════════════════════════════════════════

export function createMfaRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateToken, authRateLimiter } = ctx;

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/auth/mfa/setup
  // Initiate MFA setup — returns secret, QR code URI, and backup codes.
  // Requires authentication. Does NOT enable MFA until verify-setup is called.
  // ──────────────────────────────────────────────────────────────────────────
  router.post(
    "/api/auth/mfa/setup",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const result = await setupMfa(req.userId!);

        logger.info(
          `MFA setup initiated for user ${req.userId}`,
          undefined,
          "MFA",
        );

        res.json({
          secret: result.secret,
          qrCodeUri: result.qrCodeUri,
          backupCodes: result.backupCodes,
        });

        auditRbac((req as any).organizationId || "system", req.userId!, "mfa.setup", {});
      } catch (error: any) {
        logger.error("MFA setup error", error, "MFA");
        const status = error.message.includes("already enabled") ? 409 : 500;
        res.status(status).json({ error: error.message || "MFA setup failed" });
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/auth/mfa/verify-setup
  // Confirm MFA setup by verifying the first TOTP token from the authenticator
  // app. This enables MFA on the account.
  // Body: { token: "123456" }
  // ──────────────────────────────────────────────────────────────────────────
  router.post(
    "/api/auth/mfa/verify-setup",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { token } = req.body;

        if (!token || typeof token !== "string") {
          return res
            .status(400)
            .json({ error: "A 6-digit verification code is required" });
        }

        const result = await verifyMfaSetup(req.userId!, token.trim());

        logger.info(
          `MFA enabled for user ${req.userId}`,
          undefined,
          "MFA",
        );

        res.json({
          success: true,
          message: "MFA has been successfully enabled on your account",
        });

        auditRbac((req as any).organizationId || "system", req.userId!, "mfa.verify", {});
      } catch (error: any) {
        logger.error("MFA verify-setup error", error, "MFA");
        const status = error.message.includes("Invalid") ? 400 : 500;
        res
          .status(status)
          .json({ error: error.message || "MFA verification failed" });
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/auth/mfa/verify
  // Verify MFA during login. Accepts TOTP codes or backup codes.
  // Body: { userId: "...", token: "123456" }
  // This endpoint uses rate limiting but does NOT require bearer auth
  // (called mid-login before the full JWT is issued).
  // ──────────────────────────────────────────────────────────────────────────
  router.post(
    "/api/auth/mfa/verify",
    authRateLimiter,
    async (req: AuthRequest, res: Response) => {
      try {
        const { userId, token } = req.body;

        if (!userId || !token) {
          return res
            .status(400)
            .json({ error: "userId and token are required" });
        }

        const result = await verifyMfaLogin(userId, token.trim());

        logger.info(
          `MFA verified for user ${userId} via ${result.method}`,
          undefined,
          "MFA",
        );

        res.json({
          success: true,
          method: result.method,
          ...(result.remainingBackupCodes !== undefined && {
            remainingBackupCodes: result.remainingBackupCodes,
          }),
        });

        auditRbac("system", userId, "mfa.verify", {});
      } catch (error: any) {
        logger.error("MFA verify error", error, "MFA");
        const status = error.message.includes("Invalid") ? 401 : 500;
        res
          .status(status)
          .json({ error: error.message || "MFA verification failed" });
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/auth/mfa/disable
  // Disable MFA. Requires a valid current TOTP token for confirmation.
  // Body: { token: "123456" }
  // ──────────────────────────────────────────────────────────────────────────
  router.post(
    "/api/auth/mfa/disable",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { token } = req.body;

        if (!token || typeof token !== "string") {
          return res.status(400).json({
            error:
              "A valid verification code is required to disable MFA",
          });
        }

        const result = await disableMfa(req.userId!, token.trim());

        logger.info(
          `MFA disabled for user ${req.userId}`,
          undefined,
          "MFA",
        );

        res.json({
          success: true,
          message: "MFA has been disabled on your account",
        });

        auditRbac((req as any).organizationId || "system", req.userId!, "mfa.disable", {});
      } catch (error: any) {
        logger.error("MFA disable error", error, "MFA");
        const status = error.message.includes("Invalid") ? 400 : 500;
        res
          .status(status)
          .json({ error: error.message || "Failed to disable MFA" });
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/auth/mfa/status
  // Check MFA status for the current user. Returns whether MFA is enabled
  // and if it's required by org policy.
  // Query: ?organizationId=xxx (optional)
  // ──────────────────────────────────────────────────────────────────────────
  router.get(
    "/api/auth/mfa/status",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const organizationId = req.query.organizationId as string | undefined;
        const status = await getMfaStatus(req.userId!, organizationId);

        res.json(status);
      } catch (error: any) {
        logger.error("MFA status error", error, "MFA");
        res
          .status(500)
          .json({ error: error.message || "Failed to check MFA status" });
      }
    },
  );

  return router;
}
