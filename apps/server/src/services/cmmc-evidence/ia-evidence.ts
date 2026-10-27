"use strict";

/**
 * CMMC Identification & Authentication (IA) Domain — Evidence Collection
 *
 * Collects real database evidence for three IA controls:
 *   - IA.1.076: Unique user identification (platform-enforced)
 *   - IA.2.078: Password complexity (configurable)
 *   - IA.2.081: Multi-factor authentication (configurable)
 *
 * Each collector queries the database using Drizzle ORM, evaluates the
 * results against CMMC Level 1/2 requirements, and returns structured
 * evidence with a pass/fail/partial status.
 */

import { db } from "../../db";
import { users, complianceSettings } from "@wtrops/shared";
import { eq, sql, desc, count } from "drizzle-orm";
import { logger } from "../../utils/logger";

const SOURCE = "IA-Evidence";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CollectedEvidence {
  controlId: string;
  controlTitle: string;
  controlType: "platform" | "configurable" | "evidence";
  status: "pass" | "fail" | "partial";
  collectedAt: string;
  evidence: Record<string, any>;
  findings: string[];
  requiredActions: string[];
}

// ── IA.1.076: Unique User Identification ───────────────────────────────────────

async function collectIa1076(): Promise<CollectedEvidence> {
  const findings: string[] = [];

  // Query 1: Count total users and unique emails
  const [userCounts] = await db
    .select({
      totalUsers: count(),
      uniqueEmails: sql<number>`count(DISTINCT ${users.email})`,
    })
    .from(users)
    .where(eq(users.isDeleted, false));

  const totalUsers = Number(userCounts?.totalUsers ?? 0);
  const uniqueEmails = Number(userCounts?.uniqueEmails ?? 0);

  // Query 2: Sample user list (most recent 10)
  const sampleUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.isDeleted, false))
    .orderBy(desc(users.createdAt))
    .limit(10);

  // Evaluate
  const allUnique = totalUsers === uniqueEmails;
  const hasUsers = totalUsers > 0;

  if (hasUsers && allUnique) {
    findings.push(
      `All ${totalUsers} active users have unique email addresses (database UNIQUE constraint enforced).`,
    );
    findings.push(
      "Every user record has a UUID primary key generated via gen_random_uuid() — no shared accounts detected.",
    );
  } else if (hasUsers && !allUnique) {
    findings.push(
      `WARNING: Found ${totalUsers} total users but only ${uniqueEmails} unique emails. Possible duplicate accounts.`,
    );
  } else {
    findings.push("No active users found in the system.");
  }

  return {
    controlId: "IA.1.076",
    controlTitle: "Identify system users",
    controlType: "platform",
    status: hasUsers && allUnique ? "pass" : "fail",
    collectedAt: new Date().toISOString(),
    evidence: {
      totalUsers,
      uniqueEmails,
      allEmailsUnique: allUnique,
      idGenerationMethod: "gen_random_uuid() — PostgreSQL cryptographic UUID v4",
      emailUniquenessEnforcement: "Database UNIQUE constraint on users.email column",
      sampleUsers: sampleUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt?.toISOString() ?? null,
      })),
    },
    findings,
    requiredActions: [
      "Unique user identification is enforced by the platform (automated - every user gets a UUID via gen_random_uuid(), email uniqueness is enforced by database constraint)",
      "Review user inventory: Navigate to Teams to see all users in your organization and verify no shared accounts exist",
    ],
  };
}

// ── IA.2.078: Password Complexity ──────────────────────────────────────────────

