"use strict";

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import {} from "@wtrops/shared";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logger } from "../utils/logger";
import { webhookDeliveryService } from "../services/webhook-delivery";
// Voice/telephony service imports removed during wtrdb extraction
// import { deductCallCredits } from "../services/credit-service";
// import { sarvamTranscriptionService } from "../services/sarvam-transcription";
// import { openaiTranscriptionService } from "../services/openai-transcription";
// import { recordingService } from "../services/recording-service";
// import { mcpManager } from '../services/mcp-manager';

const router = Router();

/**
 * Internal Tools API
 *
 * HTTP endpoints called by the agent-worker during calls.
 * Authenticated via `x-internal-api-key` shared secret header.
 *
 * These provide internal tool execution endpoints
 * with direct HTTP calls from the LiveKit agent worker.
 */

// ── Auth Middleware ──

function verifyInternalApiKey(
  req: Request,
  res: Response,
  next: Function,
): void {
  const providedKey = req.headers["x-internal-api-key"] as string;
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    logger.error(
      "INTERNAL_API_KEY not set in environment",
      undefined,
      "InternalTools",
    );
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  if (!providedKey) {
    res.status(401).json({ error: "Missing x-internal-api-key header" });
    return;
  }

  // Constant-time comparison
  const a = Buffer.from(providedKey);
  const b = Buffer.from(expectedKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

router.use(verifyInternalApiKey);

// ── Book Appointment ──

router.post("/book-appointment", async (req: Request, res: Response) => {
  try {
    const {
      callId,
      userId,
      agentId,
      date,
      time,
      name,
      phone,
      email,
      notes,
      serviceName,
    } = req.body;

    if (!callId || !userId || !date || !time || !name) {
      return res.status(400).json({
        error: "Missing required fields: callId, userId, date, time, name",
      });
    }

    // Parse and validate date
    const appointmentDate = parseDate(date);
    if (!appointmentDate) {
      return res.json({
        success: false,
        message: `I couldn't understand the date "${date}". Please provide a date in YYYY-MM-DD format.`,
      });
    }

    // Parse and validate time
    const appointmentTime = parseTime(time);
    if (!appointmentTime) {
      return res.json({
        success: false,
        message: `I couldn't understand the time "${time}". Please provide a time in HH:MM format.`,
      });
    }

    // Validate not in the past
    const appointmentDateTime = new Date(
      `${appointmentDate}T${appointmentTime}:00`,
    );
    if (appointmentDateTime < new Date()) {
      return res.json({
        success: false,
        message:
          "The requested appointment time is in the past. Please choose a future date and time.",
      });
    }

    // Create appointment record
    const appointmentId = nanoid();
    const [appointment] = await db
      .insert(appointments)
      .values({
        id: appointmentId,
        userId,
        callId,
        contactName: name,
        contactPhone: phone || "",
        contactEmail: email || null,
        appointmentDate,
        appointmentTime,
        duration: 30,
        serviceName: serviceName || null,
        notes: notes || null,
        status: "scheduled",
        metadata: {
          source: "livekit-agent",
          agentId,
        },
      })
      .returning();

    // Update call metadata
    await db
      .update(calls)
      .set({
        metadata: {
          appointmentBooked: true,
          appointmentId,
          appointmentDate,
          appointmentTime,
        },
      })
      .where(eq(calls.id, callId));

    // Trigger webhook event
    webhookDeliveryService
      .triggerEvent(userId, "appointment.booked", {
        appointmentId,
        callId,
        contactName: name,
        contactPhone: phone,
        contactEmail: email,
        appointmentDate,
        appointmentTime,
        serviceName,
        notes,
      })
      .catch((err) => {
        logger.error(
          "Failed to trigger appointment.booked webhook",
          err,
          "InternalTools",
        );
      });

    logger.info(
      `Appointment booked: ${appointmentId} for ${name} on ${appointmentDate} at ${appointmentTime}`,
      undefined,
      "InternalTools",
    );

    return res.json({
      success: true,
      message: `Appointment booked for ${name} on ${appointmentDate} at ${appointmentTime}.`,
      appointmentId,
    });
  } catch (error: any) {
    logger.error(
      `Failed to book appointment: ${error.message}`,
      error,
      "InternalTools",
    );
    return res.json({
      success: false,
      message:
        "I encountered an error booking the appointment. Please try again.",
    });
  }
});

// ── Submit Form ──

router.post("/submit-form", async (req: Request, res: Response) => {
  try {
    const { callId, userId, agentId, formId, contactName, contactPhone } =
      req.body;
    // Accept both `responses` and `formData` (backward compat)
    const responses = req.body.responses || req.body.formData;

    if (!callId || !userId || !formId || !responses) {
      return res.status(400).json({
        error: "Missing required fields: callId, userId, formId, responses",
      });
    }

    // Validate form exists
    const [form] = await db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    if (!form) {
      return res.json({
        success: false,
        message: "Form not found.",
      });
    }

    // Get form fields for validation
    const fields = await db
      .select()
      .from(formFields)
      .where(eq(formFields.formId, formId));

    // Build structured responses — match by field ID, question (label), or field name
    const structuredResponses = Object.entries(
      responses as Record<string, string>,
    ).map(([key, answer]) => {
      // Try matching by: ID first, then question text, then lowercased name
      const field =
        fields.find((f) => f.id === key) ||
        fields.find((f) => f.question === key) ||
        fields.find(
          (f) =>
            f.question.toLowerCase().replace(/\s+/g, "_") === key.toLowerCase(),
        );
      return {
        fieldId: field?.id || key,
        question: field?.question || key,
        answer,
      };
    });

    // Create submission
    const submissionId = nanoid();
    const [submission] = await db
      .insert(formSubmissions)
      .values({
        id: submissionId,
        formId,
        callId,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        responses: structuredResponses,
      })
      .returning();

    // Update call metadata
    await db
      .update(calls)
      .set({
        metadata: {
          formSubmitted: true,
          formId,
          submissionId,
        },
      })
      .where(eq(calls.id, callId));

    // Trigger webhook
    webhookDeliveryService
      .triggerEvent(userId, "form.submitted", {
        submissionId,
        formId,
        callId,
        contactName,
        contactPhone,
        responses: structuredResponses,
      })
      .catch((err) => {
        logger.error(
          "Failed to trigger form.submitted webhook",
          err,
          "InternalTools",
        );
      });

    logger.info(
      `Form submitted: ${submissionId} for form ${formId}`,
      undefined,
      "InternalTools",
    );

    return res.json({
      success: true,
      message: "Form submitted successfully.",
      submissionId,
    });
  } catch (error: any) {
    logger.error(
      `Failed to submit form: ${error.message}`,
      error,
      "InternalTools",
    );
    return res.json({
      success: false,
      message: "I encountered an error submitting the form. Please try again.",
    });
  }
});

// ── Knowledge Base Lookup ──

router.post("/knowledge-base-lookup", async (req: Request, res: Response) => {
  try {
    const { callId, userId, agentId, query, knowledgeBaseIds } = req.body;

    if (!query || !knowledgeBaseIds || knowledgeBaseIds.length === 0) {
      return res.json({
        response: "No knowledge base is configured for this agent.",
        sources: [],
      });
    }

    // Try hybrid search first (RAG + knowledge graph)
    try {
      const { HybridKnowledgeSearchService } = await import(
        "../services/hybrid-knowledge-search"
      );
      const hybridResult = await HybridKnowledgeSearchService.search(
        query,
        knowledgeBaseIds,
        userId,
      );
      if (hybridResult.graphEntities.length > 0) {
        logger.debug(
          `Hybrid lookup for call ${callId}: ${hybridResult.sources.map((s) => `${s.type}=${s.count}`).join(", ")}`,
          undefined,
          "InternalTools",
        );
        return res.json({
          response: hybridResult.context,
          sources: hybridResult.sources,
        });
      }
    } catch (hybridErr: any) {
      // Fall through to existing RAG-only search
      logger.debug(
        `Hybrid search unavailable, falling back to RAG: ${hybridErr.message}`,
        undefined,
        "InternalTools",
      );
    }

    // Import RAG service dynamically to avoid circular dependencies
    let handleAskKnowledgeToolCall: any;
    try {
      ({ handleAskKnowledgeToolCall } =
        // @ts-ignore — module may not exist in all builds
        await import("../services/rag-elevenlabs-tool"));
    } catch {
      return res.json({
        response: "Knowledge base service is not available.",
        sources: [],
      });
    }

    const result = await handleAskKnowledgeToolCall(
      query,
      knowledgeBaseIds,
      userId,
    );

    logger.debug(
      `Knowledge lookup for call ${callId}: ${result.sources.length} sources`,
      undefined,
      "InternalTools",
    );

    return res.json(result);
  } catch (error: any) {
    logger.error(
      `Knowledge base lookup failed: ${error.message}`,
      error,
      "InternalTools",
    );
    return res.json({
      response:
        "I encountered an error searching the knowledge base. Please try again.",
      sources: [],
    });
  }
});

// ── Knowledge Graph Query ──

router.post("/knowledge-graph-query", async (req: Request, res: Response) => {
  try {
    const { callId, userId, knowledgeBaseIds, federationIds, query } = req.body;

    const hasLeafGraphs = knowledgeBaseIds && knowledgeBaseIds.length > 0;
    const hasFederations = federationIds && federationIds.length > 0;

    if (!query || (!hasLeafGraphs && !hasFederations)) {
      return res.json({
        success: true,
        data: {
          entities: [],
          relationships: [],
          summary: "No knowledge graph is configured for this agent.",
        },
      });
    }

    // Import query service dynamically to avoid circular dependencies
    let KnowledgeGraphQueryService: any;
    try {
      ({ KnowledgeGraphQueryService } = await import(
        "../services/knowledge-graph-query"
      ));
    } catch {
      return res.json({
        success: true,
        data: {
          entities: [],
          relationships: [],
          summary: "Knowledge graph query service is not available.",
        },
      });
    }

    const result = await KnowledgeGraphQueryService.queryGraph(
      query,
      knowledgeBaseIds || [],
      userId,
      { federationIds: federationIds || [] },
    );

    logger.debug(
      `Knowledge graph query for call ${callId}: ${result.entities.length} entities, ${result.relationships.length} relationships (leafGraphs=${(knowledgeBaseIds || []).length}, federations=${(federationIds || []).length})`,
      undefined,
      "InternalTools",
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error(
      `Knowledge graph query failed: ${error.message}`,
      error,
      "InternalTools",
    );
    return res.json({
      success: true,
      data: {
        entities: [],
        relationships: [],
        summary:
          "I encountered an error searching the knowledge graph. Please try again.",
      },
    });
  }
});

// ── Learn-to-Graph (Graph Pulse) ──

/**
 * Agent experience learning endpoint.
 *
 * Receives structured entity/relationship observations from CLAW agents,
 * validates them, runs governance adjudication, and writes accepted
 * observations to FalkorDB with full provenance metadata.
 *
 * Observations flow: Agent → This endpoint → Governance → FalkorDB
 *
 * Provenance metadata attached to every learned node/edge:
 *   _learnedBy: agentId
 *   _learnedDuring: callId
 *   _learningConfidence: number (0-1)
 *   _learnedAt: ISO timestamp
 *   _learningContext: string (e.g., "ticket_resolution")
 *
 * References:
 *   - Robinson, M. "Sheaves for Sensor Integration" 2017
 *     (Agent observations modeled as sheaf sections)
 *   - Schmid, E. "Applied Sheaf Theory for Multi-Agent AI" 2025
 *     (Sheaf consistency for multi-agent learning)
 */
router.post("/learn-to-graph", async (req: Request, res: Response) => {
  try {
    const {
      callId,
      userId,
      agentId,
      knowledgeBaseIds,
      entities,
      relationships,
      confidence,
      context: learningContext,
    } = req.body;

    // ── Input validation ──
    if (!callId || !userId || !agentId) {
      return res.status(400).json({
        error: "Missing required fields: callId, userId, agentId",
      });
    }

    if (!entities || !Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json({
        error: "At least one entity observation is required",
      });
    }

    if (!knowledgeBaseIds || !Array.isArray(knowledgeBaseIds) || knowledgeBaseIds.length === 0) {
      return res.json({
        success: true,
        data: {
          accepted: false,
          reason: "No target knowledge base configured for graph learning.",
          entitiesWritten: 0,
          relationshipsWritten: 0,
        },
      });
    }

    // ── Validate entity types ──
    const VALID_ENTITY_TYPES = new Set([
      "Person", "Organization", "Concept", "Technology", "Location",
      "Event", "Product", "Document", "Configuration", "Credential",
      "Policy", "Service", "Infrastructure",
    ]);

    for (const entity of entities) {
      if (!entity.name || typeof entity.name !== "string") {
        return res.status(400).json({
          error: `Entity missing name: ${JSON.stringify(entity)}`,
        });
      }
      if (!entity.type || typeof entity.type !== "string") {
        return res.status(400).json({
          error: `Entity missing type: ${JSON.stringify(entity)}`,
        });
      }
      // Normalize entity type — accept case-insensitive
      const normalizedType = entity.type.charAt(0).toUpperCase() +
        entity.type.slice(1).toLowerCase();
      if (!VALID_ENTITY_TYPES.has(normalizedType) && !VALID_ENTITY_TYPES.has(entity.type)) {
        logger.warn(
          `[LearnToGraph] Unknown entity type "${entity.type}" from agent ${agentId}. Allowing but logging.`,
          undefined,
          "InternalTools",
        );
      }
    }

    // ── Validate relationship references ──
    const entityNames = new Set(
      entities.map((e: any) => e.name.toLowerCase()),
    );
    const validRelationships = (relationships || []).filter((rel: any) => {
      if (!rel.source || !rel.target || !rel.type) return false;
      // Source and target should reference entities in this observation
      // or potentially entities already in the graph
      return true;
    });

    // ── Governance adjudication ──
    // Lightweight validation: reject observations with extremely low confidence
    // or that violate basic structural rules.
    // Full governance (OPA policy evaluation, evidence verification, logical verification)
    // is handled by the governance pipeline when it's available.
    const learningConfidence = typeof confidence === "number"
      ? Math.max(0, Math.min(1, confidence))
      : 0.75;

    if (learningConfidence < 0.1) {
      return res.json({
        success: true,
        data: {
          accepted: false,
          reason: "Confidence too low (< 0.1). Observations with very low confidence are rejected.",
          entitiesWritten: 0,
          relationshipsWritten: 0,
        },
      });
    }

    // ── Write to FalkorDB ──
    // Import services dynamically to avoid circular dependencies
    let getGraphNameFn: (userId: string, kbId: string) => string;
    let falkordbClient: any;

    try {
      const { getGraphName } = await import(
        "../infrastructure/falkordb/client"
      );
      const { falkordbPoolManager } = await import(
        "../infrastructure/falkordb/pool-manager"
      );
      getGraphNameFn = getGraphName;
      falkordbClient = falkordbPoolManager.getClient();
    } catch {
      return res.json({
        success: true,
        data: {
          accepted: false,
          reason: "Knowledge graph service is not available.",
          entitiesWritten: 0,
          relationshipsWritten: 0,
        },
      });
    }

    const now = new Date().toISOString();
    let totalEntitiesWritten = 0;
    let totalRelationshipsWritten = 0;

    // Write to the first available knowledge base (primary target)
    // Agent observations go to the first KB in the list (the agent's designated experience graph)
    const targetKbId = knowledgeBaseIds[0];
    const graphName = getGraphNameFn(userId, targetKbId);

    // Write entities with provenance
    for (const entity of entities) {
      try {
        const entityType = entity.type.charAt(0).toUpperCase() +
          entity.type.slice(1);
        const safeName = escapeCypherStringInternal(entity.name.trim());

        // Build property SET clauses
        const propClauses: string[] = [
          `e._learnedBy = "${escapeCypherStringInternal(agentId)}"`,
          `e._learnedDuring = "${escapeCypherStringInternal(callId)}"`,
          `e._learningConfidence = ${learningConfidence}`,
          `e._learnedAt = "${escapeCypherStringInternal(now)}"`,
          `e._learningContext = "${escapeCypherStringInternal(learningContext || "agent_observation")}"`,
        ];

        // Add user-provided properties
        if (entity.properties && typeof entity.properties === "object") {
          for (const [key, value] of Object.entries(entity.properties)) {
            const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
            if (typeof value === "number") {
              propClauses.push(`e.${safeKey} = ${value}`);
            } else if (typeof value === "boolean") {
              propClauses.push(`e.${safeKey} = ${value}`);
            } else if (typeof value === "string") {
              propClauses.push(
                `e.${safeKey} = "${escapeCypherStringInternal(value)}"`,
              );
            }
          }
        }

        const cypher =
          `MERGE (e:${entityType} {name: "${safeName}"}) ` +
          `SET ${propClauses.join(", ")}`;

        await falkordbClient.query(graphName, cypher);
        totalEntitiesWritten++;
      } catch (err: any) {
        logger.warn(
          `[LearnToGraph] Failed to write entity "${entity.name}": ${err.message}`,
          undefined,
          "InternalTools",
        );
      }
    }

    // Write relationships with provenance
    for (const rel of validRelationships) {
      try {
        const relType = rel.type.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const safeSource = escapeCypherStringInternal(rel.source.trim());
        const safeTarget = escapeCypherStringInternal(rel.target.trim());

        const propClauses: string[] = [
          `r._learnedBy = "${escapeCypherStringInternal(agentId)}"`,
          `r._learnedDuring = "${escapeCypherStringInternal(callId)}"`,
          `r._learningConfidence = ${learningConfidence}`,
          `r._learnedAt = "${escapeCypherStringInternal(now)}"`,
        ];

        if (rel.evidence && typeof rel.evidence === "string") {
          propClauses.push(
            `r.evidence_text = "${escapeCypherStringInternal(rel.evidence)}"`,
          );
        }

        const cypher =
          `MATCH (a {name: "${safeSource}"}), (b {name: "${safeTarget}"}) ` +
          `MERGE (a)-[r:${relType}]->(b) ` +
          `SET ${propClauses.join(", ")}`;

        await falkordbClient.query(graphName, cypher);
        totalRelationshipsWritten++;
      } catch (err: any) {
        logger.warn(
          `[LearnToGraph] Failed to write relationship "${rel.source}" -> "${rel.target}": ${err.message}`,
          undefined,
          "InternalTools",
        );
      }
    }

    logger.info(
      `[LearnToGraph] Agent ${agentId} learned ${totalEntitiesWritten} entities, ${totalRelationshipsWritten} relationships (call=${callId}, graph=${graphName}, confidence=${learningConfidence})`,
      undefined,
      "InternalTools",
    );

    return res.json({
      success: true,
      data: {
        accepted: true,
        entitiesWritten: totalEntitiesWritten,
        relationshipsWritten: totalRelationshipsWritten,
        graphName,
        confidence: learningConfidence,
      },
    });
  } catch (error: any) {
    logger.error(
      `Learn-to-graph failed: ${error.message}`,
      error,
      "InternalTools",
    );
    return res.json({
      success: true,
      data: {
        accepted: false,
        reason: "An error occurred while recording observations to the knowledge graph.",
        entitiesWritten: 0,
        relationshipsWritten: 0,
      },
    });
  }
});

/**
 * Escape a string for safe use inside Cypher double-quoted strings.
 * Handles backslashes and double quotes.
 */
function escapeCypherStringInternal(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── Webhook Execution ──

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const {
      callId,
      userId,
      name,
      url,
      method,
      headers,
      body: webhookBody,
    } = req.body;

    if (!url) {
      return res.json({
        success: false,
        message: "Webhook URL is required.",
      });
    }

    // Execute the webhook
    const response = await fetch(url, {
      method: method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body:
        method !== "GET"
          ? JSON.stringify({
              callId,
              userId,
              timestamp: new Date().toISOString(),
              ...webhookBody,
            })
          : undefined,
    });

    const responseData = await response.text();
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseData);
    } catch {
      parsedResponse = responseData;
    }

    logger.info(
      `Webhook ${name || url} executed: ${response.status}`,
      undefined,
      "InternalTools",
    );

    return res.json({
      success: response.ok,
      statusCode: response.status,
      response: parsedResponse,
    });
  } catch (error: any) {
    logger.error(
      `Webhook execution failed: ${error.message}`,
      error,
      "InternalTools",
    );
    return res.json({
      success: false,
      message: `Webhook failed: ${error.message}`,
    });
  }
});

