"use strict";

/**
 * Claw Engine Configuration
 *
 * Central configuration for the NemoClaw sandbox runtime.
 * All Redis key prefixes, queue names, timeouts, and fleet defaults.
 */

export const ClawConfig = {
  // NemoClaw CLI binary (assumed on PATH)
  cli: {
    binary: process.env.NEMOCLAW_CLI || "nemoclaw",
    defaultTimeout: 30_000, // 30s for CLI operations
    destroyTimeout: 15_000,
    logTailLines: 200,
  },

  // Redis key prefixes
  redis: {
    sandboxStatePrefix: "claw:sandbox:",
    heartbeatPrefix: "claw:hb:",
    meterPrefix: "claw:meter:",
    fleetLockPrefix: "claw:fleet:lock:",
    skillCachePrefix: "claw:skill:",
    circuitBreakerPrefix: "claw:cb:",
    ttlSeconds: 3600,
    heartbeatTtlSeconds: 120,
  },

  // BullMQ queues
  queue: {
    inference: "claw-inference",
    toolExecution: "claw-tool-exec",
    voiceDispatch: "claw-voice-dispatch",
    fleetOps: "claw-fleet-ops",
    defaultConcurrency: 5,
  },

  // Sandbox defaults
  sandbox: {
    defaultMemoryMb: 2048,
    defaultCpuCores: 2,
    defaultDiskMb: 10240,
    maxIdleSeconds: 900, // 15 min auto-pause
    healthCheckIntervalMs: 30_000,
    provisionTimeoutMs: 120_000, // 2 min to spin up
  },

  // Fleet management
  fleet: {
    maxSandboxesPerHost: 10,
    bulkBatchSize: 5,
    bulkDelayMs: 500,
    staleHeartbeatThresholdMs: 180_000, // 3 min
  },

  // Credit metering
  metering: {
    // Credits per 1K tokens (input / output) by provider
    rates: {
      openai: {
        "gpt-4o": { inputPer1k: 2.5, outputPer1k: 10 },
        "gpt-4o-mini": { inputPer1k: 0.15, outputPer1k: 0.6 },
        "gpt-4-turbo": { inputPer1k: 10, outputPer1k: 30 },
        default: { inputPer1k: 1, outputPer1k: 4 },
      },
      anthropic: {
        "claude-sonnet-4-20250514": { inputPer1k: 3, outputPer1k: 15 },
        "claude-3-5-haiku-20241022": { inputPer1k: 0.8, outputPer1k: 4 },
        default: { inputPer1k: 3, outputPer1k: 15 },
      },
      google: {
        "gemini-2.0-flash": { inputPer1k: 0.1, outputPer1k: 0.4 },
        "gemini-1.5-pro": { inputPer1k: 1.25, outputPer1k: 5 },
        default: { inputPer1k: 0.5, outputPer1k: 2 },
      },
      nemotron: {
        local: { inputPer1k: 0, outputPer1k: 0 },
        default: { inputPer1k: 0, outputPer1k: 0 },
      },
    } as Record<string, Record<string, { inputPer1k: number; outputPer1k: number }>>,
    toolExecutionCreditFlat: 0.5, // flat credit per tool invocation
    workflowExecutionCreditFlat: 1, // flat credit per workflow run
  },

  // OPA policy sidecar
  opa: {
    url: process.env.OPA_URL || "http://localhost:8181",
    policyPath: "/v1/data/claw/authz",
    timeoutMs: 500,
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeMs: 30_000, // 30s
    },
  },

  // Voice dispatch
  voice: {
    midCallTimeoutMs: 5_000,
    postCallDelayMs: 2_000,
    maxConcurrentVoiceSessions: 3,
  },

  // Claw Contexts
  context: {
    maxExtendsDepth: 10, // Prevent circular inheritance
    maxContextsPerClaw: 20, // Max contexts assignable to a single claw
    resolvedContextCacheTtlSeconds: 60, // Cache resolved contexts for 60s
  },

  // Agent-MCP
  agentMcp: {
    healthCheckIntervalMs: 30_000, // 30s health check for shared instances
    healthCheckTimeoutMs: 5_000,
    maxSharedInstancesPerDefinition: 3, // HA pool for shared topology
    sidecarStartTimeoutMs: 60_000, // 60s for sidecar to become healthy
    defaultPort: 3100,
  },

  // Claw Templates
  template: {
    maxContextRefsPerTemplate: 10,
  },

  // ClawHub skill registry
  skillHub: {
    registryUrl: process.env.CLAWHUB_REGISTRY_URL || "https://hub.wtrops.ai/api/v1",
    cacheTtlSeconds: 300,
    securityScoreWeights: {
      sandboxIsolation: 25,
      noNetworkAccess: 20,
      noFileSystemWrite: 15,
      signedPackage: 15,
      auditTrail: 10,
      scopedPermissions: 10,
      knownPublisher: 5,
    },
  },
} as const;

// ── Helper Functions ──

export function getSandboxStateKey(clawId: string): string {
  return `${ClawConfig.redis.sandboxStatePrefix}${clawId}`;
}

export function getHeartbeatKey(clawId: string): string {
  return `${ClawConfig.redis.heartbeatPrefix}${clawId}`;
}

export function getMeterKey(orgId: string, clawId: string, date: string): string {
  return `${ClawConfig.redis.meterPrefix}${orgId}:${clawId}:${date}`;
}

export function getFleetLockKey(hostId: string): string {
  return `${ClawConfig.redis.fleetLockPrefix}${hostId}`;
}

export function getSkillCacheKey(skillId: string): string {
  return `${ClawConfig.redis.skillCachePrefix}${skillId}`;
}

export function getCircuitBreakerKey(service: string): string {
  return `${ClawConfig.redis.circuitBreakerPrefix}${service}`;
}

export function getTokenRate(
  provider: string,
  model: string,
): { inputPer1k: number; outputPer1k: number } {
  const providerRates = ClawConfig.metering.rates[provider];
  if (!providerRates) {
    return { inputPer1k: 1, outputPer1k: 4 }; // safe fallback
  }
  return providerRates[model] || providerRates["default"] || { inputPer1k: 1, outputPer1k: 4 };
}
