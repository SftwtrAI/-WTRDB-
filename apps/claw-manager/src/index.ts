/**
 * Claw Manager -- Host Agent Entry Point
 *
 * Runs on each claw host machine. Responsibilities:
 *   1. Connect to Redis for command dispatch and metric reporting
 *   2. Start the host-agent health reporter (CPU, RAM, disk)
 *   3. Initialize the sandbox supervisor to monitor Docker containers
 */

import Redis from "ioredis";
import { startHostAgent, stopHostAgent } from "./host-agent";
import { startSandboxSupervisor, stopSandboxSupervisor } from "./sandbox-supervisor";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const HOST_ID = process.env.CLAW_HOST_ID || `host_${require("os").hostname()}`;

let redis: Redis | null = null;
let shuttingDown = false;

async function main(): Promise<void> {
  console.log(`[claw-manager] Starting on host=${HOST_ID}`);
  console.log(`[claw-manager] Connecting to Redis at ${REDIS_URL}`);

  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy(times: number) {
      const delay = Math.min(times * 500, 5000);
      console.log(`[claw-manager] Redis retry #${times}, next attempt in ${delay}ms`);
      return delay;
    },
    lazyConnect: true,
  });

  try {
    await redis.connect();
    console.log("[claw-manager] Redis connected");
  } catch (err: any) {
    console.error(`[claw-manager] Redis connection failed: ${err.message}`);
    process.exit(1);
  }

  // Listen for Redis connection events
  redis.on("error", (err) => {
    console.error(`[claw-manager] Redis error: ${err.message}`);
  });

  redis.on("reconnecting", () => {
    console.log("[claw-manager] Redis reconnecting...");
  });

  // Start subsystems
  startHostAgent(redis, HOST_ID);
  await startSandboxSupervisor(redis, HOST_ID);

  console.log("[claw-manager] All subsystems started");

  // Subscribe to command stream for this host
  listenForCommands(redis, HOST_ID);
}

/**
 * Listen for commands dispatched to this host via a Redis stream.
 */
async function listenForCommands(redis: Redis, hostId: string): Promise<void> {
  const streamKey = `claw:commands:${hostId}`;
  let lastId = "$"; // Only read new messages

  console.log(`[claw-manager] Listening for commands on stream=${streamKey}`);

  while (!shuttingDown) {
    try {
      const result = await redis.xread(
        "COUNT", 10,
        "BLOCK", 5000,
        "STREAMS", streamKey, lastId,
      );

      if (!result) continue;

      for (const [, messages] of result) {
        for (const [id, fields] of messages) {
          lastId = id;
          const command = parseStreamFields(fields);
          console.log(`[claw-manager] Received command: ${JSON.stringify(command)}`);
          await handleCommand(command);
        }
      }
    } catch (err: any) {
      if (shuttingDown) break;
      console.error(`[claw-manager] Command listener error: ${err.message}`);
      await sleep(2000);
    }
  }
}

function parseStreamFields(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    result[fields[i]] = fields[i + 1];
  }
  return result;
}

async function handleCommand(command: Record<string, string>): Promise<void> {
  const { action, claw_id: clawId } = command;

  switch (action) {
    case "start":
      console.log(`[claw-manager] Starting claw ${clawId}`);
      // TODO: Delegate to sandbox supervisor to start container
      break;
    case "stop":
      console.log(`[claw-manager] Stopping claw ${clawId}`);
      // TODO: Delegate to sandbox supervisor to stop container
      break;
    case "restart":
      console.log(`[claw-manager] Restarting claw ${clawId}`);
      // TODO: Delegate to sandbox supervisor to restart container
      break;
    case "quarantine":
      console.log(`[claw-manager] Quarantining claw ${clawId}`);
      // TODO: Disconnect container from network, keep running for forensics
      break;
    default:
      console.warn(`[claw-manager] Unknown command action: ${action}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Graceful Shutdown ──────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[claw-manager] Received ${signal}, shutting down...`);

  stopHostAgent();
  await stopSandboxSupervisor();

  if (redis) {
    try {
      await redis.quit();
      console.log("[claw-manager] Redis disconnected");
    } catch {
      // Ignore errors during shutdown
    }
  }

  console.log("[claw-manager] Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error(`[claw-manager] Fatal error: ${err.message}`);
  process.exit(1);
});
