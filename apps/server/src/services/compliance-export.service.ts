"use strict";

/**
 * Compliance Export Service
 *
 * Produces structured evidence packages suitable for auditor review.
 * Aggregates auto-collected evidence, manual evidence, attestations,
 * control status, and notes into a single downloadable JSON document.
 */

import { db } from "../db";
import {
  complianceSettings,
  complianceEvidence,
  organizations,
} from "@wtrops/shared";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../utils/logger";
import {
  getEnrichedControlsForFramework,
  type ComplianceFramework,
} from "./compliance-report.service";

const SOURCE = "ComplianceExportService";

// ── Export Types ──

export interface ComplianceExportPackage {
  organization: {
    id: string;
    name: string;
    exportedAt: string;
    exportedBy: string;
  };
  frameworks: {
    [framework: string]: {
      name: string;
      totalControls: number;
      implemented: number;
      complianceScore: number;
      controls: {
        controlId: string;
        title: string;
        status: string;
        evidence: {
          autoCollected: any[];
          manual: any[];
          attestations: any[];
        };
        lastVerified: string | null;
        notes: string | null;
      }[];
    };
  };
}

// ── Framework display names ──

const FRAMEWORK_NAMES: Record<string, string> = {
  iso27001: "ISO 27001 — Information Security Management",
  soc2: "SOC 2 — Trust Service Criteria",
  dpdp: "DPDP Act — Digital Personal Data Protection",
  cmmc: "CMMC — Cybersecurity Maturity Model Certification",
  hipaa: "HIPAA — Health Insurance Portability and Accountability",
  gdpr: "GDPR — General Data Protection Regulation",
  pci_dss: "PCI DSS — Payment Card Industry Data Security",
  nist_csf: "NIST CSF — Cybersecurity Framework",
  fedramp: "FedRAMP — Federal Risk and Authorization Management",
  ccpa: "CCPA — California Consumer Privacy Act",
  sox: "SOX — Sarbanes-Oxley Act",
  cis: "CIS Controls — Center for Internet Security",
  csa_star: "CSA STAR — Cloud Security Alliance",
  iso42001: "ISO 42001 — AI Management System",
};

// ── Helper: fetch org info ──

async function getOrganization(orgId: string) {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return rows[0] ?? { id: orgId, name: "Unknown Organization" };
}

// ── Helper: fetch control notes from settings ──

async function getControlNotes(orgId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ controlNotes: complianceSettings.controlNotes })
    .from(complianceSettings)
    .where(eq(complianceSettings.organizationId, orgId))
    .limit(1);
  return (rows[0]?.controlNotes as Record<string, string>) ?? {};
}

// ── Helper: fetch evidence for a framework from compliance_evidence table ──

async function getStoredEvidence(orgId: string, framework: string) {
  return db
    .select()
    .from(complianceEvidence)
    .where(
      and(
        eq(complianceEvidence.organizationId, orgId),
        eq(complianceEvidence.framework, framework),
        eq(complianceEvidence.isActive, true),
      ),
    )
    .orderBy(desc(complianceEvidence.createdAt));
}

// ── Helper: fetch enabled frameworks ──

async function getEnabledFrameworks(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ enabledFrameworks: complianceSettings.enabledFrameworks })
    .from(complianceSettings)
    .where(eq(complianceSettings.organizationId, orgId))
    .limit(1);
  return (rows[0]?.enabledFrameworks as string[]) ?? [];
}

// ══════════════════════════════════════════════════════════════════════════════
// Export a single control's evidence
// ══════════════════════════════════════════════════════════════════════════════

