"use strict";

/**
 * OPA (Open Policy Agent) Client
 *
 * HTTP client for the OPA sidecar at localhost:8181.
 * Implements circuit breaker pattern with fail-closed semantics:
 * if OPA is unreachable, all requests are DENIED.
 */

import { logger } from "../../../utils/logger";
import { ClawConfig } from "../config";

const SOURCE = "OpaClient";

// ── Types ──

export interface OpaInput {
  org_id: string;
  claw_id: string;
  action: string;
  resource: string;
  context?: Record<string, any>;
}

export interface OpaPolicyResult {
  allow: boolean;
  reason?: string;
}

interface OpaResponse {
  result?: {
    allow?: boolean;
    reason?: string;
  };
}

// ── Circuit Breaker State (in-process) ──

interface CircuitBreakerState {
  failures: number;
  lastFailureAt: number;
  isOpen: boolean;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

function getCircuitBreaker(key: string): CircuitBreakerState {
  let cb = circuitBreakers.get(key);
  if (!cb) {
    cb = { failures: 0, lastFailureAt: 0, isOpen: false };
    circuitBreakers.set(key, cb);
  }
  return cb;
}

function recordSuccess(key: string): void {
  const cb = getCircuitBreaker(key);
  cb.failures = 0;
  cb.isOpen = false;
}

function recordFailure(key: string): void {
  const cb = getCircuitBreaker(key);
  cb.failures += 1;
  cb.lastFailureAt = Date.now();

  if (cb.failures >= ClawConfig.opa.circuitBreaker.failureThreshold) {
    cb.isOpen = true;
    logger.warn(
      `OPA circuit breaker OPEN after ${cb.failures} consecutive failures — all requests will be DENIED`,
      undefined,
      SOURCE,
    );
  }
}

function isCircuitOpen(key: string): boolean {
  const cb = getCircuitBreaker(key);
  if (!cb.isOpen) return false;

  // Check if reset window has elapsed
  const elapsed = Date.now() - cb.lastFailureAt;
  if (elapsed >= ClawConfig.opa.circuitBreaker.resetTimeMs) {
    cb.isOpen = false;
    cb.failures = 0;
    logger.info("OPA circuit breaker RESET — allowing requests again", undefined, SOURCE);
    return false;
  }

  return true;
}

// ── Public API ──

/**
 * Evaluate an authorization request against OPA.
 *
 * Fail-closed: if OPA is unreachable or the circuit breaker is open,
 * the request is DENIED. This prevents privilege escalation when
 * the policy engine is down.
 */
export async function evaluate(input: OpaInput): Promise<OpaPolicyResult> {
  const cbKey = "opa-authz";

  // Circuit breaker check
  if (isCircuitOpen(cbKey)) {
    return {
      allow: false,
      reason: "Policy engine unavailable (circuit breaker open) — fail-closed deny",
    };
  }

  const url = `${ClawConfig.opa.url}${ClawConfig.opa.policyPath}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ClawConfig.opa.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      recordFailure(cbKey);
      logger.error(
        `OPA returned HTTP ${response.status}: ${response.statusText}`,
        undefined,
        SOURCE,
      );
      return {
        allow: false,
        reason: `Policy engine error (HTTP ${response.status}) — fail-closed deny`,
      };
    }

    const body: OpaResponse = await response.json();
    recordSuccess(cbKey);

    const allow = body.result?.allow === true;
    const reason = body.result?.reason;

    if (!allow) {
      logger.info(
        `OPA DENIED: org=${input.org_id} claw=${input.claw_id} action=${input.action} resource=${input.resource} reason=${reason || "policy denied"}`,
        undefined,
        SOURCE,
      );
    }

    return { allow, reason: reason || (allow ? undefined : "Denied by policy") };
  } catch (error: any) {
    clearTimeout(timeoutId);
    recordFailure(cbKey);

    const isTimeout = error.name === "AbortError";
    const errorType = isTimeout ? "timeout" : "connection error";

    logger.error(
      `OPA ${errorType}: ${error.message} — fail-closed deny for org=${input.org_id} action=${input.action}`,
      undefined,
      SOURCE,
    );

    return {
      allow: false,
      reason: `Policy engine unreachable (${errorType}) — fail-closed deny`,
    };
  }
}

/**
 * Evaluate a batch of policy checks.
 * Returns a map of action -> result. Useful for preflight permission checks.
 */
export async function evaluateBatch(
  orgId: string,
  clawId: string,
  actions: Array<{ action: string; resource: string; context?: Record<string, any> }>,
): Promise<Map<string, OpaPolicyResult>> {
  const results = new Map<string, OpaPolicyResult>();

  // Evaluate in parallel — each request is independently circuit-broken
  const promises = actions.map(async (a) => {
    const result = await evaluate({
      org_id: orgId,
      claw_id: clawId,
      action: a.action,
      resource: a.resource,
      context: a.context,
    });
    return { key: `${a.action}:${a.resource}`, result };
  });

  const settled = await Promise.allSettled(promises);
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.set(outcome.value.key, outcome.value.result);
    }
  }

  return results;
}

/**
 * Health check for the OPA sidecar.
 * Does NOT use the circuit breaker — always attempts a real connection.
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  latencyMs: number;
  circuitBreakerOpen: boolean;
}> {
  const start = Date.now();
  const cbKey = "opa-authz";
  const cbOpen = isCircuitOpen(cbKey);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${ClawConfig.opa.url}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return {
      healthy: response.ok,
      latencyMs: Date.now() - start,
      circuitBreakerOpen: cbOpen,
    };
  } catch {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      circuitBreakerOpen: cbOpen,
    };
  }
}

/**
 * Reset the circuit breaker manually (admin operation).
 */
export function resetCircuitBreaker(): void {
  circuitBreakers.delete("opa-authz");
  logger.info("OPA circuit breaker manually reset", undefined, SOURCE);
}
