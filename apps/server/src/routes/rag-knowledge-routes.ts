/**
 * RAG Knowledge Base Routes
 *
 * Separate from legacy KB routes.
 * Provides scalable knowledge storage with per-user 20MB limits.
 *
 * Set USE_RAG_KNOWLEDGE=true to use these routes instead of legacy.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { RAGKnowledgeService } from "../services/rag-knowledge";
import { storage } from "../storage";
import { db } from "../db";
import { knowledgeBase, knowledgeChunks } from "@wtrops/shared";
import { eq, and, sql } from "drizzle-orm";
import { auditEvent } from "../services/compliance-audit-bridge";

// Extend Request to include userId
interface AuthRequest extends Request {
  userId?: string;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max file size
  },
});

// Allowed file extensions for text-based files
const ALLOWED_TEXT_EXTENSIONS = [
  ".txt",
  ".md",
  ".html",
  ".htm",
  ".json",
  ".xml",
  ".csv",
];

// URL fetch limits
const MAX_URL_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB max for URL content
const ALLOWED_URL_PROTOCOLS = ["http:", "https:"];

/**
 * Validate file type - only allow text-based files for now
 * Binary formats (PDF, DOCX) would require additional parsers
 */
function isTextBasedFile(filename: string, mimeType: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));

  // Check extension
  if (ALLOWED_TEXT_EXTENSIONS.includes(ext)) {
    return true;
  }

  // Check mime type
  const textMimeTypes = [
    "text/plain",
    "text/html",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml",
  ];

  return textMimeTypes.includes(mimeType) || mimeType.startsWith("text/");
}

/**
 * Validate URL for security (prevent SSRF)
 */
function isValidUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Only allow http/https
    if (!ALLOWED_URL_PROTOCOLS.includes(url.protocol)) {
      return { valid: false, error: "Only HTTP and HTTPS URLs are allowed" };
    }

    // Block localhost and private IPs
    const hostname = url.hostname.toLowerCase();
    const blockedPatterns = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "10.",
      "172.16.",
      "172.17.",
      "172.18.",
      "172.19.",
      "172.20.",
      "172.21.",
      "172.22.",
      "172.23.",
      "172.24.",
      "172.25.",
      "172.26.",
      "172.27.",
      "172.28.",
      "172.29.",
      "172.30.",
      "172.31.",
      "192.168.",
      "169.254.",
      "metadata.google",
      "169.254.169.254",
    ];

    for (const pattern of blockedPatterns) {
      if (hostname.includes(pattern) || hostname.startsWith(pattern)) {
        return { valid: false, error: "Internal/private URLs are not allowed" };
      }
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Fetch URL with size limit and timeout
 */
async function fetchUrlWithLimits(
  url: string,
): Promise<{ content: string; contentType: string; size: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Wtrops.ai-Knowledge-Bot/1.0",
        Accept: "text/html, text/plain, application/json, text/markdown, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10,
    );

    // Check content length header if available
    if (contentLength > MAX_URL_CONTENT_SIZE) {
      throw new Error(
        `Content too large: ${(contentLength / (1024 * 1024)).toFixed(2)}MB exceeds ${MAX_URL_CONTENT_SIZE / (1024 * 1024)}MB limit`,
      );
    }

    // Read response in chunks with size tracking
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Unable to read response body");
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_URL_CONTENT_SIZE) {
        reader.cancel();
        throw new Error(
          `Content too large: exceeds ${MAX_URL_CONTENT_SIZE / (1024 * 1024)}MB limit`,
        );
      }

      chunks.push(value);
    }

    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const content = new TextDecoder("utf-8").decode(combined);

    return { content, contentType, size: totalSize };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract text from HTML content
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

