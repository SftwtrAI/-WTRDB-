"use strict";

import { Router, Response } from "express";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import { KycService } from "../services/kyc.service";
import { KycEngineConfig } from "../config/kyc-config";
import type { KycDocumentType, KycSettings } from "../types";

interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

// Configure multer for KYC document uploads
const storage = multer.diskStorage({
  destination: (req: any, file, cb) => {
    const userId = req.userId;
    if (!userId) {
      return cb(new Error("User not authenticated"), "");
    }
    const userDir = KycService.ensureUserKycDirectory(userId);
    cb(null, userDir);
  },
  filename: (req: any, file, cb) => {
    const documentType = req.body.documentType || "document";
    const ext = path.extname(file.originalname);
    const filename = `${documentType}_${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: KycEngineConfig.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (KycEngineConfig.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type. Allowed: ${KycEngineConfig.allowedMimeTypes.join(", ")}`,
        ),
      );
    }
  },
});

export function registerKycRoutes(
  router: Router,
  requireAuth: (req: any, res: Response, next: any) => void,
  requireAdmin: (req: any, res: Response, next: any) => void,
): void {
  // ============================================================
  // USER ENDPOINTS
  // ============================================================

  /**
   * GET /api/kyc/status
   * Get current user's KYC status
   */
  router.get(
    "/api/kyc/status",
    requireAuth,
    async (req: any, res: Response) => {
      try {
        const status = await KycService.getUserKycStatus(req.userId!);
        res.json(status);
      } catch (error: any) {
        console.error("[KYC] Error fetching KYC status:", error);
        res.status(500).json({ error: "Failed to fetch KYC status" });
      }
    },
  );

  /**
   * GET /api/kyc/documents
   * Get current user's KYC documents
   */
  router.get(
    "/api/kyc/documents",
    requireAuth,
    async (req: any, res: Response) => {
      try {
        const documents = await KycService.getUserDocuments(req.userId!);
        res.json(documents);
      } catch (error: any) {
        console.error("[KYC] Error fetching KYC documents:", error);
        res.status(500).json({ error: "Failed to fetch KYC documents" });
      }
    },
  );

  /**
   * POST /api/kyc/upload
   * Upload a KYC document
   */
  router.post(
    "/api/kyc/upload",
    requireAuth,
    upload.single("document"),
    async (req: any, res: Response) => {
      try {
        const { documentType } = req.body;
        const file = req.file;

        if (!documentType) {
          return res.status(400).json({ error: "Document type is required" });
        }

        if (!file) {
          return res.status(400).json({ error: "File is required" });
        }

        const validTypes = KycEngineConfig.documentTypes;
        if (!validTypes.includes(documentType)) {
          return res.status(400).json({
            error: `Invalid document type. Must be one of: ${validTypes.join(", ")}`,
          });
        }

        const relativePath = path.join(
          KycEngineConfig.storagePath,
          req.userId!,
          file.filename,
        );

        const document = await KycService.uploadDocument({
          userId: req.userId!,
          documentType: documentType as KycDocumentType,
          fileName: file.originalname,
          filePath: relativePath,
          mimeType: file.mimetype,
          fileSize: file.size,
        });

        res.json({ success: true, document });
      } catch (error: any) {
        console.error("[KYC] Error uploading document:", error);
        res
          .status(400)
          .json({ error: error.message || "Failed to upload document" });
      }
    },
  );

  /**
   * DELETE /api/kyc/documents/:id
   * Delete a KYC document
   */
  router.delete(
    "/api/kyc/documents/:id",
    requireAuth,
    async (req: any, res: Response) => {
      try {
        const { id } = req.params;
        await KycService.deleteDocument(id, req.userId!);
        res.json({ success: true, message: "Document deleted" });
      } catch (error: any) {
        console.error("[KYC] Error deleting document:", error);
        res
          .status(400)
          .json({ error: error.message || "Failed to delete document" });
      }
    },
  );

  /**
   * POST /api/kyc/submit
   * Submit KYC for review
   */
  router.post(
    "/api/kyc/submit",
    requireAuth,
    async (req: any, res: Response) => {
      try {
        const status = await KycService.submitForReview(req.userId!);
        res.json(status);
      } catch (error: any) {
        console.error("[KYC] Error submitting KYC:", error);
        res
          .status(400)
          .json({ error: error.message || "Failed to submit KYC" });
      }
    },
  );

  /**
   * GET /api/kyc/check-purchase/:provider
   * Check if user can purchase phone numbers for a provider
   */
  router.get(
    "/api/kyc/check-purchase/:provider",
    requireAuth,
    async (req: any, res: Response) => {
      try {
        const { provider } = req.params;

        if (provider !== "twilio" && provider !== "plivo") {
          return res
            .status(400)
            .json({ error: "Invalid provider. Must be twilio or plivo." });
        }

        // Get KYC settings from database
        const { db } = await import("../../../db");
        const { globalSettings } = await import("@wtrops/shared");
        const { eq } = await import("drizzle-orm");

        const twilioSetting = await db
          .select()
          .from(globalSettings)
          .where(eq(globalSettings.key, "twilio_kyc_required"))
          .limit(1);
        const plivoSetting = await db
          .select()
          .from(globalSettings)
          .where(eq(globalSettings.key, "plivo_kyc_required"))
          .limit(1);

        const kycSettings: KycSettings = {
          twilioKycRequired:
            (twilioSetting[0]?.value as any) === true ||
            twilioSetting[0]?.value === "true",
          plivoKycRequired:
            (plivoSetting[0]?.value as any) === true ||
            plivoSetting[0]?.value === "true",
        };

        const result = await KycService.canPurchasePhoneNumbers(
          req.userId!,
          provider,
          kycSettings,
        );
        res.json(result);
      } catch (error: any) {
        console.error("[KYC] Error checking purchase eligibility:", error);
        res.status(500).json({ error: "Failed to check purchase eligibility" });
      }
    },
  );

  // ============================================================
  // ADMIN ENDPOINTS
  // ============================================================

  /**
   * GET /api/admin/users/:userId/kyc
   * Get a user's KYC status and documents (admin)
   */
  router.get(
    "/api/admin/users/:userId/kyc",
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const { userId } = req.params;
        const status = await KycService.getUserKycStatus(userId);
        res.json(status);
      } catch (error: any) {
        console.error("[KYC] Error fetching user KYC:", error);
        res.status(500).json({ error: "Failed to fetch user KYC" });
      }
    },
  );

  /**
   * GET /api/admin/users/:userId/kyc/documents
   * Get a user's KYC documents (admin)
   */
  router.get(
    "/api/admin/users/:userId/kyc/documents",
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const { userId } = req.params;
        const documents = await KycService.getUserDocuments(userId);
        res.json(documents);
      } catch (error: any) {
        console.error("[KYC] Error fetching user KYC documents:", error);
        res.status(500).json({ error: "Failed to fetch user KYC documents" });
      }
    },
  );

  /**
   * POST /api/admin/users/:userId/kyc/approve
   * Approve a user's KYC (admin)
   */
  router.post(
    "/api/admin/users/:userId/kyc/approve",
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const { userId } = req.params;
        const status = await KycService.approveKyc(userId);
        res.json(status);
      } catch (error: any) {
        console.error("[KYC] Error approving KYC:", error);
        res
          .status(400)
          .json({ error: error.message || "Failed to approve KYC" });
      }
    },
  );

  /**
   * POST /api/admin/users/:userId/kyc/reject
   * Reject a user's KYC (admin)
   */
  router.post(
    "/api/admin/users/:userId/kyc/reject",
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const { userId } = req.params;
        const { reason } = req.body;
        const status = await KycService.rejectKyc(userId, reason);
        res.json(status);
      } catch (error: any) {
        console.error("[KYC] Error rejecting KYC:", error);
        res
          .status(400)
          .json({ error: error.message || "Failed to reject KYC" });
      }
    },
  );

  /**
   * GET /api/kyc/document/:userId/:filename
   * Serve KYC document file (admin only)
   */
  router.get(
    "/api/kyc/document/:userId/:filename",
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const { userId, filename } = req.params;

        // Validate no path traversal in params
        if (
          userId.includes("..") ||
          filename.includes("..") ||
          userId.includes("/") ||
          filename.includes("/")
        ) {
          return res.status(400).json({ error: "Invalid path" });
        }

        const baseDir = path.resolve(
          process.cwd(),
          KycEngineConfig.storagePath,
        );
        const filePath = path.resolve(baseDir, userId, filename);

        // Ensure resolved path is within base directory (prevent traversal)
        if (!filePath.startsWith(baseDir)) {
          return res.status(400).json({ error: "Invalid path" });
        }

        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: "Document not found" });
        }

        res.sendFile(filePath);
      } catch (error: any) {
        console.error("[KYC] Error serving document:", error);
        res.status(500).json({ error: "Failed to serve document" });
      }
    },
  );

  /**
   * GET /api/admin/kyc/documents/:documentId/download
   * Download KYC document by ID (admin only)
   */
  router.get(
    "/api/admin/kyc/documents/:documentId/download",
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const { documentId } = req.params;

        const document = await KycService.getDocumentById(documentId);
        if (!document) {
          return res.status(404).json({ error: "Document not found" });
        }

        const baseDir = path.resolve(
          process.cwd(),
          KycEngineConfig.storagePath,
        );
        const filePath = path.resolve(process.cwd(), document.filePath);

        // Ensure resolved path is within base directory (prevent traversal)
        if (!filePath.startsWith(baseDir)) {
          console.error(
            `[KYC] Path traversal attempt detected: ${document.filePath}`,
          );
          return res.status(400).json({ error: "Invalid document path" });
        }

        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: "Document file not found" });
        }

        res.sendFile(filePath);
      } catch (error: any) {
        console.error("[KYC] Error downloading document:", error);
        res.status(500).json({ error: "Failed to download document" });
      }
    },
  );
}
