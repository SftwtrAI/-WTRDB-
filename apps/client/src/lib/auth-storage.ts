/**
 * Centralized authentication storage module for CodeCanyon compliance.
 * Provides a consistent interface for managing auth tokens and user data.
 * All localStorage access for authentication is routed through this module.
 */

const STORAGE_KEYS = {
  AUTH_TOKEN: "auth_token",
  TOKEN_EXPIRY: "token_expiry",
  LAST_ACTIVITY: "last_activity",
  USER: "user",
  // Team member storage keys - must match TeamAuth module exactly
  TEAM_TOKEN: "team_member_token", // Single token for both user and admin team members
  TEAM_MEMBER: "team_member_data",
  TEAM_DATA: "team_data",
  TEAM_PERMISSIONS: "team_permissions", // Match TeamAuth's permissions key
} as const;

// Note: Refresh tokens are now stored in HttpOnly cookies (set by the server)
// This prevents XSS attacks from stealing refresh tokens

const ACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface StoredUser {
  id: number;
  email: string;
  name: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Safely access localStorage with error handling.
 * Returns null if localStorage is not available or an error occurs.
 */
function safeGetItem(key: string): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`[AuthStorage] Failed to get item "${key}":`, error);
    return null;
  }
}

/**
 * Safely set an item in localStorage with error handling.
 * @returns true if successful, false otherwise.
 */
function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`[AuthStorage] Failed to set item "${key}":`, error);
    return false;
  }
}

/**
 * Safely remove an item from localStorage with error handling.
 * @returns true if successful, false otherwise.
 */
