/**
 * RAG Knowledge Service
 *
 * Scalable knowledge base system using Retrieval-Augmented Generation (RAG).
 * Stores knowledge locally with embeddings.
 *
 * Features:
 * - Document chunking with configurable overlap
 * - OpenAI embeddings generation
 * - Vector similarity search (cosine similarity)
 * - Per-user storage limits (20MB default)
 * - Async processing queue for large documents
 *
 * This is a SEPARATE system from the legacy KB.
 * Set USE_RAG_KNOWLEDGE=true to enable this system.
 */

import OpenAI from "openai";
import { db } from "../db";
import {
  knowledgeBase,
  knowledgeChunks,
  knowledgeProcessingQueue,
  userKnowledgeStorageLimits,
  globalSettings,
  type KnowledgeChunk,
  type KnowledgeBase,
} from "@wtrops/shared";
import { eq, and, inArray, sql } from "drizzle-orm";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025
// Using text-embedding-3-small for cost-effective embeddings
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// Chunking configuration
const CHUNK_SIZE = 500; // tokens (roughly 2000 chars)
const CHUNK_OVERLAP = 50; // tokens overlap between chunks
const MAX_CHUNK_CHARS = 2000; // approximate chars per chunk

// Default storage limit per user (20MB)
const DEFAULT_STORAGE_LIMIT_BYTES = 20 * 1024 * 1024;

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;
let lastApiKey: string | null = null;

async function getOpenAIApiKey(): Promise<string> {
  // First check database for configured key
  try {
    const [dbSetting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "openai_api_key"))
      .limit(1);

    if (dbSetting?.value) {
      return dbSetting.value as string;
    }
  } catch (e) {
    // Table might not exist yet, fall back to env var
  }

  // Fall back to environment variable
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  throw new Error(
    "OPENAI_API_KEY is required for RAG knowledge system. Configure it in Admin Settings or as an environment variable.",
  );
}

async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getOpenAIApiKey();

  // Recreate client if API key changed
  if (!openaiClient || lastApiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    lastApiKey = apiKey;
  }

  return openaiClient;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Split text into chunks with overlap
 */
