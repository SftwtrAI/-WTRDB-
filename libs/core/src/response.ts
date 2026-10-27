import type { Response } from "express";

export interface WtropsAiApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface WtropsAiPaginationOptions {
  page: number;
  limit: number;
  total: number;
}

export const wtropsResponse = {
  success<T>(res: Response, data: T, statusCode: number = 200): Response {
    const response: WtropsAiApiResponse<T> = {
      success: true,
      data,
    };
    return res.status(statusCode).json(response);
  },

  created<T>(res: Response, data: T): Response {
    return wtropsResponse.success(res, data, 201);
  },

  noContent(res: Response): Response {
    return res.status(204).send();
  },

  error(
    res: Response,
    message: string,
    statusCode: number = 500,
    code?: string,
  ): Response {
    const response: WtropsAiApiResponse = {
      success: false,
      error: message,
      code,
    };
    return res.status(statusCode).json(response);
  },

  validationError(
    res: Response,
    message: string,
    details?: Record<string, unknown>,
  ): Response {
    const response: WtropsAiApiResponse = {
      success: false,
      error: message,
      code: "VALIDATION_ERROR",
      ...(details && { data: details }),
    };
    return res.status(400).json(response);
  },

  unauthorized(
    res: Response,
    message: string = "Authentication required",
  ): Response {
    return wtropsResponse.error(res, message, 401, "UNAUTHORIZED");
  },

  forbidden(res: Response, message: string = "Access denied"): Response {
    return wtropsResponse.error(res, message, 403, "FORBIDDEN");
  },

  notFound(res: Response, resource: string = "Resource"): Response {
    return wtropsResponse.error(res, `${resource} not found`, 404, "NOT_FOUND");
  },

  paginated<T>(
    res: Response,
    data: T[],
    options: WtropsAiPaginationOptions,
  ): Response {
    const totalPages = Math.ceil(options.total / options.limit);
    const response: WtropsAiApiResponse<T[]> = {
      success: true,
      data,
      meta: {
        page: options.page,
        limit: options.limit,
        total: options.total,
        totalPages,
      },
    };
    return res.status(200).json(response);
  },
};
