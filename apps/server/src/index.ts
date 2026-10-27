"use strict";
import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import {
  runStartupHealthCheck,
  getHealthStatus,
} from "./services/startup-health-check";
import {
  setupGlobalHandlers,
  registerServer,
  signalReady,
} from "./services/graceful-shutdown";
import { startWatchdog } from "./services/resource-watchdog";
import { webhookRetryService } from "./services/webhook-retry-service";
import { preloadJwtExpiry, authenticateToken } from "./middleware/auth";
import { registerMcpRoutes } from "./mcp/server";
import mcpRoutes from "./routes/mcp-routes";
import { storage } from "./storage";

import { correlationIdMiddleware } from "./middleware/correlation-id";
import { emailService } from "./services/email-service";
import { initializeDirectories } from "./utils/init-directories";
import { falkordbPoolManager } from "./infrastructure";
import { WebSocketServer } from "ws";
import { verifyAccessToken } from "./middleware/auth";
import { wsManager } from "./infrastructure/websocket/connection-manager";
import { randomUUID } from "crypto";

// Setup global error handlers and shutdown signals FIRST
// This ensures crashes are caught even during initialization
setupGlobalHandlers();

// Ensure all required directories exist before starting
initializeDirectories();

// Wtrops.ai startup signature
console.log(`
====================================
Wtrops.ai Initialized
©Wtrops.ai
Unauthorized distribution prohibited
`);

const app = express();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}
app.use(
  express.json({
    limit: "10mb", // Increase limit for large webhook payloads (transcripts can be large)
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(cookieParser()); // Parse cookies for refresh token handling

// Serve static files from client/public folder (for uploads like SEO images)
// This must come before API routes so /uploads/* URLs are served correctly
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "client", "public", "uploads")),
);

// Serve static images from client/public/images folder (for logos, favicons, SEO images)
// Images are stored as files instead of base64 to prevent database timeouts
app.use(
  "/images",
  express.static(path.join(process.cwd(), "client", "public", "images")),
);

// Correlation ID middleware for distributed request tracing
app.use(correlationIdMiddleware);

// Wtrops.ai author attribution header
app.use((_req, res, next) => {
  res.setHeader("X-Author", "Wtrops.ai");
  res.setHeader("X-Powered-By", "Wtrops.ai by Wtrops.ai");
  next();
});

// Simple health check endpoint for deployment
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Detailed health check endpoint with integration status
app.get("/health/detailed", async (_req, res) => {
  try {
    const status = await getHealthStatus();
    const httpStatus =
      status.status === "healthy"
        ? 200
        : status.status === "degraded"
          ? 200
          : 503;
    res.status(httpStatus).json(status);
  } catch (error: any) {
    res.status(503).json({ status: "unhealthy", error: error.message });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Include correlation ID (first 8 chars) in logs for request tracing
      const correlationPrefix = req.correlationId
        ? `[${req.correlationId.slice(0, 8)}] `
        : "";
      let logLine = `${correlationPrefix}${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 90) {
        logLine = logLine.slice(0, 89) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize email service from database settings FIRST (before health check)
  // This ensures database SMTP settings take precedence over env vars
  try {
    const emailInitialized = await emailService.reinitializeFromDatabase();
    if (emailInitialized) {
      console.log("📧 [Email] Service initialized from database settings");
    }
  } catch (error) {
    console.error("⚠️ [Email] Failed to initialize from database:", error);
  }

  // Initialize FalkorDB (Knowledge Graph) — optional, non-blocking
  try {
    await falkordbPoolManager.initialize();
  } catch (error) {
    console.warn("⚠️ [FalkorDB] Failed to initialize (knowledge graph features will be disabled):", (error as Error).message);
  }

  // Run startup health checks before serving traffic
  try {
    await runStartupHealthCheck();
  } catch (error) {
    console.error("❌ [Startup] Health check failed:", error);
  }

  // Preload JWT expiry settings from database
  await preloadJwtExpiry(storage);

  // Register MCP endpoints (Tool access for agents)
  await registerMcpRoutes(app);

  app.use("/api/mcp-servers", authenticateToken as unknown as import('express').RequestHandler, mcpRoutes);

  const server = await registerRoutes(app);

  // ── WebSocket server for real-time knowledge graph extraction events ──
  // Mounted on the same HTTP server, listening for upgrade requests at /ws/kg-events.
  // Auth: JWT passed as ?token=... query param (browsers can't set headers on WS).
  const kgWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);

    if (url.pathname !== "/ws/kg-events") {
      // Not our path — let other handlers (or default) deal with it
      return;
    }

    const token = url.searchParams.get("token");
    if (!token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    kgWss.handleUpgrade(request, socket, head, async (ws) => {
      const connectionId = randomUUID();
      const ip =
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        request.socket.remoteAddress ||
        undefined;

      const accepted = await wsManager.addConnection(
        connectionId,
        ws,
        decoded.userId,
        ip,
      );

      if (!accepted) {
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { message: "Connection limit reached" },
          }),
        );
        ws.close();
        return;
      }

      // Send a hello so the client knows the connection is live
      ws.send(
        JSON.stringify({
          type: "kg_ws_connected",
          payload: { connectionId, userId: decoded.userId },
        }),
      );

      console.log(
        `[KG WS] Connection established: ${connectionId} (user: ${decoded.userId})`,
      );
    });
  });

  // Global error handler - ALWAYS returns JSON for API routes
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Include correlation ID in error response for debugging
    const correlationId = req.correlationId;
    const errorResponse: any = {
      success: false,
      error: message,
      message,
    };
    if (correlationId) {
      errorResponse.correlationId = correlationId;
    }

    // Log the error for debugging (don't re-throw as that crashes the server)
    console.error(
      `[Error Handler] ${req.method} ${req.path}:`,
      err.message || err,
    );

    // Always return JSON response for API routes, never crash the server
    if (!res.headersSent) {
      // Explicitly set Content-Type to prevent HTML responses
      res.setHeader("Content-Type", "application/json");
      res.status(status).json(errorResponse);
    }
  });

  // API 404 handler - catches any /api/* route that wasn't matched
  // This MUST run before Vite catch-all to prevent HTML responses for API routes
  app.use("/api/*", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.status(404).json({
      success: false,
      error: "API endpoint not found",
      path: req.originalUrl,
      method: req.method,
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  const isProduction =
    app.get("env") === "production" || process.env.NODE_ENV === "production";

  if (!isProduction) {
    await setupVite(app, server);
  } else {
    // Set NODE_ENV to production for proper middleware behavior
    process.env.NODE_ENV = "production";
    app.set("env", "production");
    log("Running in PRODUCTION mode");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);

  // Register the server for graceful shutdown
  registerServer(server);

  server.listen(
    {
      port,
      host: "0.0.0.0",
      // reusePort uses SO_REUSEPORT_LB (load-balanced), which macOS does
      // not support — listen() fails with ENOTSUP. Only enable on Linux.
      ...(process.platform === "linux" ? { reusePort: true } : {}),
    },
    () => {
      log(`serving on port ${port}`);

      // Start resource watchdog for auto-restart monitoring
      startWatchdog();

      // Start webhook retry service for Brain API webhooks
      webhookRetryService.start();

      // Signal PM2 that the process is ready to receive connections
      signalReady();
    },
  );
})();
