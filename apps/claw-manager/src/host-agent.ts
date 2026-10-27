/**
 * Host Agent -- System Metrics Reporter
 *
 * Reports host-level metrics (CPU, RAM, disk) to the central server
 * via a Redis stream every 30 seconds. Each message is signed with
 * HMAC-SHA256 for authenticity verification.
 */

import os from "os";
import crypto from "crypto";
import type Redis from "ioredis";

const REPORT_INTERVAL_MS = 30_000; // 30 seconds
const METRICS_STREAM_KEY = "claw:host_metrics";
const HMAC_SECRET = process.env.CLAW_HMAC_SECRET || "dev-hmac-secret-CHANGE-ME";

let reportInterval: ReturnType<typeof setInterval> | null = null;

interface HostMetrics {
  hostId: string;
  timestamp: string;
  cpu: {
    count: number;
    model: string;
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
    usagePercent: number;
  };
  memory: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
    usagePercent: number;
  };
  disk: {
    // Note: Node.js os module does not provide disk metrics natively.
    // We report placeholder values; production should use `statvfs` or `df`.
    totalGb: number;
    freeGb: number;
    usagePercent: number;
  };
  uptime: number; // host uptime in seconds
  platform: string;
  arch: string;
  nodeVersion: string;
}

/**
 * Calculate CPU usage percentage by sampling idle time over a short window.
 */
function getCpuUsagePercent(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    const { user, nice, sys, idle, irq } = cpu.times;
    totalTick += user + nice + sys + idle + irq;
    totalIdle += idle;
  }

  if (totalTick === 0) return 0;

  const idlePercent = (totalIdle / totalTick) * 100;
  return Math.round((100 - idlePercent) * 100) / 100;
}

/**
 * Collect current host metrics.
 */
function collectMetrics(hostId: string): HostMetrics {
  const cpus = os.cpus();
  const [loadAvg1m, loadAvg5m, loadAvg15m] = os.loadavg();

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    hostId,
    timestamp: new Date().toISOString(),
    cpu: {
      count: cpus.length,
      model: cpus[0]?.model || "unknown",
      loadAvg1m: Math.round(loadAvg1m * 100) / 100,
      loadAvg5m: Math.round(loadAvg5m * 100) / 100,
      loadAvg15m: Math.round(loadAvg15m * 100) / 100,
      usagePercent: getCpuUsagePercent(),
    },
    memory: {
      totalMb: Math.round(totalMemory / (1024 * 1024)),
      freeMb: Math.round(freeMemory / (1024 * 1024)),
      usedMb: Math.round(usedMemory / (1024 * 1024)),
      usagePercent: Math.round((usedMemory / totalMemory) * 10000) / 100,
    },
    disk: {
      // Placeholder -- in production, use fs.statfs or spawn `df`
      totalGb: 0,
      freeGb: 0,
      usagePercent: 0,
    },
    uptime: Math.round(os.uptime()),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
  };
}

/**
 * Sign a payload with HMAC-SHA256.
 */
function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(payload)
    .digest("hex");
}

/**
 * Report metrics to Redis stream.
 */
async function reportMetrics(redis: Redis, hostId: string): Promise<void> {
  try {
    const metrics = collectMetrics(hostId);
    const payload = JSON.stringify(metrics);
    const signature = signPayload(payload);

    await redis.xadd(
      METRICS_STREAM_KEY,
      "MAXLEN", "~", "10000", // Keep roughly 10k entries (trim older ones)
      "*", // Auto-generate ID
      "host_id", hostId,
      "payload", payload,
      "signature", signature,
    );

    console.log(
      `[host-agent] Reported metrics: cpu=${metrics.cpu.usagePercent}%, ` +
      `mem=${metrics.memory.usagePercent}%, uptime=${metrics.uptime}s`,
    );
  } catch (err: any) {
    console.error(`[host-agent] Failed to report metrics: ${err.message}`);
  }
}

/**
 * Start the periodic host metrics reporter.
 */
export function startHostAgent(redis: Redis, hostId: string): void {
  console.log(
    `[host-agent] Starting metrics reporter (interval=${REPORT_INTERVAL_MS}ms, stream=${METRICS_STREAM_KEY})`,
  );

  // Report immediately, then on interval
  reportMetrics(redis, hostId);
  reportInterval = setInterval(() => reportMetrics(redis, hostId), REPORT_INTERVAL_MS);
}

/**
 * Stop the periodic reporter.
 */
export function stopHostAgent(): void {
  if (reportInterval) {
    clearInterval(reportInterval);
    reportInterval = null;
    console.log("[host-agent] Metrics reporter stopped");
  }
}
