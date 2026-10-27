"use strict";

import { Router, Response } from "express";
import { RouteContext } from "./common";
import {
  resolveRbacContext,
  type RbacRequest,
} from "../middleware/rbac.middleware";
import {
  generateReport,
  getSecurityPosture,
  getControlsForFramework,
  getEnrichedControlsForFramework,
  verifyControl,
  getDecisionLogSummary,
  getRbacChangeSummary,
  getSecurityEventSummary,
  type ComplianceFramework,
  type ReportFormat,
} from "../services/compliance-report.service";
import {
  healthCheck as opaHealthCheck,
} from "../engines/claw/policy/opa-client";
import { ClawConfig } from "../engines/claw/config";
import { logger } from "../utils/logger";
import { autoConfigureFramework } from "../services/compliance-auto-configure";
import {
  exportFrameworkEvidence,
  exportAllEnabledFrameworks,
} from "../services/compliance-export.service";

const ALL_FRAMEWORKS: ComplianceFramework[] = [
  "iso27001", "soc2", "dpdp", "cmmc", "hipaa", "gdpr",
  "pci_dss", "nist_csf", "fedramp", "ccpa", "sox", "cis", "csa_star", "iso42001",
];

// ════════════════════════════════════════════════════════════════════════════════
// Compliance Routes Factory
// ════════════════════════════════════════════════════════════════════════════════

