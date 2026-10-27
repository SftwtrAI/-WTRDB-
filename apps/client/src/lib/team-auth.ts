/**
 * Team Member Authentication Utilities
 * Handles JWT-based authentication for team members
 */

const STORAGE_KEYS = {
  TEAM_TOKEN: "team_member_token",
  TEAM_MEMBER_DATA: "team_member_data",
  TEAM_DATA: "team_data",
  TEAM_PERMISSIONS: "team_permissions",
} as const;

export interface TeamMemberData {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: {
    id: string;
    name: string;
  };
}

export interface TeamData {
  id: string;
  name: string;
  type: "user" | "admin";
  parentUserId?: string;
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`[TeamAuth] Failed to get item "${key}":`, error);
    return null;
  }
}

function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`[TeamAuth] Failed to set item "${key}":`, error);
    return false;
  }
}

function safeRemoveItem(key: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[TeamAuth] Failed to remove item "${key}":`, error);
    return false;
  }
}

export const TeamAuth = {
  getToken(): string | null {
    return safeGetItem(STORAGE_KEYS.TEAM_TOKEN);
  },

  setToken(token: string): boolean {
    return safeSetItem(STORAGE_KEYS.TEAM_TOKEN, token);
  },

  removeToken(): boolean {
    return safeRemoveItem(STORAGE_KEYS.TEAM_TOKEN);
  },

  isAuthenticated(): boolean {
    const token = this.getToken();
    return token !== null && token.length > 0;
  },

  getMember(): TeamMemberData | null {
    const data = safeGetItem(STORAGE_KEYS.TEAM_MEMBER_DATA);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  setMember(member: TeamMemberData): boolean {
    try {
      return safeSetItem(STORAGE_KEYS.TEAM_MEMBER_DATA, JSON.stringify(member));
    } catch {
      return false;
    }
  },

  getTeam(): TeamData | null {
    const data = safeGetItem(STORAGE_KEYS.TEAM_DATA);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  setTeam(team: TeamData): boolean {
    try {
      return safeSetItem(STORAGE_KEYS.TEAM_DATA, JSON.stringify(team));
    } catch {
      return false;
    }
  },

  getAuthHeader(): string | null {
    const token = this.getToken();
    return token ? `Bearer ${token}` : null;
  },

  getPermissions(): Record<string, Record<string, boolean>> | null {
    const data = safeGetItem(STORAGE_KEYS.TEAM_PERMISSIONS);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  setPermissions(
    permissions: Record<string, Record<string, boolean>>,
  ): boolean {
    try {
      return safeSetItem(
        STORAGE_KEYS.TEAM_PERMISSIONS,
        JSON.stringify(permissions),
      );
    } catch {
      return false;
    }
  },

  hasPermission(section: string, subsection?: string): boolean {
    const permissions = this.getPermissions();
    if (!permissions) return false;
    if (!permissions[section]) return false;
    if (subsection) {
      return permissions[section][subsection] === true;
    }
    return Object.values(permissions[section]).some((v) => v === true);
  },

  getTeamType(): "user" | "admin" | null {
    const team = this.getTeam();
    return team?.type || null;
  },

  isAdminTeamMember(): boolean {
    return this.getTeamType() === "admin";
  },

  async validateSession(): Promise<{
    valid: boolean;
    member?: TeamMemberData;
    team?: TeamData;
    permissions?: any;
  }> {
    const token = this.getToken();
    if (!token) {
      return { valid: false };
    }

    const team = this.getTeam();
    const isAdminTeam = team?.type === "admin";
    const endpoint = isAdminTeam
      ? "/api/admin/team/auth/me"
      : "/api/team/auth/me";

    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        this.clearAuth();
        return { valid: false };
      }

      const data = await response.json();

      if (data.member) {
        this.setMember(data.member);
      }
      if (data.team) {
        this.setTeam(data.team);
      }
      if (data.permissions) {
        this.setPermissions(data.permissions);
      }

      return {
        valid: true,
        member: data.member,
        team: data.team,
        permissions: data.permissions,
      };
    } catch (error) {
      console.error("[TeamAuth] Session validation failed:", error);
      return { valid: false };
    }
  },

  clearAuth(): boolean {
    const tokenRemoved = this.removeToken();
    safeRemoveItem(STORAGE_KEYS.TEAM_MEMBER_DATA);
    safeRemoveItem(STORAGE_KEYS.TEAM_DATA);
    safeRemoveItem(STORAGE_KEYS.TEAM_PERMISSIONS);
    return tokenRemoved;
  },
};

export default TeamAuth;
