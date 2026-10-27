import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import * as executionService from "./execution-service";
import { logger } from "../../utils/logger";

const router = Router();
const SOURCE = "ExecutionRoutes";

// Ensure upload directory exists
const TASK_UPLOADS_DIR = path.join(process.cwd(), "uploads", "task-files");
if (!fs.existsSync(TASK_UPLOADS_DIR)) {
  fs.mkdirSync(TASK_UPLOADS_DIR, { recursive: true });
}

// Configure multer for task file uploads
const taskUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const executionDir = path.join(TASK_UPLOADS_DIR, Date.now().toString());
    fs.mkdirSync(executionDir, { recursive: true });
    cb(null, executionDir);
  },
  filename: (_req, file, cb) => {
    // Preserve original filename with a unique prefix
    const uniquePrefix = Math.random().toString(36).substring(2, 8);
    cb(null, `${uniquePrefix}-${file.originalname}`);
  },
});

const taskUpload = multer({
  storage: taskUploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
});

function getUserId(req: Request): string {
  return (req as any).userId;
}

/** Map common file extensions to MIME types for extracted zip contents */
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/** POST /api/tasks/executions - Queue a new execution (supports file uploads) */
router.post("/tasks/executions", taskUpload.any(), async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    // When sent as FormData, JSON fields come as strings
    const templateId = req.body.templateId;
    const versionId = req.body.versionId;
    const apiKeyId = req.body.apiKeyId || null;
    const triggeredBy = req.body.triggeredBy || "manual";

    // Parse inputData - it comes as JSON string when using FormData
    let inputData: Record<string, any> = {};
    if (req.body.inputData) {
      try {
        inputData = typeof req.body.inputData === "string"
          ? JSON.parse(req.body.inputData)
          : req.body.inputData;
      } catch {
        inputData = {};
      }
    }

    if (!templateId || !versionId) {
      return res.status(400).json({ error: "templateId and versionId are required" });
    }

    // Process uploaded files - group by field name, extract .zip files
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      const filesByField: Record<string, Array<{ name: string; path: string; size: number; type: string }>> = {};

      for (const file of files) {
        if (!filesByField[file.fieldname]) {
          filesByField[file.fieldname] = [];
        }

        const isZip =
          file.originalname.toLowerCase().endsWith(".zip") ||
          file.mimetype === "application/zip" ||
          file.mimetype === "application/x-zip-compressed";

        if (isZip) {
          // Extract zip and add each contained file
          try {
            const zip = new AdmZip(file.path);
            const extractDir = path.join(path.dirname(file.path), `extracted-${path.basename(file.originalname, ".zip")}`);
            fs.mkdirSync(extractDir, { recursive: true });
            zip.extractAllTo(extractDir, true);

            // Walk extracted files
            const walkDir = (dir: string): void => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                // Skip macOS metadata
                if (entry.name.startsWith("__MACOSX") || entry.name.startsWith(".")) continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  walkDir(fullPath);
                } else {
                  const stat = fs.statSync(fullPath);
                  filesByField[file.fieldname].push({
                    name: entry.name,
                    path: fullPath,
                    size: stat.size,
                    type: getMimeType(entry.name),
                  });
                }
              }
            };
            walkDir(extractDir);

            // Remove the original zip after extraction
            fs.unlinkSync(file.path);
            logger.info(SOURCE, `Extracted zip ${file.originalname}: ${filesByField[file.fieldname].length} files`);
          } catch (zipErr: any) {
            logger.error(SOURCE, `Failed to extract zip ${file.originalname}: ${zipErr.message}`);
            // Fall back to treating it as a regular file
            filesByField[file.fieldname].push({
              name: file.originalname,
              path: file.path,
              size: file.size,
              type: file.mimetype,
            });
          }
        } else {
          filesByField[file.fieldname].push({
            name: file.originalname,
            path: file.path,
            size: file.size,
            type: file.mimetype,
          });
        }
      }

      // Merge file metadata into inputData
      for (const [fieldName, fieldFiles] of Object.entries(filesByField)) {
        inputData[fieldName] = fieldFiles;
      }
    }

    const execution = await executionService.queueExecution(userId, {
      templateId,
      versionId,
      apiKeyId,
      inputData: Object.keys(inputData).length > 0 ? inputData : null,
      triggeredBy,
    });

    res.status(201).json({ execution });
  } catch (error: any) {
    logger.error(SOURCE, `Error queuing execution: ${error.message}`);
    res.status(500).json({ error: "Failed to queue execution" });
  }
});