function safeRemoveItem(key: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[AuthStorage] Failed to remove item "${key}":`, error);
    return false;
  }
}

/**
 * AuthStorage provides a centralized interface for managing authentication tokens
 * and related user data in localStorage.
 */
export const AuthStorage = {
  /**
   * Retrieves the stored authentication token.
   * @returns The auth token if present, or null if not found or on error.
   */
  getToken(): string | null {
    return safeGetItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  /**
   * Stores the authentication token.
   * @param token - The JWT or auth token to store.
   * @returns true if storage was successful, false otherwise.
   */
  setToken(token: string): boolean {
    return safeSetItem(STORAGE_KEYS.AUTH_TOKEN, token);
  },

  /**
   * Removes the stored authentication token.
   * @returns true if removal was successful, false otherwise.
   */
  removeToken(): boolean {
    return safeRemoveItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  /**
   * Checks if a valid authentication token exists (regular user or team member).
   * @returns true if a token is present, false otherwise.
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    const teamToken = this.getTeamToken();
    return (
      (token !== null && token.length > 0) ||
      (teamToken !== null && teamToken.length > 0)
    );
  },

  /**
   * Checks if current user is a team member (not a regular user).
   * TeamAuth uses a single token key for both user and admin team members.
   * The team type is determined by the team_data.type field, not separate tokens.
   * @returns true if logged in as a team member.
   */
  isTeamMember(): boolean {
    const teamToken = this.getTeamToken();
    return teamToken !== null && teamToken.length > 0;
  },

  /**
   * Gets the team member token (shared by both user and admin team members).
   * @returns The team token if present, or null.
   */
  getTeamToken(): string | null {
    return safeGetItem(STORAGE_KEYS.TEAM_TOKEN);
  },

  /**
   * Sets the team member token.
   * @param token - The team member session token.
   */
  setTeamToken(token: string): boolean {
    return safeSetItem(STORAGE_KEYS.TEAM_TOKEN, token);
  },

  /**
   * Removes the team member token.
   */
  removeTeamToken(): boolean {
    return safeRemoveItem(STORAGE_KEYS.TEAM_TOKEN);
  },

  /**
   * Gets the stored team member data.
   * @returns The team member object, or null.
   */
  getTeamMember(): any | null {
    const data = safeGetItem(STORAGE_KEYS.TEAM_MEMBER);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  /**
   * Sets the team member data.
   * @param member - The team member object.
   */
  setTeamMember(member: any): boolean {
    try {
      return safeSetItem(STORAGE_KEYS.TEAM_MEMBER, JSON.stringify(member));
    } catch {
      return false;
    }
  },

  /**
   * Removes the team member data.
   */
  removeTeamMember(): boolean {
    return safeRemoveItem(STORAGE_KEYS.TEAM_MEMBER);
  },

  /**
   * Gets the team data to determine team type.
   * @returns The team data object, or null.
   */
  getTeamData(): { type: "user" | "admin" } | null {
    const data = safeGetItem(STORAGE_KEYS.TEAM_DATA);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  /**
   * Retrieves the stored user data.
   * @returns The parsed user object, or null if not found or on error.
   */
  getUser(): StoredUser | null {
    const userData = safeGetItem(STORAGE_KEYS.USER);
    if (!userData) {
      return null;
    }
    try {
      return JSON.parse(userData) as StoredUser;
    } catch (error) {
      console.error("[AuthStorage] Failed to parse user data:", error);
      return null;
    }
  },

  /**
   * Stores the user data.
   * @param user - The user object to store.
   * @returns true if storage was successful, false otherwise.
   */
  setUser(user: StoredUser): boolean {
    try {
      return safeSetItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } catch (error) {
      console.error("[AuthStorage] Failed to stringify user data:", error);
      return false;
    }
  },

  /**
   * Removes the stored user data.
   * @returns true if removal was successful, false otherwise.
   */
  removeUser(): boolean {
    return safeRemoveItem(STORAGE_KEYS.USER);
  },

  /**
   * Checks if the current user is an admin.
   * @returns true if the user is an admin, false otherwise.
   */
  isAdmin(): boolean {
    const user = this.getUser();
    return user?.role === "admin";
  },

  // Refresh token methods are no longer needed - tokens are now stored in HttpOnly cookies
  // for XSS protection. The browser automatically sends the cookie with requests to /api/auth/*

  /**
   * Gets the token expiry timestamp.
   * @returns The expiry timestamp in milliseconds, or null if not set.
   */
  getTokenExpiry(): number | null {
    const expiry = safeGetItem(STORAGE_KEYS.TOKEN_EXPIRY);
    return expiry ? parseInt(expiry, 10) : null;
  },

  /**
   * Sets the token expiry timestamp.
   * @param expiresIn - Seconds until token expires.
   * @returns true if storage was successful, false otherwise.
   */
  setTokenExpiry(expiresIn: number): boolean {
    const expiryTime = Date.now() + expiresIn * 1000;
    return safeSetItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
  },

  /**
   * Checks if the access token is expired or about to expire.
   * @param bufferSeconds - Buffer time in seconds before actual expiry (default 60).
   * @returns true if token is expired or will expire within buffer time.
   */
  isTokenExpired(bufferSeconds: number = 60): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return true;
    return Date.now() >= expiry - bufferSeconds * 1000;
  },

  /**
   * Updates the last activity timestamp.
   */
  updateLastActivity(): void {
    safeSetItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
  },

  /**
   * Gets the last activity timestamp.
   * @returns The last activity timestamp, or null if not set.
   */
  getLastActivity(): number | null {
    const activity = safeGetItem(STORAGE_KEYS.LAST_ACTIVITY);
    return activity ? parseInt(activity, 10) : null;
  },

  /**
   * Checks if the session has timed out due to inactivity.
   * @returns true if inactivity timeout has been exceeded.
   */
  isSessionTimedOut(): boolean {
    const lastActivity = this.getLastActivity();
    if (!lastActivity) return false;
    return Date.now() - lastActivity > ACTIVITY_TIMEOUT_MS;
  },

  /**
   * Stores all authentication data at once (token, user, expiry).
   * Note: Refresh tokens are now handled via HttpOnly cookies for XSS protection.
   * @param token - The access token.
   * @param user - The user object.
   * @param _refreshToken - Deprecated, now handled via HttpOnly cookie.
   * @param expiresIn - Seconds until token expires (optional).
   * @returns true if all storage operations were successful.
   */
  setAuthData(
    token: string,
    user: StoredUser,
    _refreshToken?: string,
    expiresIn?: number,
  ): boolean {
    const tokenSet = this.setToken(token);
    const userSet = this.setUser(user);
    let expirySet = true;

    // Note: refreshToken is now set via HttpOnly cookie by the server
    // It's ignored here but kept in signature for API compatibility

    if (expiresIn) {
      expirySet = this.setTokenExpiry(expiresIn);
    }

    this.updateLastActivity();

    return tokenSet && userSet && expirySet;
  },

  /**
   * Clears regular user authentication data from storage.
   * Does NOT clear team member data - team sessions are independent.
   * Note: Refresh token cookie is cleared by the server via /api/auth/logout.
   * @returns true if all removal operations were successful.
   */
  clearAuth(): boolean {
    const tokenRemoved = this.removeToken();
    const userRemoved = this.removeUser();
    safeRemoveItem(STORAGE_KEYS.TOKEN_EXPIRY);
    safeRemoveItem(STORAGE_KEYS.LAST_ACTIVITY);
    // Do NOT clear team member data - team sessions should persist independently
    return tokenRemoved && userRemoved;
  },

  /**
   * Clears team member authentication data.
   * Used during team member logout or session timeout.
   * Clears all team-related data including permissions.
   */
  clearTeamAuth(): boolean {
    this.removeTeamToken();
    this.removeTeamMember();
    safeRemoveItem(STORAGE_KEYS.TEAM_DATA);
    safeRemoveItem(STORAGE_KEYS.TEAM_PERMISSIONS);
    safeRemoveItem(STORAGE_KEYS.LAST_ACTIVITY);
    return true;
  },

  /**
   * Gets the Authorization header value for API requests.
   * Prioritizes team member token when logged in as a team member.
   * @returns The Bearer token header value, or null if no token exists.
   */
  getAuthHeader(): string | null {
    // Team member token takes priority when set
    const teamToken = this.getTeamToken();
    if (teamToken) {
      return `Bearer ${teamToken}`;
    }

    // Fall back to regular user token
    const token = this.getToken();
    return token ? `Bearer ${token}` : null;
  },

  /**
   * Gets the activity timeout value in milliseconds.
   * @returns The activity timeout in milliseconds.
   */
  getActivityTimeoutMs(): number {
    return ACTIVITY_TIMEOUT_MS;
  },
};

export default AuthStorage;