export function createRAGKnowledgeRoutes(authenticateToken: any): Router {
  const router = Router();

  /**
   * Get user's storage usage and limits
   */
  router.get(
    "/storage",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { maxBytes, usedBytes } =
          await RAGKnowledgeService.getUserStorageLimit(req.userId!);

        res.json({
          maxStorageBytes: maxBytes,
          usedStorageBytes: usedBytes,
          remainingBytes: maxBytes - usedBytes,
          usagePercent: Math.round((usedBytes / maxBytes) * 100),
        });
      } catch (error: any) {
        console.error("[RAG Routes] Storage usage error:", error);
        res.status(500).json({ error: "Failed to get storage usage" });
      }
    },
  );

  /**
   * Get all knowledge base items for user
   */
  router.get(
    "/",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const items = await storage.getUserKnowledgeBase(req.userId!);

        // Enhance with RAG processing status
        const enhancedItems = await Promise.all(
          items.map(async (item) => {
            const status = await RAGKnowledgeService.getProcessingStatus(
              item.id,
            );
            const chunkCount = await RAGKnowledgeService.getChunkCount(item.id);

            return {
              ...item,
              ragStatus:
                status?.status || (chunkCount > 0 ? "completed" : "pending"),
              ragProgress: status?.progress || (chunkCount > 0 ? 100 : 0),
              chunkCount,
              isRAGEnabled: chunkCount > 0,
            };
          }),
        );

        res.json(enhancedItems);
      } catch (error: any) {
        console.error("[RAG Routes] Get knowledge base error:", error);
        res.status(500).json({ error: "Failed to get knowledge base" });
      }
    },
  );

  /**
   * Upload file to RAG knowledge base
   * Only supports text-based files (TXT, MD, HTML, JSON, XML, CSV)
   */
  router.post(
    "/upload",
    authenticateToken,
    upload.single("file"),
    async (req: AuthRequest, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { name } = req.body;
        const filename = req.file.originalname;
        const mimeType = req.file.mimetype;
        const fileSize = req.file.size;

        // Validate file type
        if (!isTextBasedFile(filename, mimeType)) {
          return res.status(400).json({
            error:
              "Unsupported file type. Currently supported: TXT, MD, HTML, JSON, XML, CSV. PDF and DOCX support coming soon.",
            supportedTypes: ALLOWED_TEXT_EXTENSIONS.join(", "),
          });
        }

        // Parse file content as text
        let fileContent: string;
        try {
          fileContent = req.file.buffer.toString("utf8");
        } catch (parseError) {
          return res.status(400).json({
            error:
              "Failed to read file content. Please ensure the file is valid text.",
          });
        }

        // Check storage limit
        const hasSpace = await RAGKnowledgeService.checkStorageSpace(
          req.userId!,
          fileSize,
        );
        if (!hasSpace) {
          return res.status(400).json({
            error:
              "Storage limit exceeded. Please delete some items or upgrade your plan.",
            code: "STORAGE_LIMIT_EXCEEDED",
          });
        }

        // Create knowledge base item in database (local only)
        const item = await storage.createKnowledgeBaseItem({
          userId: req.userId!,
          type: "file",
          title: name || filename,
          content: fileContent,
          url: null,
          fileUrl: filename,
          elevenLabsDocId: null, // Legacy field kept for backward compat
          metadata: {
            filename,
            mimeType,
            ragEnabled: true,
          },
          storageSize: fileSize,
        });

        // Process with RAG (async - chunks and embeddings)
        RAGKnowledgeService.processKnowledgeItem(
          item.id,
          req.userId!,
          fileContent,
          { source: "file", filename },
        ).catch((err) =>
          console.error("[RAG Routes] Background processing error:", err),
        );

        auditEvent({ orgId: "system", userId: req.userId!, table: "claw", eventType: "knowledge.document_uploaded", eventData: { knowledgeBaseId: item.id } });

        res.json({
          ...item,
          ragStatus: "processing",
          message: "File uploaded. Processing embeddings in background.",
        });
      } catch (error: any) {
        console.error("[RAG Routes] Upload error:", error);
        res
          .status(500)
          .json({ error: error.message || "Failed to upload file" });
      }
    },
  );

  /**
   * Add URL to RAG knowledge base
   * Fetches content with security validation and size limits
   */
  router.post(
    "/url",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { url, name } = req.body;

        if (!url) {
          return res.status(400).json({ error: "URL is required" });
        }

        // Validate URL security
        const urlValidation = isValidUrl(url);
        if (!urlValidation.valid) {
          return res.status(400).json({ error: urlValidation.error });
        }

        // Fetch URL content with limits
        let content: string;
        let contentType: string;
        let contentSize: number;

        try {
          const result = await fetchUrlWithLimits(url);
          content = result.content;
          contentType = result.contentType;
          contentSize = result.size;
        } catch (fetchError: any) {
          return res
            .status(400)
            .json({ error: `Failed to fetch URL: ${fetchError.message}` });
        }

        // Extract text from HTML if needed
        if (contentType.includes("text/html")) {
          content = extractTextFromHtml(content);
          contentSize = Buffer.byteLength(content, "utf8");
        }

        // Check if content is meaningful
        if (content.trim().length < 50) {
          return res
            .status(400)
            .json({ error: "URL content is too short or empty" });
        }

        // Check storage limit
        const hasSpace = await RAGKnowledgeService.checkStorageSpace(
          req.userId!,
          contentSize,
        );
        if (!hasSpace) {
          return res.status(400).json({
            error:
              "Storage limit exceeded. Please delete some items or upgrade your plan.",
            code: "STORAGE_LIMIT_EXCEEDED",
          });
        }

        // Create knowledge base item (local only)
        const item = await storage.createKnowledgeBaseItem({
          userId: req.userId!,
          type: "url",
          title: name || url,
          content: content,
          url: url,
          fileUrl: null,
          elevenLabsDocId: null, // Legacy field kept for backward compat
          metadata: {
            url,
            contentType,
            ragEnabled: true,
          },
          storageSize: contentSize,
        });

        // Process with RAG (async)
        RAGKnowledgeService.processKnowledgeItem(
          item.id,
          req.userId!,
          content,
          { source: "url", url },
        ).catch((err) =>
          console.error("[RAG Routes] Background processing error:", err),
        );

        auditEvent({ orgId: "system", userId: req.userId!, table: "claw", eventType: "knowledge.document_uploaded", eventData: { knowledgeBaseId: item.id } });

        res.json({
          ...item,
          ragStatus: "processing",
          message: "URL content fetched. Processing embeddings in background.",
        });
      } catch (error: any) {
        console.error("[RAG Routes] URL add error:", error);
        res.status(500).json({ error: error.message || "Failed to add URL" });
      }
    },
  );

  /**
   * Add text to RAG knowledge base
   */
  router.post(
    "/text",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { text, name } = req.body;

        if (!text || !name) {
          return res.status(400).json({ error: "Text and name are required" });
        }

        const contentSize = Buffer.byteLength(text, "utf8");

        // Check storage limit
        const hasSpace = await RAGKnowledgeService.checkStorageSpace(
          req.userId!,
          contentSize,
        );
        if (!hasSpace) {
          return res.status(400).json({
            error:
              "Storage limit exceeded. Please delete some items or upgrade your plan.",
            code: "STORAGE_LIMIT_EXCEEDED",
          });
        }

        // Create knowledge base item (local only)
        const item = await storage.createKnowledgeBaseItem({
          userId: req.userId!,
          type: "text",
          title: name,
          content: text,
          url: null,
          fileUrl: null,
          elevenLabsDocId: null, // Legacy field kept for backward compat
          metadata: {
            ragEnabled: true,
          },
          storageSize: contentSize,
        });

        // Process with RAG (async)
        RAGKnowledgeService.processKnowledgeItem(item.id, req.userId!, text, {
          source: "text",
        }).catch((err) =>
          console.error("[RAG Routes] Background processing error:", err),
        );

        auditEvent({ orgId: "system", userId: req.userId!, table: "claw", eventType: "knowledge.document_uploaded", eventData: { knowledgeBaseId: item.id } });

        res.json({
          ...item,
          ragStatus: "processing",
          message: "Text added. Processing embeddings in background.",
        });
      } catch (error: any) {
        console.error("[RAG Routes] Text add error:", error);
        res.status(500).json({ error: error.message || "Failed to add text" });
      }
    },
  );

  /**
   * Re-process an existing knowledge base item (re-chunk + re-embed)
   * Useful when initial processing failed or chunks are missing.
   */
  router.post(
    "/:id/reprocess",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const item = await storage.getKnowledgeBaseItem(req.params.id);
        if (!item || item.userId !== req.userId) {
          return res
            .status(404)
            .json({ error: "Knowledge base item not found" });
        }

        if (!item.content) {
          return res
            .status(400)
            .json({ error: "No content available for reprocessing" });
        }

        // Delete existing chunks first
        await RAGKnowledgeService.deleteKnowledgeChunks(
          req.params.id,
          req.userId!,
        );

        // Re-process in background
        RAGKnowledgeService.processKnowledgeItem(
          item.id,
          req.userId!,
          item.content,
          { source: item.type || "file", reprocessed: true },
        ).catch((err) =>
          console.error("[RAG Routes] Reprocess error:", err),
        );

        res.json({
          success: true,
          message: "Reprocessing started. Chunks and embeddings will be regenerated.",
        });
      } catch (error: any) {
        console.error("[RAG Routes] Reprocess error:", error);
        res.status(500).json({ error: "Failed to reprocess knowledge base item" });
      }
    },
  );

  /**
   * Delete knowledge base item
   */
  router.delete(
    "/:id",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const item = await storage.getKnowledgeBaseItem(req.params.id);
        if (!item || item.userId !== req.userId) {
          return res
            .status(404)
            .json({ error: "Knowledge base item not found" });
        }

        // Delete RAG chunks (also updates storage usage)
        await RAGKnowledgeService.deleteKnowledgeChunks(
          req.params.id,
          req.userId!,
        );

        // Delete from database
        await storage.deleteKnowledgeBaseItem(req.params.id);

        auditEvent({ orgId: "system", userId: req.userId!, table: "claw", eventType: "knowledge.document_deleted", eventData: { knowledgeBaseId: req.params.id } });

        res.json({ success: true });
      } catch (error: any) {
        console.error("[RAG Routes] Delete error:", error);
        res.status(500).json({ error: "Failed to delete knowledge base item" });
      }
    },
  );

  /**
   * Get processing status for an item
   */
  router.get(
    "/:id/status",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const item = await storage.getKnowledgeBaseItem(req.params.id);
        if (!item || item.userId !== req.userId) {
          return res
            .status(404)
            .json({ error: "Knowledge base item not found" });
        }

        const status = await RAGKnowledgeService.getProcessingStatus(
          req.params.id,
        );
        const chunkCount = await RAGKnowledgeService.getChunkCount(
          req.params.id,
        );

        res.json({
          status: status?.status || (chunkCount > 0 ? "completed" : "pending"),
          progress: status?.progress || (chunkCount > 0 ? 100 : 0),
          chunkCount,
          error: status?.error,
        });
      } catch (error: any) {
        console.error("[RAG Routes] Status check error:", error);
        res.status(500).json({ error: "Failed to get status" });
      }
    },
  );

  /**
   * Search knowledge base - internal API for agents
   * This is called by the internal tools API
   */
  router.post(
    "/search",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const { query, knowledgeBaseIds, maxResults = 5 } = req.body;

        if (!query) {
          return res.status(400).json({ error: "Query is required" });
        }

        if (
          !knowledgeBaseIds ||
          !Array.isArray(knowledgeBaseIds) ||
          knowledgeBaseIds.length === 0
        ) {
          return res
            .status(400)
            .json({ error: "Knowledge base IDs are required" });
        }

        const results = await RAGKnowledgeService.searchKnowledge(
          query,
          knowledgeBaseIds,
          req.userId!,
          maxResults,
        );

        // Format for agent consumption
        const formattedResponse =
          RAGKnowledgeService.formatResultsForAgent(results);

        res.json({
          results: results.map((r) => ({
            text: r.chunk.chunkText,
            score: r.score,
            source: r.source,
          })),
          formattedResponse,
        });
      } catch (error: any) {
        console.error("[RAG Routes] Search error:", error);
        res.status(500).json({ error: "Failed to search knowledge base" });
      }
    },
  );

  /**
   * Internal endpoint for tool webhook
   * Called when agent invokes the ask_knowledge tool
   */
  router.post("/tool-webhook", async (req: Request, res: Response) => {
    try {
      const { query, agent_id, knowledge_base_ids, user_id } = req.body;

      console.log(
        `[RAG Tool] Received query: "${query}" for agent ${agent_id}`,
      );

      if (!query || !knowledge_base_ids || !user_id) {
        return res.status(400).json({
          error: "Missing required parameters",
          response:
            "I couldn't access the knowledge base. Please try asking again.",
        });
      }

      const results = await RAGKnowledgeService.searchKnowledge(
        query,
        knowledge_base_ids,
        user_id,
        3, // Limit to 3 results for concise response
      );

      const formattedResponse = RAGKnowledgeService.formatResultsForAgent(
        results,
        400,
      );

      console.log(
        `[RAG Tool] Found ${results.length} results, returning formatted response`,
      );

      res.json({
        response: formattedResponse,
        sources: results.map((r) => ({
          id: r.chunk.knowledgeBaseId,
          relevance: r.score,
        })),
      });
    } catch (error: any) {
      console.error("[RAG Tool] Webhook error:", error);
      res.status(500).json({
        error: error.message,
        response:
          "I encountered an error accessing the knowledge base. Please try again.",
      });
    }
  });

  return router;
}

export default createRAGKnowledgeRoutes;
