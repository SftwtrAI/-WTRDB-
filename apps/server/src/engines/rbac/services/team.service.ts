"use strict";

import { db } from "../../../db";
import {
  teams,
  teamMembers,
  type Team,
  type TeamMember,
} from "@wtrops/shared";
import { eq, and } from "drizzle-orm";
import { logger } from "../../../utils/logger";

// ════════════════════════════════════════════════════════════════════════════════
// Team Service — CRUD + Hierarchy
// ════════════════════════════════════════════════════════════════════════════════

export interface TeamWithChildren extends Team {
  children?: TeamWithChildren[];
}

export class TeamService {
  /**
   * Create a new team.
   */
  async createTeam(params: {
    organizationId: string;
    name: string;
    description?: string;
    parentTeamId?: string;
    createdBy: string;
  }): Promise<Team> {
    // If parentTeamId specified, verify it exists and belongs to same org
    if (params.parentTeamId) {
      const parent = await this.getTeam(params.parentTeamId);
      if (!parent || parent.organizationId !== params.organizationId) {
        throw new Error("Parent team not found or belongs to a different organization");
      }
    }

    const [team] = await db
      .insert(teams)
      .values({
        organizationId: params.organizationId,
        name: params.name,
        description: params.description ?? null,
        parentTeamId: params.parentTeamId ?? null,
        createdBy: params.createdBy,
      })
      .returning();

    logger.info(
      `Created team "${team.name}" in org ${params.organizationId}`,
      undefined,
      "RBAC",
    );
    return team;
  }

  /**
   * Get a single team by ID.
   */
  async getTeam(teamId: string): Promise<Team | null> {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    return team ?? null;
  }

  /**
   * List all teams in an organization as a flat list.
   */
  async listTeams(organizationId: string): Promise<Team[]> {
    return db
      .select()
      .from(teams)
      .where(eq(teams.organizationId, organizationId))
      .orderBy(teams.name);
  }

  /**
   * List teams as a tree structure.
   * Returns top-level teams (parentTeamId IS NULL) with nested children.
   */
  async listTeamsTree(organizationId: string): Promise<TeamWithChildren[]> {
    const allTeams = await this.listTeams(organizationId);
    return this.buildTree(allTeams);
  }

  /**
   * Update a team.
   */
  async updateTeam(
    teamId: string,
    updates: {
      name?: string;
      description?: string;
      parentTeamId?: string | null;
    },
  ): Promise<Team | null> {
    const existing = await this.getTeam(teamId);
    if (!existing) return null;

    // Prevent circular parent reference
    if (updates.parentTeamId !== undefined) {
      if (updates.parentTeamId === teamId) {
        throw new Error("A team cannot be its own parent");
      }
      if (updates.parentTeamId !== null) {
        // Verify proposed parent is not a descendant of this team
        const descendants = await this.getDescendantIds(teamId);
        if (descendants.includes(updates.parentTeamId)) {
          throw new Error("Cannot set parent to a descendant team (circular reference)");
        }
      }
    }

    const [updated] = await db
      .update(teams)
      .set({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.description !== undefined && {
          description: updates.description,
        }),
        ...(updates.parentTeamId !== undefined && {
          parentTeamId: updates.parentTeamId,
        }),
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId))
      .returning();

    logger.info(`Updated team "${updated.name}" (${teamId})`, undefined, "RBAC");
    return updated;
  }

  /**
   * Delete a team. Also cascades to teamMembers via FK.
   */
  async deleteTeam(teamId: string): Promise<boolean> {
    const existing = await this.getTeam(teamId);
    if (!existing) return false;

    // Re-parent children to this team's parent (or null)
    await db
      .update(teams)
      .set({ parentTeamId: existing.parentTeamId })
      .where(eq(teams.parentTeamId, teamId));

    await db.delete(teams).where(eq(teams.id, teamId));
    logger.info(
      `Deleted team "${existing.name}" (${teamId})`,
      undefined,
      "RBAC",
    );
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Members
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Add a member to a team.
   */
  async addMember(params: {
    teamId: string;
    userId: string;
    role?: string;
    addedBy: string;
  }): Promise<TeamMember> {
    // Check for existing membership
    const existing = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, params.teamId),
          eq(teamMembers.userId, params.userId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error("User is already a member of this team");
    }

    const [member] = await db
      .insert(teamMembers)
      .values({
        teamId: params.teamId,
        userId: params.userId,
        role: params.role ?? "member",
        addedBy: params.addedBy,
      })
      .returning();

    logger.info(
      `Added user ${params.userId} to team ${params.teamId}`,
      undefined,
      "RBAC",
    );
    return member;
  }

  /**
   * Remove a member from a team.
   */
  async removeMember(teamId: string, userId: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
        ),
      )
      .limit(1);

    if (existing.length === 0) return false;

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
        ),
      );

    logger.info(
      `Removed user ${userId} from team ${teamId}`,
      undefined,
      "RBAC",
    );
    return true;
  }

  /**
   * List members of a team.
   */
  async listMembers(teamId: string): Promise<TeamMember[]> {
    return db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(teamMembers.createdAt);
  }

  /**
   * Get all team IDs a user belongs to (direct memberships only).
   */
  async getUserTeamIds(userId: string): Promise<string[]> {
    const rows = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    return rows.map((r) => r.teamId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Hierarchy helpers
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Get all ancestor team IDs for a given team (walking up parentTeamId).
   * Useful for scope checking — if a user has access to a parent team,
   * they implicitly have access to all descendant teams.
   */
  async getTeamHierarchy(teamId: string): Promise<string[]> {
    const ancestors: string[] = [];
    let currentId: string | null = teamId;

    // Safety: prevent infinite loops from bad data
    const maxDepth = 20;
    let depth = 0;

    while (currentId && depth < maxDepth) {
      const [team] = await db
        .select({ id: teams.id, parentTeamId: teams.parentTeamId })
        .from(teams)
        .where(eq(teams.id, currentId))
        .limit(1);

      if (!team) break;
      ancestors.push(team.id);
      currentId = team.parentTeamId;
      depth++;
    }

    return ancestors;
  }

  /**
   * Get all descendant team IDs (children, grandchildren, etc.).
   */
  async getDescendantIds(teamId: string): Promise<string[]> {
    const orgTeam = await this.getTeam(teamId);
    if (!orgTeam) return [];

    const allTeams = await this.listTeams(orgTeam.organizationId);
    const descendants: string[] = [];
    const queue = [teamId];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const t of allTeams) {
        if (t.parentTeamId === parentId && !descendants.includes(t.id)) {
          descendants.push(t.id);
          queue.push(t.id);
        }
      }
    }

    return descendants;
  }

  /**
   * Build a tree structure from a flat list of teams.
   */
  private buildTree(allTeams: Team[]): TeamWithChildren[] {
    const teamMap = new Map<string, TeamWithChildren>();
    for (const t of allTeams) {
      teamMap.set(t.id, { ...t, children: [] });
    }

    const roots: TeamWithChildren[] = [];

    for (const t of allTeams) {
      const node = teamMap.get(t.id)!;
      if (t.parentTeamId && teamMap.has(t.parentTeamId)) {
        teamMap.get(t.parentTeamId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}

export const teamService = new TeamService();
