import { WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { globalSettings } from "@wtrops/shared";

interface ConnectionLimits {
  maxPerProcess: number;
  maxPerUser: number;
  maxPerIp: number;
}

interface ConnectionStats {
  totalConnections: number;
  uniqueUsers: number;
  uniqueIPs: number;
  limits: ConnectionLimits;
  utilizationPercent: number;
}

export class WebSocketConnectionManager {
  private connections: Map<string, WebSocket> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private ipConnections: Map<string, Set<string>> = new Map();
  private connectionMetadata: Map<string, { userId?: string; ip?: string }> =
    new Map();

  private limits: ConnectionLimits = {
    maxPerProcess: 1000,
    maxPerUser: 5,
    maxPerIp: 10,
  };

  private settingsLoaded = false;

  async loadSettings(): Promise<void> {
    console.log("[WS Manager] Loading settings from globalSettings table...");

    try {
      const maxPerProcessResult = await db
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.key, "max_ws_connections_per_process"));

      const maxPerUserResult = await db
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.key, "max_ws_connections_per_user"));

      const maxPerIpResult = await db
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.key, "max_ws_connections_per_ip"));

      if (maxPerProcessResult[0]?.value) {
        this.limits.maxPerProcess = Number(maxPerProcessResult[0].value);
      }

      if (maxPerUserResult[0]?.value) {
        this.limits.maxPerUser = Number(maxPerUserResult[0].value);
      }

      if (maxPerIpResult[0]?.value) {
        this.limits.maxPerIp = Number(maxPerIpResult[0].value);
      }

      this.settingsLoaded = true;
      console.log(
        `[WS Manager] Settings loaded: maxPerProcess=${this.limits.maxPerProcess}, maxPerUser=${this.limits.maxPerUser}, maxPerIp=${this.limits.maxPerIp}`,
      );
    } catch (error) {
      console.log(
        `[WS Manager] Failed to load settings, using defaults: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.settingsLoaded = true;
    }
  }

  async refreshSettings(): Promise<void> {
    console.log("[WS Manager] Refreshing settings...");
    this.settingsLoaded = false;
    await this.loadSettings();
  }

  private async ensureSettingsLoaded(): Promise<void> {
    if (!this.settingsLoaded) {
      await this.loadSettings();
    }
  }

  async addConnection(
    id: string,
    ws: WebSocket,
    userId?: string,
    ip?: string,
  ): Promise<boolean> {
    await this.ensureSettingsLoaded();

    if (this.connections.size >= this.limits.maxPerProcess) {
      console.log(
        `[WS Manager] Connection rejected: process limit reached (${this.connections.size}/${this.limits.maxPerProcess})`,
      );
      return false;
    }

    if (userId) {
      const userConns = this.userConnections.get(userId);
      if (userConns && userConns.size >= this.limits.maxPerUser) {
        console.log(
          `[WS Manager] Connection rejected: user limit reached for ${userId} (${userConns.size}/${this.limits.maxPerUser})`,
        );
        return false;
      }
    }

    if (ip) {
      const ipConns = this.ipConnections.get(ip);
      if (ipConns && ipConns.size >= this.limits.maxPerIp) {
        console.log(
          `[WS Manager] Connection rejected: IP limit reached for ${ip} (${ipConns.size}/${this.limits.maxPerIp})`,
        );
        return false;
      }
    }

    this.connections.set(id, ws);
    this.connectionMetadata.set(id, { userId, ip });

    if (userId) {
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)!.add(id);
    }

    if (ip) {
      if (!this.ipConnections.has(ip)) {
        this.ipConnections.set(ip, new Set());
      }
      this.ipConnections.get(ip)!.add(id);
    }

    ws.on("close", () => {
      this.removeConnection(id, userId, ip);
    });

    console.log(
      `[WS Manager] Connection added: ${id} (total: ${this.connections.size})`,
    );
    return true;
  }

  removeConnection(id: string, userId?: string, ip?: string): void {
    if (!this.connections.has(id)) {
      return;
    }

    this.connections.delete(id);

    const metadata = this.connectionMetadata.get(id);
    const effectiveUserId = userId || metadata?.userId;
    const effectiveIp = ip || metadata?.ip;

    if (effectiveUserId) {
      const userConns = this.userConnections.get(effectiveUserId);
      if (userConns) {
        userConns.delete(id);
        if (userConns.size === 0) {
          this.userConnections.delete(effectiveUserId);
        }
      }
    }

    if (effectiveIp) {
      const ipConns = this.ipConnections.get(effectiveIp);
      if (ipConns) {
        ipConns.delete(id);
        if (ipConns.size === 0) {
          this.ipConnections.delete(effectiveIp);
        }
      }
    }

    this.connectionMetadata.delete(id);
    console.log(
      `[WS Manager] Connection removed: ${id} (total: ${this.connections.size})`,
    );
  }

  getConnection(id: string): WebSocket | undefined {
    return this.connections.get(id);
  }

  getUserConnections(userId: string): Set<string> {
    return this.userConnections.get(userId) || new Set();
  }

  getStats(): ConnectionStats {
    const totalConnections = this.connections.size;
    const uniqueUsers = this.userConnections.size;
    const uniqueIPs = this.ipConnections.size;
    const utilizationPercent =
      this.limits.maxPerProcess > 0
        ? Math.round((totalConnections / this.limits.maxPerProcess) * 100)
        : 0;

    return {
      totalConnections,
      uniqueUsers,
      uniqueIPs,
      limits: { ...this.limits },
      utilizationPercent,
    };
  }

  async closeAll(reason: string): Promise<void> {
    console.log(`[WS Manager] Closing all connections: ${reason}`);

    const closePromises: Promise<void>[] = [];

    Array.from(this.connections.entries()).forEach(([id, ws]) => {
      closePromises.push(
        new Promise<void>((resolve) => {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(1001, reason);
            }
          } catch (error) {
            console.log(
              `[WS Manager] Error closing connection ${id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          resolve();
        }),
      );
    });

    await Promise.all(closePromises);

    this.connections.clear();
    this.userConnections.clear();
    this.ipConnections.clear();
    this.connectionMetadata.clear();

    console.log(`[WS Manager] All connections closed: ${reason}`);
  }

  getLimits(): ConnectionLimits {
    return { ...this.limits };
  }

  isSettingsLoaded(): boolean {
    return this.settingsLoaded;
  }
}

export const wsManager = new WebSocketConnectionManager();
