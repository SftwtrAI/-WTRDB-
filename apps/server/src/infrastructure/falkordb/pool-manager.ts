"use strict";

/**
 * FalkorDB Pool Manager
 *
 * Manages the connection lifecycle to a FalkorDB instance which speaks
 * the Redis protocol. Provides initialisation, health-checking, client
 * access, and graceful shutdown.
 *
 * Pattern follows:
 *   - apps/server/src/infrastructure/database/connection-pool.ts
 *   - apps/server/src/infrastructure/openai/pool-manager.ts
 */

import Redis from "ioredis";
import {
  createFalkorDBClient,
  type FalkorDBClient,
} from "./client";

interface FalkorDBPoolSettings {
  host: string;
  port: number;
  maxRetriesPerRequest: number;
  connectTimeoutMs: number;
  lazyConnect: boolean;
}

const DEFAULT_SETTINGS: FalkorDBPoolSettings = {
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: 3,
  connectTimeoutMs: 10000,
  lazyConnect: true,
};

export class FalkorDBPoolManager {
  private redis: Redis | null = null;
  private client: FalkorDBClient | null = null;
  private isInitialized = false;
  private settings: FalkorDBPoolSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    this.loadEnvSettings();
  }

  private log(message: string): void {
    console.log(`[FalkorDB Pool] ${message}`);
  }

  private warn(message: string): void {
    console.warn(`[FalkorDB Pool] ${message}`);
  }

  private error(message: string, err?: Error): void {
    console.error(`[FalkorDB Pool] ${message}`, err || "");
  }

  /**
   * Load connection settings from environment variables.
   */
  private loadEnvSettings(): void {
    const host = process.env.FALKORDB_HOST;
    const port = process.env.FALKORDB_PORT;

    if (host) this.settings.host = host;
    if (port) this.settings.port = parseInt(port, 10);
  }

  /**
   * Initialise the Redis connection to FalkorDB.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.log("Already initialized, skipping");
      return;
    }

    this.log(
      `Initializing connection to ${this.settings.host}:${this.settings.port}...`,
    );

    try {
      this.redis = new Redis({
        host: this.settings.host,
        port: this.settings.port,
        maxRetriesPerRequest: this.settings.maxRetriesPerRequest,
        connectTimeout: this.settings.connectTimeoutMs,
        lazyConnect: this.settings.lazyConnect,
        retryStrategy(times: number) {
          if (times > 5) {
            // Stop retrying after 5 attempts
            return null;
          }
          return Math.min(times * 500, 3000);
        },
      });

      // Attach event listeners
      this.redis.on("connect", () => {
        this.log("Connected to FalkorDB");
      });

      this.redis.on("error", (err) => {
        this.error("Connection error", err);
      });

      this.redis.on("close", () => {
        this.warn("Connection closed");
      });

      // Explicitly connect (since lazyConnect is true)
      await this.redis.connect();

      this.client = createFalkorDBClient(this.redis);
      this.isInitialized = true;

      this.log("Initialization complete");
    } catch (err: any) {
      this.error("Failed to initialize", err);
      // Clean up partial state
      if (this.redis) {
        try {
          this.redis.disconnect();
        } catch {
          // ignore
        }
        this.redis = null;
      }
      this.client = null;
      throw err;
    }
  }

  /**
   * Return the typed FalkorDB client.
   * Throws if the pool has not been initialised.
   */
  getClient(): FalkorDBClient {
    if (!this.client || !this.isInitialized) {
      throw new Error(
        "[FalkorDB Pool] Not initialized. Call initialize() first.",
      );
    }
    return this.client;
  }

  /**
   * Run a health check against the underlying Redis/FalkorDB connection.
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    if (!this.client) {
      return { healthy: false, message: "FalkorDB pool not initialized" };
    }
    return this.client.healthCheck();
  }

  /**
   * Gracefully close the Redis connection.
   */
  async shutdown(): Promise<void> {
    if (!this.redis) {
      this.log("No connection to shut down");
      return;
    }

    this.log("Initiating graceful shutdown...");

    try {
      await this.redis.quit();
      this.redis = null;
      this.client = null;
      this.isInitialized = false;
      this.log("Graceful shutdown complete");
    } catch (err: any) {
      this.error("Shutdown error", err);
      // Force disconnect on error
      try {
        this.redis?.disconnect();
      } catch {
        // ignore
      }
      this.redis = null;
      this.client = null;
      this.isInitialized = false;
      throw err;
    }
  }

  /**
   * Whether the pool is ready to serve requests.
   */
  isReady(): boolean {
    return this.isInitialized && this.redis !== null && this.client !== null;
  }

  /**
   * Return the current connection settings (for diagnostics).
   */
  getSettings(): FalkorDBPoolSettings {
    return { ...this.settings };
  }
}

/** Singleton instance — import this in consuming modules. */
export const falkordbPoolManager = new FalkorDBPoolManager();
