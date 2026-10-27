"use strict";

import { Router, Response } from "express";
import { RouteContext } from "./common";
import { db } from "../db";
import {
  complianceSettings,
  complianceEvidence,
  complianceScheduledReports,
} from "@wtrops/shared";
import { eq, and, desc } from "drizzle-orm";
import {
  resolveRbacContext,
  type RbacRequest,
} from "../middleware/rbac.middleware";
import { logger } from "../utils/logger";
import { collectEvidenceForControl } from "../services/compliance-evidence-collector";
import { auditRbac } from "../services/compliance-audit-bridge";

// ════════════════════════════════════════════════════════════════════════════════
// Framework Relevance Guide — static data
// ════════════════════════════════════════════════════════════════════════════════

const FRAMEWORK_RELEVANCE_GUIDE = [
  {
    id: "iso27001",
    name: "ISO 27001",
    description: "Information Security Management System",
    relevanceGuide: {
      relevantIf: "You handle sensitive data of any kind",
      notRelevantIf: "Never — applicable to all organizations",
      recommended: true,
    },
  },
  {
    id: "soc2",
    name: "SOC 2",
    description: "Service Organization Control Type 2",
    relevanceGuide: {
      relevantIf: "You serve enterprise B2B customers",
      notRelevantIf: "Consumer-only product with no enterprise clients",
      recommended: true,
    },
  },
  {
    id: "dpdp",
    name: "DPDP Act",
    description: "Digital Personal Data Protection Act (India)",
    relevanceGuide: {
      relevantIf: "You have Indian customers or operations",
      notRelevantIf: "No presence in India",
      recommended: false,
    },
  },
  {
    id: "cmmc",
    name: "CMMC",
    description: "Cybersecurity Maturity Model Certification",
    relevanceGuide: {
      relevantIf: "You work with US DoD or defense contractors",
      notRelevantIf: "No government or defense work",
      recommended: false,
    },
  },
  {
    id: "hipaa",
    name: "HIPAA",
    description: "Health Insurance Portability and Accountability Act",
    relevanceGuide: {
      relevantIf: "You handle health or medical data",
      notRelevantIf: "No health data involvement",
      recommended: false,
    },
  },
  {
    id: "gdpr",
    name: "GDPR",
    description: "General Data Protection Regulation (EU)",
    relevanceGuide: {
      relevantIf: "You have EU customers or process EU personal data",
      notRelevantIf: "No EU presence or data processing",
      recommended: false,
    },
  },
  {
    id: "pci_dss",
    name: "PCI DSS",
    description: "Payment Card Industry Data Security Standard",
    relevanceGuide: {
      relevantIf: "You process payment card data",
      notRelevantIf: "No payment processing",
      recommended: false,
    },
  },
  {
    id: "nist_csf",
    name: "NIST CSF",
    description: "NIST Cybersecurity Framework",
    relevanceGuide: {
      relevantIf: "You want a security baseline — applicable to any organization",
      notRelevantIf: "Never — universally applicable",
      recommended: true,
    },
  },
  {
    id: "fedramp",
    name: "FedRAMP",
    description: "Federal Risk and Authorization Management Program",
    relevanceGuide: {
      relevantIf: "You sell to US federal agencies",
      notRelevantIf: "No federal customers",
      recommended: false,
    },
  },
  {
    id: "ccpa",
    name: "CCPA",
    description: "California Consumer Privacy Act",
    relevanceGuide: {
      relevantIf: "You have California customers",
      notRelevantIf: "No California customers",
      recommended: false,
    },
  },
  {
    id: "sox",
    name: "SOX",
    description: "Sarbanes-Oxley Act",
    relevanceGuide: {
      relevantIf: "You are publicly traded or plan to IPO",
      notRelevantIf: "Private company with no IPO plans",
      recommended: false,
    },
  },
  {
    id: "cis",
    name: "CIS Controls",
    description: "Center for Internet Security Controls",
    relevanceGuide: {
      relevantIf: "You want practical, prioritized security controls",
      notRelevantIf: "Never — universally applicable",
      recommended: true,
    },
  },
  {
    id: "csa_star",
    name: "CSA STAR",
    description: "Cloud Security Alliance Security Trust Assurance and Risk",
    relevanceGuide: {
      relevantIf: "You are a cloud service provider",
      notRelevantIf: "On-premise only deployment",
      recommended: false,
    },
  },
  {
    id: "iso42001",
    name: "ISO 42001",
    description: "AI Management System",
    relevanceGuide: {
      relevantIf: "You develop or deploy AI systems",
      notRelevantIf: "No AI involvement",
      recommended: true,
    },
  },
];