// ── API Call Execution ──

router.post("/api-call", async (req: Request, res: Response) => {
  try {
    const { callId, userId, name, url, method, headers, parameters } = req.body;

    if (!url) {
      return res.json({
        success: false,
        message: "API URL is required.",
      });
    }

    // Build URL with query params for GET requests
    let finalUrl = url;
    let body: string | undefined;

    if (method === "GET" && parameters) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(parameters)) {
        params.set(key, String(value));
      }
      finalUrl = `${url}?${params.toString()}`;
    } else if (parameters) {
      body = JSON.stringify(parameters);
    }

    const response = await fetch(finalUrl, {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    });

    const responseData = await response.text();
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseData);
    } catch {
      parsedResponse = responseData;
    }

    logger.info(
      `API call ${name || url} executed: ${response.status}`,
      undefined,
      "InternalTools",
    );

    return res.json({
      success: response.ok,
      statusCode: response.status,
      data: parsedResponse,
    });
  } catch (error: any) {
    logger.error(
      `API call execution failed: ${error.message}`,
      error,
      "InternalTools",
    );
    return res.json({
      success: false,
      message: `API call failed: ${error.message}`,
    });
  }
});

// ── Call Events (removed in wtrdb extraction) ──

router.post("/call-event", async (_req: Request, res: Response) => {
  return res.status(410).json({ error: "Voice/telephony routes removed in wtrdb extraction" });
});

