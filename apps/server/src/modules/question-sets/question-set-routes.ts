import { Router, Request, Response } from "express";
import * as questionSetService from "./question-set-service";
import { questionSetStorage } from "./question-set-storage";
import { generateQuestionSet } from "../job-descriptions/jd-service";

const router = Router();

// Helper to get userId from request (set by authenticateHybrid middleware)
function getUserId(req: Request): string {
  return (req as any).userId;
}

// ── Question Sets CRUD ───────────────────────────────────────

/** GET /api/question-sets - List user's question sets */
router.get("/question-sets", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const sets = await questionSetService.listQuestionSets(
      userId,
      limit,
      offset,
    );
    res.json({ questionSets: sets });
  } catch (error: any) {
    console.error("Error listing question sets:", error);
    res.status(500).json({ error: "Failed to list question sets" });
  }
});

/** POST /api/question-sets - Create a new question set */
router.post("/question-sets", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "name is required" });
    }

    const set = await questionSetService.createQuestionSet(userId, {
      name: name.trim(),
      description: description?.trim(),
    });
    res.status(201).json({ questionSet: set });
  } catch (error: any) {
    console.error("Error creating question set:", error);
    res.status(500).json({ error: "Failed to create question set" });
  }
});

/** POST /api/question-sets/from-jd - Create question set from job description */
router.post("/question-sets/from-jd", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { jobDescriptionId } = req.body;

    if (!jobDescriptionId) {
      return res.status(400).json({ error: "jobDescriptionId is required" });
    }

    const result = await generateQuestionSet(userId, jobDescriptionId);
    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error generating question set from JD:", error);
    res
      .status(500)
      .json({ error: "Failed to generate question set from job description" });
  }
});

/** GET /api/question-sets/:id - Get question set with items */
router.get("/question-sets/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await questionSetService.getQuestionSetWithItems(
      req.params.id,
      userId,
    );
    if (!result)
      return res.status(404).json({ error: "Question set not found" });
    res.json({ questionSet: result.set, items: result.items });
  } catch (error: any) {
    console.error("Error getting question set:", error);
    res.status(500).json({ error: "Failed to get question set" });
  }
});

/** PUT /api/question-sets/:id - Update question set metadata */
router.put("/question-sets/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, description } = req.body;
    const set = await questionSetService.updateQuestionSet(
      req.params.id,
      userId,
      {
        name: name?.trim(),
        description: description?.trim(),
      },
    );
    if (!set) return res.status(404).json({ error: "Question set not found" });
    res.json({ questionSet: set });
  } catch (error: any) {
    console.error("Error updating question set:", error);
    res.status(500).json({ error: "Failed to update question set" });
  }
});

/** DELETE /api/question-sets/:id - Archive question set */
router.delete("/question-sets/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const archived = await questionSetService.archiveQuestionSet(
      req.params.id,
      userId,
    );
    if (!archived)
      return res.status(404).json({ error: "Question set not found" });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error archiving question set:", error);
    res.status(500).json({ error: "Failed to archive question set" });
  }
});

/** POST /api/question-sets/:id/duplicate - Clone question set */
router.post(
  "/question-sets/:id/duplicate",
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const result = await questionSetService.duplicateSet(
        req.params.id,
        userId,
      );
      if (!result)
        return res.status(404).json({ error: "Question set not found" });
      res.status(201).json({ questionSet: result.set, items: result.items });
    } catch (error: any) {
      console.error("Error duplicating question set:", error);
      res.status(500).json({ error: "Failed to duplicate question set" });
    }
  },
);

// ── Question Set Items ───────────────────────────────────────

/** POST /api/question-sets/:id/items - Add questions to set */
router.post("/question-sets/:id/items", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const set = await questionSetService.getQuestionSet(req.params.id, userId);
    if (!set) return res.status(404).json({ error: "Question set not found" });

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const created = await questionSetService.addItems(set.id, items);
    res.status(201).json({ items: created });
  } catch (error: any) {
    console.error("Error adding items:", error);
    res.status(500).json({ error: "Failed to add items" });
  }
});

/** PUT /api/question-sets/:id/items/:itemId - Update a question */
router.put(
  "/question-sets/:id/items/:itemId",
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const set = await questionSetService.getQuestionSet(
        req.params.id,
        userId,
      );
      if (!set)
        return res.status(404).json({ error: "Question set not found" });

      const item = await questionSetService.updateItem(
        req.params.itemId,
        req.body,
      );
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json({ item });
    } catch (error: any) {
      console.error("Error updating item:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
  },
);

/** DELETE /api/question-sets/:id/items/:itemId - Delete a question */
router.delete(
  "/question-sets/:id/items/:itemId",
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const set = await questionSetService.getQuestionSet(
        req.params.id,
        userId,
      );
      if (!set)
        return res.status(404).json({ error: "Question set not found" });

      const deleted = await questionSetService.deleteItem(
        req.params.itemId,
        set.id,
      );
      if (!deleted) return res.status(404).json({ error: "Item not found" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting item:", error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  },
);

/** PATCH /api/question-sets/:id/items/reorder - Reorder questions */
router.patch(
  "/question-sets/:id/items/reorder",
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const set = await questionSetService.getQuestionSet(
        req.params.id,
        userId,
      );
      if (!set)
        return res.status(404).json({ error: "Question set not found" });

      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds array is required" });
      }

      await questionSetService.reorderItems(set.id, itemIds);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error reordering items:", error);
      res.status(500).json({ error: "Failed to reorder items" });
    }
  },
);

export default router;
