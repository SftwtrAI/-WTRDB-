"use strict";

import { Request, Response, NextFunction, RequestHandler } from "express";
import {
  AppError,
  isOperationalError,
  toAppError,
  getErrorMessage,
} from "../utils/errors";

/**
 * Custom request type that may include userId from authentication.
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
}

/**
 * Type for async route handlers that may throw errors.
 */
type AsyncHandler = (
  req: Request | AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => Promise<void | Response>;

/**
 * Wraps an async route handler to catch errors and pass them to the error middleware.
 * This ensures consistent async error handling as required by CodeCanyon standards.
 *
 * @param {AsyncHandler} handler - The async route handler to wrap
 * @returns {RequestHandler} Wrapped handler that catches and forwards errors
 *
 * @example
 * app.get('/api/users', asyncHandler(async (req, res) => {
 *   const users = await storage.getUsers();
 *   res.json(users);
 * }));
 */
export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Alias for asyncHandler - wraps async functions for Express error handling.
 * @param {AsyncHandler} fn - Async function to wrap
 * @returns {RequestHandler} Wrapped request handler
 */
export const catchAsync = asyncHandler;

/**
 * Global error handler middleware.
 * Handles all errors passed via next(error) and returns consistent JSON responses.
 *
 * @param {Error} err - The error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} _next - Express next function (unused but required by signature)
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appError = toAppError(err);

  const logContext = {
    method: req.method,
    path: req.path,
    userId: (req as AuthenticatedRequest).userId,
    errorCode: appError.code,
    timestamp: appError.timestamp,
  };

  if (!isOperationalError(err)) {
    console.error("[CRITICAL] Non-operational error:", {
      ...logContext,
      message: appError.message,
      stack: appError.stack,
    });
  } else if (appError.statusCode >= 500) {
    console.error("[ERROR] Server error:", {
      ...logContext,
      message: appError.message,
    });
  } else if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] Client error:", {
      ...logContext,
      message: appError.message,
    });
  }

  if (res.headersSent) {
    return;
  }

  const responseBody = appError.toJSON();
  // Add success: false for consistency
  (responseBody as Record<string, unknown>).success = false;

  if (process.env.NODE_ENV === "development" && appError.stack) {
    (responseBody as Record<string, unknown>).stack = appError.stack;
  }

  // Explicitly set Content-Type to prevent HTML responses for API routes
  res.setHeader("Content-Type", "application/json");
  res.status(appError.statusCode).json(responseBody);
}

/**
 * Handles 404 errors for undefined routes.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const error = new AppError(
    `Route ${req.method} ${req.path} not found`,
    404,
    "ROUTE_NOT_FOUND",
    true,
    {
      method: req.method,
      path: req.path,
    },
  );
  next(error);
}

/**
 * Creates a request validation middleware using Zod schemas.
 *
 * @param {object} schemas - Object containing Zod schemas for body, query, params
 * @returns {RequestHandler} Validation middleware
 *
 * @example
 * app.post('/api/users', validateRequest({ body: insertUserSchema }), handler);
 */
export function validateRequest(schemas: {
  body?: { parse: (data: unknown) => unknown };
  query?: { parse: (data: unknown) => unknown };
  params?: { parse: (data: unknown) => unknown };
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const appError = new AppError(
        `Validation failed: ${message}`,
        400,
        "VALIDATION_ERROR",
        true,
        { originalError: message },
      );
      next(appError);
    }
  };
}

/**
 * Middleware to handle uncaught promise rejections in the request cycle.
 * Should be added early in the middleware chain.
 */
export function unhandledRejectionHandler(): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    process.on("unhandledRejection", (reason: unknown) => {
      console.error("[CRITICAL] Unhandled Promise Rejection:", reason);
      const error = toAppError(reason, "Unhandled promise rejection");
      next(error);
    });
    next();
  };
}

/**
 * Rate limiting error response helper.
 *
 * @param {Response} res - Express response object
 * @param {number} retryAfter - Seconds until retry is allowed
 * @param {string} message - Custom error message
 */
export function sendRateLimitResponse(
  res: Response,
  retryAfter: number,
  message: string = "Too many requests",
): void {
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({
    error: message,
    code: "RATE_LIMIT_ERROR",
    retryAfter,
    timestamp: new Date().toISOString(),
  });
}
