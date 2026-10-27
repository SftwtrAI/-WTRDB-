import { Router, Request, Response } from "express";
import { openclawBridge } from "./openclaw-bridge";
import { logger } from "../../utils/logger";

const router = Router();
const SOURCE = "OpenClawRoutes";

/** GET /api/tasks/openclaw/health - Get OpenClaw bridge health status */
router.get("/tasks/openclaw/health", async (_req: Request, res: Response) => {
  try {
    const health = await openclawBridge.getHealth();
    res.json(health);
  } catch (error: any) {
    logger.error(SOURCE, `Error getting OpenClaw health: ${error.message}`);
    res.status(500).json({ error: "Failed to get OpenClaw health" });
  }
});

/** POST /api/tasks/openclaw/pull-image - Pull the OpenClaw Docker image */
router.post("/tasks/openclaw/pull-image", async (_req: Request, res: Response) => {
  try {
    await openclawBridge.ensureImage();
    res.json({ success: true, message: "Image pulled successfully" });
  } catch (error: any) {
    logger.error(SOURCE, `Error pulling image: ${error.message}`);
    res.status(500).json({ error: `Failed to pull image: ${error.message}` });
  }
});

/** POST /api/tasks/openclaw/cleanup - Cleanup orphaned containers */
router.post("/tasks/openclaw/cleanup", async (_req: Request, res: Response) => {
  try {
    await openclawBridge.cleanupOrphans();
    res.json({ success: true, message: "Orphaned containers cleaned up" });
  } catch (error: any) {
    logger.error(SOURCE, `Error cleaning up containers: ${error.message}`);
    res.status(500).json({ error: "Failed to cleanup containers" });
  }
});

export default router;
