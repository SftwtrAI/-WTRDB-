"use strict";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import {
  llmModels,
  users,
  knowledgeBase,
  userSubscriptions,
  insertPromptTemplateSchema,
} from "@wtrops/shared";
import { eq, sql } from "drizzle-orm";
import {
  authenticateToken,
  requireRole,
  type AuthRequest,
} from "./middleware/auth";
import { adminRouter } from "./routes/admin-routes";
import adminTeamAccessRoutes from "./routes/admin-team-access.routes";
import { createPublicRoutes } from "./routes/public-routes";
import { createAuthRoutes } from "./routes/auth-routes";
import { createMfaRoutes } from "./routes/mfa-routes";
import { createRouteContext } from "./routes/common";
import { internalToolsRouter } from "./routes/internal-tools-routes";
// KYC Engine
import { registerKycRoutes } from "./engines/kyc";
import { checkAdmin } from "./middleware/admin-auth";
import llmModelsRouter from "./routes/llm-models-routes";
import emailSettingsRouter from "./routes/email-settings-routes";
import { createRAGKnowledgeRoutes } from "./routes/rag-knowledge-routes";
import { createNotificationRoutes } from "./routes/notification-routes";
import { createUserWebhookRoutes } from "./routes/user-webhook-routes";
// Widget and avatar modules removed (wtrdb)
// Interview, JD, candidate, email config, automation modules removed (wtrdb)
// Long-running tasks module removed (wtrdb)
// Team Management Middleware - allows team members to access user data with their parent's userId
// Uses adapter for optional plugin loading
import {
  getTeamContextMiddleware,
  isTeamManagementInstalled,
  initializeAdapter as initTeamAdapter,
} from "./plugins/team-management-adapter";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server first
  const httpServer = createServer(app);

  // Create shared route context for dependency injection
  const routeContext = createRouteContext();

  // Register public routes (installer, health, branding, SEO, contact, etc.)
  const publicRoutes = createPublicRoutes(routeContext);
  app.use(publicRoutes);

  // Register authentication routes (login, register, OTP, password, etc.)
  const authRoutes = createAuthRoutes(routeContext);
  app.use(authRoutes);

  // Register MFA routes (TOTP setup, verify, disable — CMMC IA.2.081)
  const mfaRoutes = createMfaRoutes(routeContext);
  app.use(mfaRoutes);

  // Block all mutating requests for viewer role users (demo mode)
  // Placed after auth routes so login/refresh/logout still work
  const { viewerGuard } = await import("./middleware/viewer-guard");
  app.use(viewerGuard);

  // Apply team context middleware globally for all user-facing /api routes
  // This allows team members to access data using their parent user's userId
  // The middleware only activates when Team Management plugin is installed and
  // a Bearer token is present from team member auth
  if (isTeamManagementInstalled()) {
    await initTeamAdapter();
    app.use("/api", getTeamContextMiddleware());
    console.log(
      "✅ Team Management plugin detected - team context middleware enabled",
    );
  }

  // Register notification routes
  const notificationRoutes = createNotificationRoutes(routeContext);
  app.use(notificationRoutes);

  // Register user webhook routes (subscription management)
  const userWebhookRoutes = createUserWebhookRoutes(routeContext);
  app.use(userWebhookRoutes);

  // Internal tools API (agent-worker -> server, authenticated via shared secret)
  app.use("/api/internal/tools", internalToolsRouter);
  console.log("✅ Internal Tools API initialized");

  // Register KYC Engine routes
  // TODO: Express middleware type compatibility - KYC engine accepts generic middleware types
  // but authenticateToken/checkAdmin use extended Request types. Fixing requires updating the
  // KYC engine interface to accept properly typed middleware.
  registerKycRoutes(
    app,
    authenticateToken as unknown as import("express").RequestHandler,
    checkAdmin as unknown as import("express").RequestHandler,
  );

  // LLM Models - Get available models for current user (filtered by plan tier)
  app.get(
    "/api/llm-models/available",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { llmModels } = await import("@wtrops/shared");
        const { eq, and } = await import("drizzle-orm");

        // Get user to check their plan tier
        const user = await storage.getUser(req.userId!);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Fetch all active models
        const allModels = await db
          .select()
          .from(llmModels)
          .where(eq(llmModels.isActive, true))
          .orderBy(llmModels.sortOrder, llmModels.name);

        // Admins and Pro users can see all models
        if (user.role === "admin" || user.planType === "pro") {
          return res.json(allModels);
        }

        // Free users can only see free tier models
        const freeModels = allModels.filter((model) => model.tier === "free");
        res.json(freeModels);
      } catch (error: any) {
        console.error("Get available LLM models error:", error);
        res.status(500).json({ error: "Failed to get available LLM models" });
      }
    },
  );

  app.post(
    "/api/admin/users/:id/credits",
    authenticateToken,
    requireRole("admin", "manager"),
    async (req: AuthRequest, res: Response) => {
      try {
        const { amount, description } = req.body;

        if (typeof amount !== "number") {
          return res
            .status(400)
            .json({ error: "Amount is required and must be a number" });
        }

        const user = await storage.getUser(req.params.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const newCredits = user.credits + amount;
        await storage.updateUserCredits(user.id, newCredits);

        await storage.createCreditTransaction({
          userId: user.id,
          type: amount > 0 ? "credit" : "debit",
          amount,
          description:
            description ||
            (amount > 0 ? "Credit added by admin" : "Credit deducted by admin"),
          reference: null,
          stripePaymentId: null,
        });

        res.json({ success: true, newCredits });
      } catch (error: any) {
        console.error("Update user credits error:", error);
        res.status(500).json({ error: "Failed to update user credits" });
      }
    },
  );

  // Admin: Get user's effective limits and overrides
  app.get(
    "/api/admin/users/:id/limits",
    authenticateToken,
    requireRole("admin", "manager"),
    async (req: AuthRequest, res: Response) => {
      try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const limits = await storage.getUserEffectiveLimits(req.params.id);

        // Get subscription overrides if any
        const subscription = await storage.getUserSubscription(req.params.id);

        // Get current usage counts
        const webhookCount = await storage.getUserWebhookCount(req.params.id);
        const kbCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(knowledgeBase)
          .where(eq(knowledgeBase.userId, req.params.id));
        // flows table removed in wtrdb extraction
        const flowCount = [{ count: 0 }];

        res.json({
          userId: req.params.id,
          effectiveLimits: limits,
          overrides: subscription
            ? {
                overrideMaxWebhooks: subscription.overrideMaxWebhooks,
                overrideMaxKnowledgeBases:
                  subscription.overrideMaxKnowledgeBases,
                overrideMaxFlows: subscription.overrideMaxFlows,
              }
            : null,
          currentUsage: {
            webhooks: webhookCount,
            knowledgeBases: Number(kbCount[0]?.count || 0),
            flows: Number(flowCount[0]?.count || 0),
          },
        });
      } catch (error: any) {
        console.error("Get user limits error:", error);
        res.status(500).json({ error: "Failed to get user limits" });
      }
    },
  );

  // Admin: Update user's limit overrides
  app.patch(
    "/api/admin/users/:id/limits",
    authenticateToken,
    requireRole("admin", "manager"),
    async (req: AuthRequest, res: Response) => {
      try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const body = req.body;

        // Coerce and validate limit values: accept null, undefined (no change), or valid integers
        // Empty strings and "null" strings are coerced to null for convenience
        const coerceAndValidate = (
          value: any,
          name: string,
        ): number | null | undefined => {
          // undefined means don't change existing value
          if (value === undefined) return undefined;
          // null, empty string, or "null" string means inherit from plan
          if (value === null || value === "" || value === "null") return null;
          // Coerce string numbers to integers
          const numValue =
            typeof value === "string" ? parseInt(value, 10) : value;
          if (
            typeof numValue !== "number" ||
            isNaN(numValue) ||
            numValue < 0 ||
            !Number.isInteger(numValue)
          ) {
            throw new Error(
              `${name} must be null (inherit from plan) or a non-negative integer (use 999 for unlimited)`,
            );
          }
          return numValue;
        };

        const overrideMaxWebhooks = coerceAndValidate(
          body.overrideMaxWebhooks,
          "overrideMaxWebhooks",
        );
        const overrideMaxKnowledgeBases = coerceAndValidate(
          body.overrideMaxKnowledgeBases,
          "overrideMaxKnowledgeBases",
        );
        const overrideMaxFlows = coerceAndValidate(
          body.overrideMaxFlows,
          "overrideMaxFlows",
        );
        // Get or create subscription
        let subscription = await storage.getUserSubscription(req.params.id);

        if (!subscription) {
          // Create a free subscription with overrides
          subscription = await storage.createUserSubscription({
            userId: req.params.id,
            planId: "free",
            status: "active",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            overrideMaxWebhooks: overrideMaxWebhooks ?? null,
            overrideMaxKnowledgeBases: overrideMaxKnowledgeBases ?? null,
            overrideMaxFlows: overrideMaxFlows ?? null,
          });
        } else {
          // Update existing subscription with new overrides
          await db
            .update(userSubscriptions)
            .set({
              overrideMaxWebhooks:
                overrideMaxWebhooks !== undefined
                  ? overrideMaxWebhooks
                  : subscription.overrideMaxWebhooks,
              overrideMaxKnowledgeBases:
                overrideMaxKnowledgeBases !== undefined
                  ? overrideMaxKnowledgeBases
                  : subscription.overrideMaxKnowledgeBases,
              overrideMaxFlows:
                overrideMaxFlows !== undefined
                  ? overrideMaxFlows
                  : subscription.overrideMaxFlows,
            })
            .where(eq(userSubscriptions.id, subscription.id));
        }

        // Return updated limits
        const newLimits = await storage.getUserEffectiveLimits(req.params.id);
        res.json({ success: true, effectiveLimits: newLimits });
      } catch (error: any) {
        console.error("Update user limits error:", error);
        res
          .status(500)
          .json({ error: error.message || "Failed to update user limits" });
      }
    },
  );

  // Admin: Reset user's limit overrides to plan defaults
  app.delete(
    "/api/admin/users/:id/limits",
    authenticateToken,
    requireRole("admin", "manager"),
    async (req: AuthRequest, res: Response) => {
      try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const subscription = await storage.getUserSubscription(req.params.id);

        if (subscription) {
          // Reset all overrides to null (inherit from plan)
          await db
            .update(userSubscriptions)
            .set({
              overrideMaxWebhooks: null,
              overrideMaxKnowledgeBases: null,
              overrideMaxFlows: null,
            })
            .where(eq(userSubscriptions.id, subscription.id));
        }

        // Return updated limits
        const newLimits = await storage.getUserEffectiveLimits(req.params.id);
        res.json({
          success: true,
          effectiveLimits: newLimits,
          message: "User limits reset to plan defaults",
        });
      } catch (error: any) {
        console.error("Reset user limits error:", error);
        res.status(500).json({ error: "Failed to reset user limits" });
      }
    },
  );

  // Admin routes accessible by admin team members (read-only analytics)
  // Must be before main admin router to take precedence
  app.use("/api/admin", adminTeamAccessRoutes);

  // Admin routes (super admin only)
  app.use("/api/admin", adminRouter);

  // LLM Models admin routes
  app.use("/api/admin/llm-models", llmModelsRouter);

  // Admin Email Settings routes
  app.use("/api/admin/email-settings", emailSettingsRouter);

  // Voice widget, interview, task, and OpenCLAW routes removed (wtrdb)

  // RAG Knowledge Base routes (user-facing KB management)
  // Internal tools handle RAG queries from agent-worker
  const ragKnowledgeRoutes = createRAGKnowledgeRoutes(
    routeContext.authenticateHybrid,
  );
  app.use("/api/rag-knowledge", ragKnowledgeRoutes);

  // ============================================
  // PRD v3.4 — KNOWLEDGE GRAPH ENGINE ROUTES
  // ============================================

  // Enterprise RBAC routes (teams, roles, permissions, audit)
  const { createRbacRoutes } = await import("./routes/rbac-routes");
  const rbacRoutes = createRbacRoutes(routeContext);
  app.use(rbacRoutes);

  // Compliance & Policy Management routes
  const { createComplianceRoutes } = await import("./routes/compliance-routes");
  const complianceRoutes = createComplianceRoutes(routeContext);
  app.use(complianceRoutes);

  // Compliance Settings, Evidence & Scheduled Reports routes
  const { createComplianceSettingsRoutes } =
    await import("./routes/compliance-settings-routes");
  const complianceSettingsRoutes = createComplianceSettingsRoutes(routeContext);
  app.use(complianceSettingsRoutes);

  // Knowledge Graph (FalkorDB) routes
  const { createKnowledgeGraphRoutes } =
    await import("./routes/knowledge-graph-routes");
  const knowledgeGraphRoutes = createKnowledgeGraphRoutes(routeContext);
  app.use(knowledgeGraphRoutes);

  // Brain Endpoints — REST + MCP transports for published graphs
  const { createBrainEndpointRoutes } =
    await import("./routes/brain-endpoints-routes");
  const brainRoutes = createBrainEndpointRoutes(routeContext);
  app.use(brainRoutes);

  // Federation Registry & Merge Algebra routes (WS1) — legacy, being phased out
  const { createFederationRoutes } = await import("./routes/federation-routes");
  const federationRoutes = createFederationRoutes(routeContext);
  app.use(federationRoutes);

  // Meta-Knowledge Graphs — pattern + procedural facets, induction, projected query
  const { createMetaGraphsRoutes } = await import("./routes/meta-graphs-routes");
  const metaGraphsRoutes = createMetaGraphsRoutes(routeContext);
  app.use(metaGraphsRoutes);

  // Eval Harness routes (placeholder API contract for frontend)
  app.get(
    "/api/eval-harness/runs",
    routeContext.authenticateHybrid,
    async (_req: AuthRequest, res: Response) => {
      res.json([]);
    },
  );

  app.get(
    "/api/eval-harness/runs/:id/detail",
    routeContext.authenticateHybrid,
    async (_req: AuthRequest, res: Response) => {
      res.json([]);
    },
  );

  console.log(
    "✅ wtrdb engines initialized (RBAC, Compliance, KnowledgeGraph, Federation)",
  );

  // ============================================
  // USER LIMITS API
  // ============================================

  // Get all user limits and current usage
  app.get(
    "/api/user/limits",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const limits = await storage.getUserEffectiveLimits(req.userId!);

        // Get current counts
        const webhookCount = await storage.getUserWebhookCount(req.userId!);
        const kbCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(knowledgeBase)
          .where(eq(knowledgeBase.userId, req.userId!));
        // flows table removed in wtrdb extraction
        const flowCount = [{ count: 0 }];

        res.json({
          webhooks: {
            current: webhookCount,
            max: limits.maxWebhooks,
            remaining: Math.max(0, limits.maxWebhooks - webhookCount),
            source: limits.sources.maxWebhooks,
          },
          knowledgeBases: {
            current: Number(kbCount[0]?.count || 0),
            max: limits.maxKnowledgeBases,
            remaining: Math.max(
              0,
              limits.maxKnowledgeBases - Number(kbCount[0]?.count || 0),
            ),
            source: limits.sources.maxKnowledgeBases,
          },
          flows: {
            current: Number(flowCount[0]?.count || 0),
            max: limits.maxFlows,
            remaining: Math.max(
              0,
              limits.maxFlows - Number(flowCount[0]?.count || 0),
            ),
            source: limits.sources.maxFlows,
          },
        });
      } catch (error: any) {
        console.error("Get user limits error:", error);
        res.status(500).json({ error: "Failed to get user limits" });
      }
    },
  );

  // Notifications
  app.get(
    "/api/notifications",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : 50;
        const notifications = await storage.getUserNotifications(
          req.userId!,
          limit,
        );
        res.json(notifications);
      } catch (error: any) {
        console.error("Get notifications error:", error);
        res.status(500).json({ error: "Failed to get notifications" });
      }
    },
  );

  app.get(
    "/api/notifications/unread-count",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const count = await storage.getUnreadNotificationCount(req.userId!);
        res.json({ count });
      } catch (error: any) {
        console.error("Get unread count error:", error);
        res.status(500).json({ error: "Failed to get unread count" });
      }
    },
  );

  app.patch(
    "/api/notifications/:id/read",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const notification = await storage.getNotification(req.params.id);
        if (!notification || notification.userId !== req.userId) {
          return res.status(404).json({ error: "Notification not found" });
        }

        await storage.markNotificationAsRead(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Mark notification as read error:", error);
        res.status(500).json({ error: "Failed to mark notification as read" });
      }
    },
  );

  app.post(
    "/api/notifications/read-all",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.markAllNotificationsAsRead(req.userId!);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Mark all notifications as read error:", error);
        res
          .status(500)
          .json({ error: "Failed to mark all notifications as read" });
      }
    },
  );

  app.delete(
    "/api/notifications/:id",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const notification = await storage.getNotification(req.params.id);
        if (!notification || notification.userId !== req.userId) {
          return res.status(404).json({ error: "Notification not found" });
        }

        await storage.deleteNotification(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Delete notification error:", error);
        res.status(500).json({ error: "Failed to delete notification" });
      }
    },
  );

  app.get(
    "/api/notifications/banner",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const notifications = await storage.getBannerNotifications(req.userId!);
        res.json(notifications);
      } catch (error: any) {
        console.error("Get banner notifications error:", error);
        res.status(500).json({ error: "Failed to get banner notifications" });
      }
    },
  );

  app.patch(
    "/api/notifications/:id/dismiss",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const notification = await storage.getNotification(req.params.id);
        if (!notification || notification.userId !== req.userId) {
          return res.status(404).json({ error: "Notification not found" });
        }

        await storage.dismissNotification(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Dismiss notification error:", error);
        res.status(500).json({ error: "Failed to dismiss notification" });
      }
    },
  );

  app.post(
    "/api/admin/notifications/broadcast",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = await storage.getUser(req.userId!);
        if (user?.role !== "admin") {
          return res
            .status(403)
            .json({ error: "Only admins can send broadcast notifications" });
        }

        const {
          title,
          message,
          link,
          type = "system",
          icon,
          displayType = "bell",
          priority = 0,
          dismissible = true,
          expiresAt,
        } = req.body;

        if (!title || !message) {
          return res
            .status(400)
            .json({ error: "Title and message are required" });
        }

        if (displayType && !["bell", "banner", "both"].includes(displayType)) {
          return res
            .status(400)
            .json({ error: "displayType must be 'bell', 'banner', or 'both'" });
        }

        if (
          priority !== undefined &&
          (typeof priority !== "number" || priority < 0)
        ) {
          return res
            .status(400)
            .json({ error: "priority must be a non-negative number" });
        }

        if (dismissible !== undefined && typeof dismissible !== "boolean") {
          return res
            .status(400)
            .json({ error: "dismissible must be a boolean" });
        }

        let parsedExpiresAt: Date | null = null;
        if (expiresAt) {
          parsedExpiresAt = new Date(expiresAt);
          if (isNaN(parsedExpiresAt.getTime())) {
            return res
              .status(400)
              .json({ error: "expiresAt must be a valid date" });
          }
        }

        const users = await storage.getAllUsers();
        const notifications = await Promise.all(
          users.map((u) =>
            storage.createNotification({
              userId: u.id,
              type,
              title,
              message,
              link: link || null,
              icon: icon || null,
              displayType,
              priority,
              dismissible,
              expiresAt: parsedExpiresAt,
            }),
          ),
        );

        res.json({
          success: true,
          recipientCount: notifications.length,
          message: `Broadcast sent to ${notifications.length} users`,
        });
      } catch (error: any) {
        console.error("Broadcast notification error:", error);
        res
          .status(500)
          .json({ error: "Failed to send broadcast notification" });
      }
    },
  );

  // ============================================
  // PROMPT TEMPLATES ROUTES
  // ============================================

  // Get all prompt templates available to user (own + system + public)
  app.get(
    "/api/prompt-templates",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const category = req.query.category as string | undefined;

        // Get user's own templates
        const userTemplates = await storage.getUserPromptTemplates(req.userId!);

        // Get system templates
        const systemTemplates = await storage.getSystemPromptTemplates();

        // Get public templates (from other users)
        const publicTemplates = await storage.getPublicPromptTemplates();

        // Combine and deduplicate (user's own templates take priority, avoid system template duplicates)
        const userTemplateIds = new Set(userTemplates.map((t) => t.id));
        const systemTemplateIds = new Set(systemTemplates.map((t) => t.id));
        const filteredPublic = publicTemplates.filter(
          (t) =>
            !userTemplateIds.has(t.id) &&
            !systemTemplateIds.has(t.id) &&
            t.userId !== req.userId,
        );

        let allTemplates = [
          ...userTemplates,
          ...systemTemplates,
          ...filteredPublic,
        ];

        // Filter by category if specified
        if (category && category !== "all") {
          allTemplates = allTemplates.filter((t) => t.category === category);
        }

        res.json(allTemplates);
      } catch (error: any) {
        console.error("Get prompt templates error:", error);
        res.status(500).json({ error: "Failed to get prompt templates" });
      }
    },
  );

  // Get single prompt template
  app.get(
    "/api/prompt-templates/:id",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const template = await storage.getPromptTemplate(req.params.id);
        if (!template) {
          return res.status(404).json({ error: "Prompt template not found" });
        }

        // Allow access if: own template, system template, or public template
        const isOwn = template.userId === req.userId;
        const isSystem = template.isSystemTemplate;
        const isPublic = template.isPublic;

        if (!isOwn && !isSystem && !isPublic) {
          return res.status(403).json({ error: "Access denied" });
        }

        res.json(template);
      } catch (error: any) {
        console.error("Get prompt template error:", error);
        res.status(500).json({ error: "Failed to get prompt template" });
      }
    },
  );

  // Create prompt template
  app.post(
    "/api/prompt-templates",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        // Validate with Zod schema
        const validationResult = insertPromptTemplateSchema.safeParse({
          ...req.body,
          userId: req.userId,
          isSystemTemplate: false,
        });

        if (!validationResult.success) {
          const errors = validationResult.error.errors
            .map((e) => e.message)
            .join(", ");
          return res
            .status(400)
            .json({ error: `Validation failed: ${errors}` });
        }

        const {
          name,
          description,
          category,
          systemPrompt,
          firstMessage,
          variables,
          suggestedVoiceTone,
          suggestedPersonality,
          isPublic,
        } = validationResult.data;

        // Extract variables from template using {{variable}} pattern
        const extractedVars = (systemPrompt.match(/\{\{(\w+)\}\}/g) || []).map(
          (v: string) => v.replace(/\{\{|\}\}/g, ""),
        );
        const firstMsgVars = (firstMessage?.match(/\{\{(\w+)\}\}/g) || []).map(
          (v: string) => v.replace(/\{\{|\}\}/g, ""),
        );

        const allVariables = Array.from(
          new Set([...extractedVars, ...firstMsgVars, ...(variables || [])]),
        );

        const template = await storage.createPromptTemplate({
          userId: req.userId!,
          name,
          description: description || null,
          category: category || "general",
          systemPrompt,
          firstMessage: firstMessage || null,
          variables: allVariables.length > 0 ? allVariables : null,
          suggestedVoiceTone: suggestedVoiceTone || null,
          suggestedPersonality: suggestedPersonality || null,
          isSystemTemplate: false,
          isPublic: isPublic || false,
        });

        res.json(template);
      } catch (error: any) {
        console.error("Create prompt template error:", error);
        res.status(500).json({ error: "Failed to create prompt template" });
      }
    },
  );

  // Update prompt template
  app.patch(
    "/api/prompt-templates/:id",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const template = await storage.getPromptTemplate(req.params.id);
        if (!template) {
          return res.status(404).json({ error: "Prompt template not found" });
        }

        // Only owner can update (not system templates)
        if (template.userId !== req.userId || template.isSystemTemplate) {
          return res.status(403).json({ error: "Cannot modify this template" });
        }

        const {
          name,
          description,
          category,
          systemPrompt,
          firstMessage,
          variables,
          suggestedVoiceTone,
          suggestedPersonality,
          isPublic,
        } = req.body;

        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (category !== undefined) updates.category = category;
        if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
        if (firstMessage !== undefined) updates.firstMessage = firstMessage;
        if (suggestedVoiceTone !== undefined)
          updates.suggestedVoiceTone = suggestedVoiceTone;
        if (suggestedPersonality !== undefined)
          updates.suggestedPersonality = suggestedPersonality;
        if (isPublic !== undefined) updates.isPublic = isPublic;

        // Re-extract variables whenever systemPrompt or firstMessage changes
        if (systemPrompt !== undefined || firstMessage !== undefined) {
          const finalSystemPrompt = systemPrompt ?? template.systemPrompt;
          const finalFirstMessage = firstMessage ?? template.firstMessage;

          const extractedVars = (
            finalSystemPrompt.match(/\{\{(\w+)\}\}/g) || []
          ).map((v: string) => v.replace(/\{\{|\}\}/g, ""));
          const firstMsgVars = (
            finalFirstMessage?.match(/\{\{(\w+)\}\}/g) || []
          ).map((v: string) => v.replace(/\{\{|\}\}/g, ""));
          updates.variables = Array.from(
            new Set([...extractedVars, ...firstMsgVars]),
          );
        }

        await storage.updatePromptTemplate(req.params.id, updates);

        const updated = await storage.getPromptTemplate(req.params.id);
        res.json(updated);
      } catch (error: any) {
        console.error("Update prompt template error:", error);
        res.status(500).json({ error: "Failed to update prompt template" });
      }
    },
  );

  // Delete prompt template
  app.delete(
    "/api/prompt-templates/:id",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const template = await storage.getPromptTemplate(req.params.id);
        if (!template) {
          return res.status(404).json({ error: "Prompt template not found" });
        }

        // Only owner can delete (not system templates)
        if (template.userId !== req.userId || template.isSystemTemplate) {
          return res.status(403).json({ error: "Cannot delete this template" });
        }

        await storage.deletePromptTemplate(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Delete prompt template error:", error);
        res.status(500).json({ error: "Failed to delete prompt template" });
      }
    },
  );

  // Use template (increments usage count and returns interpolated content)
  app.post(
    "/api/prompt-templates/:id/use",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const template = await storage.getPromptTemplate(req.params.id);
        if (!template) {
          return res.status(404).json({ error: "Prompt template not found" });
        }

        // Allow access if: own template, system template, or public template
        const isOwn = template.userId === req.userId;
        const isSystem = template.isSystemTemplate;
        const isPublic = template.isPublic;

        if (!isOwn && !isSystem && !isPublic) {
          return res.status(403).json({ error: "Access denied" });
        }

        const { variableValues } = req.body;

        // Interpolate variables
        let systemPrompt = template.systemPrompt;
        let firstMessage = template.firstMessage;

        if (variableValues && typeof variableValues === "object") {
          for (const [key, value] of Object.entries(variableValues)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
            systemPrompt = systemPrompt.replace(regex, String(value));
            if (firstMessage) {
              firstMessage = firstMessage.replace(regex, String(value));
            }
          }
        }

        // Increment usage count
        await storage.incrementPromptTemplateUsage(req.params.id);

        res.json({
          systemPrompt,
          firstMessage,
          suggestedVoiceTone: template.suggestedVoiceTone,
          suggestedPersonality: template.suggestedPersonality,
          usedVariables: variableValues || {},
          missingVariables: (template.variables || []).filter(
            (v) => !variableValues || !(v in variableValues),
          ),
        });
      } catch (error: any) {
        console.error("Use prompt template error:", error);
        res.status(500).json({ error: "Failed to use prompt template" });
      }
    },
  );

  // Admin: Create/manage system templates
  app.post(
    "/api/admin/prompt-templates/system",
    authenticateToken,
    requireRole("admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          name,
          description,
          category,
          systemPrompt,
          firstMessage,
          variables,
          suggestedVoiceTone,
          suggestedPersonality,
        } = req.body;

        if (!name || !systemPrompt) {
          return res
            .status(400)
            .json({ error: "Name and system prompt are required" });
        }

        const template = await storage.createPromptTemplate({
          userId: null, // System templates have no owner
          name,
          description: description || null,
          category: category || "general",
          systemPrompt,
          firstMessage: firstMessage || null,
          variables: variables || null,
          suggestedVoiceTone: suggestedVoiceTone || null,
          suggestedPersonality: suggestedPersonality || null,
          isSystemTemplate: true,
          isPublic: true, // System templates are always public
        });

        res.json(template);
      } catch (error: any) {
        console.error("Create system prompt template error:", error);
        res
          .status(500)
          .json({ error: "Failed to create system prompt template" });
      }
    },
  );

  // Admin Email Templates Routes
  app.get(
    "/api/admin/email-templates",
    authenticateToken,
    requireRole("admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const templates = await storage.getEmailTemplates();
        res.json(templates);
      } catch (error: any) {
        console.error("Get email templates error:", error);
        res.status(500).json({ error: "Failed to get email templates" });
      }
    },
  );

  app.get(
    "/api/admin/email-templates/:templateType",
    authenticateToken,
    requireRole("admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const template = await storage.getEmailTemplate(
          req.params.templateType,
        );
        if (!template) {
          return res.status(404).json({ error: "Email template not found" });
        }
        res.json(template);
      } catch (error: any) {
        console.error("Get email template error:", error);
        res.status(500).json({ error: "Failed to get email template" });
      }
    },
  );

  app.put(
    "/api/admin/email-templates/:id",
    authenticateToken,
    requireRole("admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const { name, subject, htmlBody, textBody, variables, isActive } =
          req.body;
        await storage.updateEmailTemplate(req.params.id, {
          name,
          subject,
          htmlBody,
          textBody,
          variables,
          isActive,
        });
        res.json({
          success: true,
          message: "Email template updated successfully",
        });
      } catch (error: any) {
        console.error("Update email template error:", error);
        res.status(500).json({ error: "Failed to update email template" });
      }
    },
  );

  app.post(
    "/api/admin/email-templates",
    authenticateToken,
    requireRole("admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          templateType,
          name,
          subject,
          htmlBody,
          textBody,
          variables,
          isActive,
        } = req.body;

        if (!templateType || !name || !subject || !htmlBody || !textBody) {
          return res.status(400).json({
            error:
              "templateType, name, subject, htmlBody, and textBody are required",
          });
        }

        const existingTemplate = await storage.getEmailTemplate(templateType);
        if (existingTemplate) {
          return res
            .status(400)
            .json({ error: "Email template with this type already exists" });
        }

        const template = await storage.createEmailTemplate({
          templateType,
          name,
          subject,
          htmlBody,
          textBody,
          variables: variables || [],
          isActive: isActive !== undefined ? isActive : true,
        });

        res.json(template);
      } catch (error: any) {
        console.error("Create email template error:", error);
        res.status(500).json({ error: "Failed to create email template" });
      }
    },
  );

  // Interview scheduler, task processor, and OpenCLAW bridge removed (wtrdb)

  return httpServer;
}