async function collectIa2078(orgId: string): Promise<CollectedEvidence> {
  const findings: string[] = [];

  // Query: Get password policy from compliance settings
  const [settings] = await db
    .select({
      minPasswordLength: complianceSettings.minPasswordLength,
      requireMfa: complianceSettings.requireMfa,
    })
    .from(complianceSettings)
    .where(eq(complianceSettings.organizationId, orgId))
    .limit(1);

  const minLength = settings?.minPasswordLength ?? null;
  const configured = minLength !== null;
  const meetsCmmc = configured && minLength >= 12;

  if (!configured) {
    findings.push(
      "Password policy has NOT been configured. No compliance_settings record found for this organization.",
    );
    findings.push(
      "CMMC Level 2 requires a minimum password length of 12 characters.",
    );
  } else if (meetsCmmc) {
    findings.push(
      `Password policy is configured with minimum length of ${minLength} characters — meets CMMC Level 2 requirement (>= 12).`,
    );
  } else {
    findings.push(
      `Password policy minimum length is ${minLength} characters — does NOT meet CMMC Level 2 requirement (>= 12).`,
    );
    findings.push(
      `Increase minimum password length from ${minLength} to at least 12 characters.`,
    );
  }

  return {
    controlId: "IA.2.078",
    controlTitle: "Enforce password complexity",
    controlType: "configurable",
    status: meetsCmmc ? "pass" : "fail",
    collectedAt: new Date().toISOString(),
    evidence: {
      policyConfigured: configured,
      minPasswordLength: minLength,
      cmmcRequiredLength: 12,
      meetsRequirement: meetsCmmc,
      passwordLengthOptions: [
        { value: 8, label: "8 (minimum, not recommended)" },
        { value: 10, label: "10" },
        { value: 12, label: "12 (recommended for CMMC)" },
        { value: 14, label: "14" },
        { value: 16, label: "16 (high security)" },
      ],
    },
    findings,
    requiredActions: [
      "Configure minimum password length: Go to Compliance Settings > Authentication & Security, set minimum password length to 12 or higher. CMMC recommends 12+ characters. Options: 8 (minimum, not recommended), 10, 12 (recommended for CMMC), 14, 16 (high security). Longer passwords are exponentially harder to crack — each additional character multiplies the search space by ~95x.",
      "Enable password history: Prevents users from reusing recent passwords. This is configured at the platform level.",
    ],
  };
}

// ── IA.2.081: Multi-Factor Authentication ──────────────────────────────────────

