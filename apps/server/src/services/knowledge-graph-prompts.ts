"use strict";

/**
 * Knowledge Graph Extraction Prompts
 *
 * OpenAI prompt templates for extracting entities and relationships
 * from knowledge base document chunks using structured JSON output.
 *
 * WS3-T1.2: Dual-Track Routing (DIAL-KG)
 * Extraction now produces two tracks:
 *   STATIC — stable facts as triples (h, r, t)
 *   EVENT  — temporal/complex facts as event structures
 *     ε = (trigger, roles, time, intent) where intent ∈ {Informational, Evolutionary}
 *
 * Evolutionary events trigger soft deprecation of existing facts.
 *
 * Reference: Bao et al., "DIAL-KG: Schema-Free Incremental Knowledge Graph
 * Construction via Dynamic Schema Induction and Evolution-Intent Assessment,"
 * arXiv:2603.20059, 2026.
 */

// Canonical entity types supported by the knowledge graph
// Extended per math.md Section 1.3 with Configuration, Credential, Policy,
// Service, Infrastructure, Technology
export const ENTITY_TYPES = [
  "Person",
  "Organization",
  "Concept",
  "Technology",
  "Location",
  "Event",
  "Product",
  "Document",
  "Configuration",
  "Credential",
  "Policy",
  "Service",
  "Infrastructure",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

// Canonical relationship types — extended per math.md Section 1.4
export const RELATIONSHIP_TYPES = [
  "WORKS_AT",
  "RELATED_TO",
  "PART_OF",
  "LOCATED_IN",
  "CREATED_BY",
  "DEPENDS_ON",
  "MENTIONS",
  "MANAGES",
  "OWNS",
  "PARTICIPATES_IN",
  "PRODUCES",
  "USED_BY",
  "FUNDED_BY",
  "COLLABORATES_WITH",
  "REPORTS_TO",
  "CONFIGURED_BY",
  "AUTHENTICATES_WITH",
  "CONNECTS_TO",
  "MONITORS",
  "RUNS_ON",
  "HOSTS",
  "BACKED_UP_BY",
  "LICENSED_TO",
  "GOVERNS",
  "SUPERSEDES",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

// Event intent types for dual-track routing
export const EVENT_INTENT_TYPES = ["Informational", "Evolutionary"] as const;
export type EventIntentType = (typeof EVENT_INTENT_TYPES)[number];

// Event type categories for extraction events
export const EVENT_TYPE_CATEGORIES = [
  "change",
  "announcement",
  "incident",
  "milestone",
  "transition",
  "discovery",
  "deprecation",
] as const;
export type EventTypeCategory = (typeof EVENT_TYPE_CATEGORIES)[number];

/** Typed event structure from dual-track extraction (EVENT track) */
export interface ExtractedEvent {
  name: string;
  type: EventTypeCategory;
  trigger: string;
  startDate: string;
  endDate: string;
  participants: string[];
  outcome: string;
  intent: EventIntentType;
  deprecates: string[];
}

/**
 * JSON schema for OpenAI structured output (response_format).
 * Instructs the model to return entities, relationships, AND events.
 *
 * WS3-T1.2: The `events` array is the EVENT track output.
 * Entities + relationships are the STATIC track output.
 */
export const extractionJsonSchema = {
  name: "knowledge_graph_extraction",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      entities: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: {
              type: "string" as const,
              description:
                "The canonical name of the entity (proper casing, no abbreviations when possible)",
            },
            label: {
              type: "string" as const,
              enum: [...ENTITY_TYPES],
              description:
                "The type/category of the entity from the allowed set",
            },
            properties: {
              type: "object" as const,
              description:
                "Additional key-value properties extracted for this entity (e.g. role, description, url)",
              properties: {},
              required: [] as string[],
              additionalProperties: { type: "string" as const },
            },
          },
          required: ["name", "label", "properties"],
          additionalProperties: false,
        },
        description: "All distinct entities found in the text (STATIC track: stable facts)",
      },
      relationships: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            sourceEntity: {
              type: "string" as const,
              description:
                "Name of the source entity (must match an entity name above)",
            },
            targetEntity: {
              type: "string" as const,
              description:
                "Name of the target entity (must match an entity name above)",
            },
            type: {
              type: "string" as const,
              enum: [...RELATIONSHIP_TYPES],
              description:
                "The relationship type from the allowed set",
            },
            properties: {
              type: "object" as const,
              description:
                "Additional key-value properties for this relationship (e.g. since, context)",
              properties: {},
              required: [] as string[],
              additionalProperties: { type: "string" as const },
            },
          },
          required: ["sourceEntity", "targetEntity", "type", "properties"],
          additionalProperties: false,
        },
        description:
          "All relationships between entities found in the text (STATIC track: stable triples)",
      },
      events: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: {
              type: "string" as const,
              description: "Short descriptive name for the event",
            },
            type: {
              type: "string" as const,
              enum: [...EVENT_TYPE_CATEGORIES],
              description: "The category of event",
            },
            trigger: {
              type: "string" as const,
              description:
                "The statement or action that triggered this event (the source text snippet)",
            },
            startDate: {
              type: "string" as const,
              description:
                "ISO-8601 date/datetime when the event started, or empty string if unknown",
            },
            endDate: {
              type: "string" as const,
              description:
                "ISO-8601 date/datetime when the event ended (or empty for ongoing/unknown)",
            },
            participants: {
              type: "array" as const,
              items: { type: "string" as const },
              description:
                "Entity names involved in this event (must match entities above)",
            },
            outcome: {
              type: "string" as const,
              description:
                "What resulted from this event (brief description)",
            },
            intent: {
              type: "string" as const,
              enum: [...EVENT_INTENT_TYPES],
              description:
                "Informational = purely descriptive, no existing facts change. Evolutionary = this event changes/supersedes existing facts (triggers soft deprecation).",
            },
            deprecates: {
              type: "array" as const,
              items: { type: "string" as const },
              description:
                "List of relationship descriptions that this event makes obsolete (e.g. 'Alice MANAGES dc01'). Empty if intent is Informational.",
            },
          },
          required: [
            "name",
            "type",
            "trigger",
            "startDate",
            "endDate",
            "participants",
            "outcome",
            "intent",
            "deprecates",
          ],
          additionalProperties: false,
        },
        description:
          "Temporal or complex facts that represent events, changes, or transitions (EVENT track). Include events where something happened, changed, was announced, or transitioned.",
      },
    },
    required: ["entities", "relationships", "events"],
    additionalProperties: false,
  },
};

