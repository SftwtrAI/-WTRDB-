"use strict";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { users } from "@wtrops/shared";
import { eq } from "drizzle-orm";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable must be set in production",
      );
    }
    return "insecure-dev-secret-CHANGE-ME";
  })();

export interface AdminRequest extends Request {
  userId?: string;
  userRole?: string;
  isAdmin?: boolean;
  adminTeamMember?: {
    memberId: string;
    teamId: string;
    roleId: string;
    roleName: string;
    email: string;
  };
}

/**
 * Validate admin team session token format before DB lookup
 * Returns true if token looks like a valid hex session token
 */
function isValidSessionTokenFormat(token: string): boolean {
  // Admin team tokens are 64-character hex strings
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

/**
 * In-memory cache for failed token attempts to prevent DoS
 * Tokens that fail are cached for a short period to avoid repeated DB lookups
 */
const failedTokenCache = new Map<string, number>();
const FAILED_TOKEN_CACHE_TTL = 60000; // 1 minute
const MAX_FAILED_TOKEN_CACHE_SIZE = 10000; // Prevent memory exhaustion

/**
 * Check if a token is in the failed cache (recently rejected)
 */
function isTokenRecentlyRejected(token: string): boolean {
  const cacheTime = failedTokenCache.get(token);
  if (!cacheTime) return false;

  if (Date.now() - cacheTime > FAILED_TOKEN_CACHE_TTL) {
    failedTokenCache.delete(token);
    return false;
  }
  return true;
}

/**
 * Mark a token as recently rejected
 */
function markTokenAsRejected(token: string): void {
  // Prevent memory exhaustion by limiting cache size
  if (failedTokenCache.size >= MAX_FAILED_TOKEN_CACHE_SIZE) {
    // Remove oldest entries (simple LRU approximation)
    const toDelete = failedTokenCache.size - MAX_FAILED_TOKEN_CACHE_SIZE + 1000;
    let deleted = 0;
    for (const key of failedTokenCache.keys()) {
      if (deleted >= toDelete) break;
      failedTokenCache.delete(key);
      deleted++;
    }
  }
  failedTokenCache.set(token, Date.now());
}

/**
 * Try to validate admin team session token
 * Returns member info if valid, null otherwise
 * Only for READ-ONLY operations in the admin panel
 *
 * Includes DoS protection:
 * - Token format validation before DB lookup
 * - In-memory cache for recently rejected tokens
 */
async function tryAdminTeamToken(token: string): Promise<{
  memberId: string;
  teamId: string;
  roleId: string;
  roleName: string;
  email: string;
} | null> {
  try {
    // Validate token format before hitting database to prevent DoS
    if (!isValidSessionTokenFormat(token)) {
      return null;
    }

    // Check if this token was recently rejected (DoS prevention)
    if (isTokenRecentlyRejected(token)) {
      return null;
    }

    const result = await db.execute(sql`
      SELECT s.member_id, s.admin_team_id, m.email, m.role_id, r.name as role_name, r.display_name
      FROM admin_team_sessions s
      JOIN admin_team_members m ON s.member_id = m.id
      JOIN admin_team_roles r ON m.role_id = r.id
      WHERE s.token = ${token} 
        AND s.expires_at > NOW()
        AND m.status = 'active'
    `);

    if (result.rows.length === 0) {
      // Cache this failed token to prevent repeated DB lookups
      markTokenAsRejected(token);
      return null;
    }

    const session = result.rows[0] as any;

    await db.execute(sql`
      UPDATE admin_team_sessions SET last_activity_at = NOW() WHERE token = ${token}
    `);

    return {
      memberId: session.member_id,
      teamId: session.admin_team_id,
      roleId: session.role_id,
      roleName: session.display_name || session.role_name,
      email: session.email,
    };
  } catch (error) {
    console.error("[Admin Auth] Admin team token check error:", error);
    return null;
  }
}

export async function checkSuperAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    // Get token from header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      console.log("[Admin Auth] No token provided");
      return res.status(401).json({ error: "Authentication required" });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
    };
    const userId = decoded.userId;

    // Check if user has admin role
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      console.log("[Admin Auth] User not found:", userId);
      return res.status(403).json({ error: "User not found" });
    }

    if (user.role !== "admin") {
      console.log("[Admin Auth] User is not admin:", {
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      return res.status(403).json({
        error: "Admin access required",
        details: "Your account does not have admin privileges",
      });
    }

    // Attach admin status to request
    req.userId = userId;
    req.userRole = user.role;
    req.isAdmin = true;
    next();
  } catch (error) {
    console.error("[Admin Auth] Error:", error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    res.status(500).json({ error: "Authentication error" });
  }
}

export async function checkAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    // Get token from header
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
    };
    const userId = decoded.userId;

    // Check if user has admin role
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Attach admin status to request
    req.userId = userId;
    req.userRole = user.role;
    req.isAdmin = true;
    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    res.status(500).json({ error: "Authentication error" });
  }
}

/**
 * Middleware for admin routes:
 * Users with 'admin' role have full access to admin panel
 */
export async function checkAdminWithReadOnly(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
    };
    const userId = decoded.userId;

    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      return res.status(403).json({ error: "User not found" });
    }

    // Only users with 'admin' role can access
    if (user.role !== "admin") {
      return res.status(403).json({
        error: "Admin access required",
        details: "Only admins can access the admin panel.",
      });
    }

    req.userId = userId;
    req.userRole = user.role;
    req.isAdmin = true;

    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    res.status(500).json({ error: "Authentication error" });
  }
}

/**
 * Middleware for admin team member access to specific read-only endpoints
 * Only use this for explicit read-only analytics/dashboard endpoints
 * This allows admin team members to view data based on their permissions
 */
export async function checkAdminOrTeamMember(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // First try JWT token for main admin
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        role: string;
      };
      const userId = decoded.userId;

      const [user] = await db.select().from(users).where(eq(users.id, userId));

      if (user && user.role === "admin") {
        req.userId = userId;
        req.userRole = user.role;
        req.isAdmin = true;
        return next();
      }
    } catch (jwtError) {
      // JWT verification failed, try admin team token
    }

    // Fallback: Try admin team session token
    // Validate format first to prevent unnecessary DB lookups
    if (!isValidSessionTokenFormat(token)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const adminTeamMember = await tryAdminTeamToken(token);
    if (adminTeamMember) {
      req.adminTeamMember = adminTeamMember;
      // Do NOT set isAdmin - team members have limited permissions
      return next();
    }

    return res.status(403).json({ error: "Admin access required" });
  } catch (error) {
    console.error("Admin auth error:", error);
    res.status(500).json({ error: "Authentication error" });
  }
}