async function collectIa2081(orgId: string): Promise<CollectedEvidence> {
  const findings: string[] = [];

  // Query 1: Get MFA policy from compliance settings
  const [settings] = await db
    .select({
      requireMfa: complianceSettings.requireMfa,
      mfaEnforcedRoles: complianceSettings.mfaEnforcedRoles,
    })
    .from(complianceSettings)
    .where(eq(complianceSettings.organizationId, orgId))
    .limit(1);

  const requireMfa = settings?.requireMfa ?? false;
  const enforcedRoles: string[] =
    (settings?.mfaEnforcedRoles as string[] | null) ?? [];

  // Query 2: Get MFA adoption stats
  // The mfa_enabled column exists in the users table schema, but we wrap in
  // try/catch in case a migration has not yet run on this database instance.
  let totalActiveUsers = 0;
  let mfaEnabledCount = 0;
  let mfaQuerySucceeded = true;

  try {
    const [mfaStats] = await db
      .select({
        total: count(),
        mfaEnabled: sql<number>`count(CASE WHEN ${users.mfaEnabled} THEN 1 END)`,
      })
      .from(users)
      .where(eq(users.isDeleted, false));

    totalActiveUsers = Number(mfaStats?.total ?? 0);
    mfaEnabledCount = Number(mfaStats?.mfaEnabled ?? 0);
  } catch (err: any) {
    mfaQuerySucceeded = false;
    logger.warn(
      `[${SOURCE}] mfa_enabled column query failed — column may not exist yet: ${err.message}`,
    );

    // Fallback: just get user count
    const [fallback] = await db
      .select({ total: count() })
      .from(users)
      .where(eq(users.isDeleted, false));

    totalActiveUsers = Number(fallback?.total ?? 0);
  }

  const mfaAdoptionRate =
    totalActiveUsers > 0 ? Math.round((mfaEnabledCount / totalActiveUsers) * 100) : 0;

  // Evaluate status
  let status: "pass" | "fail" | "partial" = "fail";

  if (!requireMfa && enforcedRoles.length === 0) {
    findings.push(
      "MFA is NOT required for any roles. This does not meet CMMC Level 2 requirements.",
    );
    findings.push(
      "At minimum, Owner and Admin roles must have MFA enforced for privileged account access.",
    );
    status = "fail";
  } else if (requireMfa || enforcedRoles.length > 0) {
    const privilegedRoles = ["owner", "admin"];
    const privilegedCovered = privilegedRoles.every((r) =>
      enforcedRoles.map((er) => er.toLowerCase()).includes(r),
    );

    if (privilegedCovered && mfaAdoptionRate === 100) {
      findings.push(
        `MFA is enforced for roles: [${enforcedRoles.join(", ")}]. All privileged roles are covered.`,
      );
      findings.push(
        `MFA adoption: ${mfaEnabledCount}/${totalActiveUsers} users (${mfaAdoptionRate}%) have MFA enabled.`,
      );
      status = "pass";
    } else if (privilegedCovered || requireMfa) {
      findings.push(
        `MFA policy is configured (enforced roles: [${enforcedRoles.join(", ")}], require_mfa: ${requireMfa}).`,
      );
      if (!privilegedCovered) {
        findings.push(
          "WARNING: Not all privileged roles (Owner, Admin) are covered by MFA enforcement.",
        );
      }
      if (mfaAdoptionRate < 100) {
        findings.push(
          `MFA adoption is incomplete: ${mfaEnabledCount}/${totalActiveUsers} users (${mfaAdoptionRate}%) have enrolled. 100% enrollment required for full compliance.`,
        );
      }
      status = "partial";
    } else {
      findings.push(
        `MFA enforcement is configured for [${enforcedRoles.join(", ")}] but privileged roles (Owner, Admin) are not fully covered.`,
      );
      status = "partial";
    }
  }

  if (!mfaQuerySucceeded) {
    findings.push(
      "NOTE: Could not query mfa_enabled column — database migration may be pending. MFA enrollment data unavailable.",
    );
  }

  return {
    controlId: "IA.2.081",
    controlTitle: "Multi-factor authentication",
    controlType: "configurable",
    status,
    collectedAt: new Date().toISOString(),
    evidence: {
      policyConfiguration: {
        requireMfa,
        mfaEnforcedRoles: enforcedRoles,
      },
      adoption: {
        totalActiveUsers,
        mfaEnabledCount,
        mfaAdoptionRate,
        mfaQuerySucceeded,
      },
      mfaEnforcementOptions: [
        { value: "owner", label: "Owner only (minimum)" },
        { value: "owner,admin", label: "Owner + Admin (recommended for CMMC)" },
        { value: "all", label: "All roles (maximum security)" },
      ],
    },
    findings,
    requiredActions: [
      "Enable MFA requirement for privileged roles: Go to Compliance Settings > Authentication & Security, toggle 'Require MFA' to ON, then select which roles must use MFA. For CMMC Level 2, at minimum Owner and Admin roles must have MFA. Options for MFA enforcement: Owner only (minimum), Owner + Admin (recommended for CMMC), All roles (maximum security).",
      "Enroll in MFA: Each user with a required role must set up their TOTP authenticator. Go to account settings to scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password). After scanning, enter the 6-digit code to verify.",
      "Monitor MFA adoption: The compliance dashboard shows what percentage of required users have enrolled. 100% enrollment is required for this control to pass.",
    ],
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Collect evidence for a specific IA-domain CMMC control.
 *
 * @param orgId    - Organization ID (required for IA.2.078 and IA.2.081)
 * @param controlId - One of "IA.1.076", "IA.2.078", "IA.2.081"
 * @returns Structured evidence with status, findings, and required actions
 */
export async function collectIaEvidence(
  orgId: string,
  controlId: string,
): Promise<CollectedEvidence> {
  logger.info(`[${SOURCE}] Collecting evidence for ${controlId} (org: ${orgId})`);

  switch (controlId) {
    case "IA.1.076":
      return collectIa1076();

    case "IA.2.078":
      return collectIa2078(orgId);

    case "IA.2.081":
      return collectIa2081(orgId);

    default:
      throw new Error(
        `Unknown IA control: ${controlId}. Supported: IA.1.076, IA.2.078, IA.2.081`,
      );
  }
}
