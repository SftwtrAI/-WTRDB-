"use strict";

import { db } from "../../../db";
import {
  userRoles,
  teamMembers,
} from "@wtrops/shared";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { teamService } from "./team.service";

// ════════════════════════════════════════════════════════════════════════════════
// Scope Service
//
// Determines which resources a user can see based on their team assignments
// and role scope. Org-wide roles (no scopeTeamId) see everything.
// Team-scoped roles only see resources owned by members of their teams
// (including descendant teams in the hierarchy).
// ════════════════════════════════════════════════════════════════════════════════

export type ResourceType = string;

export interface ScopeResult {
  /** If true, the user has org-wide access — no filtering needed. */
  isOrgWide: boolean;
  /** If not org-wide, this is the set of user IDs whose resources are visible. */
  visibleOwnerIds: string[];
  /** Team IDs the user can access (direct + descendants). */
  accessibleTeamIds: string[];
}

export class ScopeService {
  /**
   * Determine the scope for a user in an organization.
   *
   * - If the user has any role with scopeTeamId = NULL, they have org-wide access.
   * - Otherwise, collect all scopeTeamIds from their roles, expand to include
   *   descendant teams, and collect all member user IDs from those teams.
   */
  async getUserScope(userId: string, orgId: string): Promise<ScopeResult> {
    // Get all role assignments for this user in this org
    const roleAssignments = await db
      .select({
        roleId: userRoles.roleId,
        scopeTeamId: userRoles.scopeTeamId,
      })
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, userId), eq(userRoles.organizationId, orgId)),
      );

    if (roleAssignments.length === 0) {
      return { isOrgWide: false, visibleOwnerIds: [], accessibleTeamIds: [] };
    }

    // Check for org-wide access (any role with no team scope)
    const hasOrgWide = roleAssignments.some((r) => r.scopeTeamId === null);
    if (hasOrgWide) {
      return { isOrgWide: true, visibleOwnerIds: [], accessibleTeamIds: [] };
    }

    // Collect team IDs from scoped roles
    const scopedTeamIds = Array.from(
      new Set(
        roleAssignments
          .map((r) => r.scopeTeamId)
          .filter((id): id is string => id !== null),
      ),
    );

    // Expand to include all descendant teams
    const allTeamIds = new Set<string>(scopedTeamIds);
    for (const teamId of scopedTeamIds) {
      const descendants = await teamService.getDescendantIds(teamId);
      for (const d of descendants) {
        allTeamIds.add(d);
      }
    }

    const accessibleTeamIds = Array.from(allTeamIds);

    // Get all user IDs who are members of those teams
    if (accessibleTeamIds.length === 0) {
      return {
        isOrgWide: false,
        visibleOwnerIds: [userId], // At minimum, the user can see their own resources
        accessibleTeamIds: [],
      };
    }

    const memberRows = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, accessibleTeamIds));

    const visibleOwnerIds = Array.from(
      new Set([userId, ...memberRows.map((r) => r.userId)]),
    );

    return { isOrgWide: false, visibleOwnerIds, accessibleTeamIds };
  }

  /**
   * Get scoped resources of a given type for a user in an org.
   *
   * Returns the actual resource records filtered by the user's team scope.
   * For org-wide users, returns all resources in the org (by userId of org members).
   */
  async getScopedResources(
    userId: string,
    orgId: string,
    resourceType: ResourceType,
  ): Promise<any[]> {
    // Original resource tables (agents, campaigns, claws) were removed during
    // the wtrdb extraction.  This method is retained for API compatibility but
    // always returns an empty array until new resource tables are registered.
    const scope = await this.getUserScope(userId, orgId);

    const tableMap: Record<string, any> = {
      // Register future resource tables here
    };

    const table = tableMap[resourceType];
    if (!table) {
      return [];
    }

    if (scope.isOrgWide) {
      return db.select().from(table);
    }

    if (scope.visibleOwnerIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(table)
      .where(inArray(table.userId, scope.visibleOwnerIds));
  }
}

export const scopeService = new ScopeService();
