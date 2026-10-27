/**
 * Infrastructure Services
 *
 * Centralized exports for all infrastructure services used by the platform.
 * These services provide database pooling, WebSocket management,
 * OpenAI connection pooling, and campaign queue management.
 */

// Database connection pool
export {
  DatabasePoolManager,
  databasePoolManager,
} from "./database/connection-pool";

// WebSocket connection manager
export {
  WebSocketConnectionManager,
  wsManager,
} from "./websocket/connection-manager";

// OpenAI connection pool manager
export { OpenAIPoolManager, openaiPoolManager } from "./openai/pool-manager";

// Campaign queue service
export {
  CampaignQueueService,
  campaignQueue,
} from "./queue/campaign-queue.service";

// Campaign recovery service removed (wtrdb)

// FalkorDB (knowledge graph) pool manager
export {
  FalkorDBPoolManager,
  falkordbPoolManager,
} from "./falkordb/pool-manager";

// FalkorDB typed client & helpers
export {
  type FalkorDBClient,
  type FalkorDBResult,
  getGraphName,
  getFederationGraphName,
  createFalkorDBClient,
} from "./falkordb/client";