/**
 * Map common entity type variations to canonical types.
 * Handles case-insensitive matching and common synonyms.
 *
 * Extended for WS3 with Technology, Configuration, Credential, Policy,
 * Service, and Infrastructure types per math.md Section 1.3.
 */
const ENTITY_TYPE_ALIASES: Record<string, EntityType> = {
  // Person
  person: "Person",
  people: "Person",
  individual: "Person",
  human: "Person",
  employee: "Person",
  user: "Person",
  author: "Person",
  founder: "Person",
  ceo: "Person",
  manager: "Person",
  developer: "Person",

  // Organization
  organization: "Organization",
  organisation: "Organization",
  company: "Organization",
  corporation: "Organization",
  firm: "Organization",
  enterprise: "Organization",
  institution: "Organization",
  agency: "Organization",
  team: "Organization",
  department: "Organization",
  group: "Organization",

  // Concept
  concept: "Concept",
  idea: "Concept",
  theory: "Concept",
  methodology: "Concept",
  framework: "Concept",
  principle: "Concept",
  topic: "Concept",
  skill: "Concept",
  technique: "Concept",

  // Technology (split from Concept)
  technology: "Technology",
  standard: "Technology",
  protocol: "Technology",
  programming_language: "Technology",
  language: "Technology",
  database: "Technology",
  os: "Technology",
  operating_system: "Technology",

  // Location
  location: "Location",
  place: "Location",
  city: "Location",
  country: "Location",
  region: "Location",
  address: "Location",
  area: "Location",
  state: "Location",
  continent: "Location",

  // Event
  event: "Event",
  meeting: "Event",
  conference: "Event",
  launch: "Event",
  release: "Event",
  incident: "Event",
  milestone: "Event",
  announcement: "Event",

  // Product
  product: "Product",
  software: "Product",
  tool: "Product",
  platform: "Product",
  application: "Product",
  app: "Product",
  api: "Product",
  library: "Product",
  feature: "Product",

  // Document
  document: "Document",
  report: "Document",
  paper: "Document",
  article: "Document",
  specification: "Document",
  manual: "Document",
  guide: "Document",
  readme: "Document",

  // Configuration (new)
  configuration: "Configuration",
  config: "Configuration",
  setting: "Configuration",
  settings: "Configuration",
  parameter: "Configuration",
  preference: "Configuration",

  // Credential (new)
  credential: "Credential",
  certificate: "Credential",
  api_key: "Credential",
  token: "Credential",
  password: "Credential",
  secret: "Credential",
  license_key: "Credential",
  ssh_key: "Credential",

  // Policy (new)
  policy: "Policy",
  contract: "Policy",
  rule: "Policy",
  regulation: "Policy",
  compliance: "Policy",
  sla: "Policy",
  agreement: "Policy",

  // Service (new)
  service: "Service",
  microservice: "Service",
  endpoint: "Service",
  daemon: "Service",
  web_service: "Service",
  cloud_service: "Service",

  // Infrastructure (new)
  infrastructure: "Infrastructure",
  server: "Infrastructure",
  cluster: "Infrastructure",
  network: "Infrastructure",
  firewall: "Infrastructure",
  router: "Infrastructure",
  switch: "Infrastructure",
  load_balancer: "Infrastructure",
  vm: "Infrastructure",
  virtual_machine: "Infrastructure",
  container: "Infrastructure",
};