// ════════════════════════════════════════════════════════════════════════════════
// Compliance Settings Routes Factory
// ════════════════════════════════════════════════════════════════════════════════

export function createComplianceSettingsRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateHybrid } = ctx;
  const auth = authenticateHybrid as any;

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/settings — Get org compliance settings (upsert default)
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/settings",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        // Try to find existing settings
        const existing = await db
          .select()
          .from(complianceSettings)
          .where(eq(complianceSettings.organizationId, orgId))
          .limit(1);

        if (existing.length > 0) {
          res.json(existing[0]);
          return;
        }

        // Create default settings for this org
        const [created] = await db
          .insert(complianceSettings)
          .values({
            organizationId: orgId,
            enabledFrameworks: [],
            boardMemberEmails: [],
            boardReportFrequency: "monthly",
            boardReportEnabled: false,
            auditLogRetentionDays: 365,
            dataRetentionDays: 730,
            trainingFrequencyMonths: 12,
            minPasswordLength: 12,
            requireMfa: false,
            mfaEnforcedRoles: [],
            controlNotes: {},
          })
          .returning();

        res.json(created);
      } catch (err: any) {
        logger.error(`Failed to get compliance settings: ${err.message}`, undefined, "ComplianceSettings");
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // PUT /api/compliance/settings — Update compliance settings
  // ══════════════════════════════════════════════════════════════════════════

  router.put(
    "/api/compliance/settings",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const {
          enabledFrameworks,
          boardMemberEmails,
          boardReportFrequency,
          boardReportEnabled,
          irPrimaryContact,
          irSecondaryContact,
          irEscalationEmail,
          irSlackWebhook,
          auditLogRetentionDays,
          dataRetentionDays,
          dpoName,
          dpoEmail,
          securityTrainingProvider,
          lastTrainingDate,
          trainingFrequencyMonths,
          minPasswordLength,
          requireMfa,
          mfaEnforcedRoles,
          controlNotes,
        } = req.body;

        // Build update payload (only include defined fields)
        const updates: Record<string, any> = { updatedAt: new Date() };
        if (enabledFrameworks !== undefined) updates.enabledFrameworks = enabledFrameworks;
        if (boardMemberEmails !== undefined) updates.boardMemberEmails = boardMemberEmails;
        if (boardReportFrequency !== undefined) updates.boardReportFrequency = boardReportFrequency;
        if (boardReportEnabled !== undefined) updates.boardReportEnabled = boardReportEnabled;
        if (irPrimaryContact !== undefined) updates.irPrimaryContact = irPrimaryContact;
        if (irSecondaryContact !== undefined) updates.irSecondaryContact = irSecondaryContact;
        if (irEscalationEmail !== undefined) updates.irEscalationEmail = irEscalationEmail;
        if (irSlackWebhook !== undefined) updates.irSlackWebhook = irSlackWebhook;
        if (auditLogRetentionDays !== undefined) updates.auditLogRetentionDays = auditLogRetentionDays;
        if (dataRetentionDays !== undefined) updates.dataRetentionDays = dataRetentionDays;
        if (dpoName !== undefined) updates.dpoName = dpoName;
        if (dpoEmail !== undefined) updates.dpoEmail = dpoEmail;
        if (securityTrainingProvider !== undefined) updates.securityTrainingProvider = securityTrainingProvider;
        if (lastTrainingDate !== undefined) updates.lastTrainingDate = lastTrainingDate ? new Date(lastTrainingDate) : null;
        if (trainingFrequencyMonths !== undefined) updates.trainingFrequencyMonths = trainingFrequencyMonths;
        if (minPasswordLength !== undefined) updates.minPasswordLength = minPasswordLength;
        if (requireMfa !== undefined) updates.requireMfa = requireMfa;
        if (mfaEnforcedRoles !== undefined) updates.mfaEnforcedRoles = mfaEnforcedRoles;
        if (controlNotes !== undefined) updates.controlNotes = controlNotes;

        // Ensure settings row exists
        const existing = await db
          .select()
          .from(complianceSettings)
          .where(eq(complianceSettings.organizationId, orgId))
          .limit(1);

        let result;
        if (existing.length === 0) {
          // Insert new with provided values
          [result] = await db
            .insert(complianceSettings)
            .values({
              organizationId: orgId,
              ...updates,
            })
            .returning();
        } else {
          [result] = await db
            .update(complianceSettings)
            .set(updates)
            .where(eq(complianceSettings.organizationId, orgId))
            .returning();
        }

        auditRbac(orgId, req.userId!, "compliance.settings_updated", { fields: Object.keys(req.body) });

        res.json(result);
      } catch (err: any) {
        logger.error(`Failed to update compliance settings: ${err.message}`, undefined, "ComplianceSettings");
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/settings/frameworks — Framework relevance guide
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/settings/frameworks",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;

        // Fetch org's enabled frameworks if available
        let enabledFrameworks: string[] = [];
        if (orgId) {
          const settings = await db
            .select({ enabledFrameworks: complianceSettings.enabledFrameworks })
            .from(complianceSettings)
            .where(eq(complianceSettings.organizationId, orgId))
            .limit(1);

          if (settings.length > 0 && settings[0].enabledFrameworks) {
            enabledFrameworks = settings[0].enabledFrameworks as string[];
          }
        }

        // Enrich the static guide with enabled status
        const frameworks = FRAMEWORK_RELEVANCE_GUIDE.map((fw) => ({
          ...fw,
          enabled: enabledFrameworks.includes(fw.id),
        }));

        res.json({ frameworks, enabledCount: enabledFrameworks.length });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/compliance/settings/frameworks/toggle — Enable/disable framework
  // ══════════════════════════════════════════════════════════════════════════

  router.post(
    "/api/compliance/settings/frameworks/toggle",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const { frameworkId, enabled } = req.body as {
          frameworkId?: string;
          enabled?: boolean;
        };

        if (!frameworkId) {
          res.status(400).json({ error: "frameworkId is required" });
          return;
        }

        const validIds = FRAMEWORK_RELEVANCE_GUIDE.map((fw) => fw.id);
        if (!validIds.includes(frameworkId)) {
          res.status(400).json({
            error: `Invalid frameworkId. Must be one of: ${validIds.join(", ")}`,
          });
          return;
        }

        // Get or create settings
        let existing = await db
          .select()
          .from(complianceSettings)
          .where(eq(complianceSettings.organizationId, orgId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(complianceSettings).values({
            organizationId: orgId,
            enabledFrameworks: [],
          });
          existing = await db
            .select()
            .from(complianceSettings)
            .where(eq(complianceSettings.organizationId, orgId))
            .limit(1);
        }

        const currentFrameworks = (existing[0].enabledFrameworks as string[]) || [];
        let updatedFrameworks: string[];

        if (enabled === false) {
          // Disable — remove from list
          updatedFrameworks = currentFrameworks.filter((f) => f !== frameworkId);
        } else {
          // Enable — add if not present
          updatedFrameworks = currentFrameworks.includes(frameworkId)
            ? currentFrameworks
            : [...currentFrameworks, frameworkId];
        }

        const [result] = await db
          .update(complianceSettings)
          .set({
            enabledFrameworks: updatedFrameworks,
            updatedAt: new Date(),
          })
          .where(eq(complianceSettings.organizationId, orgId))
          .returning();

        const nowEnabled = updatedFrameworks.includes(frameworkId);
        auditRbac(orgId, req.userId!, "compliance.framework_toggled", { frameworkId, enabled: nowEnabled });

        res.json({
          frameworkId,
          enabled: nowEnabled,
          enabledFrameworks: updatedFrameworks,
        });
      } catch (err: any) {
        logger.error(`Failed to toggle framework: ${err.message}`, undefined, "ComplianceSettings");
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/evidence/:framework/:controlId — Get evidence
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/evidence/:framework/:controlId",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const { framework, controlId } = req.params;

        const evidence = await db
          .select()
          .from(complianceEvidence)
          .where(
            and(
              eq(complianceEvidence.organizationId, orgId),
              eq(complianceEvidence.framework, framework),
              eq(complianceEvidence.controlId, controlId),
              eq(complianceEvidence.isActive, true),
            ),
          )
          .orderBy(desc(complianceEvidence.createdAt));

        res.json({ framework, controlId, evidence, count: evidence.length });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/compliance/evidence/:framework/:controlId — Add evidence
  // ══════════════════════════════════════════════════════════════════════════

  router.post(
    "/api/compliance/evidence/:framework/:controlId",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        const userId = req.userId;
        if (!orgId || !userId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const { framework, controlId } = req.params;
        const {
          evidenceType,
          title,
          description,
          fileUrl,
          fileName,
          fileSizeBytes,
          evidenceData,
          validFrom,
          validUntil,
        } = req.body;

        if (!evidenceType || !title) {
          res.status(400).json({ error: "evidenceType and title are required" });
          return;
        }

        const validTypes = ["document", "screenshot", "log_export", "configuration", "attestation"];
        if (!validTypes.includes(evidenceType)) {
          res.status(400).json({
            error: `Invalid evidenceType. Must be one of: ${validTypes.join(", ")}`,
          });
          return;
        }

        const insertValues: any = {
          organizationId: orgId,
          framework,
          controlId,
          evidenceType,
          title,
          description: description || null,
          fileUrl: fileUrl || null,
          fileName: fileName || null,
          fileSizeBytes: fileSizeBytes || null,
          evidenceData: evidenceData || null,
          createdBy: userId,
          isActive: true,
        };

        // For attestations, set the attested fields
        if (evidenceType === "attestation") {
          insertValues.attestedBy = userId;
          insertValues.attestedAt = new Date();
        }

        if (validFrom) insertValues.validFrom = new Date(validFrom);
        if (validUntil) insertValues.validUntil = new Date(validUntil);

        const [created] = await db
          .insert(complianceEvidence)
          .values(insertValues)
          .returning();

        auditRbac(orgId, userId, "compliance.evidence_uploaded", { framework, controlId });

        res.status(201).json(created);
      } catch (err: any) {
        logger.error(`Failed to add evidence: ${err.message}`, undefined, "ComplianceSettings");
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/evidence/:framework/:controlId/auto-collect
  // Auto-collect evidence from system (real data from database)
  // Uses the comprehensive compliance-evidence-collector service
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/evidence/:framework/:controlId/auto-collect",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const { framework, controlId } = req.params;

        const result = await collectEvidenceForControl(orgId, framework, controlId);

        res.json({
          autoCollected: true,
          ...result,
        });
      } catch (err: any) {
        logger.error(`Auto-collect evidence failed: ${err.message}`, undefined, "ComplianceSettings");
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/scheduled-reports — List scheduled reports
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/scheduled-reports",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const reports = await db
          .select()
          .from(complianceScheduledReports)
          .where(eq(complianceScheduledReports.organizationId, orgId))
          .orderBy(desc(complianceScheduledReports.createdAt));

        res.json({ reports, count: reports.length });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/compliance/scheduled-reports — Create scheduled report
  // ══════════════════════════════════════════════════════════════════════════

  router.post(
    "/api/compliance/scheduled-reports",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        const userId = req.userId;
        if (!orgId || !userId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const { reportType, recipientEmails, frequency, frameworks } = req.body;

        if (!reportType || !recipientEmails || !frequency) {
          res.status(400).json({
            error: "reportType, recipientEmails, and frequency are required",
          });
          return;
        }

        const validTypes = ["board_oversight", "audit_summary", "compliance_status"];
        if (!validTypes.includes(reportType)) {
          res.status(400).json({
            error: `Invalid reportType. Must be one of: ${validTypes.join(", ")}`,
          });
          return;
        }

        const validFrequencies = ["daily", "weekly", "monthly", "quarterly"];
        if (!validFrequencies.includes(frequency)) {
          res.status(400).json({
            error: `Invalid frequency. Must be one of: ${validFrequencies.join(", ")}`,
          });
          return;
        }

        if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) {
          res.status(400).json({ error: "recipientEmails must be a non-empty array" });
          return;
        }

        // Calculate next send time based on frequency
        const nextSendAt = calculateNextSendTime(frequency);

        const [created] = await db
          .insert(complianceScheduledReports)
          .values({
            organizationId: orgId,
            reportType,
            recipientEmails,
            frequency,
            frameworks: frameworks || [],
            nextSendAt,
            isActive: true,
            createdBy: userId,
          })
          .returning();

        res.status(201).json(created);
      } catch (err: any) {
        logger.error(`Failed to create scheduled report: ${err.message}`, undefined, "ComplianceSettings");
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /api/compliance/scheduled-reports/:id — Delete scheduled report
  // ══════════════════════════════════════════════════════════════════════════

  router.delete(
    "/api/compliance/scheduled-reports/:id",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const reportId = req.params.id;

        // Verify the report belongs to this org
        const existing = await db
          .select()
          .from(complianceScheduledReports)
          .where(
            and(
              eq(complianceScheduledReports.id, reportId),
              eq(complianceScheduledReports.organizationId, orgId),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          res.status(404).json({ error: "Scheduled report not found" });
          return;
        }

        await db
          .delete(complianceScheduledReports)
          .where(eq(complianceScheduledReports.id, reportId));

        res.json({ deleted: true, id: reportId });
      } catch (err: any) {
        logger.error(`Failed to delete scheduled report: ${err.message}`, undefined, "ComplianceSettings");
        res.status(500).json({ error: err.message });
      }
    },
  );

  return router;
}

// ════════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════════

function calculateNextSendTime(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "daily":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "monthly": {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      return next;
    }
    case "quarterly": {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 3);
      return next;
    }
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}
