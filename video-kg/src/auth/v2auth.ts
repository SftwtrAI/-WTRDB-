import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { createLogger } from "../logger.js";

const log = createLogger("auth");

let cachedUserId: string | null = null;

/**
 * Resolve the wtrdb user that owns ingested videos:
 *   1. DEFAULT_USER_ID, else
 *   2. look up USER_EMAIL in the shared users table, else
 *   3. login to v2 with USER_EMAIL/USER_PASSWORD and decode the token.
 */
export async function resolveUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  if (config.defaultUserId.trim()) {
    cachedUserId = config.defaultUserId.trim();
    return cachedUserId;
  }

  if (config.userEmail.trim()) {
    try {
      const r = await pool.query(
        "SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1",
        [config.userEmail.trim()],
      );
      if (r.rows[0]?.id) {
        cachedUserId = r.rows[0].id as string;
        log.info(`Resolved user via email lookup: ${cachedUserId}`);
        return cachedUserId;
      }
    } catch (err: any) {
      log.warn(`email lookup failed: ${err.message}`);
    }

    if (config.userPassword.trim()) {
      const tok = await loginV2(config.userEmail.trim(), config.userPassword.trim());
      const decoded = jwt.decode(tok) as { userId?: string } | null;
      if (decoded?.userId) {
        cachedUserId = decoded.userId;
        log.info(`Resolved user via v2 login: ${cachedUserId}`);
        return cachedUserId;
      }
    }
  }

  throw new Error(
    "Cannot resolve owner user. Set DEFAULT_USER_ID, or USER_EMAIL (+ optional USER_PASSWORD) in video-kg/.env.",
  );
}

/** Mint a v2-compatible JWT ({ userId, role }) signed with the shared secret. */
export function mintToken(userId: string): string {
  if (!config.jwtSecret) throw new Error("JWT_SECRET not set");
  return jwt.sign({ userId, role: "user" }, config.jwtSecret, {
    expiresIn: "1h",
  });
}

export async function loginV2(email: string, password: string): Promise<string> {
  const res = await fetch(`${config.v2BaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`v2 login failed: ${res.status} ${await res.text()}`);
  }
  const data: any = await res.json();
  if (!data.token) throw new Error("v2 login returned no token");
  return data.token as string;
}
