"use strict";

import { db } from "../../../db";
import {
  roles,
  rolePermissions,
  permissions,
  type Role,
} from "@wtrops/shared";
import { eq, and, or, isNull } from "drizzle-orm";
import { logger } from "../../../utils/logger";

// ════════════════════════════════════════════════════════════════════════════════
// System Role Definitions
// ════════════════════════════════════════════════════════════════════════════════

export interface SystemRoleSeed {
  name: string;
  displayName: string;
  description: string;
  priority: number;
}

export const SYSTEM_ROLES: SystemRoleSeed[] = [
  {
    name: "owner",
    displayName: "Owner",
    description:
      "Full control over the organization. Can manage billing, transfer ownership, and perform all actions.",
    priority: 100,
  },
  {
    name: "admin",
    displayName: "Admin",
    description:
      "Can manage users, teams, roles, agents, campaigns, and most settings. Cannot transfer ownership or manage billing.",
    priority: 80,
  },
  {
    name: "team_member",
    displayName: "Team Member",
    description:
      "Can create and manage agents, campaigns, and resources within their assigned teams.",
    priority: 40,
  },
  {
    name: "viewer",
    displayName: "Viewer",
    description:
      "Read-only access to agents, campaigns, analytics, and dashboards. Cannot create or modify resources.",
    priority: 10,
  },
];

// ════════════════════════════════════════════════════════════════════════════════
// Role Service
// ════════════════════════════════════════════════════════════════════════════════

export class RoleService {
  /**
   * Seed the 4 system roles into the database.
   * Skips any that already exist (by name + isSystemRole=true).
   */
  async seedSystemRoles(): Promise<void> {
    for (const roleSeed of SYSTEM_ROLES) {
      const existing = await db
        .select()
        .from(roles)
        .where(and(eq(roles.name, roleSeed.name), eq(roles.isSystemRole, true)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(roles).values({
          name: roleSeed.name,
          displayName: roleSeed.displayName,
          description: roleSeed.description,
          isSystemRole: true,
          priority: roleSeed.priority,
          organizationId: null, // System roles are org-agnostic
        });
        logger.info(
          `Seeded system role: ${roleSeed.displayName}`,
          undefined,
          "RBAC",
        );
      }
    }
    logger.info("System roles seed complete", undefined, "RBAC");
  }

  /**
   * Create a custom role for a specific organization.
   */
  async createRole(params: {
    organizationId: string;
    name: string;
    displayName: string;
    description?: string;
    priority?: number;
    permissionIds?: string[];
  }): Promise<Role> {
    const [role] = await db
      .insert(roles)
      .values({
        organizationId: params.organizationId,
        name: params.name,
        displayName: params.displayName,
        description: params.description ?? null,
        priority: params.priority ?? 0,
        isSystemRole: false,
      })
      .returning();

    // Attach permissions if provided
    if (params.permissionIds && params.permissionIds.length > 0) {
      await db.insert(rolePermissions).values(
        params.permissionIds.map((permId) => ({
          roleId: role.id,
          permissionId: permId,
        })),
      );
    }

    logger.info(
      `Created custom role "${role.displayName}" for org ${params.organizationId}`,
      undefined,
      "RBAC",
    );
    return role;
  }

  /**
   * Get a single role by ID.
   */
  async getRole(roleId: string): Promise<Role | null> {
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);
    return role ?? null;
  }

  /**
   * List all roles visible to an organization:
   * - All system roles (organizationId IS NULL, isSystemRole = true)
   * - Custom roles belonging to this organization
   */
  async listRoles(organizationId: string): Promise<Role[]> {
    const result = await db
      .select()
      .from(roles)
      .where(
        or(
          eq(roles.isSystemRole, true),
          eq(roles.organizationId, organizationId),
        ),
      )
      .orderBy(roles.priority);
    return result;
  }

  /**
   * Update a custom role. Prevents updating system roles.
   */
  async updateRole(
    roleId: string,
    updates: {
      name?: string;
      displayName?: string;
      description?: string;
      priority?: number;
      permissionIds?: string[];
    },
  ): Promise<Role | null> {
    // Fetch current role
    const existing = await this.getRole(roleId);
    if (!existing) return null;

    if (existing.isSystemRole) {
      throw new Error("Cannot modify system roles");
    }

    const [updated] = await db
      .update(roles)
      .set({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.displayName !== undefined && {
          displayName: updates.displayName,
        }),
        ...(updates.description !== undefined && {
          description: updates.description,
        }),
        ...(updates.priority !== undefined && { priority: updates.priority }),
        updatedAt: new Date(),
      })
      .where(eq(roles.id, roleId))
      .returning();

    // Replace permissions if provided
    if (updates.permissionIds !== undefined) {
      await db
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));
      if (updates.permissionIds.length > 0) {
        await db.insert(rolePermissions).values(
          updates.permissionIds.map((permId) => ({
            roleId,
            permissionId: permId,
          })),
        );
      }
    }

    logger.info(`Updated role "${updated.displayName}"`, undefined, "RBAC");
    return updated;
  }

  /**
   * Delete a custom role. Prevents deleting system roles.
   */
  async deleteRole(roleId: string): Promise<boolean> {
    const existing = await this.getRole(roleId);
    if (!existing) return false;

    if (existing.isSystemRole) {
      throw new Error("Cannot delete system roles");
    }

    await db.delete(roles).where(eq(roles.id, roleId));
    logger.info(
      `Deleted role "${existing.displayName}" (${roleId})`,
      undefined,
      "RBAC",
    );
    return true;
  }

  /**
   * Get permissions attached to a role.
   */
  async getRolePermissions(roleId: string): Promise<string[]> {
    const rows = await db
      .select({ permissionName: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((r) => r.permissionName);
  }

  /**
   * Get a system role by name.
   */
  async getSystemRoleByName(name: string): Promise<Role | null> {
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.name, name), eq(roles.isSystemRole, true)))
      .limit(1);
    return role ?? null;
  }
}

export const roleService = new RoleService();
