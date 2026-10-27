"use strict";

/**
 * RBAC Engine
 *
 * Enterprise Role-Based Access Control for Wtrops.ai.
 * Manages roles, permissions, teams, scoping, and audit.
 *
 * Entry point: call initRbacEngine() during server startup
 * to seed system roles and permissions.
 */

import { roleService } from "./services/role.service";
import { permissionService } from "./services/permission.service";
import { logger } from "../../utils/logger";

/**
 * Initialize the RBAC engine.
 * Seeds system roles and permissions on first run.
 */
export async function initRbacEngine(): Promise<void> {
  logger.info("Initializing RBAC engine...", undefined, "RBAC");

  // Seed system roles first (permissions reference roles)
  await roleService.seedSystemRoles();

  // Seed all permissions and attach to system roles
  await permissionService.seedPermissions();

  logger.info("RBAC engine initialized", undefined, "RBAC");
}

// Re-export services
export { roleService, RoleService, SYSTEM_ROLES } from "./services/role.service";
export {
  permissionService,
  PermissionService,
  ALL_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
} from "./services/permission.service";
export {
  teamService,
  TeamService,
  type TeamWithChildren,
} from "./services/team.service";
export {
  scopeService,
  ScopeService,
  type ResourceType,
  type ScopeResult,
} from "./services/scope.service";
