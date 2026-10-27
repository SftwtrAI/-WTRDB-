"use strict";

import type { KycDocumentType } from "../types";

export const KycEngineConfig = {
  documentTypes: [
    "photo_id",
    "company_registration",
    "gst_certificate",
    "authorization_letter",
  ] as KycDocumentType[],

  documentLabels: {
    photo_id: "Photo ID",
    company_registration: "Company Registration Certificate",
    gst_certificate: "GST Certificate",
    authorization_letter: "Authorization Letter",
  } as Record<KycDocumentType, string>,

  allowedMimeTypes: ["application/pdf", "image/jpeg", "image/jpg", "image/png"],

  maxFileSizeMb: 10,

  storagePath: "kyc",
};
