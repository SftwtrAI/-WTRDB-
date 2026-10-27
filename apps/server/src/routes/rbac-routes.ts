"use strict";

import { Router, Response } from "express";
import { RouteContext, AuthRequest } from "./common";
import { db } from "../db";
import {
  teams,
  teamMembers,
  roles,
  permissions,
  rolePermissions,
  userRoles,
  rbacAuditEvents,
  organizationMembers,
} from "@wtrops/shared";
import { eq, and, desc } from "drizzle-orm";
import {
  requirePermission,
  resolveRbacContext,
  type RbacRequest,
} from "../middleware/rbac.middleware";
import { roleService } from "../engines/rbac/services/role.service";
import { permissionService } from "../engines/rbac/services/permission.service";
import { teamService } from "../engines/rbac/services/team.service";
import { auditRbac } from "../services/compliance-audit-bridge";

// ════════════════════════════════════════════════════════════════════════════════
// RBAC Routes Factory
// ════════════════════════════════════════════════════════════════════════════════

export function createRbacRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { authenticateToken } = ctx;

  // ══════════════════════════════════════════════════════════════════════════
  // Teams CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/rbac/teams — List all teams (tree structure)
   */
  router.get(
    "/api/rbac/teams",
    authenticateToken,
    requirePermission("teams.read"),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId!;
        const tree = req.query.tree === "true";

        if (tree) {
          const result = await teamService.listTeamsTree(orgId);
          res.json(result);
        } else {
          const result = await teamService.listTeams(orgId);
          res.json(result);
        }
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * GET /api/rbac/teams/:teamId — Get a single team
   */
  router.get(
    "/api/rbac/teams/:teamId",
    authenticateToken,
    requirePermission("teams.read"),
    async (req: RbacRequest, res: Response) => {
      try {
        const team = await teamService.getTeam(req.params.teamId);
        if (!team) {
          res.status(404).json({ error: "Team not found" });
          return;
        }
        res.json(team);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * POST /api/rbac/teams — Create a team
   */
  router.post(
    "/api/rbac/teams",
    authenticateToken,
    requirePermission("teams.create"),
    async (req: RbacRequest, res: Response) => {
      try {
        const { name, description, parentTeamId } = req.body;
        if (!name) {
          res.status(400).json({ error: "name is required" });
          return;
        }

        const team = await teamService.createTeam({
          organizationId: req.organizationId!,
          name,
          description,
          parentTeamId,
          createdBy: req.userId!,
        });

        // Audit
        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          eventType: "team_created",
          eventData: { teamId: team.id, name },
        });
        auditRbac(req.organizationId!, req.userId!, "team.created", { teamId: team.id, teamName: name });

        res.status(201).json(team);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  /**
   * PUT /api/rbac/teams/:teamId — Update a team
   */
  router.put(
    "/api/rbac/teams/:teamId",
    authenticateToken,
    requirePermission("teams.update"),
    async (req: RbacRequest, res: Response) => {
      try {
        const { name, description, parentTeamId } = req.body;
        const updated = await teamService.updateTeam(req.params.teamId, {
          name,
          description,
          parentTeamId,
        });

        if (!updated) {
          res.status(404).json({ error: "Team not found" });
          return;
        }

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          eventType: "team_updated",
          eventData: { teamId: updated.id, changes: req.body },
        });

        res.json(updated);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  /**
   * DELETE /api/rbac/teams/:teamId — Delete a team
   */
  router.delete(
    "/api/rbac/teams/:teamId",
    authenticateToken,
    requirePermission("teams.delete"),
    async (req: RbacRequest, res: Response) => {
      try {
        const deleted = await teamService.deleteTeam(req.params.teamId);
        if (!deleted) {
          res.status(404).json({ error: "Team not found" });
          return;
        }

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          eventType: "team_deleted",
          eventData: { teamId: req.params.teamId },
        });

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Team Members
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/rbac/teams/:teamId/members — List team members
   */
  router.get(
    "/api/rbac/teams/:teamId/members",
    authenticateToken,
    requirePermission("teams.read"),
    async (req: RbacRequest, res: Response) => {
      try {
        const members = await teamService.listMembers(req.params.teamId);
        res.json(members);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * POST /api/rbac/teams/:teamId/members — Add member to team
   */
  router.post(
    "/api/rbac/teams/:teamId/members",
    authenticateToken,
    requirePermission("teams.manage_members"),
    async (req: RbacRequest, res: Response) => {
      try {
        const { userId, role } = req.body;
        if (!userId) {
          res.status(400).json({ error: "userId is required" });
          return;
        }

        const member = await teamService.addMember({
          teamId: req.params.teamId,
          userId,
          role,
          addedBy: req.userId!,
        });

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          targetUserId: userId,
          eventType: "member_added_to_team",
          eventData: { teamId: req.params.teamId, role: role ?? "member" },
        });
        auditRbac(req.organizationId!, req.userId!, "team.member_added", { teamId: req.params.teamId, memberId: userId });

        res.status(201).json(member);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  /**
   * DELETE /api/rbac/teams/:teamId/members/:userId — Remove member from team
   */
  router.delete(
    "/api/rbac/teams/:teamId/members/:userId",
    authenticateToken,
    requirePermission("teams.manage_members"),
    async (req: RbacRequest, res: Response) => {
      try {
        const removed = await teamService.removeMember(
          req.params.teamId,
          req.params.userId,
        );
        if (!removed) {
          res.status(404).json({ error: "Member not found in team" });
          return;
        }

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          targetUserId: req.params.userId,
          eventType: "member_removed_from_team",
          eventData: { teamId: req.params.teamId },
        });
        auditRbac(req.organizationId!, req.userId!, "team.member_removed", { teamId: req.params.teamId, memberId: req.params.userId });

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Roles CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/rbac/roles — List roles (system + custom for org)
   */
  router.get(
    "/api/rbac/roles",
    authenticateToken,
    requirePermission("rbac.view_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const result = await roleService.listRoles(req.organizationId!);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * GET /api/rbac/roles/:roleId — Get a single role with its permissions
   */
  router.get(
    "/api/rbac/roles/:roleId",
    authenticateToken,
    requirePermission("rbac.view_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const role = await roleService.getRole(req.params.roleId);
        if (!role) {
          res.status(404).json({ error: "Role not found" });
          return;
        }

        const perms = await roleService.getRolePermissions(req.params.roleId);
        res.json({ ...role, permissions: perms });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * POST /api/rbac/roles — Create a custom role
   */
  router.post(
    "/api/rbac/roles",
    authenticateToken,
    requirePermission("rbac.manage_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const { name, displayName, description, priority, permissionIds } =
          req.body;

        if (!name || !displayName) {
          res
            .status(400)
            .json({ error: "name and displayName are required" });
          return;
        }

        const role = await roleService.createRole({
          organizationId: req.organizationId!,
          name,
          displayName,
          description,
          priority,
          permissionIds,
        });

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          eventType: "role_created",
          eventData: { roleId: role.id, name, displayName },
        });
        auditRbac(req.organizationId!, req.userId!, "role.created", { roleId: role.id, roleName: displayName });

        res.status(201).json(role);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  /**
   * PUT /api/rbac/roles/:roleId — Update a custom role
   */
  router.put(
    "/api/rbac/roles/:roleId",
    authenticateToken,
    requirePermission("rbac.manage_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const { name, displayName, description, priority, permissionIds } =
          req.body;

        const updated = await roleService.updateRole(req.params.roleId, {
          name,
          displayName,
          description,
          priority,
          permissionIds,
        });

        if (!updated) {
          res.status(404).json({ error: "Role not found" });
          return;
        }

        // Invalidate permission caches for this org since a role changed
        await permissionService.invalidateOrgCache(req.organizationId!);

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          eventType: "role_updated",
          eventData: { roleId: req.params.roleId, changes: req.body },
        });
        auditRbac(req.organizationId!, req.userId!, "role.updated", { roleId: req.params.roleId });

        res.json(updated);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  /**
   * DELETE /api/rbac/roles/:roleId — Delete a custom role
   */
  router.delete(
    "/api/rbac/roles/:roleId",
    authenticateToken,
    requirePermission("rbac.manage_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const deleted = await roleService.deleteRole(req.params.roleId);
        if (!deleted) {
          res.status(404).json({ error: "Role not found" });
          return;
        }

        await permissionService.invalidateOrgCache(req.organizationId!);

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          eventType: "role_deleted",
          eventData: { roleId: req.params.roleId },
        });
        auditRbac(req.organizationId!, req.userId!, "role.deleted", { roleId: req.params.roleId });

        res.json({ success: true });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // User Role Assignments
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/rbac/user-roles — List role assignments for the org
   */
  router.get(
    "/api/rbac/user-roles",
    authenticateToken,
    requirePermission("rbac.view_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId!;
        const result = await db
          .select()
          .from(userRoles)
          .where(eq(userRoles.organizationId, orgId))
          .orderBy(userRoles.createdAt);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * POST /api/rbac/user-roles — Assign a role to a user (with optional team scope)
   */
  router.post(
    "/api/rbac/user-roles",
    authenticateToken,
    requirePermission("rbac.assign_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const { userId, roleId, scopeTeamId } = req.body;
        if (!userId || !roleId) {
          res
            .status(400)
            .json({ error: "userId and roleId are required" });
          return;
        }

        // Verify the role exists and is accessible
        const role = await roleService.getRole(roleId);
        if (!role) {
          res.status(404).json({ error: "Role not found" });
          return;
        }

        // Verify target user is a member of the org
        const [orgMember] = await db
          .select()
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, req.organizationId!),
              eq(organizationMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!orgMember) {
          res.status(400).json({
            error: "Target user is not a member of this organization",
          });
          return;
        }

        // Prevent assigning a role with higher priority than the assigner's highest role
        if (!req.userRole || req.userRole !== "admin") {
          const assignerRoles = await db
            .select({ roleId: userRoles.roleId })
            .from(userRoles)
            .where(
              and(
                eq(userRoles.userId, req.userId!),
                eq(userRoles.organizationId, req.organizationId!),
              ),
            );

          if (assignerRoles.length > 0) {
            const assignerRoleDetails = await db
              .select({ priority: roles.priority })
              .from(roles)
              .where(
                eq(
                  roles.id,
                  assignerRoles.reduce(
                    (_, r) => r.roleId,
                    assignerRoles[0].roleId,
                  ),
                ),
              );

            const maxPriority = Math.max(
              ...assignerRoleDetails.map((r) => r.priority),
              0,
            );

            if (role.priority > maxPriority) {
              res.status(403).json({
                error:
                  "Cannot assign a role with higher priority than your own",
              });
              return;
            }
          }
        }

        const [assignment] = await db
          .insert(userRoles)
          .values({
            userId,
            organizationId: req.organizationId!,
            roleId,
            scopeTeamId: scopeTeamId ?? null,
            assignedBy: req.userId!,
          })
          .returning();

        // Invalidate cached permissions for the target user
        await permissionService.invalidateCache(userId, req.organizationId!);

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          targetUserId: userId,
          eventType: "role_assigned",
          eventData: {
            roleId,
            roleName: role.displayName,
            scopeTeamId: scopeTeamId ?? null,
          },
        });
        auditRbac(req.organizationId!, req.userId!, "role.assigned", { targetUserId: userId, roleId });

        res.status(201).json(assignment);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  /**
   * DELETE /api/rbac/user-roles/:assignmentId — Remove a role assignment
   */
  router.delete(
    "/api/rbac/user-roles/:assignmentId",
    authenticateToken,
    requirePermission("rbac.assign_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const [existing] = await db
          .select()
          .from(userRoles)
          .where(eq(userRoles.id, req.params.assignmentId))
          .limit(1);

        if (!existing) {
          res.status(404).json({ error: "Role assignment not found" });
          return;
        }

        await db
          .delete(userRoles)
          .where(eq(userRoles.id, req.params.assignmentId));

        // Invalidate cached permissions
        await permissionService.invalidateCache(
          existing.userId,
          existing.organizationId,
        );

        await db.insert(rbacAuditEvents).values({
          organizationId: req.organizationId!,
          actorUserId: req.userId!,
          targetUserId: existing.userId,
          eventType: "role_unassigned",
          eventData: {
            roleId: existing.roleId,
            assignmentId: req.params.assignmentId,
          },
        });
        auditRbac(req.organizationId!, req.userId!, "role.revoked", { targetUserId: existing.userId, roleId: existing.roleId });

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Permissions
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/rbac/permissions — List all available permissions
   */
  router.get(
    "/api/rbac/permissions",
    authenticateToken,
    requirePermission("rbac.view_roles"),
    async (req: RbacRequest, res: Response) => {
      try {
        const category = req.query.category as string | undefined;
        const result = await permissionService.listPermissions(category);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * GET /api/rbac/permissions/check — Check if the current user has a permission
   */
  router.get(
    "/api/rbac/permissions/check",
    authenticateToken,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        const permission = req.query.permission as string;
        if (!permission) {
          res.status(400).json({ error: "permission query param required" });
          return;
        }

        if (!req.organizationId) {
          res.json({ hasPermission: false, reason: "no_org_context" });
          return;
        }

        const has = await permissionService.checkPermission(
          req.userId!,
          req.organizationId,
          permission,
        );

        res.json({ hasPermission: has, permission });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  /**
   * GET /api/rbac/permissions/mine — Get all permissions for the current user
   */
  router.get(
    "/api/rbac/permissions/mine",
    authenticateToken,
    resolveRbacContext(),
    async (req: RbacRequest, res: Response) => {
      try {
        res.json({
          permissions: req.userPermissions ?? [],
          organizationId: req.organizationId,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RBAC Audit
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/rbac/audit — Query RBAC audit events
   */
  router.get(
    "/api/rbac/audit",
    authenticateToken,
    requirePermission("rbac.view_audit"),
    async (req: RbacRequest, res: Response) => {
      try {
        const orgId = req.organizationId!;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await db
          .select()
          .from(rbacAuditEvents)
          .where(eq(rbacAuditEvents.organizationId, orgId))
          .orderBy(desc(rbacAuditEvents.timestamp))
          .limit(limit)
          .offset(offset);

        res.json({ events: result, limit, offset });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  return router;
}
