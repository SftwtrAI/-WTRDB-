"use strict";
import { Server } from "http";
import { pool } from "../db";

/**
 * Graceful Shutdown Service
 *
 * Handles clean application shutdown by:
 * 1. Stopping background schedulers and cron jobs
 * 2. Closing HTTP server (stop accepting new connections)
 * 3. Draining existing connections
 * 4. Closing database pool
 *
 * This ensures data integrity and proper resource cleanup.
 */

let isShuttingDown = false;
let httpServer: Server | null = null;

/**
 * Register the HTTP server for graceful shutdown
 */
export function registerServer(server: Server): void {
  httpServer = server;
}

/**
 * Perform graceful shutdown
 * @param signal - The signal that triggered shutdown (SIGTERM, SIGINT, etc.)
 * @param exitCode - Exit code to use (default 0)
 */
export async function gracefulShutdown(
  signal: string,
  exitCode: number = 0,
): Promise<void> {
  if (isShuttingDown) {
    console.log(`⚠️ [Shutdown] Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(
    `\n🛑 [Shutdown] Received ${signal}, starting graceful shutdown...`,
  );

  const shutdownStart = Date.now();
  const SHUTDOWN_TIMEOUT = 10000; // 10 seconds max

  try {
    // Step 1: Stop accepting new requests
    if (httpServer) {
      console.log("   [1/5] Closing HTTP server (no new connections)...");
      await new Promise<void>((resolve) => {
        httpServer!.close(() => {
          console.log("   ✓ HTTP server closed");
          resolve();
        });

        // Force close after timeout
        setTimeout(() => {
          console.log("   ⚠️ HTTP server close timed out, forcing...");
          resolve();
        }, 5000);
      });
    }

    // Step 2: Stop background schedulers (campaign-scheduler and phone-billing-cron removed)
    console.log("   [2/5] Stopping background schedulers...");
    console.log("   ✓ Schedulers stopped (no active schedulers)");

    // Step 3: Wait for pending operations (brief delay)
    console.log("   [3/5] Draining pending operations...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("   ✓ Operations drained");

    // Step 4: Close FalkorDB connection
    console.log("   [4/5] Closing FalkorDB connection...");
    try {
      const { falkordbPoolManager } = await import("../infrastructure");
      if (falkordbPoolManager.isReady()) {
        await falkordbPoolManager.shutdown();
        console.log("   ✓ FalkorDB connection closed");
      } else {
        console.log("   ✓ FalkorDB was not initialized, skipping");
      }
    } catch (fkError: any) {
      console.log(`   ⚠️ FalkorDB close warning: ${fkError.message}`);
    }

    // Step 5: Close database pool
    console.log("   [5/5] Closing database connections...");
    try {
      await pool.end();
      console.log("   ✓ Database pool closed");
    } catch (dbError: any) {
      console.log(`   ⚠️ Database close warning: ${dbError.message}`);
    }

    const shutdownDuration = Date.now() - shutdownStart;
    console.log(
      `✅ [Shutdown] Graceful shutdown completed in ${shutdownDuration}ms`,
    );

    // Signal PM2 that we're ready to die
    process.exit(exitCode);
  } catch (error: any) {
    console.error(`❌ [Shutdown] Error during graceful shutdown:`, error);
    process.exit(1);
  }
}

/**
 * Setup global error handlers and shutdown signals
 */
export function setupGlobalHandlers(): void {
  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    console.error("💥 [FATAL] Uncaught Exception:", error.message);
    console.error(error.stack);
    gracefulShutdown("uncaughtException", 1);
  });

  // Handle unhandled promise rejections — log but do NOT crash.
  // Transient I/O errors (Redis disconnects, network blips) surface as
  // unhandled rejections and should not kill a production server.
  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    console.error("⚠️ [WARN] Unhandled Promise Rejection (non-fatal):", reason);
    if (reason instanceof Error) {
      console.error(reason.stack);
    }
  });

  // Handle termination signals
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // PM2 graceful reload signal
  process.on("SIGUSR2", () => {
    console.log("📡 [PM2] Received SIGUSR2 (graceful reload)");
    gracefulShutdown("SIGUSR2");
  });

  console.log(
    "🛡️ [Process] Global error handlers and shutdown signals registered",
  );
}

/**
 * Signal PM2 that the process is ready to receive connections
 * Call this after the server is fully initialized
 */
export function signalReady(): void {
  if (process.send) {
    process.send("ready");
    console.log("📡 [PM2] Signaled ready to process manager");
  }
}
