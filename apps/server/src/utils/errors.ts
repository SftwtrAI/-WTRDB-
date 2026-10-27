"use strict";

/**
 * Base application error class that extends the native Error object.
 * Implements the Error contract as required by CodeCanyon/Envato standards.
 *
 * @class AppError
 * @extends Error
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: string;
  public readonly cause?: Error;

  /**
   * Creates an instance of AppError.
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} code - Machine-readable error code (default: 'INTERNAL_ERROR')
   * @param {boolean} isOperational - Whether this is an operational error (default: true)
   * @param {Record<string, unknown>} context - Additional context for debugging
   * @param {Error} cause - Original error that caused this error (for error wrapping)
   */
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    isOperational: boolean = true,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.cause = cause;

    Error.captureStackTrace(this, this.constructor);

    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Converts the error to a JSON-serializable object for API responses.
   * Excludes sensitive information like stack traces in production.
   * @returns {object} JSON representation of the error
   */
  public toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
    };

    if (process.env.NODE_ENV === "development" && this.context) {
      json.context = this.context;
    }

    return json;
  }

  /**
   * Wraps an existing error with additional context.
   * @param {Error} originalError - The original error to wrap
   * @param {string} message - New message for context
   * @param {Record<string, unknown>} additionalContext - Extra context to add
   * @returns {AppError} Wrapped error instance
   */
  public static wrap(
    originalError: Error,
    message: string,
    additionalContext?: Record<string, unknown>,
  ): AppError {
    const context: Record<string, unknown> = {
      originalMessage: originalError.message,
      originalName: originalError.name,
      ...additionalContext,
    };

    return new AppError(
      message,
      500,
      "WRAPPED_ERROR",
      true,
      context,
      originalError,
    );
  }
}

/**
 * Error for invalid request data (400 Bad Request).
 * @class ValidationError
 * @extends AppError
 */
export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(
    message: string,
    fields?: Record<string, string>,
    context?: Record<string, unknown>,
  ) {
    super(message, 400, "VALIDATION_ERROR", true, context);
    this.fields = fields;
  }

  public toJSON(): Record<string, unknown> {
    const json = super.toJSON();
    if (this.fields) {
      json.fields = this.fields;
    }
    return json;
  }
}

/**
 * Error for authentication failures (401 Unauthorized).
 * @class AuthenticationError
 * @extends AppError
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string = "Authentication required",
    context?: Record<string, unknown>,
  ) {
    super(message, 401, "AUTHENTICATION_ERROR", true, context);
  }
}

/**
 * Error for authorization failures (403 Forbidden).
 * @class AuthorizationError
 * @extends AppError
 */
export class AuthorizationError extends AppError {
  constructor(
    message: string = "Access denied",
    context?: Record<string, unknown>,
  ) {
    super(message, 403, "AUTHORIZATION_ERROR", true, context);
  }
}

/**
 * Error for resource not found (404 Not Found).
 * @class NotFoundError
 * @extends AppError
 */
export class NotFoundError extends AppError {
  public readonly resourceType?: string;
  public readonly resourceId?: string;

  constructor(
    message: string = "Resource not found",
    resourceType?: string,
    resourceId?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 404, "NOT_FOUND", true, {
      ...context,
      resourceType,
      resourceId,
    });
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Error for conflict situations (409 Conflict).
 * @class ConflictError
 * @extends AppError
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 409, "CONFLICT_ERROR", true, context);
  }
}

/**
 * Error for rate limiting (429 Too Many Requests).
 * @class RateLimitError
 * @extends AppError
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(
    message: string = "Too many requests",
    retryAfter?: number,
    context?: Record<string, unknown>,
  ) {
    super(message, 429, "RATE_LIMIT_ERROR", true, {
      ...context,
      retryAfter,
    });
    this.retryAfter = retryAfter;
  }
}

/**
 * Error for external service failures (502 Bad Gateway).
 * @class ExternalServiceError
 * @extends AppError
 */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string;
  public readonly serviceError?: string;

  constructor(
    serviceName: string,
    message: string,
    originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    super(
      message,
      502,
      "EXTERNAL_SERVICE_ERROR",
      true,
      {
        ...context,
        serviceName,
        serviceError: originalError?.message,
      },
      originalError,
    );
    this.serviceName = serviceName;
    this.serviceError = originalError?.message;
  }
}