/** GET /api/tasks/executions - List user's executions */
router.get("/tasks/executions", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    const executions = await executionService.getUserExecutions(userId, limit, offset, status);
    res.json({ executions });
  } catch (error: any) {
    logger.error(SOURCE, `Error listing executions: ${error.message}`);
    res.status(500).json({ error: "Failed to list executions" });
  }
});

/** GET /api/tasks/executions/:id - Get execution detail */
router.get("/tasks/executions/:id", async (req: Request, res: Response) => {
  try {
    const execution = await executionService.getExecution(req.params.id);
    if (!execution) return res.status(404).json({ error: "Execution not found" });
    res.json({ execution });
  } catch (error: any) {
    logger.error(SOURCE, `Error getting execution: ${error.message}`);
    res.status(500).json({ error: "Failed to get execution" });
  }
});

/** GET /api/tasks/executions/:id/events - Get execution events */
router.get("/tasks/executions/:id/events", async (req: Request, res: Response) => {
  try {
    const afterTimestamp = req.query.after
      ? new Date(req.query.after as string)
      : undefined;
    const events = await executionService.getExecutionEvents(req.params.id, afterTimestamp);
    res.json({ events });
  } catch (error: any) {
    logger.error(SOURCE, `Error getting events: ${error.message}`);
    res.status(500).json({ error: "Failed to get execution events" });
  }
});

/** GET /api/tasks/executions/:id/stream - SSE stream for live monitoring */
router.get("/tasks/executions/:id/stream", async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id;

    // Verify execution exists
    const execution = await executionService.getExecution(executionId);
    if (!execution) {
      return res.status(404).json({ error: "Execution not found" });
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send existing events first
    const existingEvents = await executionService.getExecutionEvents(executionId);
    for (const event of existingEvents) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    }

    // Check if already finished
    const terminalStatuses = ["completed", "failed", "cancelled"];
    if (terminalStatuses.includes(execution.status)) {
      res.write(`data: ${JSON.stringify({ eventType: "stream_end", data: { status: execution.status } })}\n\n`);
      res.end();
      return;
    }

    // Listen for new events
    const handler = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();

      // End stream on terminal events
      if (
        event.eventType === "status_change" &&
        terminalStatuses.includes(event.data?.to)
      ) {
        res.write(`data: ${JSON.stringify({ eventType: "stream_end", data: { status: event.data.to } })}\n\n`);
        res.end();
      }
    };

    executionService.executionEvents.on(`execution:${executionId}`, handler);

    // Clean up on client disconnect
    req.on("close", () => {
      executionService.executionEvents.off(`execution:${executionId}`, handler);
    });
  } catch (error: any) {
    logger.error(SOURCE, `Error starting SSE stream: ${error.message}`);
    res.status(500).json({ error: "Failed to start event stream" });
  }
});

/** POST /api/tasks/executions/:id/cancel - Cancel a running execution */
router.post("/tasks/executions/:id/cancel", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const execution = await executionService.cancelExecution(req.params.id, userId);
    if (!execution) return res.status(404).json({ error: "Execution not found" });
    res.json({ execution });
  } catch (error: any) {
    logger.error(SOURCE, `Error cancelling execution: ${error.message}`);
    res.status(500).json({ error: "Failed to cancel execution" });
  }
});

export default router;
