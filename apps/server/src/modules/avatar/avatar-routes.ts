import { Router, Request, Response } from "express";
import { avatarService } from "./avatar-service";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    }
  },
});

/**
 * GET /api/avatars - List user's saved avatars
 */
router.get("/avatars", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const avatars = await avatarService.getUserAvatars(userId);
    res.json({ avatars });
  } catch (error: any) {
    console.error("Error listing avatars:", error);
    res.status(500).json({ error: "Failed to list avatars" });
  }
});

/**
 * POST /api/avatars - Create a custom avatar from an uploaded image
 */
router.post(
  "/avatars",
  upload.single("imageFile"),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { displayName, imageUrl } = req.body;

      if (!displayName || displayName.length < 3 || displayName.length > 50) {
        return res
          .status(400)
          .json({ error: "Display name must be 3-50 characters" });
      }

      let avatar;
      if (req.file) {
        avatar = await avatarService.createCustomAvatar(userId, displayName, {
          type: "file",
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
        });
      } else if (imageUrl) {
        avatar = await avatarService.createCustomAvatar(userId, displayName, {
          type: "url",
          imageUrl,
        });
      } else {
        return res
          .status(400)
          .json({ error: "Either imageFile or imageUrl is required" });
      }

      res.status(201).json({ avatar });
    } catch (error: any) {
      console.error("Error creating avatar:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to create avatar" });
    }
  },
);

/**
 * PUT /api/avatars/:id - Update avatar display name
 */
router.put("/avatars/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { displayName } = req.body;

    if (!displayName || displayName.length < 3 || displayName.length > 50) {
      return res
        .status(400)
        .json({ error: "Display name must be 3-50 characters" });
    }

    const avatar = await avatarService.updateAvatar(
      userId,
      req.params.id,
      displayName,
    );
    if (!avatar) {
      return res.status(404).json({ error: "Avatar not found" });
    }
    res.json({ avatar });
  } catch (error: any) {
    console.error("Error updating avatar:", error);
    res.status(500).json({ error: "Failed to update avatar" });
  }
});

/**
 * DELETE /api/avatars/:id - Delete an avatar
 */
router.delete("/avatars/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const deleted = await avatarService.deleteAvatar(userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Avatar not found" });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting avatar:", error);
    res.status(500).json({ error: "Failed to delete avatar" });
  }
});

export default router;
