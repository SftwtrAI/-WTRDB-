"use strict";
import * as os from "os";
import { storage } from "../storage";
import { gracefulShutdown } from "./graceful-shutdown";

/**
 * Resource Watchdog Service
 *
 * Monitors system resources (RAM/CPU) and triggers graceful shutdown
 * when configured thresholds are exceeded. Settings are admin-configurable
 * via the global settings table.
 */

export interface AutoRestartSettings {
  enabled: boolean;
  ramPercent: number; // 50-95%
  cpuPercent: number; // 20-95%
}

// Default settings
const DEFAULT_SETTINGS: AutoRestartSettings = {
  enabled: false,
  ramPercent: 75,
  cpuPercent: 85,
};

// Watchdog state
let watchdogInterval: NodeJS.Timeout | null = null;
let cachedSettings: AutoRestartSettings = { ...DEFAULT_SETTINGS };
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 60000; // 1 minute cache
const CHECK_INTERVAL = 30000; // Check every 30 seconds
const BREACH_THRESHOLD = 3; // Consecutive breaches before restart
let consecutiveBreaches = 0;
let lastCpuUsage = 0;
let lastCpuTime = process.hrtime.bigint();

/**
 * Get CPU usage percentage with improved accuracy
 * Uses multiple signals: process CPU time and system load average
 */
function getCpuUsage(): {
  percent: number;
  loadAvg1m: number;
  cores: number;
  method: "process" | "loadavg";
} {
  const cores = os.cpus().length;
  const loadAvg = os.loadavg();
  const loadAvg1m = loadAvg[0]; // 1-minute load average

  // Calculate process-based CPU usage
  const cpuUsage = process.cpuUsage();
  const totalCpuTime = cpuUsage.user + cpuUsage.system;
  const currentTime = process.hrtime.bigint();

  const elapsedNs = Number(currentTime - lastCpuTime);
  const elapsedMs = elapsedNs / 1e6;

  let processPercent = 0;
  if (elapsedMs > 100) {
    // Only calculate if enough time has passed
    // CPU time is in microseconds, normalize by core count for accurate percentage
    const rawPercent = ((totalCpuTime - lastCpuUsage) / 1000 / elapsedMs) * 100;
    // Normalize by core count to get per-core utilization
    processPercent = rawPercent / cores;
    lastCpuUsage = totalCpuTime;
    lastCpuTime = currentTime;
  }

  // Calculate load-average based CPU percentage (works better in containerized environments)
  // Load average represents average number of processes waiting for CPU
  // When divided by cores, gives a percentage-like metric
  const loadAvgPercent = (loadAvg1m / cores) * 100;

  // Use the higher of the two signals for more reliable detection
  // Process CPU can be low in idle periods, load average captures system-wide pressure
  const effectivePercent = Math.max(processPercent, loadAvgPercent);

  // Clamp to valid range, guard against NaN
  const finalPercent = isNaN(effectivePercent)
    ? 0
    : Math.min(100, Math.max(0, effectivePercent));

  return {
    percent: Math.round(finalPercent * 10) / 10,
    loadAvg1m: Math.round(loadAvg1m * 100) / 100,
    cores,
    method: loadAvgPercent > processPercent ? "loadavg" : "process",
  };
}

/**
 * Get RAM usage percentage
 */
function getRamUsage(): {
  usedPercent: number;
  usedGB: number;
  totalGB: number;
} {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;

  const totalGB = totalMemoryBytes / (1024 * 1024 * 1024);
  const usedGB = usedMemoryBytes / (1024 * 1024 * 1024);
  const usedPercent = (usedMemoryBytes / totalMemoryBytes) * 100;

  return { usedPercent, usedGB, totalGB };
}

/**
 * Get process-specific memory usage
 */
function getProcessMemory(): { usedMB: number; rssPercent: number } {
  const memUsage = process.memoryUsage();
  const usedMB = memUsage.rss / (1024 * 1024);
  const totalMemory = os.totalmem();
  const rssPercent = (memUsage.rss / totalMemory) * 100;

  return { usedMB, rssPercent };
}

/**
 * Load auto-restart settings from database with caching
 */
async function loadSettings(): Promise<AutoRestartSettings> {
  const now = Date.now();

  // Return cached settings if still valid
  if (now - settingsCacheTime < SETTINGS_CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const [enabledSetting, ramSetting, cpuSetting] = await Promise.all([
      storage.getGlobalSetting("auto_restart_enabled"),
      storage.getGlobalSetting("auto_restart_ram_percent"),
      storage.getGlobalSetting("auto_restart_cpu_percent"),
    ]);

    cachedSettings = {
      enabled: enabledSetting?.value === true,
      ramPercent:
        typeof ramSetting?.value === "number"
          ? ramSetting.value
          : DEFAULT_SETTINGS.ramPercent,
      cpuPercent:
        typeof cpuSetting?.value === "number"
          ? cpuSetting.value
          : DEFAULT_SETTINGS.cpuPercent,
    };

    // Validate bounds
    cachedSettings.ramPercent = Math.max(
      50,
      Math.min(95, cachedSettings.ramPercent),
    );
    cachedSettings.cpuPercent = Math.max(
      20,
      Math.min(95, cachedSettings.cpuPercent),
    );

    settingsCacheTime = now;
  } catch (error) {
    console.error("⚠️ [Watchdog] Failed to load settings:", error);
    // Keep using cached settings on error
  }

  return cachedSettings;
}

