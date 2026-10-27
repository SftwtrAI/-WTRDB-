import { Router, Response } from "express";
import { db } from "../db";
import { llmModels } from "@wtrops/shared";
import { checkSuperAdmin, AdminRequest } from "../middleware/admin-auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// All routes require super admin authentication
router.use(checkSuperAdmin);

// GET /api/admin/llm-models - List all LLM models
router.get("/", async (req: AdminRequest, res: Response) => {
  try {
    const models = await db
      .select()
      .from(llmModels)
      .orderBy(llmModels.sortOrder, llmModels.name);

    res.json(models);
  } catch (error) {
    console.error("Error fetching LLM models:", error);
    res.status(500).json({ error: "Failed to fetch LLM models" });
  }
});

// PATCH /api/admin/llm-models/:id - Update model tier or active status
router.patch("/:id", async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Validate request body
    const updateData = z
      .object({
        tier: z.enum(["free", "pro"]).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
      .parse(req.body);

    // Verify model exists
    const existingModel = await db
      .select()
      .from(llmModels)
      .where(eq(llmModels.id, id))
      .limit(1);

    if (existingModel.length === 0) {
      return res.status(404).json({ error: "Model not found" });
    }

    // Update the model
    await db
      .update(llmModels)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(llmModels.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating LLM model:", error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update LLM model" });
  }
});

export default router;
