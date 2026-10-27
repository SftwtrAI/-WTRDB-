/**
 * Team Management Plugin Adapter
 *
 * Provides optional dynamic loading of the Team Management plugin.
 * Returns no-op stubs when the plugin is not installed, allowing
 * the core application to function without the plugin.
 *
 * Uses async dynamic import() for ES module compatibility.
 * Supports both .ts (development) and .js (production) files.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { Request, Response, NextFunction } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "plugins",
  "team-management",
);

export interface TeamMemberContext {
  memberId: string;
  teamId: string;
  userId: string | number;
  roleId: string;
  roleName?: string;
  permissions: any;
  isAdminTeam?: boolean;
}

export interface AdminTeamMemberContext extends TeamMemberContext {
  isAdminTeam: boolean;
  adminId: string;
}

let pluginAvailable: boolean | null = null;
let cachedServices: {
  TeamAuthService?: any;
  AdminTeamService?: any;
  TeamService?: any;
  applyTeamContext?: any;
} = {};
let loadAttempted = false;

function isPluginInstalled(): boolean {
  if (pluginAvailable === null) {
    try {
      pluginAvailable =
        fs.existsSync(PLUGIN_DIR) &&
        fs.existsSync(path.join(PLUGIN_DIR, "services"));
    } catch {
      pluginAvailable = false;
    }
  }
  return pluginAvailable;
}

function resolveModulePath(basePath: string): string | null {
  const extensions = [".ts", ".js", ".mjs"];

  for (const ext of extensions) {
    const fullPath = basePath + ext;
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  if (fs.existsSync(basePath)) {
    return basePath;
  }

  return null;
}

async function dynamicImport(basePath: string): Promise<any> {
  const resolvedPath = resolveModulePath(basePath);

  if (!resolvedPath) {
    throw new Error(`Module not found: ${basePath}`);
  }

  const fileUrl = pathToFileURL(resolvedPath).href;
  return import(fileUrl);
}

async function loadServices(): Promise<boolean> {
  if (!isPluginInstalled()) {
    return false;
  }

  try {
    const teamAuthBase = path.join(PLUGIN_DIR, "services", "team-auth.service");
    const adminTeamBase = path.join(
      PLUGIN_DIR,
      "services",
      "admin-team.service",
    );
    const teamBase = path.join(PLUGIN_DIR, "services", "team.service");

    const results = await Promise.allSettled([
      dynamicImport(teamAuthBase),
      dynamicImport(adminTeamBase),
      dynamicImport(teamBase),
    ]);

    if (results[0].status === "fulfilled") {
      cachedServices.TeamAuthService = results[0].value.TeamAuthService;
    }
    if (results[1].status === "fulfilled") {
      cachedServices.AdminTeamService = results[1].value.AdminTeamService;
    }
    if (results[2].status === "fulfilled") {
      cachedServices.TeamService = results[2].value.TeamService;
    }

    const anyLoaded = results.some((r) => r.status === "fulfilled");
    if (anyLoaded) {
      console.log("[TeamManagementAdapter] Services loaded successfully");
    }

    return anyLoaded;
  } catch (error) {
    console.warn("[TeamManagementAdapter] Failed to load services:", error);
    return false;
  }
}

async function loadMiddleware(): Promise<boolean> {
  if (!isPluginInstalled()) {
    return false;
  }

  try {
    const middlewareBase = path.join(
      PLUGIN_DIR,
      "middleware",
      "team-auth.middleware",
    );
    const module = await dynamicImport(middlewareBase);
    cachedServices.applyTeamContext = module.applyTeamContext;
    console.log("[TeamManagementAdapter] Middleware loaded successfully");
    return true;
  } catch (error) {
    console.warn("[TeamManagementAdapter] Failed to load middleware:", error);
    return false;
  }
}

export async function initializeAdapter(): Promise<void> {
  if (loadAttempted && Object.keys(cachedServices).length > 0) {
    return;
  }

  loadAttempted = true;
  await Promise.all([loadServices(), loadMiddleware()]);
}

export function getTeamAuthService(): any | null {
  return cachedServices.TeamAuthService || null;
}

export function getAdminTeamService(): any | null {
  return cachedServices.AdminTeamService || null;
}

export function getTeamService(): any | null {
  return cachedServices.TeamService || null;
}

export function getApplyTeamContext(): any | null {
  return cachedServices.applyTeamContext || null;
}

export function getTeamContextMiddleware(): (
  req: Request,
  res: Response,
  next: NextFunction,
) => void {
  const applyTeamContext = getApplyTeamContext();

  if (applyTeamContext) {
    return applyTeamContext() as unknown as (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => void;
  }

  return (_req: Request, _res: Response, next: NextFunction) => {
    next();
  };
}

export async function validateUserTeamSession(
  token: string,
): Promise<TeamMemberContext | null> {
  if (!cachedServices.TeamAuthService && !loadAttempted) {
    await loadServices();
  }

  const TeamAuthService = getTeamAuthService();

  if (!TeamAuthService) {
    return null;
  }

  try {
    return await TeamAuthService.validateSession(token);
  } catch (error) {
    console.error(
      "[TeamManagementAdapter] User team session validation error:",
      error,
    );
    return null;
  }
}

export async function validateAdminTeamSession(
  token: string,
): Promise<AdminTeamMemberContext | null> {
  if (!cachedServices.AdminTeamService && !loadAttempted) {
    await loadServices();
  }

  const AdminTeamService = getAdminTeamService();

  if (!AdminTeamService) {
    return null;
  }

  try {
    const session = await AdminTeamService.validateSession(token);

    if (!session) {
      return null;
    }

    return {
      memberId: session.memberId,
      teamId: session.teamId,
      userId: session.adminId,
      roleId: session.roleId,
      roleName: session.roleName,
      permissions: session.permissions,
      isAdminTeam: true,
      adminId: session.adminId,
    };
  } catch (error) {
    console.error(
      "[TeamManagementAdapter] Admin team session validation error:",
      error,
    );
    return null;
  }
}

export function isTeamManagementInstalled(): boolean {
  return isPluginInstalled();
}

export function clearCache(): void {
  pluginAvailable = null;
  cachedServices = {};
  loadAttempted = false;
}
