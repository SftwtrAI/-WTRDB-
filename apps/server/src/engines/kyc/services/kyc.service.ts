"use strict";

import { db } from "../../../db";
import { users } from "@wtrops/shared";
import { eq, and } from "drizzle-orm";
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

// Stub: userKycDocuments table was removed from the shared schema.
// This local definition keeps the KYC engine compilable; the underlying
// DB table may not exist, so all queries will fail gracefully at runtime.
const userKycDocuments = pgTable("user_kyc_documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  documentType: text("document_type").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
import { KycEngineConfig } from "../config/kyc-config";
import type {
  KycStatus,
  KycDocumentType,
  KycDocument,
  UserKycStatus,
  KycSettings,
} from "../types";
import * as fs from "fs";
import * as path from "path";
import { NotificationService } from "../../../services/notification-service";
import { emailService } from "../../../services/email-service";

export class KycService {
  /**
   * Get KYC status for a user
   */
  static async getUserKycStatus(userId: string): Promise<UserKycStatus> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const documents = await db
      .select()
      .from(userKycDocuments)
      .where(eq(userKycDocuments.userId, userId));

    const docTypes = documents.map((d) => d.documentType);
    const isComplete = KycEngineConfig.documentTypes.every((type) =>
      docTypes.includes(type),
    );

    return {
      userId: user.id,
      status: (user.kycStatus as KycStatus) || "pending",
      submittedAt: user.kycSubmittedAt,
      approvedAt: user.kycApprovedAt,
      rejectionReason: user.kycRejectionReason,
      documents: documents.map((d) => ({
        id: d.id,
        userId: d.userId,
        documentType: d.documentType as KycDocumentType,
        fileName: d.fileName,
        filePath: d.filePath,
        mimeType: d.mimeType,
        fileSize: d.fileSize ?? undefined,
        uploadedAt: d.uploadedAt,
      })),
      isComplete,
    };
  }

  /**
   * Get user's KYC documents
   */
  static async getUserDocuments(userId: string): Promise<KycDocument[]> {
    const documents = await db
      .select()
      .from(userKycDocuments)
      .where(eq(userKycDocuments.userId, userId));

    return documents.map((d) => ({
      id: d.id,
      userId: d.userId,
      documentType: d.documentType as KycDocumentType,
      fileName: d.fileName,
      filePath: d.filePath,
      mimeType: d.mimeType,
      fileSize: d.fileSize ?? undefined,
      uploadedAt: d.uploadedAt,
    }));
  }

  /**
   * Upload a KYC document
   */
  static async uploadDocument(params: {
    userId: string;
    documentType: KycDocumentType;
    fileName: string;
    filePath: string;
    mimeType: string;
    fileSize?: number;
  }): Promise<KycDocument> {
    const { userId, documentType, fileName, filePath, mimeType, fileSize } =
      params;

    // Validate document type
    if (!KycEngineConfig.documentTypes.includes(documentType)) {
      throw new Error(`Invalid document type: ${documentType}`);
    }

    // Validate mime type
    if (!KycEngineConfig.allowedMimeTypes.includes(mimeType)) {
      throw new Error(
        `Invalid file type. Allowed: ${KycEngineConfig.allowedMimeTypes.join(", ")}`,
      );
    }

    // Check if document of this type already exists for user
    const existing = await db
      .select()
      .from(userKycDocuments)
      .where(
        and(
          eq(userKycDocuments.userId, userId),
          eq(userKycDocuments.documentType, documentType),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Delete old file
      const oldDoc = existing[0];
      try {
        const fullPath = path.join(process.cwd(), oldDoc.filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (error) {
        console.warn("[KYC] Failed to delete old document file:", error);
      }

      // Update existing record
      const [updated] = await db
        .update(userKycDocuments)
        .set({
          fileName,
          filePath,
          mimeType,
          fileSize,
          uploadedAt: new Date(),
        })
        .where(eq(userKycDocuments.id, oldDoc.id))
        .returning();

      // Reset user KYC status if it was rejected
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (user?.kycStatus === "rejected") {
        await db
          .update(users)
          .set({
            kycStatus: "pending",
            kycRejectionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }

      return {
        id: updated.id,
        userId: updated.userId,
        documentType: updated.documentType as KycDocumentType,
        fileName: updated.fileName,
        filePath: updated.filePath,
        mimeType: updated.mimeType,
        fileSize: updated.fileSize ?? undefined,
        uploadedAt: updated.uploadedAt,
      };
    }

    // Insert new document
    const [doc] = await db
      .insert(userKycDocuments)
      .values({
        userId,
        documentType,
        fileName,
        filePath,
        mimeType,
        fileSize,
      })
      .returning();

    // Reset user KYC status if it was rejected
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.kycStatus === "rejected") {
      await db
        .update(users)
        .set({
          kycStatus: "pending",
          kycRejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return {
      id: doc.id,
      userId: doc.userId,
      documentType: doc.documentType as KycDocumentType,
      fileName: doc.fileName,
      filePath: doc.filePath,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize ?? undefined,
      uploadedAt: doc.uploadedAt,
    };
  }

  /**
   * Submit KYC for review
   */
  static async submitForReview(userId: string): Promise<UserKycStatus> {
    // Validate all documents are uploaded
    const documents = await this.getUserDocuments(userId);
    const docTypes = documents.map((d) => d.documentType);
    const missingDocs = KycEngineConfig.documentTypes.filter(
      (type) => !docTypes.includes(type),
    );

    if (missingDocs.length > 0) {
      const missingLabels = missingDocs.map(
        (t) => KycEngineConfig.documentLabels[t],
      );
      throw new Error(
        `Missing required documents: ${missingLabels.join(", ")}`,
      );
    }

    // Check current status
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.kycStatus === "approved") {
      throw new Error("KYC is already approved");
    }

    if (user.kycStatus === "submitted") {
      throw new Error("KYC is already submitted and pending review");
    }

    // Update status
    await db
      .update(users)
      .set({
        kycStatus: "submitted",
        kycSubmittedAt: new Date(),
        kycRejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return this.getUserKycStatus(userId);
  }

  /**
   * Approve KYC (admin action)
   */
  static async approveKyc(userId: string): Promise<UserKycStatus> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.kycStatus !== "submitted") {
      throw new Error(
        `Cannot approve KYC with status: ${user.kycStatus}. Must be 'submitted'.`,
      );
    }

    await db
      .update(users)
      .set({
        kycStatus: "approved",
        kycApprovedAt: new Date(),
        kycRejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    console.log(`[KYC] Approved KYC for user: ${userId}`);

    try {
      await NotificationService.create({
        userId,
        type: "kyc_approved",
        title: "KYC Approved",
        message:
          "Your KYC verification has been approved. You can now purchase phone numbers.",
        link: "/app/settings",
      });
      await emailService.sendKycApproved(userId);
    } catch (error) {
      console.error("[KYC] Failed to send approval notifications:", error);
    }

    return this.getUserKycStatus(userId);
  }

  /**
   * Reject KYC (admin action)
   */
  static async rejectKyc(
    userId: string,
    reason?: string,
  ): Promise<UserKycStatus> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.kycStatus !== "submitted") {
      throw new Error(
        `Cannot reject KYC with status: ${user.kycStatus}. Must be 'submitted'.`,
      );
    }

    await db
      .update(users)
      .set({
        kycStatus: "rejected",
        kycRejectionReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    console.log(`[KYC] Rejected KYC for user: ${userId}`);

    try {
      const rejectionMessage = reason
        ? `Your KYC verification was rejected. Reason: ${reason}. Please review and resubmit your documents.`
        : "Your KYC verification was rejected. Please review and resubmit your documents.";

      await NotificationService.create({
        userId,
        type: "kyc_rejected",
        title: "KYC Rejected",
        message: rejectionMessage,
        link: "/app/settings",
      });
      await emailService.sendKycRejected(
        userId,
        reason || "No reason provided",
      );
    } catch (error) {
      console.error("[KYC] Failed to send rejection notifications:", error);
    }

    return this.getUserKycStatus(userId);
  }

  /**
   * Check if user can purchase phone numbers
   */
  static async canPurchasePhoneNumbers(
    userId: string,
    provider: "twilio" | "plivo",
    settings: KycSettings,
  ): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // Check if KYC is required for this provider
    const kycRequired =
      provider === "twilio"
        ? settings.twilioKycRequired
        : settings.plivoKycRequired;

    if (!kycRequired) {
      return { allowed: true };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      return { allowed: false, reason: "User not found" };
    }

    if (user.kycStatus !== "approved") {
      return {
        allowed: false,
        reason:
          user.kycStatus === "submitted"
            ? "Your KYC is under review. Please wait for approval."
            : "KYC verification required before purchasing phone numbers.",
      };
    }

    return { allowed: true };
  }

  /**
   * Delete a KYC document
   */
  static async deleteDocument(
    documentId: string,
    userId: string,
  ): Promise<void> {
    const [doc] = await db
      .select()
      .from(userKycDocuments)
      .where(
        and(
          eq(userKycDocuments.id, documentId),
          eq(userKycDocuments.userId, userId),
        ),
      )
      .limit(1);

    if (!doc) {
      throw new Error("Document not found");
    }

    // Delete file
    try {
      const fullPath = path.join(process.cwd(), doc.filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      console.warn("[KYC] Failed to delete document file:", error);
    }

    // Delete record
    await db
      .delete(userKycDocuments)
      .where(eq(userKycDocuments.id, documentId));
  }

  /**
   * Ensure user's KYC storage directory exists
   */
  static ensureUserKycDirectory(userId: string): string {
    const userDir = path.join(
      process.cwd(),
      KycEngineConfig.storagePath,
      userId,
    );
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  /**
   * Get a KYC document by ID
   */
  static async getDocumentById(
    documentId: string,
  ): Promise<KycDocument | null> {
    const [doc] = await db
      .select()
      .from(userKycDocuments)
      .where(eq(userKycDocuments.id, documentId))
      .limit(1);

    if (!doc) {
      return null;
    }

    return {
      id: doc.id,
      userId: doc.userId,
      documentType: doc.documentType as KycDocumentType,
      fileName: doc.fileName,
      filePath: doc.filePath,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize ?? undefined,
      uploadedAt: doc.uploadedAt,
    };
  }
}