export function createComplianceRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateHybrid } = ctx;
  const auth = authenticateHybrid as any;

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/compliance/reports — Generate a compliance report
  // ══════════════════════════════════════════════════════════════════════════

  router.post(
    "/api/compliance/reports",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        // Accept both backend canonical names (type/period) and frontend names (framework/dateRange)
        const { type, period, format, framework, dateRange } = req.body as {
          type?: string;
          period?: { start?: string; end?: string };
          format?: string;
          framework?: string;
          dateRange?: { start?: string; end?: string };
        };

        // Map frontend field names to canonical ones
        const resolvedType = type || framework;
        const resolvedPeriod = period || dateRange;

        // Validate framework type
        const validFrameworks = ALL_FRAMEWORKS;
        if (!resolvedType || !validFrameworks.includes(resolvedType as ComplianceFramework)) {
          res.status(400).json({
            error: `Invalid framework type. Must be one of: ${validFrameworks.join(", ")}`,
          });
          return;
        }

        // Validate period
        if (!resolvedPeriod?.start || !resolvedPeriod?.end) {
          res.status(400).json({
            error: "Period with start and end dates is required (ISO 8601 format)",
          });
          return;
        }

        const startDate = new Date(resolvedPeriod.start);
        const endDate = new Date(resolvedPeriod.end);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          res.status(400).json({ error: "Invalid date format. Use ISO 8601 (e.g., 2026-01-01)" });
          return;
        }

        if (startDate >= endDate) {
          res.status(400).json({ error: "Start date must be before end date" });
          return;
        }

        // Validate format
        const validFormats: ReportFormat[] = ["json", "pdf"];
        const reportFormat = (format as ReportFormat) || "json";
        if (!validFormats.includes(reportFormat)) {
          res.status(400).json({
            error: `Invalid format. Must be one of: ${validFormats.join(", ")}`,
          });
          return;
        }

        if (reportFormat === "pdf") {
          // PDF generation is a future enhancement — return JSON with a note
          const report = await generateReport(
            orgId,
            resolvedType as ComplianceFramework,
            { start: startDate, end: endDate },
            "json",
          );
          res.json({
            ...report,
            _note: "PDF export is a planned enhancement. Report returned as JSON.",
          });
          return;
        }

        const report = await generateReport(
          orgId,
          resolvedType as ComplianceFramework,
          { start: startDate, end: endDate },
          reportFormat,
        );

        res.json(report);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/reports/:id — Get a generated report
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/reports/:id",
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

        // Parse the report ID to extract framework and regenerate
        // Format: {framework}-{orgId}-{timestamp}
        const parts = reportId.split("-");
        if (parts.length < 3) {
          res.status(400).json({ error: "Invalid report ID format" });
          return;
        }

        const framework = parts[0] as ComplianceFramework;
        const validFrameworks = ALL_FRAMEWORKS;
        if (!validFrameworks.includes(framework)) {
          res.status(400).json({ error: "Invalid framework in report ID" });
          return;
        }

        // Re-generate the report with a 90-day lookback
        const now = new Date();
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        const report = await generateReport(
          orgId,
          framework,
          { start: ninetyDaysAgo, end: now },
          "json",
        );

        // Override the report ID to match the requested ID
        report.id = reportId;

        res.json(report);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/status — Security posture overview
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/status",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;

        if (!orgId) {
          // Return a default empty posture so the page still renders
          res.json({
            encryption: { atRest: true, inTransit: true, keyRotation: true },
            policyCoveragePercent: 0,
            rbac: { totalRoles: 0, assignedUsers: 0, activePermissions: 0 },
            auditLog: { events24h: 0, events7d: 0, events30d: 0 },
          });
          return;
        }

        const posture = await getSecurityPosture(orgId);

        // Transform service shape (SecurityPosture) to frontend shape (ComplianceOverview)
        const totalAuditEvents =
          posture.auditLogStats.rbacEvents +
          posture.auditLogStats.clawEvents +
          posture.auditLogStats.inferenceEvents +
          posture.auditLogStats.toolEvents +
          posture.auditLogStats.queryEvents;

        res.json({
          encryption: {
            atRest: posture.encryptionStatus.atRest,
            inTransit: posture.encryptionStatus.inTransit,
            keyRotation: posture.encryptionStatus.keyRotation !== "none",
          },
          policyCoveragePercent: posture.policyCoverage.coveragePct,
          rbac: {
            totalRoles: posture.rbacStatus.totalRoles,
            assignedUsers: posture.rbacStatus.totalAssignments,
            activePermissions: posture.rbacStatus.totalAssignments, // best available proxy
          },
          auditLog: {
            events24h: Math.round(totalAuditEvents / 30), // approximate daily from 30-day total
            events7d: Math.round((totalAuditEvents / 30) * 7),
            events30d: totalAuditEvents,
          },
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/controls/:framework — Controls for a framework
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/controls/:framework",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;

        const framework = req.params.framework as ComplianceFramework;
        const validFrameworks = ALL_FRAMEWORKS;
        if (!validFrameworks.includes(framework)) {
          res.status(400).json({
            error: `Invalid framework. Must be one of: ${validFrameworks.join(", ")}`,
          });
          return;
        }

        const enriched = await getEnrichedControlsForFramework(
          orgId || "__no_org__",
          framework,
        );

        // If no org, override statuses to "planned"
        const controls = orgId
          ? enriched
          : enriched.map((c) => ({
              ...c,
              status: "planned" as const,
              evidence: [],
              richEvidence: [],
              liveCheck: { verified: false, checkedAt: null as string | null, detail: "No organization context" },
              opaIntegration: c.opaIntegration,
            }));

        // Compute summary stats
        const implemented = controls.filter((c) => c.status === "implemented").length;
        const partial = controls.filter((c) => c.status === "partial").length;
        const planned = controls.filter((c) => c.status === "planned").length;
        const notApplicable = controls.filter((c) => c.status === "not_applicable").length;
        const applicable = controls.length - notApplicable;

        // Transform to enriched frontend shape
        const frontendControls = controls.map((c) => ({
          id: c.id,
          controlId: c.id,
          controlName: c.title,
          category: c.category,
          framework: c.framework,
          status: c.status,
          evidenceLink: c.evidence.length > 0 ? c.evidence[0] : null,
          notes: c.description,
          evidence: c.richEvidence,
          liveCheck: c.liveCheck,
          opaIntegration: c.opaIntegration,
          guidance: c.guidance,
        }));

        res.json({
          framework,
          summary: {
            total: controls.length,
            implemented,
            partial,
            planned,
            notApplicable,
            complianceScore: applicable > 0
              ? Math.round((implemented / applicable) * 100)
              : 0,
          },
          controls: frontendControls,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/compliance/controls/:controlId/verify — Live verification
  // ══════════════════════════════════════════════════════════════════════════

  router.post(
    "/api/compliance/controls/:controlId/verify",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const controlId = req.params.controlId;
        const { framework } = req.body as { framework?: string };

        if (!framework) {
          res.status(400).json({ error: "framework is required in request body" });
          return;
        }

        const validFrameworks = ALL_FRAMEWORKS;
        if (!validFrameworks.includes(framework as ComplianceFramework)) {
          res.status(400).json({
            error: `Invalid framework. Must be one of: ${validFrameworks.join(", ")}`,
          });
          return;
        }

        const result = await verifyControl(orgId, controlId, framework as ComplianceFramework);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/opa-status — OPA sidecar status
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/opa-status",
    auth,
    resolveRbacContext(),
    async (_req: RbacRequest, res: Response) => {
      try {
        const opaUrl = ClawConfig.opa.url;

        // Health check
        const health = await opaHealthCheck();

        // Loaded policies
        let policies: Array<{ id: string; raw: string }> = [];
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const policiesRes = await fetch(`${opaUrl}/v1/policies`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (policiesRes.ok) {
            const body = await policiesRes.json();
            policies = (body.result || []).map((p: any) => ({
              id: p.id || "unknown",
              raw: p.raw || "",
            }));
          }
        } catch {
          // Policies fetch failed — continue with empty
        }

        // Policy data summary (top-level keys)
        let dataKeys: string[] = [];
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const dataRes = await fetch(`${opaUrl}/v1/data`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (dataRes.ok) {
            const body = await dataRes.json();
            dataKeys = body.result ? Object.keys(body.result) : [];
          }
        } catch {
          // Data fetch failed — continue with empty
        }

        // Extract package names from policies
        const policyPackages = policies
          .map((p) => {
            const match = p.raw.match(/package\s+([\w.]+)/);
            return match ? match[1] : p.id;
          })
          .filter(Boolean);

        res.json({
          healthy: health.healthy,
          latencyMs: health.latencyMs,
          circuitBreakerOpen: health.circuitBreakerOpen,
          opaUrl,
          policies: policies.map((p) => ({
            id: p.id,
            package: (() => {
              const match = p.raw.match(/package\s+([\w.]+)/);
              return match ? match[1] : p.id;
            })(),
          })),
          policyPackages,
          dataKeys,
        });
      } catch (err: any) {
        logger.error(`OPA status check failed: ${err.message}`, undefined, "ComplianceRoutes");
        res.status(500).json({
          healthy: false,
          latencyMs: 0,
          circuitBreakerOpen: false,
          opaUrl: ClawConfig.opa.url,
          policies: [],
          policyPackages: [],
          dataKeys: [],
          error: err.message,
        });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/compliance/opa-evaluate — Ad-hoc OPA policy evaluation
  // ══════════════════════════════════════════════════════════════════════════

  router.post(
    "/api/compliance/opa-evaluate",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const { policyPath, input } = req.body as {
          policyPath?: string;
          input?: Record<string, any>;
        };

        if (!policyPath) {
          res.status(400).json({ error: "policyPath is required" });
          return;
        }

        const opaUrl = ClawConfig.opa.url;
        const url = `${opaUrl}/v1/data/${policyPath.replace(/^\/+/, "")}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: input || {} }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          res.status(response.status).json({
            error: `OPA returned HTTP ${response.status}`,
            detail: await response.text(),
          });
          return;
        }

        const body = await response.json();
        res.json({
          policyPath,
          input: input || {},
          result: body.result,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/summary/:type — Quick summary for dashboards
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/summary/:type",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          // Return empty summary when no org context
          res.json({ total: 0, items: [], period: "last_30_days" });
          return;
        }

        const type = req.params.type;
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const period = { start: thirtyDaysAgo, end: now };

        switch (type) {
          case "decisions": {
            const summary = await getDecisionLogSummary(orgId, period);
            res.json(summary);
            break;
          }
          case "rbac": {
            const summary = await getRbacChangeSummary(orgId, period);
            res.json(summary);
            break;
          }
          case "security": {
            const summary = await getSecurityEventSummary(orgId, period);
            res.json(summary);
            break;
          }
          default:
            res.status(400).json({
              error: `Invalid summary type. Must be one of: decisions, rbac, security`,
            });
        }
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/compliance/auto-configure — One-click compliance auto-config
  // ══════════════════════════════════════════════════════════════════════════

  router.post(
    "/api/compliance/auto-configure",
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
        const { framework } = req.body as { framework?: string };
        if (!framework) {
          res.status(400).json({ error: "framework is required" });
          return;
        }
        const result = await autoConfigureFramework(orgId, userId, framework);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/export/:framework — Export evidence for one framework
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/export/:framework",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const framework = req.params.framework;
        const validFrameworks = ALL_FRAMEWORKS;
        if (!validFrameworks.includes(framework as any)) {
          res.status(400).json({
            error: `Invalid framework. Must be one of: ${validFrameworks.join(", ")}`,
          });
          return;
        }

        const pkg = await exportFrameworkEvidence(orgId, framework);
        res.json(pkg);
      } catch (err: any) {
        logger.error(`Export framework evidence failed: ${err.message}`, undefined, "ComplianceRoutes");
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/compliance/export — Export evidence for all enabled frameworks
  // ══════════════════════════════════════════════════════════════════════════

  router.get(
    "/api/compliance/export",
    auth,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId;
        if (!orgId) {
          res.status(400).json({ error: "Organization context required" });
          return;
        }

        const pkg = await exportAllEnabledFrameworks(orgId);
        res.json(pkg);
      } catch (err: any) {
        logger.error(`Export all evidence failed: ${err.message}`, undefined, "ComplianceRoutes");
        res.status(500).json({ error: err.message });
      }
    },
  );

  return router;
}