/**
 * Error for payment-related failures.
 * @class PaymentError
 * @extends AppError
 */
export class PaymentError extends AppError {
  public readonly provider: string;
  public readonly transactionId?: string;

  constructor(
    provider: string,
    message: string,
    transactionId?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 402, "PAYMENT_ERROR", true, {
      ...context,
      provider,
      transactionId,
    });
    this.provider = provider;
    this.transactionId = transactionId;
  }
}

/**
 * Error for database operations.
 * @class DatabaseError
 * @extends AppError
 */
export class DatabaseError extends AppError {
  public readonly operation?: string;
  public readonly table?: string;

  constructor(
    message: string,
    operation?: string,
    table?: string,
    originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    super(
      message,
      500,
      "DATABASE_ERROR",
      true,
      {
        ...context,
        operation,
        table,
      },
      originalError,
    );
    this.operation = operation;
    this.table = table;
  }
}

/**
 * Error for configuration issues.
 * @class ConfigurationError
 * @extends AppError
 */
export class ConfigurationError extends AppError {
  public readonly configKey?: string;

  constructor(
    message: string,
    configKey?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 500, "CONFIGURATION_ERROR", false, {
      ...context,
      configKey,
    });
    this.configKey = configKey;
  }
}

/**
 * Error for webhook signature validation failures.
 * @class WebhookValidationError
 * @extends AppError
 */
export class WebhookValidationError extends AppError {
  public readonly provider: string;

  constructor(
    provider: string,
    message: string = "Invalid webhook signature",
    context?: Record<string, unknown>,
  ) {
    super(message, 401, "WEBHOOK_VALIDATION_ERROR", true, {
      ...context,
      provider,
    });
    this.provider = provider;
  }
}

/**
 * Error for insufficient credits.
 * @class InsufficientCreditsError
 * @extends AppError
 */
export class InsufficientCreditsError extends AppError {
  public readonly required: number;
  public readonly available: number;

  constructor(
    required: number,
    available: number,
    context?: Record<string, unknown>,
  ) {
    super(
      `Insufficient credits. Required: ${required}, Available: ${available}`,
      402,
      "INSUFFICIENT_CREDITS",
      true,
      {
        ...context,
        required,
        available,
      },
    );
    this.required = required;
    this.available = available;
  }
}

/**
 * Error for plan limit exceeded.
 * @class PlanLimitError
 * @extends AppError
 */
export class PlanLimitError extends AppError {
  public readonly limitType: string;
  public readonly currentValue: number;
  public readonly maxValue: number;

  constructor(
    limitType: string,
    currentValue: number,
    maxValue: number,
    context?: Record<string, unknown>,
  ) {
    super(
      `${limitType} limit reached. Maximum allowed: ${maxValue}`,
      403,
      "PLAN_LIMIT_EXCEEDED",
      true,
      {
        ...context,
        limitType,
        currentValue,
        maxValue,
        upgradeRequired: true,
      },
    );
    this.limitType = limitType;
    this.currentValue = currentValue;
    this.maxValue = maxValue;
  }
}

/**
 * Checks if an error is an operational error (expected, handled).
 * @param {Error} error - The error to check
 * @returns {boolean} True if operational, false if programmer error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Safely extracts error message from unknown error types.
 * @param {unknown} error - Unknown error value
 * @returns {string} Error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}

/**
 * Wraps an unknown error into an AppError.
 * @param {unknown} error - Unknown error value
 * @param {string} fallbackMessage - Message to use if error is not an Error instance
 * @returns {AppError} AppError instance
 */
export function toAppError(
  error: unknown,
  fallbackMessage: string = "An unexpected error occurred",
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return AppError.wrap(error, error.message);
  }

  return new AppError(
    typeof error === "string" ? error : fallbackMessage,
    500,
    "UNKNOWN_ERROR",
    false,
  );
}
