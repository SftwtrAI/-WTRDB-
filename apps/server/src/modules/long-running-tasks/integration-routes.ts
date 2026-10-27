import { Router, Request, Response } from "express";
import * as integrationService from "./integration-service";
import * as automationScheduler from "./automation-scheduler";
import { logger } from "../../utils/logger";

const router = Router();
const SOURCE = "IntegrationRoutes";

function getUserId(req: Request): string {
  return (req as any).userId;
}

// ── Integrations CRUD ───────────────────────────

/** GET /api/tasks/integrations */
router.get("/tasks/integrations", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const integrations = await integrationService.getUserIntegrations(userId);
    res.json({ integrations });
  } catch (error: any) {
    logger.error(SOURCE, `Error listing integrations: ${error.message}`);
    res.status(500).json({ error: "Failed to list integrations" });
  }
});

/** POST /api/tasks/integrations */
router.post("/tasks/integrations", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, type, config, authConfig } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "name and type are required" });
    }

    const validTypes = ["webhook", "api_pull", "s3", "google_drive", "database", "custom"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    }

    const integration = await integrationService.createIntegration(userId, {
      name,
      type,
      config: config || null,
      authConfig: authConfig || null,
      isActive: true,
    });
    res.status(201).json({ integration });
  } catch (error: any) {
    logger.error(SOURCE, `Error creating integration: ${error.message}`);
    res.status(500).json({ error: "Failed to create integration" });
  }
});

/** PUT /api/tasks/integrations/:id */
router.put("/tasks/integrations/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const integration = await integrationService.updateIntegration(
      req.params.id,
      userId,
      req.body,
    );
    if (!integration) return res.status(404).json({ error: "Integration not found" });
    res.json({ integration });
  } catch (error: any) {
    logger.error(SOURCE, `Error updating integration: ${error.message}`);
    res.status(500).json({ error: "Failed to update integration" });
  }
});

/** DELETE /api/tasks/integrations/:id */
router.delete("/tasks/integrations/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const deleted = await integrationService.deleteIntegration(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: "Integration not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(SOURCE, `Error deleting integration: ${error.message}`);
    res.status(500).json({ error: "Failed to delete integration" });
  }
});

/** POST /api/tasks/integrations/:id/test - Test connection */
router.post("/tasks/integrations/:id/test", async (req: Request, res: Response) => {
  try {
    const integration = await integrationService.getIntegration(req.params.id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const result = await integrationService.testConnection(integration);
    res.json(result);
  } catch (error: any) {
    logger.error(SOURCE, `Error testing integration: ${error.message}`);
    res.status(500).json({ error: "Failed to test integration" });
  }
});

/** POST /api/tasks/integrations/:id/pull - Manually pull data */
router.post("/tasks/integrations/:id/pull", async (req: Request, res: Response) => {
  try {
    const integration = await integrationService.getIntegration(req.params.id);
    if (!integration) return res.status(404).json({ error: "Integration not found" });

    const run = await integrationService.pullData(integration);
    res.json({ run });
  } catch (error: any) {
    logger.error(SOURCE, `Error pulling data: ${error.message}`);
    res.status(500).json({ error: "Failed to pull data" });
  }
});

/** GET /api/tasks/integrations/:id/runs - Get integration run history */
router.get("/tasks/integrations/:id/runs", async (req: Request, res: Response) => {
  try {
    const runs = await integrationService.getIntegrationRuns(req.params.id);
    res.json({ runs });
  } catch (error: any) {
    logger.error(SOURCE, `Error getting integration runs: ${error.message}`);
    res.status(500).json({ error: "Failed to get integration runs" });
  }
});

// ── Automation Rules CRUD ───────────────────────

/** GET /api/tasks/automations */
router.get("/tasks/automations", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const rules = await automationScheduler.getUserAutomationRules(userId);
    res.json({ automations: rules });
  } catch (error: any) {
    logger.error(SOURCE, `Error listing automations: ${error.message}`);
    res.status(500).json({ error: "Failed to list automations" });
  }
});

/** POST /api/tasks/automations */
router.post("/tasks/automations", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, description, templateId, versionId, apiKeyId, trigger, inputMapping, integrationIds, isActive } = req.body;

    if (!name || !templateId || !trigger) {
      return res.status(400).json({ error: "name, templateId, and trigger are required" });
    }

    const rule = await automationScheduler.createAutomationRule(userId, {
      name,
      description: description || null,
      templateId,
      versionId: versionId || null,
      apiKeyId: apiKeyId || null,
      trigger,
      inputMapping: inputMapping || null,
      integrationIds: integrationIds || null,
      isActive: isActive !== false,
    });
    res.status(201).json({ automation: rule });
  } catch (error: any) {
    logger.error(SOURCE, `Error creating automation: ${error.message}`);
    res.status(500).json({ error: "Failed to create automation" });
  }
});

/** PUT /api/tasks/automations/:id */
router.put("/tasks/automations/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const rule = await automationScheduler.updateAutomationRule(
      req.params.id,
      userId,
      req.body,
    );
    if (!rule) return res.status(404).json({ error: "Automation rule not found" });
    res.json({ automation: rule });
  } catch (error: any) {
    logger.error(SOURCE, `Error updating automation: ${error.message}`);
    res.status(500).json({ error: "Failed to update automation" });
  }
});

/** DELETE /api/tasks/automations/:id */
router.delete("/tasks/automations/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const deleted = await automationScheduler.deleteAutomationRule(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: "Automation rule not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(SOURCE, `Error deleting automation: ${error.message}`);
    res.status(500).json({ error: "Failed to delete automation" });
  }
});

export default router;
