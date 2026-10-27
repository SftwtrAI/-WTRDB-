"use strict";

import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  concurrencyLimits,
  concurrencySessions,
  concurrencyAllocations,
  organizationMembers,
} from "@wtrops/shared";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "../utils/logger";
import Redis from "ioredis";
import crypto from "crypto";

// ════════════════════════════════════════════════════════════════════════════════
// Redis Configuration
// ════════════════════════════════════════════════════════════════════════════════

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const COUNTER_KEY_PREFIX = "conc:counter:";
const COUNTER_TTL = 3600; // 1 hour safety TTL for counters

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });
    redis.on("error", (err) => {
      logger.warn(
        `Concurrency Redis connection error: ${err.message}`,
        undefined,
        "Concurrency",
      );
    });
  }
  return redis;
}

// ════════════════════════════════════════════════════════════════════════════════
// Counter Key Helpers
// ════════════════════════════════════════════════════════════════════════════════

function orgCounterKey(orgId: string, sessionType: string): string {
  return `${COUNTER_KEY_PREFIX}org:${orgId}:${sessionType}`;
}

function teamCounterKey(teamId: string, sessionType: string): string {
  return `${COUNTER_KEY_PREFIX}team:${teamId}:${sessionType}`;
}

function userCounterKey(userId: string, sessionType: string): string {
  return `${COUNTER_KEY_PREFIX}user:${userId}:${sessionType}`;
}

// ════════════════════════════════════════════════════════════════════════════════
// Extended Request type
// ════════════════════════════════════════════════════════════════════════════════

export interface ConcurrencyRequest extends Request {
  userId?: string;
  userRole?: string;
  organizationId?: string;
  /** Set by concurrency middleware upon successful slot acquisition. */
  concurrencySession?: {
    sessionId: string;
    sessionToken: string;
    sessionType: string;
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Resolve org ID from request (same logic as RBAC middleware).
 */
async function resolveOrgId(req: ConcurrencyRequest): Promise<string | null> {
  const explicit =
    (req.headers["x-organization-id"] as string) ||
    (req.query.organizationId as string);
  if (explicit) return explicit;

  if (!req.userId) return null;
  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, req.userId))
    .limit(1);

  return membership?.organizationId ?? null;
}

/**
 * Get the concurrency limit for a session type at the org level.
 */
async function getOrgLimit(
  orgId: string,
  sessionType: string,
): Promise<number> {
  const [limits] = await db
    .select()
    .from(concurrencyLimits)
    .where(eq(concurrencyLimits.organizationId, orgId))
    .limit(1);

  if (!limits) return 2; // Default fallback

  switch (sessionType) {
    case "voice":
      return limits.voiceConcurrencyLimit;
    case "claw":
      return limits.clawConcurrencyLimit;
    default:
      return limits.totalConcurrencyLimit;
  }
}

/**
 * Get team-level concurrency allocation, if any.
 */
async function getTeamAllocationLimit(
  orgId: string,
  teamId: string,
): Promise<{ limit: number; overflowPolicy: string } | null> {
  const [alloc] = await db
    .select()
    .from(concurrencyAllocations)
    .where(
      and(
        eq(concurrencyAllocations.organizationId, orgId),
        eq(concurrencyAllocations.teamId, teamId),
      ),
    )
    .limit(1);

  if (!alloc) return null;
  return {
    limit: alloc.concurrencyLimit,
    overflowPolicy: alloc.overflowPolicy,
  };
}

/**
 * Get user-level concurrency allocation, if any.
 */
