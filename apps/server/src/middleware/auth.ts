"use strict";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable must be set in production",
      );
    }
    console.warn(
      "⚠️  WARNING: Using insecure default JWT_SECRET in development. Set JWT_SECRET environment variable for production!",
    );
    return "insecure-dev-secret-CHANGE-ME";
  })();

// Refresh token settings
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const ACTIVITY_TIMEOUT_MINUTES = 30; // Session expires after 30 mins of inactivity

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
    };
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    // Also set req.user for backward compatibility with routes expecting req.user
    (req as any).user = {
      id: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

/**
 * Middleware factory to check if user account is active (not suspended)
 * Requires authenticateToken to run first
 * Returns 403 if user account is suspended
 */
export function checkUserActive(storage: any) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user account is suspended
      if (user.isActive === false) {
        console.log(`Access blocked: User ${req.userId} account is suspended`);
        return res.status(403).json({
          error:
            "Your account has been suspended. Please contact support for assistance.",
          code: "ACCOUNT_SUSPENDED",
        });
      }

      next();
    } catch (error: any) {
      console.error("User active check error:", error);
      return res.status(500).json({ error: "Failed to verify account status" });
    }
  };
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // Admin role always has access to all protected routes
    if (req.userRole === "admin") {
      return next();
    }

    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Cache for JWT expiry to avoid repeated DB calls
let cachedJwtExpiry: string = "7d";
let jwtExpiryCacheTime: number = 0;
const JWT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Preload JWT expiry from database on server startup
export async function preloadJwtExpiry(storage: any): Promise<void> {
  try {
    const setting = await storage.getGlobalSetting("jwt_expiry_days");
    const days = typeof setting?.value === "number" ? setting.value : 7;
    cachedJwtExpiry = `${days}d`;
    jwtExpiryCacheTime = Date.now();
    console.log(`🔐 [Auth] JWT expiry preloaded: ${cachedJwtExpiry}`);
  } catch (error) {
    console.error(
      "[Auth] Failed to preload jwt_expiry_days, using default 7d:",
      error,
    );
  }
}

async function getJwtExpiry(storage: any): Promise<string> {
  const now = Date.now();
  if (now - jwtExpiryCacheTime < JWT_CACHE_TTL) {
    return cachedJwtExpiry;
  }

  try {
    const setting = await storage.getGlobalSetting("jwt_expiry_days");
    const days = typeof setting?.value === "number" ? setting.value : 7;
    cachedJwtExpiry = `${days}d`;
    jwtExpiryCacheTime = now;
    return cachedJwtExpiry;
  } catch (error) {
    console.error(
      "[Auth] Failed to fetch jwt_expiry_days, using default:",
      error,
    );
    return "7d";
  }
}

export async function generateTokenAsync(
  userId: string,
  role: string,
  storage: any,
): Promise<string> {
  const expiry = await getJwtExpiry(storage);
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: expiry as any });
}

/**
 * Middleware to check if user has an active Pro membership
 * Requires authenticateToken to run first
 * Skips check in development mode for testing
 */
export function checkActiveMembership(storage: any) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Skip in development mode for testing
    if (process.env.NODE_ENV === "development") {
      console.log("Development mode: Bypassing membership check");
      return next();
    }

    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Method 1: Check if user has an active subscription in userSubscriptions table
      const subscription = await storage.getUserSubscription(req.userId!);
      if (
        subscription &&
        subscription.status === "active" &&
        new Date(subscription.currentPeriodEnd) > new Date()
      ) {
        console.log(
          `User ${req.userId} has active subscription via userSubscriptions table`,
        );
        return next();
      }

      // Method 2: Check user's planType and planExpiresAt fields (fallback)
      if (
        user.planType !== "free" &&
        user.planExpiresAt &&
        new Date(user.planExpiresAt) > new Date()
      ) {
        console.log(`User ${req.userId} has active membership via users table`);
        return next();
      }

      // No active membership found
      console.log(
        `User ${req.userId} does not have active Pro membership. planType=${user.planType}, planExpiresAt=${user.planExpiresAt}, subscription=${subscription?.status}`,
      );
      return res.status(403).json({
        error:
          "Active Pro membership required. Please subscribe to a plan to access this feature.",
      });
    } catch (error: any) {
      console.error("Membership check error:", error);
      return res
        .status(500)
        .json({ error: "Failed to verify membership status" });
    }
  };
}

/**
 * Generate a secure refresh token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Hash a refresh token for secure storage
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Get refresh token expiry date
 */
export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiry;
}

/**
 * Get activity timeout setting in milliseconds
 */
export function getActivityTimeoutMs(): number {
  return ACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
}

/**
 * Check if a timestamp is within the activity timeout window
 */
export function isWithinActivityTimeout(lastActivityAt: Date | null): boolean {
  if (!lastActivityAt) return false;
  const now = Date.now();
  const lastActivity = new Date(lastActivityAt).getTime();
  return now - lastActivity < getActivityTimeoutMs();
}

/**
 * Interface for refresh token creation
 */
export interface RefreshTokenData {
  userId: string;
  token: string;
  hashedToken: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Create refresh token data for storage
 */
export function createRefreshTokenData(
  userId: string,
  userAgent?: string,
  ipAddress?: string,
): RefreshTokenData {
  const token = generateRefreshToken();
  return {
    userId,
    token,
    hashedToken: hashRefreshToken(token),
    expiresAt: getRefreshTokenExpiry(),
    userAgent,
    ipAddress,
  };
}

/**
 * Generate short-lived access token (15 minutes)
 */
export function generateShortAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "15m" });
}

/**
 * Verify access token and return decoded payload
 */
export function verifyAccessToken(
  token: string,
): { userId: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
  } catch (error) {
    return null;
  }
}

/**
 * Cookie name for refresh token
 */
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/**
 * Set refresh token as HttpOnly, Secure cookie
 * This prevents XSS attacks from stealing the refresh token
 */
export function setRefreshTokenCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // Convert days to milliseconds

  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: isProduction, // Only send over HTTPS in production
    sameSite: "lax", // Prevents CSRF while allowing same-site navigation
    maxAge: maxAge, // Cookie expires when refresh token expires
    path: "/api/auth", // Only sent to auth endpoints (reduces attack surface)
  });
}

/**
 * Clear refresh token cookie on logout
 */
export function clearRefreshTokenCookie(res: Response): void {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 0, // Immediately expire the cookie
    path: "/api/auth",
  });
}

/**
 * Get refresh token from cookie
 */
export function getRefreshTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_TOKEN_COOKIE];
}

/**
 * Export constants for use elsewhere
 */
export const AUTH_CONSTANTS = {
  REFRESH_TOKEN_EXPIRY_DAYS,
  ACTIVITY_TIMEOUT_MINUTES,
  ACCESS_TOKEN_EXPIRY_MINUTES: 15,
};
