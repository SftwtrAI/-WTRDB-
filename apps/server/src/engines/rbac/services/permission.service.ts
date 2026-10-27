"use strict";

import { db } from "../../../db";
import {
  permissions,
  rolePermissions,
  userRoles,
  roles as rolesTable,
  type Permission,
} from "@wtrops/shared";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../../../utils/logger";
import Redis from "ioredis";

// ════════════════════════════════════════════════════════════════════════════════
// Redis cache for permission lookups
// ════════════════════════════════════════════════════════════════════════════════

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PERMISSION_CACHE_TTL = 60; // seconds
const CACHE_KEY_PREFIX = "rbac:perms:";

function getCacheKey(userId: string, orgId: string): string {
  return `${CACHE_KEY_PREFIX}${orgId}:${userId}`;
}

// ════════════════════════════════════════════════════════════════════════════════
// Permission Seed Data
// Categories: agents, claws, campaigns, credits, concurrency, classification,
//             telephony, teams, policies, billing, audit, settings, rbac
// ════════════════════════════════════════════════════════════════════════════════

interface PermissionSeed {
  name: string;
  description: string;
  category: string;
}

export const ALL_PERMISSIONS: PermissionSeed[] = [
  // ── Agents ──────────────────────────────────────────────────────────────────
  { name: "agents.create", description: "Create voice or flow agents", category: "agents" },
  { name: "agents.read", description: "View agent configurations", category: "agents" },
  { name: "agents.update", description: "Update agent configurations", category: "agents" },
  { name: "agents.delete", description: "Delete agents", category: "agents" },
  { name: "agents.deploy", description: "Deploy agents to production", category: "agents" },
  { name: "agents.test", description: "Run test calls on agents", category: "agents" },

  // ── Claws (AI Compute) ─────────────────────────────────────────────────────
  { name: "claws.create", description: "Create claw instances", category: "claws" },
  { name: "claws.read", description: "View claw configurations and status", category: "claws" },
  { name: "claws.update", description: "Update claw configurations", category: "claws" },
  { name: "claws.delete", description: "Delete claw instances", category: "claws" },
  { name: "claws.execute", description: "Execute claw inference requests", category: "claws" },
  { name: "claws.manage_skills", description: "Install, remove, or approve skills", category: "claws" },

  // ── Campaigns ──────────────────────────────────────────────────────────────
  { name: "campaigns.create", description: "Create outbound campaigns", category: "campaigns" },
  { name: "campaigns.read", description: "View campaigns and their results", category: "campaigns" },
  { name: "campaigns.update", description: "Update campaign settings", category: "campaigns" },
  { name: "campaigns.delete", description: "Delete campaigns", category: "campaigns" },
  { name: "campaigns.start", description: "Start or resume campaigns", category: "campaigns" },
  { name: "campaigns.stop", description: "Pause or stop running campaigns", category: "campaigns" },

  // ── Credits ────────────────────────────────────────────────────────────────
  { name: "credits.view", description: "View credit balance and usage", category: "credits" },
  { name: "credits.purchase", description: "Purchase additional credits", category: "credits" },
  { name: "credits.transfer", description: "Transfer credits between teams", category: "credits" },
  { name: "credits.set_limits", description: "Set per-team or per-user credit limits", category: "credits" },

  // ── Concurrency ────────────────────────────────────────────────────────────
  { name: "concurrency.view", description: "View concurrency limits and usage", category: "concurrency" },
  { name: "concurrency.manage", description: "Manage concurrency allocations", category: "concurrency" },
  { name: "concurrency.override", description: "Override concurrency limits (admin)", category: "concurrency" },
  { name: "concurrency.view_sessions", description: "View active concurrency sessions", category: "concurrency" },

  // ── Classification ─────────────────────────────────────────────────────────
  { name: "classification.read", description: "View call classifications and dispositions", category: "classification" },
  { name: "classification.update", description: "Update classification rules", category: "classification" },
  { name: "classification.manage_rules", description: "Create and manage classification rulesets", category: "classification" },

  // ── Telephony ──────────────────────────────────────────────────────────────
  { name: "telephony.view", description: "View phone numbers and SIP trunks", category: "telephony" },
  { name: "telephony.purchase", description: "Purchase phone numbers", category: "telephony" },
  { name: "telephony.configure", description: "Configure SIP trunks and telephony providers", category: "telephony" },
  { name: "telephony.release", description: "Release phone numbers", category: "telephony" },

  // ── Teams ──────────────────────────────────────────────────────────────────
  { name: "teams.create", description: "Create teams", category: "teams" },
  { name: "teams.read", description: "View team details and membership", category: "teams" },
  { name: "teams.update", description: "Update team settings", category: "teams" },
  { name: "teams.delete", description: "Delete teams", category: "teams" },
  { name: "teams.manage_members", description: "Add or remove team members", category: "teams" },

  // ── Policies ───────────────────────────────────────────────────────────────
  { name: "policies.create", description: "Create claw policy templates", category: "policies" },
  { name: "policies.read", description: "View policy templates", category: "policies" },
  { name: "policies.update", description: "Update policy templates", category: "policies" },
  { name: "policies.delete", description: "Delete policy templates", category: "policies" },
  { name: "policies.assign", description: "Assign policies to claws or teams", category: "policies" },

  // ── Billing ────────────────────────────────────────────────────────────────
  { name: "billing.view", description: "View invoices, subscriptions, and payment history", category: "billing" },
  { name: "billing.manage", description: "Manage subscription plans and payment methods", category: "billing" },
  { name: "billing.export", description: "Export billing data and invoices", category: "billing" },

  // ── Audit ──────────────────────────────────────────────────────────────────
  { name: "audit.read", description: "View audit logs and activity history", category: "audit" },
  { name: "audit.export", description: "Export audit logs", category: "audit" },

  // ── Settings ───────────────────────────────────────────────────────────────
  { name: "settings.read", description: "View organization settings", category: "settings" },
  { name: "settings.update", description: "Update organization settings", category: "settings" },
  { name: "settings.manage_integrations", description: "Manage third-party integrations and webhooks", category: "settings" },
  { name: "settings.manage_api_keys", description: "Create and manage API keys", category: "settings" },

  // ── RBAC ───────────────────────────────────────────────────────────────────
  { name: "rbac.manage_roles", description: "Create, update, and delete custom roles", category: "rbac" },
  { name: "rbac.assign_roles", description: "Assign roles to users", category: "rbac" },
  { name: "rbac.view_roles", description: "View roles and their permissions", category: "rbac" },
  { name: "rbac.view_audit", description: "View RBAC audit events", category: "rbac" },
];