export async function exportControlEvidence(
  orgId: string,
  framework: string,
  controlId: string,
): Promise<ComplianceExportPackage> {
  const org = await getOrganization(orgId);
  const controlNotes = await getControlNotes(orgId);

  // Get enriched controls (includes auto-collected evidence)
  const enrichedControls = await getEnrichedControlsForFramework(
    orgId,
    framework as ComplianceFramework,
  );
  const targetControl = enrichedControls.find((c) => c.id === controlId);

  // Get stored evidence from DB
  const storedEvidence = await getStoredEvidence(orgId, framework);
  const controlEvidence = storedEvidence.filter((e) => e.controlId === controlId);

  const manual = controlEvidence.filter((e) => e.evidenceType !== "attestation");
  const attestations = controlEvidence.filter((e) => e.evidenceType === "attestation");

  const controlExport = {
    controlId,
    title: targetControl?.title ?? controlId,
    status: targetControl?.status ?? "planned",
    evidence: {
      autoCollected: targetControl?.richEvidence ?? [],
      manual: manual.map((e) => ({
        id: e.id,
        type: e.evidenceType,
        title: e.title,
        description: e.description,
        fileName: e.fileName,
        fileUrl: e.fileUrl,
        createdAt: e.createdAt?.toISOString() ?? null,
        validFrom: e.validFrom?.toISOString() ?? null,
        validUntil: e.validUntil?.toISOString() ?? null,
      })),
      attestations: attestations.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        attestedBy: e.attestedBy,
        attestedAt: e.attestedAt?.toISOString() ?? null,
        createdAt: e.createdAt?.toISOString() ?? null,
      })),
    },
    lastVerified: targetControl?.liveCheck?.checkedAt ?? null,
    notes: controlNotes[controlId] ?? null,
  };

  const implemented = targetControl?.status === "implemented" ? 1 : 0;
  const notApplicable = targetControl?.status === "not_applicable" ? 1 : 0;
  const applicable = 1 - notApplicable;

  return {
    organization: {
      id: org.id,
      name: org.name,
      exportedAt: new Date().toISOString(),
      exportedBy: "system",
    },
    frameworks: {
      [framework]: {
        name: FRAMEWORK_NAMES[framework] ?? framework,
        totalControls: 1,
        implemented,
        complianceScore: applicable > 0 ? Math.round((implemented / applicable) * 100) : 0,
        controls: [controlExport],
      },
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Export all evidence for a single framework
// ══════════════════════════════════════════════════════════════════════════════

export async function exportFrameworkEvidence(
  orgId: string,
  framework: string,
): Promise<ComplianceExportPackage> {
  logger.info(`Exporting evidence for framework ${framework}`, undefined, SOURCE);

  const org = await getOrganization(orgId);
  const controlNotes = await getControlNotes(orgId);

  // Get enriched controls (includes auto-collected evidence + OPA checks)
  const enrichedControls = await getEnrichedControlsForFramework(
    orgId,
    framework as ComplianceFramework,
  );

  // Get all stored evidence for this framework
  const storedEvidence = await getStoredEvidence(orgId, framework);

  // Index stored evidence by controlId
  const evidenceByControl: Record<string, typeof storedEvidence> = {};
  for (const ev of storedEvidence) {
    if (!evidenceByControl[ev.controlId]) evidenceByControl[ev.controlId] = [];
    evidenceByControl[ev.controlId].push(ev);
  }

  // Build export for each control
  const controlExports = enrichedControls.map((control) => {
    const controlEv = evidenceByControl[control.id] ?? [];
    const manual = controlEv.filter((e) => e.evidenceType !== "attestation");
    const attestations = controlEv.filter((e) => e.evidenceType === "attestation");

    return {
      controlId: control.id,
      title: control.title,
      status: control.status,
      evidence: {
        autoCollected: control.richEvidence ?? [],
        manual: manual.map((e) => ({
          id: e.id,
          type: e.evidenceType,
          title: e.title,
          description: e.description,
          fileName: e.fileName,
          fileUrl: e.fileUrl,
          createdAt: e.createdAt?.toISOString() ?? null,
          validFrom: e.validFrom?.toISOString() ?? null,
          validUntil: e.validUntil?.toISOString() ?? null,
        })),
        attestations: attestations.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          attestedBy: e.attestedBy,
          attestedAt: e.attestedAt?.toISOString() ?? null,
          createdAt: e.createdAt?.toISOString() ?? null,
        })),
      },
      lastVerified: control.liveCheck?.checkedAt ?? null,
      notes: controlNotes[control.id] ?? null,
    };
  });

  const implemented = enrichedControls.filter((c) => c.status === "implemented").length;
  const notApplicable = enrichedControls.filter((c) => c.status === "not_applicable").length;
  const applicable = enrichedControls.length - notApplicable;

  return {
    organization: {
      id: org.id,
      name: org.name,
      exportedAt: new Date().toISOString(),
      exportedBy: "system",
    },
    frameworks: {
      [framework]: {
        name: FRAMEWORK_NAMES[framework] ?? framework,
        totalControls: enrichedControls.length,
        implemented,
        complianceScore: applicable > 0 ? Math.round((implemented / applicable) * 100) : 0,
        controls: controlExports,
      },
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Export complete compliance package across multiple frameworks
// ══════════════════════════════════════════════════════════════════════════════

export async function exportCompliancePackage(
  orgId: string,
  frameworks: string[],
): Promise<ComplianceExportPackage> {
  logger.info(`Exporting compliance package for ${frameworks.length} frameworks`, undefined, SOURCE);

  const org = await getOrganization(orgId);

  const pkg: ComplianceExportPackage = {
    organization: {
      id: org.id,
      name: org.name,
      exportedAt: new Date().toISOString(),
      exportedBy: "system",
    },
    frameworks: {},
  };

  // Build each framework's evidence in sequence to avoid overwhelming DB
  for (const framework of frameworks) {
    try {
      const fwExport = await exportFrameworkEvidence(orgId, framework);
      if (fwExport.frameworks[framework]) {
        pkg.frameworks[framework] = fwExport.frameworks[framework];
      }
    } catch (err: any) {
      logger.error(`Failed to export framework ${framework}: ${err.message}`, undefined, SOURCE);
      // Include a placeholder so the auditor knows this framework was attempted
      pkg.frameworks[framework] = {
        name: FRAMEWORK_NAMES[framework] ?? framework,
        totalControls: 0,
        implemented: 0,
        complianceScore: 0,
        controls: [],
      };
    }
  }

  return pkg;
}

// ══════════════════════════════════════════════════════════════════════════════
// Export all enabled frameworks for an org
// ══════════════════════════════════════════════════════════════════════════════

export async function exportAllEnabledFrameworks(
  orgId: string,
): Promise<ComplianceExportPackage> {
  const enabledFrameworks = await getEnabledFrameworks(orgId);

  // If nothing is explicitly enabled, fall back to all known frameworks
  const frameworks = enabledFrameworks.length > 0
    ? enabledFrameworks
    : Object.keys(FRAMEWORK_NAMES);

  return exportCompliancePackage(orgId, frameworks);
}
