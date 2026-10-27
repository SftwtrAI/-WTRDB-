"use strict";
/**
 * Admin Team Access Routes
 * These endpoints are accessible to both main admins AND admin team members
 * Uses checkAdminOrTeamMember middleware which allows team member session tokens
 *
 * IMPORTANT: Only define routes here that should be accessible to admin team members
 * All other admin routes should go in admin-routes.ts (main admin only)
 */
import { Router, Response } from "express";
import { checkAdminOrTeamMember, AdminRequest } from "../middleware/admin-auth";
import { storage } from "../storage";

const router = Router();

// Apply checkAdminOrTeamMember only to specific routes, NOT globally via router.use
// This prevents the middleware from running on unrelated /api/admin/* requests

router.get(
  "/analytics",
  checkAdminOrTeamMember,
  async (req: AdminRequest, res: Response) => {
    try {
      const { timeRange = "30d" } = req.query;
      const analytics = await storage.getGlobalAnalytics(timeRange as string);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  },
);

export default router;
