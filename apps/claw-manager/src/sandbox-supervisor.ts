/**
 * Sandbox Supervisor
 *
 * Monitors local Docker containers that host claw sandboxes.
 * Periodically lists running containers, detects crashed ones,
 * and reports status back to the central server via Redis.
 */

import Dockerode from "dockerode";
import type Redis from "ioredis";

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const CONTAINER_LABEL_PREFIX = "claw.id";
const STATUS_STREAM_KEY = "claw:sandbox_status";

let docker: Dockerode | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let running = false;

interface SandboxStatus {
  containerId: string;
  clawId: string;
  name: string;
  image: string;
  state: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  restartCount: number;
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
}

/**
 * Initialize the Docker client.
 * Connects to the local Docker socket by default.
 */
function initDocker(): Dockerode {
  const socketPath = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
  return new Dockerode({ socketPath });
}

/**
 * List all claw-managed containers and gather their status.
 */
async function listSandboxes(): Promise<SandboxStatus[]> {
  if (!docker) return [];

  const containers = await docker.listContainers({
    all: true, // Include stopped containers
    filters: {
      label: [CONTAINER_LABEL_PREFIX],
    },
  });

  const statuses: SandboxStatus[] = [];

  for (const containerInfo of containers) {
    const clawId = containerInfo.Labels?.[CONTAINER_LABEL_PREFIX] || "unknown";

    let cpuPercent = 0;
    let memoryUsageMb = 0;
    let memoryLimitMb = 0;

    // Attempt to get live stats for running containers
    if (containerInfo.State === "running") {
      try {
        const container = docker.getContainer(containerInfo.Id);
        const stats = await getContainerStats(container);
        cpuPercent = stats.cpuPercent;
        memoryUsageMb = stats.memoryUsageMb;
        memoryLimitMb = stats.memoryLimitMb;
      } catch {
        // Stats may fail for containers in transitional states
      }
    }

    // Inspect for detailed timing info
    let startedAt: string | null = null;
    let finishedAt: string | null = null;
    let exitCode: number | null = null;
    let restartCount = 0;

    try {
      const container = docker.getContainer(containerInfo.Id);
      const inspection = await container.inspect();
      startedAt = inspection.State.StartedAt || null;
      finishedAt = inspection.State.FinishedAt || null;
      exitCode = inspection.State.ExitCode ?? null;
      restartCount = inspection.RestartCount || 0;
    } catch {
      // Inspection may fail; continue with partial data
    }

    statuses.push({
      containerId: containerInfo.Id.slice(0, 12),
      clawId,
      name: containerInfo.Names?.[0]?.replace(/^\//, "") || "unknown",
      image: containerInfo.Image || "unknown",
      state: containerInfo.State || "unknown",
      status: containerInfo.Status || "unknown",
      startedAt,
      finishedAt,
      exitCode,
      restartCount,
      cpuPercent,
      memoryUsageMb,
      memoryLimitMb,
    });
  }

  return statuses;
}

/**
 * Get CPU and memory stats from a running container.
 */
function getContainerStats(
  container: Dockerode.Container,
): Promise<{ cpuPercent: number; memoryUsageMb: number; memoryLimitMb: number }> {
  return new Promise((resolve) => {
    container.stats({ stream: false }, (err, stats) => {
      if (err || !stats) {
        resolve({ cpuPercent: 0, memoryUsageMb: 0, memoryLimitMb: 0 });
        return;
      }

      // CPU calculation
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        (stats.precpu_stats?.cpu_usage?.total_usage || 0);
      const systemDelta =
        stats.cpu_stats.system_cpu_usage -
        (stats.precpu_stats?.system_cpu_usage || 0);
      const numCpus = stats.cpu_stats.online_cpus || 1;

      let cpuPercent = 0;
      if (systemDelta > 0 && cpuDelta > 0) {
        cpuPercent = Math.round((cpuDelta / systemDelta) * numCpus * 10000) / 100;
      }

      // Memory calculation
      const memoryUsage = stats.memory_stats?.usage || 0;
      const memoryLimit = stats.memory_stats?.limit || 0;

      resolve({
        cpuPercent,
        memoryUsageMb: Math.round(memoryUsage / (1024 * 1024)),
        memoryLimitMb: Math.round(memoryLimit / (1024 * 1024)),
      });
    });
  });
}

/**
 * Detect crashed containers and report anomalies.
 */
function detectCrashed(sandboxes: SandboxStatus[]): SandboxStatus[] {
  return sandboxes.filter((s) => {
    // Container exited with non-zero code
    if (s.state === "exited" && s.exitCode !== null && s.exitCode !== 0) {
      return true;
    }
    // Container is in a dead state
    if (s.state === "dead") {
      return true;
    }
    // Container is restarting excessively
    if (s.restartCount > 5) {
      return true;
    }
    return false;
  });
}

/**
 * Report sandbox statuses to Redis.
 */
async function reportStatus(
  redis: Redis,
  hostId: string,
  sandboxes: SandboxStatus[],
  crashed: SandboxStatus[],
): Promise<void> {
  try {
    const payload = JSON.stringify({
      hostId,
      timestamp: new Date().toISOString(),
      totalContainers: sandboxes.length,
      running: sandboxes.filter((s) => s.state === "running").length,
      stopped: sandboxes.filter((s) => s.state === "exited" && (s.exitCode === null || s.exitCode === 0)).length,
      crashed: crashed.length,
      sandboxes,
    });

    await redis.xadd(
      STATUS_STREAM_KEY,
      "MAXLEN", "~", "5000",
      "*",
      "host_id", hostId,
      "payload", payload,
    );

    // Log warnings for crashed containers
    for (const c of crashed) {
      console.warn(
        `[sandbox-supervisor] CRASHED: claw=${c.clawId} container=${c.containerId} ` +
        `state=${c.state} exitCode=${c.exitCode} restarts=${c.restartCount}`,
      );
    }

    const runningCount = sandboxes.filter((s) => s.state === "running").length;
    console.log(
      `[sandbox-supervisor] Status: ${sandboxes.length} total, ${runningCount} running, ${crashed.length} crashed`,
    );
  } catch (err: any) {
    console.error(`[sandbox-supervisor] Failed to report status: ${err.message}`);
  }
}

/**
 * Single poll cycle: list containers, detect issues, report.
 */
async function pollCycle(redis: Redis, hostId: string): Promise<void> {
  try {
    const sandboxes = await listSandboxes();
    const crashed = detectCrashed(sandboxes);
    await reportStatus(redis, hostId, sandboxes, crashed);
  } catch (err: any) {
    console.error(`[sandbox-supervisor] Poll cycle failed: ${err.message}`);
  }
}

/**
 * Start the sandbox supervisor.
 */
export async function startSandboxSupervisor(redis: Redis, hostId: string): Promise<void> {
  console.log(
    `[sandbox-supervisor] Starting (interval=${POLL_INTERVAL_MS}ms, label=${CONTAINER_LABEL_PREFIX})`,
  );

  docker = initDocker();

  // Verify Docker connectivity
  try {
    const info = await docker.info();
    console.log(
      `[sandbox-supervisor] Docker connected: ${info.Name}, ` +
      `containers=${info.Containers}, running=${info.ContainersRunning}`,
    );
  } catch (err: any) {
    console.error(`[sandbox-supervisor] Docker connection failed: ${err.message}`);
    console.warn("[sandbox-supervisor] Supervisor will retry on next poll cycle");
  }

  running = true;

  // Initial poll
  await pollCycle(redis, hostId);

  // Periodic polling
  pollInterval = setInterval(() => pollCycle(redis, hostId), POLL_INTERVAL_MS);
}

/**
 * Stop the sandbox supervisor.
 */
export async function stopSandboxSupervisor(): Promise<void> {
  running = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  console.log("[sandbox-supervisor] Stopped");
}