/**
 * Clear settings cache to force reload
 */
export function clearSettingsCache(): void {
  settingsCacheTime = 0;
}

/**
 * Check resource usage and trigger restart if needed
 */
async function checkResources(): Promise<void> {
  const settings = await loadSettings();

  // Skip if disabled
  if (!settings.enabled) {
    consecutiveBreaches = 0;
    return;
  }

  const ram = getRamUsage();
  const cpu = getCpuUsage();
  const processMemory = getProcessMemory();

  const ramBreach = ram.usedPercent > settings.ramPercent;
  const cpuBreach = cpu.percent > settings.cpuPercent;

  if (ramBreach || cpuBreach) {
    consecutiveBreaches++;

    console.warn(
      `⚠️ [Watchdog] Resource threshold breach #${consecutiveBreaches}/${BREACH_THRESHOLD}`,
    );
    console.warn(
      `   RAM: ${ram.usedPercent.toFixed(1)}% (limit: ${settings.ramPercent}%) - ${ram.usedGB.toFixed(2)}GB / ${ram.totalGB.toFixed(2)}GB`,
    );
    console.warn(
      `   CPU: ${cpu.percent.toFixed(1)}% (limit: ${settings.cpuPercent}%) [${cpu.method}, ${cpu.cores} cores, load: ${cpu.loadAvg1m}]`,
    );
    console.warn(
      `   Process RSS: ${processMemory.usedMB.toFixed(0)}MB (${processMemory.rssPercent.toFixed(1)}% of total)`,
    );

    if (consecutiveBreaches >= BREACH_THRESHOLD) {
      console.error(
        "🚨 [Watchdog] Threshold exceeded - initiating graceful restart",
      );
      console.error(
        `   Final stats - RAM: ${ram.usedPercent.toFixed(1)}%, CPU: ${cpu.percent.toFixed(1)}%`,
      );

      // Stop watchdog before restart
      stopWatchdog();

      // Trigger graceful shutdown (PM2 will restart)
      await gracefulShutdown("WATCHDOG_RESTART", 0);
    }
  } else {
    // Reset breach counter on successful check
    if (consecutiveBreaches > 0) {
      console.log(
        "✅ [Watchdog] Resources within limits, resetting breach counter",
      );
    }
    consecutiveBreaches = 0;
  }
}

/**
 * Start the resource watchdog
 */
export function startWatchdog(): void {
  if (watchdogInterval) {
    console.log("⚠️ [Watchdog] Already running");
    return;
  }

  console.log("👁️ [Watchdog] Starting resource monitor (30s interval)");

  // Initialize CPU baseline
  lastCpuUsage = process.cpuUsage().user + process.cpuUsage().system;
  lastCpuTime = process.hrtime.bigint();

  // Run immediately, then on interval
  checkResources().catch(console.error);
  watchdogInterval = setInterval(() => {
    checkResources().catch(console.error);
  }, CHECK_INTERVAL);
}

/**
 * Stop the resource watchdog
 */
export function stopWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    console.log("🛑 [Watchdog] Resource monitor stopped");
  }
}

/**
 * Get current resource status (for admin dashboard)
 */
export async function getResourceStatus(): Promise<{
  settings: AutoRestartSettings;
  current: {
    ramPercent: number;
    ramUsedGB: number;
    ramTotalGB: number;
    cpuPercent: number;
    cpuLoadAvg1m: number;
    cpuCores: number;
    cpuMethod: "process" | "loadavg";
    processMemoryMB: number;
  };
  watchdogActive: boolean;
  environment: "development" | "production";
}> {
  const settings = await loadSettings();
  const ram = getRamUsage();
  const cpu = getCpuUsage();
  const processMemory = getProcessMemory();

  // Detect environment based on NODE_ENV
  const isProduction = process.env.NODE_ENV === "production";

  return {
    settings,
    current: {
      ramPercent: Math.round(ram.usedPercent * 10) / 10,
      ramUsedGB: Math.round(ram.usedGB * 100) / 100,
      ramTotalGB: Math.round(ram.totalGB * 100) / 100,
      cpuPercent: cpu.percent,
      cpuLoadAvg1m: cpu.loadAvg1m,
      cpuCores: cpu.cores,
      cpuMethod: cpu.method,
      processMemoryMB: Math.round(processMemory.usedMB),
    },
    watchdogActive: watchdogInterval !== null,
    environment: isProduction ? "production" : "development",
  };
}