async function getUserAllocationLimit(
  orgId: string,
  userId: string,
): Promise<{ limit: number; overflowPolicy: string } | null> {
  const [alloc] = await db
    .select()
    .from(concurrencyAllocations)
    .where(
      and(
        eq(concurrencyAllocations.organizationId, orgId),
        eq(concurrencyAllocations.userId, userId),
      ),
    )
    .limit(1);

  if (!alloc) return null;
  return {
    limit: alloc.concurrencyLimit,
    overflowPolicy: alloc.overflowPolicy,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// Concurrency Middleware Factory
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware that checks org/team/user concurrency limits.
 *
 * Uses Redis INCR for atomic counter operations.
 * On success, creates a concurrencySessions row and injects session info into the request.
 * On limit exceeded, returns 429.
 *
 * The caller MUST call `releaseConcurrencySlot` when the session ends.
 *
 * @param sessionType - "voice" | "claw" | "total"
 */
export function checkConcurrency(sessionType: string) {
  return async (
    req: ConcurrencyRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const orgId = req.organizationId || (await resolveOrgId(req));
      if (!orgId) {
        res.status(403).json({
          error: "No organization context for concurrency check",
          code: "NO_ORG_CONTEXT",
        });
        return;
      }
      req.organizationId = orgId;

      const resourceId =
        (req.body?.resourceId as string) ||
        (req.params?.resourceId as string) ||
        `req-${Date.now()}`;

      const r = getRedis();

      // ── 1. Check org-level limit ──────────────────────────────────────────
      const orgLimit = await getOrgLimit(orgId, sessionType);
      const orgKey = orgCounterKey(orgId, sessionType);

      const orgCurrent = await r.incr(orgKey);
      await r.expire(orgKey, COUNTER_TTL);

      if (orgCurrent > orgLimit) {
        // Roll back
        await r.decr(orgKey);
        logger.warn(
          `Concurrency limit reached: org=${orgId} type=${sessionType} current=${orgCurrent} limit=${orgLimit}`,
          undefined,
          "Concurrency",
        );
        res.status(429).json({
          error: "Organization concurrency limit reached",
          code: "CONCURRENCY_LIMIT_ORG",
          limit: orgLimit,
          current: orgCurrent - 1,
          sessionType,
        });
        return;
      }

      // ── 2. Check user-level allocation (optional) ─────────────────────────
      const userAlloc = await getUserAllocationLimit(orgId, userId);
      if (userAlloc) {
        const userKey = userCounterKey(userId, sessionType);
        const userCurrent = await r.incr(userKey);
        await r.expire(userKey, COUNTER_TTL);

        if (userCurrent > userAlloc.limit) {
          // Roll back both user and org counters
          await r.decr(userKey);
          await r.decr(orgKey);

          if (userAlloc.overflowPolicy === "reject") {
            res.status(429).json({
              error: "User concurrency limit reached",
              code: "CONCURRENCY_LIMIT_USER",
              limit: userAlloc.limit,
              current: userCurrent - 1,
              sessionType,
            });
            return;
          }
          // If overflow policy is "queue" or "burst", we could implement that later.
          // For now, treat non-reject as a pass-through.
        }
      }

      // ── 3. Create session record ──────────────────────────────────────────
      const sessionToken = crypto.randomUUID();

      const [session] = await db
        .insert(concurrencySessions)
        .values({
          organizationId: orgId,
          userId,
          sessionType,
          resourceId,
          sessionToken,
          status: "active",
        })
        .returning();

      req.concurrencySession = {
        sessionId: session.id,
        sessionToken,
        sessionType,
      };

      logger.info(
        `Concurrency slot acquired: org=${orgId} user=${userId} type=${sessionType} session=${session.id}`,
        undefined,
        "Concurrency",
      );

      next();
    } catch (err: any) {
      logger.error(
        `Concurrency middleware error: ${err.message}`,
        { stack: err.stack },
        "Concurrency",
      );
      res.status(500).json({
        error: "Internal error during concurrency check",
        code: "CONCURRENCY_INTERNAL_ERROR",
      });
    }
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// Release helper (call when session ends)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Release a concurrency slot. Decrements the Redis counter and marks the
 * session as ended in the database.
 */
export async function releaseConcurrencySlot(
  sessionId: string,
): Promise<void> {
  try {
    const [session] = await db
      .select()
      .from(concurrencySessions)
      .where(eq(concurrencySessions.id, sessionId))
      .limit(1);

    if (!session || session.status !== "active") return;

    // Decrement Redis counter
    const r = getRedis();
    const orgKey = orgCounterKey(session.organizationId, session.sessionType);
    const newVal = await r.decr(orgKey);
    // Prevent negative counters
    if (newVal < 0) {
      await r.set(orgKey, "0", "EX", COUNTER_TTL);
    }

    if (session.userId) {
      const userKey = userCounterKey(session.userId, session.sessionType);
      const userVal = await r.decr(userKey);
      if (userVal < 0) {
        await r.set(userKey, "0", "EX", COUNTER_TTL);
      }
    }

    // Mark session ended
    await db
      .update(concurrencySessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(concurrencySessions.id, sessionId));

    logger.info(
      `Concurrency slot released: session=${sessionId}`,
      undefined,
      "Concurrency",
    );
  } catch (err: any) {
    logger.error(
      `Failed to release concurrency slot ${sessionId}: ${err.message}`,
      undefined,
      "Concurrency",
    );
  }
}

/**
 * Record a heartbeat for an active session (prevents stale session cleanup).
 */
export async function heartbeatConcurrencySession(
  sessionId: string,
): Promise<void> {
  await db
    .update(concurrencySessions)
    .set({ lastHeartbeatAt: new Date() })
    .where(
      and(
        eq(concurrencySessions.id, sessionId),
        eq(concurrencySessions.status, "active"),
      ),
    );
}

/**
 * Graceful shutdown: close Redis connection.
 */
export async function shutdownConcurrencyRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
