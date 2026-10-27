import { Router, Request, Response } from "express";
import { apiKeyStorage } from "./task-storage";
import { encryptApiKey } from "./execution-service";
import { logger } from "../../utils/logger";

const router = Router();
const SOURCE = "ApiKeyRoutes";

function getUserId(req: Request): string {
  return (req as any).userId;
}

/** Mask an API key for safe display: show first 4 and last 4 chars */
function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

/** GET /api/tasks/api-keys */
router.get("/tasks/api-keys", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const keys = await apiKeyStorage.getByUser(userId);

    // Mask API keys in the response
    const maskedKeys = keys.map((k) => ({
      ...k,
      apiKey: maskApiKey(k.apiKey),
    }));

    res.json({ apiKeys: maskedKeys });
  } catch (error: any) {
    logger.error(SOURCE, `Error listing API keys: ${error.message}`);
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

/** POST /api/tasks/api-keys */
router.post("/tasks/api-keys", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { provider, label, apiKey, baseUrl, model } = req.body;

    if (!provider || !label || !apiKey) {
      return res.status(400).json({ error: "provider, label, and apiKey are required" });
    }

    const validProviders = ["openai", "anthropic", "google", "deepseek", "custom"];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: `provider must be one of: ${validProviders.join(", ")}` });
    }

    // Encrypt the API key before storing
    const encryptedKey = encryptApiKey(apiKey);

    const key = await apiKeyStorage.create({
      userId,
      provider,
      label,
      apiKey: encryptedKey,
      baseUrl: baseUrl || null,
      model: model || null,
      isActive: true,
    });

    res.status(201).json({
      apiKey: {
        ...key,
        apiKey: maskApiKey(apiKey), // Return masked version
      },
    });
  } catch (error: any) {
    logger.error(SOURCE, `Error creating API key: ${error.message}`);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

/** PUT /api/tasks/api-keys/:id */
router.put("/tasks/api-keys/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { label, baseUrl, model, isActive, apiKey } = req.body;

    const updateData: any = {};
    if (label !== undefined) updateData.label = label;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (model !== undefined) updateData.model = model;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (apiKey) updateData.apiKey = encryptApiKey(apiKey);

    const key = await apiKeyStorage.update(req.params.id, userId, updateData);
    if (!key) return res.status(404).json({ error: "API key not found" });

    res.json({
      apiKey: {
        ...key,
        apiKey: maskApiKey(key.apiKey),
      },
    });
  } catch (error: any) {
    logger.error(SOURCE, `Error updating API key: ${error.message}`);
    res.status(500).json({ error: "Failed to update API key" });
  }
});

/** DELETE /api/tasks/api-keys/:id */
router.delete("/tasks/api-keys/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const deleted = await apiKeyStorage.delete(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: "API key not found" });
    res.json({ success: true });
  } catch (error: any) {
    logger.error(SOURCE, `Error deleting API key: ${error.message}`);
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

export default router;
