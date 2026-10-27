"use strict";

import { ExternalServiceError, AppError } from "./errors";

export type ServiceName = "Twilio" | "Stripe" | "Razorpay" | "OpenAI" | "SMTP";

interface ServiceErrorOptions {
  service: ServiceName;
  operation: string;
  originalError?: Error;
  context?: Record<string, unknown>;
  recoverable?: boolean;
}

export function wrapServiceError(
  options: ServiceErrorOptions,
): ExternalServiceError {
  const {
    service,
    operation,
    originalError,
    context,
    recoverable = false,
  } = options;

  let message = `${service} ${operation} failed`;

  if (originalError) {
    const errorMessage =
      originalError instanceof Error
        ? originalError.message
        : String(originalError);

    if (
      errorMessage.includes("timeout") ||
      errorMessage.includes("ETIMEDOUT")
    ) {
      message = `${service} service timeout during ${operation}`;
    } else if (
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ENOTFOUND")
    ) {
      message = `${service} service unavailable during ${operation}`;
    } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
      message = `${service} authentication failed during ${operation}`;
    } else if (errorMessage.includes("429")) {
      message = `${service} rate limit exceeded during ${operation}`;
    } else {
      message = `${service} ${operation} failed: ${errorMessage}`;
    }
  }

  return new ExternalServiceError(service, message, originalError, {
    ...context,
    operation,
    recoverable,
  });
}

export async function withServiceErrorHandling<T>(
  service: ServiceName,
  operation: string,
  fn: () => Promise<T>,
  options?: {
    fallback?: T;
    context?: Record<string, unknown>;
    logError?: boolean;
  },
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const originalError =
      error instanceof Error ? error : new Error(String(error));

    if (options?.logError !== false) {
      console.error(
        `❌ [${service}] ${operation} failed:`,
        originalError.message,
      );
    }

    if (options?.fallback !== undefined) {
      console.log(`⚠️ [${service}] Using fallback for ${operation}`);
      return options.fallback;
    }

    throw wrapServiceError({
      service,
      operation,
      originalError,
      context: options?.context,
    });
  }
}

export function isServiceError(error: unknown): error is ExternalServiceError {
  return error instanceof ExternalServiceError;
}

export function getServiceErrorMessage(error: unknown): string {
  if (error instanceof ExternalServiceError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface ServiceAvailability {
  available: boolean;
  reason?: string;
  lastChecked: Date;
}

const serviceAvailability = new Map<ServiceName, ServiceAvailability>();

export function markServiceUnavailable(
  service: ServiceName,
  reason: string,
): void {
  serviceAvailability.set(service, {
    available: false,
    reason,
    lastChecked: new Date(),
  });
  console.warn(`⚠️ [${service}] Marked as unavailable: ${reason}`);
}

export function markServiceAvailable(service: ServiceName): void {
  serviceAvailability.set(service, {
    available: true,
    lastChecked: new Date(),
  });
}

export function isServiceAvailable(service: ServiceName): ServiceAvailability {
  const status = serviceAvailability.get(service);
  if (!status) {
    return { available: true, lastChecked: new Date() };
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (!status.available && status.lastChecked < fiveMinutesAgo) {
    return { available: true, lastChecked: new Date() };
  }

  return status;
}