/**
 * Normalize a raw entity type string to one of the canonical EntityType values.
 * Falls back to "Concept" for unrecognized types.
 */
export function normalizeEntityType(raw: string): EntityType {
  if (!raw) return "Concept";

  const lower = raw.toLowerCase().trim();

  // Direct canonical match (case-insensitive)
  for (const t of ENTITY_TYPES) {
    if (lower === t.toLowerCase()) return t;
  }

  // Alias lookup
  const alias = ENTITY_TYPE_ALIASES[lower];
  if (alias) return alias;

  // Fallback
  return "Concept";
}

/**
 * Build the system and user prompts for entity/relationship extraction.
 *
 * WS3-T1.2: Dual-Track Routing
 * The prompt now instructs the model to produce two tracks:
 *  - STATIC track: entities + relationships (stable facts as triples)
 *  - EVENT track: events array (temporal/complex facts)
 *
 * @param existingEntities - Optional list of entity names already in the graph.
 *   Used for incremental extraction to help the model reference existing entities.
 */
export function buildExtractionPrompt(
  chunkText: string,
  documentTitle: string,
  existingEntities?: string[],
): { systemPrompt: string; userPrompt: string } {
  const existingEntityContext =
    existingEntities && existingEntities.length > 0
      ? `\n\nThe following entities already exist in the knowledge graph. If any extracted entities refer to the same real-world objects, use the EXACT same names to enable deduplication:\n${existingEntities.slice(0, 200).join(", ")}`
      : "";

  const systemPrompt = `You are a knowledge graph extraction assistant implementing DIAL-KG dual-track routing. Your task is to read a chunk of text from a document and extract:

**STATIC TRACK** — Stable facts as entities and relationships (triples).
**EVENT TRACK** — Temporal or complex facts as event structures.

# STATIC Track Rules (entities + relationships):
1. Extract entities of these types ONLY: ${ENTITY_TYPES.join(", ")}.
2. Use the MOST SPECIFIC type that fits (e.g., prefer "Infrastructure" over "Concept" for a server, "Technology" over "Concept" for a programming language, "Service" over "Product" for a cloud service).
3. Entity names should use proper casing and be fully spelled out when possible (e.g., "Artificial Intelligence" not "AI", unless AI is the widely-known name).
4. Deduplicate within this chunk — if the same entity is mentioned multiple times, include it only once.
5. For relationships, use these types: ${RELATIONSHIP_TYPES.join(", ")}.
6. Only create relationships between entities you have listed. Both sourceEntity and targetEntity must exactly match an entity name in your entities list.
7. Add useful properties where available (e.g., a Person's role, an Organization's industry, a relationship's context, a Credential's expiry date).
8. If the text contains no extractable entities, return empty arrays.
9. Be thorough but precise — extract real entities mentioned in the text, do not hallucinate entities that are not present.
10. **CRITICAL — NO ORPHAN ENTITIES**: Every entity you extract MUST participate in at least one relationship within this chunk. If an entity is mentioned but you cannot identify a meaningful relationship for it, OMIT it entirely. Never produce entities that have no edges. Common patterns to use:
    - Document subject MENTIONS named things in the text
    - Configuration items are PART_OF a system, CONFIGURED_BY a tool, or USED_BY a service
    - Services/Infrastructure DEPENDS_ON each other, RUN_ON hosts, are MONITORED by tools
    - People WORK_AT organizations, MANAGE systems, REPORT_TO others
    - Technologies are USED_BY products and CONNECT_TO other technologies
11. Aim for relationship density: target at least one relationship per entity on average. If you have 10 entities, you should produce at least 10 relationships.

# EVENT Track Rules (events):
10. When the text describes something that happened, changed, was announced, or transitioned — extract it as an event.
11. Events have: name, type (change/announcement/incident/milestone/transition/discovery/deprecation), trigger (source text snippet), startDate, endDate, participants (entity names), outcome, intent, deprecates.
12. **Intent classification is critical:**
    - **Informational**: The event describes a fact or occurrence but does NOT change any existing knowledge (e.g., "Company X was founded in 2020" is informational if we already know this).
    - **Evolutionary**: The event changes, supersedes, or invalidates existing facts (e.g., "Alice was promoted from Engineer to CTO" means the old WORKS_AT relationship with role=Engineer should be deprecated).
13. For Evolutionary events, fill the "deprecates" array with natural-language descriptions of the relationships that should be soft-deprecated (e.g., "Alice WORKS_AT Acme with role=Engineer").
14. For Informational events, leave "deprecates" as an empty array.
15. Use ISO-8601 format for dates. Use empty string if date is unknown.
16. If no events are found, return an empty events array.${existingEntityContext}`;

  const userPrompt = `Document title: "${documentTitle}"

Text chunk to analyze:
---
${chunkText}
---

Extract all entities, relationships, and events from the text above using dual-track routing (STATIC + EVENT). Return them as JSON matching the required schema.`;

  return { systemPrompt, userPrompt };
}
