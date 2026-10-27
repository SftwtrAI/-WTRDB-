"use strict";

import type { Express, Router } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "../storage";
import { db } from "../db";
import {
  authenticateToken,
  requireRole,
  generateTokenAsync,
  checkActiveMembership,
  checkUserActive,
  type AuthRequest,
} from "../middleware/auth";
import {
  authenticateHybrid,
  optionalHybridAuth,
  type HybridAuthRequest,
} from "../middleware/hybrid-auth";
import {
  authRateLimiter,
  strictRateLimiter,
  paymentRateLimiter,
} from "../middleware/rateLimiter";
import { NotificationService as notificationServiceSingleton } from "../services/notification-service";
import { webhookDeliveryService } from "../services/webhook-delivery";
import { webhookTestService } from "../services/webhook-test-service";
import { emailService } from "../services/email-service";

/**
 * Shared upload configuration for file uploads
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

/**
 * Helper function to escape CSV fields
 */
export function escapeCSV(value: string | number): string {
  if (typeof value === "number") return value.toString();
  if (!value) return "";

  const stringValue = value.toString();
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * RouteContext contains all shared dependencies that route modules need.
 * Each route module exports a factory function that receives this context
 * and returns an Express Router.
 *
 * Voice/CRM/telephony/payment services removed in wtrdb extraction.
 */
export interface RouteContext {
  // Database
  db: typeof db;
  storage: typeof storage;

  // Auth middleware
  authenticateToken: typeof authenticateToken;
  authenticateHybrid: typeof authenticateHybrid;
  optionalHybridAuth: typeof optionalHybridAuth;
  requireRole: typeof requireRole;
  generateTokenAsync: typeof generateTokenAsync;
  checkActiveMembership: typeof checkActiveMembership;
  checkUserActive: typeof checkUserActive;

  // Rate limiters
  authRateLimiter: typeof authRateLimiter;
  strictRateLimiter: typeof strictRateLimiter;
  paymentRateLimiter: typeof paymentRateLimiter;

  // Services
  notificationService: typeof notificationServiceSingleton;
  webhookDeliveryService: typeof webhookDeliveryService;
  webhookTestService: typeof webhookTestService;
  emailService: typeof emailService;

  // Utilities
  upload: typeof upload;
  escapeCSV: typeof escapeCSV;
}

/**
 * Creates the shared route context with all dependencies.
 * Call this once in registerRoutes and pass to all route factories.
 */
export function createRouteContext(): RouteContext {
  return {
    db,
    storage,
    authenticateToken,
    authenticateHybrid,
    optionalHybridAuth,
    requireRole,
    generateTokenAsync,
    checkActiveMembership,
    checkUserActive,
    authRateLimiter,
    strictRateLimiter,
    paymentRateLimiter,
    notificationService: notificationServiceSingleton,
    webhookDeliveryService,
    webhookTestService,
    emailService,
    upload,
    escapeCSV,
  };
}

/**
 * Type for route factory functions.
 * Each route module should export a function matching this signature.
 */
export type RouteFactory = (ctx: RouteContext) => Router;

// Re-export commonly used types
export type { AuthRequest } from "../middleware/auth";
export type { HybridAuthRequest } from "../middleware/hybrid-auth";
