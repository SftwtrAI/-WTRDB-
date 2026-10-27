import { Router, Request, Response } from "express";
import * as taskService from "./task-service";
import { logger } from "../../utils/logger";

const router = Router();
const SOURCE = "TaskRoutes";

function getUserId(req: Request): string {
  return (req as any).userId;
}

// ── Templates CRUD ──────────────────────────────

/** GET /api/tasks/templates */
router.get("/tasks/templates", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const templates = await taskService.getUserTemplates(userId, limit, offset);
    res.json({ templates });
  } catch (error: any) {
    logger.error(SOURCE, `Error listing templates: ${error.message}`);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

/** POST /api/tasks/templates */
router.post("/tasks/templates", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, description, category, icon, inputSchema, defaultOutputStyle, tags, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const template = await taskService.createTemplate(userId, {
      name,
      description: description || null,
      category: category || null,
      icon: icon || null,
      inputSchema: inputSchema || null,
      defaultOutputStyle: defaultOutputStyle || null,
      tags: tags || null,
      isPublic: isPublic || false,
    });
    res.status(201).json({ template });
  } catch (error: any) {
    logger.error(SOURCE, `Error creating template: ${error.message}`);
    res.status(500).json({ error: "Failed to create template" });
  }
});

/** GET /api/tasks/templates/:id */
router.get("/tasks/templates/:id", async (req: Request, res: Response) => {
  try {
    const template = await taskService.getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ template });
  } catch (error: any) {
    logger.error(SOURCE, `Error getting template: ${error.message}`);
    res.status(500).json({ error: "Failed to get template" });
  }
});

/** PUT /api/tasks/templates/:id */
router.put("/tasks/templates/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const template = await taskService.updateTemplate(req.params.id, userId, req.body);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ template });
  } catch (error: any) {
    logger.error(SOURCE, `Error updating template: ${error.message}`);
    res.status(500).json({ error: "Failed to update template" });
  }
});

/** DELETE /api/tasks/templates/:id */
router.delete("/tasks/templates/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const archived = await taskService.archiveTemplate(req.params.id, userId);
    if (!archived) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(SOURCE, `Error archiving template: ${error.message}`);
    res.status(500).json({ error: "Failed to archive template" });
  }
});

// ── Template Versions ───────────────────────────

/** GET /api/tasks/templates/:id/versions */
router.get("/tasks/templates/:id/versions", async (req: Request, res: Response) => {
  try {
    const versions = await taskService.getTemplateVersions(req.params.id);
    res.json({ versions });
  } catch (error: any) {
    logger.error(SOURCE, `Error listing versions: ${error.message}`);
    res.status(500).json({ error: "Failed to list versions" });
  }
});

/** POST /api/tasks/templates/:id/versions */
router.post("/tasks/templates/:id/versions", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { systemPrompt, userPrompt, toolsConfig, outputStyle, inputSchema, changeNotes, status } = req.body;

    const version = await taskService.createVersion(req.params.id, userId, {
      systemPrompt: systemPrompt || null,
      userPrompt: userPrompt || null,
      toolsConfig: toolsConfig || null,
      outputStyle: outputStyle || null,
      inputSchema: inputSchema || null,
      changeNotes: changeNotes || null,
      status: status || "draft",
      publishedAt: null,
    });
    res.status(201).json({ version });
  } catch (error: any) {
    logger.error(SOURCE, `Error creating version: ${error.message}`);
    res.status(500).json({ error: "Failed to create version" });
  }
});

/** GET /api/tasks/versions/:id */
router.get("/tasks/versions/:id", async (req: Request, res: Response) => {
  try {
    const version = await taskService.getVersion(req.params.id);
    if (!version) return res.status(404).json({ error: "Version not found" });
    res.json({ version });
  } catch (error: any) {
    logger.error(SOURCE, `Error getting version: ${error.message}`);
    res.status(500).json({ error: "Failed to get version" });
  }
});

/** PUT /api/tasks/versions/:id */
router.put("/tasks/versions/:id", async (req: Request, res: Response) => {
  try {
    const version = await taskService.updateVersion(req.params.id, req.body);
    if (!version) return res.status(404).json({ error: "Version not found" });
    res.json({ version });
  } catch (error: any) {
    logger.error(SOURCE, `Error updating version: ${error.message}`);
    res.status(500).json({ error: "Failed to update version" });
  }
});

/** POST /api/tasks/versions/:id/publish */
router.post("/tasks/versions/:id/publish", async (req: Request, res: Response) => {
  try {
    const version = await taskService.getVersion(req.params.id);
    if (!version) return res.status(404).json({ error: "Version not found" });

    const published = await taskService.publishVersion(req.params.id, version.templateId);
    if (!published) return res.status(500).json({ error: "Failed to publish version" });
    res.json({ version: published });
  } catch (error: any) {
    logger.error(SOURCE, `Error publishing version: ${error.message}`);
    res.status(500).json({ error: "Failed to publish version" });
  }
});

/** DELETE /api/tasks/versions/:id */
router.delete("/tasks/versions/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await taskService.deleteVersion(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Version not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(SOURCE, `Error deleting version: ${error.message}`);
    res.status(500).json({ error: "Failed to delete version" });
  }
});

export default router;
