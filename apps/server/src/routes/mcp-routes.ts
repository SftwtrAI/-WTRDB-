import { Router, Response } from "express";
import { type AuthRequest } from "../middleware/auth";

// mcpServers table and insertMcpServerSchema were removed from the shared schema
// during the wtrdb extraction. All MCP server CRUD routes are stubbed to return
// appropriate error responses until the feature is re-implemented.

const router = Router();

const REMOVED_MSG = "MCP servers feature removed in wtrdb extraction";

router.get("/", (_req: AuthRequest, res: Response) => {
  res.json([]);
});

router.post("/", (_req: AuthRequest, res: Response) => {
  res.status(501).json({ error: REMOVED_MSG });
});

router.patch("/:id", (_req: AuthRequest, res: Response) => {
  res.status(501).json({ error: REMOVED_MSG });
});

router.delete("/:id", (_req: AuthRequest, res: Response) => {
  res.status(501).json({ error: REMOVED_MSG });
});

router.post("/test-connection", (_req: AuthRequest, res: Response) => {
  res.status(501).json({ error: REMOVED_MSG });
});

router.get("/:id/tools", (_req: AuthRequest, res: Response) => {
  res.json([]);
});

router.post("/:id/refresh", (_req: AuthRequest, res: Response) => {
  res.json([]);
});

router.post("/:id/tools/execute", (_req: AuthRequest, res: Response) => {
  res.status(501).json({ error: REMOVED_MSG });
});

export default router;
