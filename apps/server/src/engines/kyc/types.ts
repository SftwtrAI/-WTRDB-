"use strict";

export type KycStatus = "pending" | "submitted" | "approved" | "rejected";

export type KycDocumentType =
  | "photo_id"
  | "company_registration"
  | "gst_certificate"
  | "authorization_letter";

export interface KycDocument {
  id: string;
  userId: string;
  documentType: KycDocumentType;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize?: number;
  uploadedAt: Date;
}

export interface UserKycStatus {
  userId: string;
  status: KycStatus;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  documents: KycDocument[];
  isComplete: boolean;
}

export interface KycSettings {
  twilioKycRequired: boolean;
  plivoKycRequired: boolean;
}
