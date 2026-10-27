"use strict";
/**
 * Get the correct domain for webhooks and callbacks
 * Works in both development and production environments
 *
 * Environment Variables:
 * - APP_DOMAIN: Primary domain for the application (e.g., "app.yourdomain.com")
 * - NODE_ENV: Set to "production" in production environments
 */
export function getDomain(fallbackHost?: string): string {
  let domain: string | undefined;

  // In development environment, use DEV_DOMAIN for correct webhook URLs
  // This ensures webhooks work correctly during development/testing
  if (process.env.DEV_DOMAIN && process.env.NODE_ENV !== "production") {
    domain = process.env.DEV_DOMAIN;
  }
  // Check for explicit APP_DOMAIN environment variable (recommended for production)
  else if (process.env.APP_DOMAIN) {
    domain = process.env.APP_DOMAIN;
  }
  // Fallback to the host header from request
  else if (fallbackHost) {
    domain = fallbackHost;
  }

  if (!domain) {
    throw new Error(
      "Unable to determine domain for webhooks. Please set APP_DOMAIN environment variable.",
    );
  }

  // Ensure domain always has https:// protocol prefix
  // This is required for proper URL generation (webhooks, WebSocket streams, etc.)
  if (!domain.startsWith("http://") && !domain.startsWith("https://")) {
    domain = "https://" + domain;
  }

  return domain;
}