// ════════════════════════════════════════════════════════════════════════════════
// Default permission assignments per system role
// ════════════════════════════════════════════════════════════════════════════════

export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ALL_PERMISSIONS.map((p) => p.name), // Owner gets everything
  admin: ALL_PERMISSIONS.filter(
    (p) =>
      !["billing.manage", "settings.manage_api_keys"].includes(p.name),
  ).map((p) => p.name),
  team_member: [
    "agents.create", "agents.read", "agents.update", "agents.delete", "agents.deploy", "agents.test",
    "claws.create", "claws.read", "claws.update", "claws.execute",
    "campaigns.create", "campaigns.read", "campaigns.update", "campaigns.start", "campaigns.stop",
    "credits.view",
    "concurrency.view",
    "classification.read", "classification.update",
    "telephony.view",
    "teams.read",
    "policies.read",
    "settings.read",
    "rbac.view_roles",
  ],
  viewer: [
    "agents.read",
    "claws.read",
    "campaigns.read",
    "credits.view",
    "concurrency.view",
    "classification.read",
    "telephony.view",
    "teams.read",
    "policies.read",
    "billing.view",
    "audit.read",
    "settings.read",
    "rbac.view_roles",
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// Permission Service
// ════════════════════════════════════════════════════════════════════════════════

export class PermissionService {
  private redis: Redis | null = null;

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
      });
      this.redis.on("error", (err) => {
        logger.warn(`RBAC Redis connection error: ${err.message}`, undefined, "RBAC");
      });
    }
    return this.redis;
  }

  /**
   * Seed all permissions into the database.
   * Skips any that already exist (by unique name).
   * Also attaches permissions to system roles.
   */
  async seedPermissions(): Promise<void> {
    // Upsert all permissions
    for (const perm of ALL_PERMISSIONS) {
      const existing = await db
        .select()
        .from(permissions)
        .where(eq(permissions.name, perm.name))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(permissions).values({
          name: perm.name,
          description: perm.description,
          category: perm.category,
        });
      }
    }
    logger.info(
      `Seeded ${ALL_PERMISSIONS.length} permissions`,
      undefined,
      "RBAC",
    );

    // Attach permissions to system roles
    const allPerms = await db.select().from(permissions);
    const permMap = new Map(allPerms.map((p) => [p.name, p.id]));

    const systemRoles = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.isSystemRole, true));

    for (const role of systemRoles) {
      const permNames = SYSTEM_ROLE_PERMISSIONS[role.name];
      if (!permNames) continue;

      // Clear existing role permissions for this system role
      await db
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id));

      const permValues = permNames
        .map((name) => {
          const permId = permMap.get(name);
          if (!permId) return null;
          return { roleId: role.id, permissionId: permId };
        })
        .filter(Boolean) as { roleId: string; permissionId: string }[];

      if (permValues.length > 0) {
        await db.insert(rolePermissions).values(permValues);
      }

      logger.info(
        `Attached ${permValues.length} permissions to system role "${role.displayName}"`,
        undefined,
        "RBAC",
      );
    }
  }

  /**
   * List all permissions, optionally filtered by category.
   */
  async listPermissions(category?: string): Promise<Permission[]> {
    if (category) {
      return db
        .select()
        .from(permissions)
        .where(eq(permissions.category, category))
        .orderBy(permissions.category, permissions.name);
    }
    return db
      .select()
      .from(permissions)
      .orderBy(permissions.category, permissions.name);
  }

  /**
   * Get all permission names for a user in an organization.
   * Aggregates permissions from all roles assigned to the user in that org.
   * Uses Redis cache with 60s TTL.
   */
  async getUserPermissions(
    userId: string,
    orgId: string,
  ): Promise<string[]> {
    const cacheKey = getCacheKey(userId, orgId);

    // Try cache first
    try {
      const redis = this.getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable, fall through to DB
    }

    // Query DB: get all roles for user in org, then get permissions for those roles
    const userRoleRows = await db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, userId), eq(userRoles.organizationId, orgId)),
      );

    if (userRoleRows.length === 0) {
      await this.cachePermissions(cacheKey, []);
      return [];
    }

    const roleIds = userRoleRows.map((r) => r.roleId);

    const permRows = await db
      .select({ permissionName: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));

    // Deduplicate
    const permSet = Array.from(new Set(permRows.map((r) => r.permissionName)));

    await this.cachePermissions(cacheKey, permSet);
    return permSet;
  }

  /**
   * Check if a user has a specific permission in an organization.
   */
  async checkPermission(
    userId: string,
    orgId: string,
    permission: string,
  ): Promise<boolean> {
    const perms = await this.getUserPermissions(userId, orgId);
    return perms.includes(permission);
  }

  /**
   * Invalidate the cached permissions for a user in an org.
   * Call this when roles or role-permissions change.
   */
  async invalidateCache(userId: string, orgId: string): Promise<void> {
    try {
      const redis = this.getRedis();
      await redis.del(getCacheKey(userId, orgId));
    } catch {
      // Redis unavailable, cache will expire naturally
    }
  }

  /**
   * Invalidate all permission caches for an entire org (e.g. when a role is updated).
   */
  async invalidateOrgCache(orgId: string): Promise<void> {
    try {
      const redis = this.getRedis();
      const pattern = `${CACHE_KEY_PREFIX}${orgId}:*`;
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== "0");
    } catch {
      // Redis unavailable
    }
  }

  private async cachePermissions(
    cacheKey: string,
    perms: string[],
  ): Promise<void> {
    try {
      const redis = this.getRedis();
      await redis.set(cacheKey, JSON.stringify(perms), "EX", PERMISSION_CACHE_TTL);
    } catch {
      // Redis unavailable, skip caching
    }
  }

  /**
   * Graceful shutdown: close Redis connection.
   */
  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

export const permissionService = new PermissionService();
