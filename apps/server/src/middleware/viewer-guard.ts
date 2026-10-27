"use strict";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./auth";

/**
 * Global middleware that blocks non-GET requests for viewer role users (demo mode).
 * Applied after auth routes so login/refresh/logout still work.
 * Also explicitly exempts /api/auth/* paths for safety.
 */
export function viewerGuard(req: Request, res: Response, next: NextFunction) {
  // Allow read-only methods through
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    return next();
  }

  // Exempt auth routes so viewers can login/refresh/logout
  if (req.path.startsWith("/api/auth/")) {
    return next();
  }

  // Check JWT for viewer role
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return next(); // No token — let authenticateToken handle 401 later
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
    };
    if (decoded.role === "viewer") {
      return res.status(403).json({
        error: "Demo mode: read-only access. Actions are disabled.",
        code: "VIEWER_READ_ONLY",
      });
    }
  } catch {
    // Invalid token — let authenticateToken handle it later
  }

  next();
}
