export class WtropsAiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "WTROPS_ERROR",
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WtropsAiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class WtropsAiValidationError extends WtropsAiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "WtropsAiValidationError";
  }
}

export class WtropsAiAuthError extends WtropsAiError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "AUTH_ERROR");
    this.name = "WtropsAiAuthError";
  }
}

export class WtropsAiForbiddenError extends WtropsAiError {
  constructor(message: string = "Access denied") {
    super(message, 403, "FORBIDDEN_ERROR");
    this.name = "WtropsAiForbiddenError";
  }
}

export class WtropsAiNotFoundError extends WtropsAiError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND_ERROR");
    this.name = "WtropsAiNotFoundError";
  }
}

export class WtropsAiRateLimitError extends WtropsAiError {
  constructor(message: string = "Too many requests") {
    super(message, 429, "RATE_LIMIT_ERROR");
    this.name = "WtropsAiRateLimitError";
  }
}

export class WtropsAiExternalServiceError extends WtropsAiError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, 502, "EXTERNAL_SERVICE_ERROR", { service });
    this.name = "WtropsAiExternalServiceError";
  }
}