function chunkText(
  text: string,
  maxChars: number = MAX_CHUNK_CHARS,
  overlapChars: number = 200,
): string[] {
  const chunks: string[] = [];

  // Clean and normalize text
  const cleanText = text.replace(/\s+/g, " ").trim();

  if (cleanText.length <= maxChars) {
    return [cleanText];
  }

  let start = 0;
  while (start < cleanText.length) {
    let end = start + maxChars;

    // Try to break at sentence boundary
    if (end < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf(".", end);
      const lastNewline = cleanText.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + maxChars / 2) {
        end = breakPoint + 1;
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start with overlap
    start = end - overlapChars;
    if (start >= cleanText.length) break;
  }

  return chunks;
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const openai = await getOpenAIClient();

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

export class RAGKnowledgeService {
  /**
   * Get or create storage limit for user
   */
  static async getUserStorageLimit(
    userId: string,
  ): Promise<{ maxBytes: number; usedBytes: number }> {
    const [existing] = await db
      .select()
      .from(userKnowledgeStorageLimits)
      .where(eq(userKnowledgeStorageLimits.userId, userId));

    if (existing) {
      return {
        maxBytes: existing.maxStorageBytes,
        usedBytes: existing.usedStorageBytes,
      };
    }

    // Create default limit
    await db.insert(userKnowledgeStorageLimits).values({
      userId,
      maxStorageBytes: DEFAULT_STORAGE_LIMIT_BYTES,
      usedStorageBytes: 0,
    });

    return { maxBytes: DEFAULT_STORAGE_LIMIT_BYTES, usedBytes: 0 };
  }

  /**
   * Update used storage for user
   */
  static async updateUsedStorage(
    userId: string,
    deltaBytes: number,
  ): Promise<void> {
    await db
      .update(userKnowledgeStorageLimits)
      .set({
        usedStorageBytes: sql`${userKnowledgeStorageLimits.usedStorageBytes} + ${deltaBytes}`,
        updatedAt: new Date(),
      })
      .where(eq(userKnowledgeStorageLimits.userId, userId));
  }

  /**
   * Check if user has enough storage space
   */
  static async checkStorageSpace(
    userId: string,
    requiredBytes: number,
  ): Promise<boolean> {
    const { maxBytes, usedBytes } = await this.getUserStorageLimit(userId);
    return usedBytes + requiredBytes <= maxBytes;
  }

  /**
   * Process and store knowledge base item with embeddings
   */
  static async processKnowledgeItem(
    knowledgeBaseId: string,
    userId: string,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<{ success: boolean; chunksCreated: number; error?: string }> {
    try {
      console.log(
        `[RAG] Processing knowledge item ${knowledgeBaseId} for user ${userId}`,
      );

      // Check storage limit
      const contentSize = Buffer.byteLength(content, "utf8");
      const hasSpace = await this.checkStorageSpace(userId, contentSize);

      if (!hasSpace) {
        return {
          success: false,
          chunksCreated: 0,
          error:
            "Storage limit exceeded. Please delete some knowledge items or upgrade your plan.",
        };
      }

      // Create processing queue entry
      const [queueEntry] = await db
        .insert(knowledgeProcessingQueue)
        .values({
          knowledgeBaseId,
          userId,
          status: "processing",
        })
        .returning();

      // Split into chunks
      const chunks = chunkText(content);
      console.log(`[RAG] Created ${chunks.length} chunks from content`);

      // Update queue with total chunks
      await db
        .update(knowledgeProcessingQueue)
        .set({ totalChunks: chunks.length })
        .where(eq(knowledgeProcessingQueue.id, queueEntry.id));

      // Process each chunk
      let processedCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];

        try {
          // Generate embedding
          const embedding = await generateEmbedding(chunkText);

          // Store chunk with embedding
          await db.insert(knowledgeChunks).values({
            knowledgeBaseId,
            userId,
            chunkIndex: i,
            chunkText,
            embedding: embedding as any, // Store as JSON array
            tokenCount: estimateTokens(chunkText),
            metadata: {
              ...metadata,
              chunkIndex: i,
              totalChunks: chunks.length,
            },
          });

          processedCount++;

          // Update progress
          await db
            .update(knowledgeProcessingQueue)
            .set({ processedChunks: processedCount, updatedAt: new Date() })
            .where(eq(knowledgeProcessingQueue.id, queueEntry.id));
        } catch (chunkError: any) {
          console.error(
            `[RAG] Error processing chunk ${i}:`,
            chunkError.message,
          );
        }

        // Small delay to avoid rate limits
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Update storage used
      await this.updateUsedStorage(userId, contentSize);

      // Mark as completed
      await db
        .update(knowledgeProcessingQueue)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(knowledgeProcessingQueue.id, queueEntry.id));

      console.log(
        `[RAG] Successfully processed ${processedCount}/${chunks.length} chunks`,
      );

      // Auto-trigger KG extraction now that chunks exist. Dynamic import to
      // avoid a circular dep (KG extraction imports from this module's
      // siblings). The extraction routes guard against double-fire via
      // extractionInFlight, so a concurrent client-side /generate call is a
      // no-op rather than a duplicate run.
      if (processedCount > 0) {
        (async () => {
          try {
            const { processKnowledgeBase } = await import(
              "./knowledge-graph-extraction"
            );
            console.log(
              `[RAG] Auto-triggering KG extraction for KB ${knowledgeBaseId}`,
            );
            await processKnowledgeBase(knowledgeBaseId, userId);
          } catch (err: any) {
            console.error(
              `[RAG] Auto-extraction failed for KB ${knowledgeBaseId}:`,
              err.message,
            );
          }
        })();
      }

      return { success: true, chunksCreated: processedCount };
    } catch (error: any) {
      console.error(`[RAG] Error processing knowledge item:`, error.message);

      // Mark as failed
      await db
        .update(knowledgeProcessingQueue)
        .set({
          status: "failed",
          errorMessage: error.message,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeProcessingQueue.knowledgeBaseId, knowledgeBaseId));

      return { success: false, chunksCreated: 0, error: error.message };
    }
  }

  /**
   * Search knowledge base using semantic similarity
   */
  static async searchKnowledge(
    query: string,
    knowledgeBaseIds: string[],
    userId: string,
    maxResults: number = 5,
  ): Promise<Array<{ chunk: KnowledgeChunk; score: number; source: string }>> {
    try {
      console.log(
        `[RAG] Searching knowledge for: "${query.substring(0, 50)}..."`,
      );

      if (knowledgeBaseIds.length === 0) {
        return [];
      }

      // Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);

      // Fetch all chunks for the specified knowledge bases
      const chunks = await db
        .select()
        .from(knowledgeChunks)
        .where(
          and(
            inArray(knowledgeChunks.knowledgeBaseId, knowledgeBaseIds),
            eq(knowledgeChunks.userId, userId),
          ),
        );

      if (chunks.length === 0) {
        console.log(`[RAG] No chunks found for knowledge bases`);
        return [];
      }

      console.log(`[RAG] Searching ${chunks.length} chunks`);

      // Calculate similarity scores
      const scoredChunks = chunks
        .filter((chunk) => chunk.embedding && Array.isArray(chunk.embedding))
        .map((chunk) => ({
          chunk,
          score: cosineSimilarity(queryEmbedding, chunk.embedding as number[]),
          source: chunk.knowledgeBaseId,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      console.log(
        `[RAG] Found ${scoredChunks.length} relevant chunks (top score: ${scoredChunks[0]?.score.toFixed(3) || "N/A"})`,
      );

      return scoredChunks;
    } catch (error: any) {
      console.error(`[RAG] Search error:`, error.message);
      return [];
    }
  }

  /**
   * Format search results for agent consumption
   */
  static formatResultsForAgent(
    results: Array<{ chunk: KnowledgeChunk; score: number; source: string }>,
    maxTokens: number = 500,
  ): string {
    if (results.length === 0) {
      return "No relevant information found in the knowledge base.";
    }

    let output = "Based on the knowledge base:\n\n";
    let totalTokens = estimateTokens(output);

    for (const result of results) {
      const chunkTokens = estimateTokens(result.chunk.chunkText);

      if (totalTokens + chunkTokens > maxTokens) {
        // Truncate to fit
        const remainingTokens = maxTokens - totalTokens - 10;
        if (remainingTokens > 50) {
          const truncatedChars = remainingTokens * 4;
          output += `• ${result.chunk.chunkText.substring(0, truncatedChars)}...\n`;
        }
        break;
      }

      output += `• ${result.chunk.chunkText}\n\n`;
      totalTokens += chunkTokens + 5;
    }

    return output.trim();
  }

  /**
   * Delete all chunks for a knowledge base item
   */
  static async deleteKnowledgeChunks(
    knowledgeBaseId: string,
    userId: string,
  ): Promise<void> {
    // Get total size of chunks being deleted
    const chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeChunks.userId, userId),
        ),
      );

    const totalSize = chunks.reduce((sum, chunk) => {
      return sum + Buffer.byteLength(chunk.chunkText, "utf8");
    }, 0);

    // Delete chunks
    await db
      .delete(knowledgeChunks)
      .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));

    // Delete processing queue entries
    await db
      .delete(knowledgeProcessingQueue)
      .where(eq(knowledgeProcessingQueue.knowledgeBaseId, knowledgeBaseId));

    // Update storage used (subtract deleted size)
    if (totalSize > 0) {
      await this.updateUsedStorage(userId, -totalSize);
    }

    console.log(
      `[RAG] Deleted ${chunks.length} chunks for knowledge base ${knowledgeBaseId}`,
    );
  }

  /**
   * Get processing status for a knowledge base item
   */
  static async getProcessingStatus(knowledgeBaseId: string): Promise<{
    status: string;
    progress: number;
    error?: string;
  } | null> {
    const [entry] = await db
      .select()
      .from(knowledgeProcessingQueue)
      .where(eq(knowledgeProcessingQueue.knowledgeBaseId, knowledgeBaseId))
      .orderBy(sql`${knowledgeProcessingQueue.createdAt} DESC`)
      .limit(1);

    if (!entry) {
      return null;
    }

    const progress = entry.totalChunks
      ? ((entry.processedChunks || 0) / entry.totalChunks) * 100
      : 0;

    return {
      status: entry.status,
      progress: Math.round(progress),
      error: entry.errorMessage || undefined,
    };
  }

  /**
   * Get chunk count for a knowledge base item
   */
  static async getChunkCount(knowledgeBaseId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));

    return Number(result[0]?.count || 0);
  }
}

export default RAGKnowledgeService;