router.post("/call-ended", async (_req: Request, res: Response) => {
  return res.status(410).json({ error: "Voice/telephony routes removed in wtrdb extraction" });
});

router.post("/recover-calls", async (_req: Request, res: Response) => {
  return res.status(410).json({ error: "Voice/telephony routes removed in wtrdb extraction" });
});

router.post("/mcp-execute", async (_req: Request, res: Response) => {
  return res.status(410).json({ error: "MCP tool execution removed in wtrdb extraction" });
});

// ── parseDate / parseTime helpers (used by book-appointment) ──

function parseDate(input: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = new Date(input);
  if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
  return null;
}

function parseTime(input: string): string | null {
  if (/^\d{2}:\d{2}$/.test(input)) return input;
  if (/^\d{1}:\d{2}$/.test(input)) return `0${input}`;
  const match12 = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const period = match12[3].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }
  return null;
}

// ── Interview Completed ──
// Called by agent-worker when an AI interview session ends

router.post("/interview-completed", async (req: Request, res: Response) => {
  try {
    const {
      interviewId,
      candidateId,
      transcript,
      durationSeconds,
      recordingUrl,
    } = req.body;

    if (!interviewId || !candidateId || !transcript) {
      return res.status(400).json({ error: "interviewId, candidateId, and transcript are required" });
    }

    // Lazy import to avoid circular dependencies
    const { processInterviewCompleted } =
      await import("../modules/interview/interview-service");
    await processInterviewCompleted(
      candidateId,
      transcript,
      durationSeconds || 0,
      recordingUrl,
    );

    logger.info(
      `Interview completed: candidate=${candidateId}, interview=${interviewId}`,
      undefined,
      "InternalTools",
    );
    res.json({ success: true });
  } catch (error: any) {
    logger.error(
      `Failed to process interview-completed: ${error.message}`,
      error,
      "InternalTools",
    );
    res.status(500).json({ error: error.message });
  }
});

// Called by agent-worker when an automation interview session ends
router.post(
  "/automation-interview-completed",
  async (req: Request, res: Response) => {
    try {
      const {
        automationId,
        automationCandidateId,
        transcript,
        durationSeconds,
        recordingUrl,
      } = req.body;

      if (!automationCandidateId) {
        return res
          .status(400)
          .json({ error: "automationCandidateId is required" });
      }

      const { processInterviewCompleted } =
        await import("../modules/interview-automations/automation-service");
      await processInterviewCompleted(
        automationCandidateId,
        transcript || "",
        durationSeconds || 0,
        recordingUrl,
      );

      logger.info(
        `Automation interview completed: candidate=${automationCandidateId}, automation=${automationId}`,
        undefined,
        "InternalTools",
      );
      res.json({ success: true });
    } catch (error: any) {
      logger.error(
        `Failed to process automation-interview-completed: ${error.message}`,
        error,
        "InternalTools",
      );
      res.status(500).json({ error: error.message });
    }
  },
);

export { router as internalToolsRouter };

