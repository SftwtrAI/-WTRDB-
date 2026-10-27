"use strict";

import crypto from "crypto";
import { db } from "../db";
import { users, complianceSettings } from "@wtrops/shared";
import { eq } from "drizzle-orm";

// ════════════════════════════════════════════════════════════════════════════════
// TOTP-based Multi-Factor Authentication Service
// Implements RFC 6238 (TOTP) using Node.js crypto — no external dependencies.
// Required for CMMC control IA.2.081: Multi-factor authentication for
// local and network access to privileged and non-privileged accounts.
// ════════════════════════════════════════════════════════════════════════════════

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // allow +/- 1 period for clock drift
const ISSUER = "Wtrops";
const BACKUP_CODE_COUNT = 8;

// ─── Base32 Encoding/Decoding (RFC 4648) ────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  const stripped = encoded.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < stripped.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(stripped[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

// ─── TOTP Core (RFC 6238) ───────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random secret (20 bytes = 160 bits).
 * Returns base32-encoded string suitable for otpauth:// URIs.
 */
function generateSecret(): string {
  const secretBytes = crypto.randomBytes(20);
  return base32Encode(secretBytes);
}

/**
 * Generate a TOTP code for the given secret and time.
 * Implements HMAC-SHA1 based TOTP per RFC 6238.
 */
function generateTOTP(secret: string, timeInSeconds?: number): string {
  const time = timeInSeconds ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(time / TOTP_PERIOD);

  // Convert counter to big-endian 8-byte buffer
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  // HMAC-SHA1
  const secretBuffer = base32Decode(secret);
  const hmac = crypto.createHmac("sha1", secretBuffer);
  hmac.update(buffer);
  const hash = hmac.digest();

  // Dynamic truncation (RFC 4226 section 5.4)
  const offset = hash[hash.length - 1] & 0xf;
  const code =
    (((hash[offset] & 0x7f) << 24) |
      (hash[offset + 1] << 16) |
      (hash[offset + 2] << 8) |
      hash[offset + 3]) %
    Math.pow(10, TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Verify a TOTP token within the configured time window.
 * Checks current period and +/- TOTP_WINDOW periods for clock drift.
 */
function verifyTOTP(secret: string, token: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const candidate = generateTOTP(secret, now + i * TOTP_PERIOD);
    // Constant-time comparison to prevent timing attacks
    if (
      candidate.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Build the otpauth:// URI for QR code scanning.
 */
function buildOtpAuthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: TOTP_DIGITS.toString(),
    period: TOTP_PERIOD.toString(),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Generate a set of one-time backup codes.
 * Returns { plain: string[], hashed: string[] }.
 */
function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // 8-character alphanumeric codes in groups of 4 (e.g., "ABCD-1234")
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plain.push(code);
    hashed.push(crypto.createHash("sha256").update(code).digest("hex"));
  }

  return { plain, hashed };
}

// ─── MFA Service Public API ─────────────────────────────────────────────────

/**
 * Begin MFA setup for a user. Generates a new secret, stores it (not yet enabled),
 * and returns the secret + QR code URI + backup codes.
 */
export async function setupMfa(userId: string) {
  // Fetch user
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (user.mfaEnabled) throw new Error("MFA is already enabled for this account");

  const secret = generateSecret();
  const qrCodeUri = buildOtpAuthUri(user.email, secret);
  const backupCodes = generateBackupCodes();

  // Store the secret (not yet enabled — requires verify-setup)
  await db
    .update(users)
    .set({
      mfaSecret: secret,
      mfaBackupCodes: backupCodes.hashed,
      mfaEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return {
    secret,
    qrCodeUri,
    backupCodes: backupCodes.plain,
  };
}

/**
 * Verify the first TOTP token during MFA setup to confirm the user
 * has correctly configured their authenticator app. Enables MFA on success.
 */
export async function verifyMfaSetup(userId: string, token: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (user.mfaEnabled) throw new Error("MFA is already enabled");
  if (!user.mfaSecret) throw new Error("MFA setup has not been initiated. Call /api/auth/mfa/setup first.");

  const valid = verifyTOTP(user.mfaSecret, token);
  if (!valid) {
    throw new Error("Invalid verification code. Please try again.");
  }

  // Enable MFA
  await db
    .update(users)
    .set({
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { success: true };
}

/**
 * Verify a TOTP token during login. Also accepts backup codes.
 */
export async function verifyMfaLogin(userId: string, token: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new Error("MFA is not enabled for this account");
  }

  // First try TOTP verification
  if (verifyTOTP(user.mfaSecret, token)) {
    await db
      .update(users)
      .set({ mfaVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { success: true, method: "totp" };
  }

  // Fall back to backup code verification
  const normalizedToken = token.toUpperCase().trim();
  const tokenHash = crypto.createHash("sha256").update(normalizedToken).digest("hex");
  const backupCodes: string[] = (user.mfaBackupCodes as string[] | null) ?? [];

  const codeIndex = backupCodes.findIndex(
    (hash) => crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(tokenHash, "hex"))
  );

  if (codeIndex >= 0) {
    // Remove used backup code
    const remaining = [...backupCodes];
    remaining.splice(codeIndex, 1);
    await db
      .update(users)
      .set({
        mfaBackupCodes: remaining,
        mfaVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return {
      success: true,
      method: "backup_code",
      remainingBackupCodes: remaining.length,
    };
  }

  throw new Error("Invalid verification code or backup code");
}

/**
 * Disable MFA for a user. Requires a valid current TOTP token for security.
 */
export async function disableMfa(userId: string, token: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (!user.mfaEnabled || !user.mfaSecret) {
    throw new Error("MFA is not enabled for this account");
  }

  // Verify current token before disabling
  const valid = verifyTOTP(user.mfaSecret, token);
  if (!valid) {
    throw new Error("Invalid verification code. MFA disable aborted.");
  }

  await db
    .update(users)
    .set({
      mfaSecret: null,
      mfaEnabled: false,
      mfaVerifiedAt: null,
      mfaBackupCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { success: true };
}

/**
 * Check if MFA is required for a user based on organization compliance settings.
 * Returns { enabled, requiredByPolicy, enforcedForRole }.
 */
export async function getMfaStatus(userId: string, organizationId?: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  let requiredByPolicy = false;
  let enforcedForRole = false;

  if (organizationId) {
    const [settings] = await db
      .select()
      .from(complianceSettings)
      .where(eq(complianceSettings.organizationId, organizationId))
      .limit(1);

    if (settings) {
      // Global MFA requirement
      if (settings.requireMfa) {
        requiredByPolicy = true;
      }

      // Role-specific MFA enforcement
      const enforcedRoles: string[] = (settings.mfaEnforcedRoles as string[] | null) ?? [];
      if (enforcedRoles.length > 0 && enforcedRoles.includes(user.role)) {
        enforcedForRole = true;
        requiredByPolicy = true;
      }
    }
  }

  return {
    enabled: user.mfaEnabled ?? false,
    requiredByPolicy,
    enforcedForRole,
  };
}

/**
 * Check if a user has MFA enabled (lightweight check for login flow).
 */
export async function isMfaEnabled(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.mfaEnabled === true;
}
