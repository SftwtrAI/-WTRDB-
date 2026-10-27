import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup ──

// vi.mock is hoisted above module scope, so any mock referenced inside a factory
// must be created with vi.hoisted.
const {
  mockCreate,
  mockDbSelect,
  mockDbFrom,
  mockDbWhere,
  mockDbLimit,
  mockDbExecute,
  mockFalkorQuery,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockDbSelect: vi.fn().mockReturnThis(),
  mockDbFrom: vi.fn().mockReturnThis(),
  mockDbWhere: vi.fn().mockReturnThis(),
  mockDbLimit: vi.fn().mockResolvedValue([]),
  mockDbExecute: vi.fn().mockResolvedValue({ rows: [] }),
  mockFalkorQuery: vi.fn().mockResolvedValue({ records: [] }),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
    // kg-llm-router routes gpt-5-class models to the Responses API.
    responses = {
      create: mockCreate,
    };
  },
}));

// Mock the db module
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([{ value: "test-openai-api-key" }]),
        }),
      }),
    }),
    execute: mockDbExecute,
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ _type: "eq", left: a, right: b })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => ({
      _type: "sql",
      strings,
      values,
    }),
    { raw: vi.fn() },
  ),
}));

// Mock shared schema tables.
// The service pulls in ../temporal, whose entities.ts calls registerEntity() for
// several tables at import time — so those exports have to be present here too.
vi.mock("@wtrops/shared", () => ({
  registerEntity: vi.fn(),
  knowledgeChunks: { knowledgeBaseId: "knowledgeBaseId", chunkText: "chunkText", chunkIndex: "chunkIndex" },
  knowledgeBase: { id: "id", title: "title" },
  globalSettings: { key: "key", value: "value" },
  knowledgeGraphs: {},
  users: { id: "id" },
  plans: { id: "id" },
  webhookSubscriptions: { id: "id" },
}));

// Mock FalkorDB client
vi.mock("../infrastructure/falkordb/client", () => ({
  getGraphName: (userId: string, kbId: string) => `kg_${userId}_${kbId}`,
  createFalkorDBClient: vi.fn(() => ({
    query: mockFalkorQuery,
  })),
}));

// Mock ioredis
vi.mock("ioredis", () => ({
  default: class MockRedis {
    constructor() {}
    connect = vi.fn().mockResolvedValue(undefined);
    quit = vi.fn().mockResolvedValue(undefined);
    call = vi.fn().mockResolvedValue(undefined);
  },
}));

// ── Import after mocks ──

import { extractEntitiesFromChunk } from "../services/knowledge-graph-extraction";
import { normalizeEntityType } from "../services/knowledge-graph-prompts";

// ── Helper to build a successful OpenAI response ──

// Shape returned by the Responses API, which kg-llm-router walks looking for
// output_text parts. Chat-completions shape is no longer what the service reads.
function makeOpenAIResponse(content: string) {
  return {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: content,
          },
        ],
      },
    ],
  };
}

// ── Tests ──

describe("Knowledge Graph Extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────
  // extractEntitiesFromChunk
  // ────────────────────────────────────────────

  describe("extractEntitiesFromChunk", () => {
    it("parses OpenAI response into GraphEntity[] and GraphRelationship[]", async () => {
      const extractionPayload = {
        entities: [
          {
            name: "Acme Corp",
            label: "Organization",
            properties: { industry: "Tech" },
          },
          {
            name: "John Doe",
            label: "Person",
            properties: { role: "CEO" },
          },
        ],
        relationships: [
          {
            sourceEntity: "John Doe",
            targetEntity: "Acme Corp",
            type: "WORKS_AT",
            properties: {},
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse(JSON.stringify(extractionPayload)),
      );

      const result = await extractEntitiesFromChunk(
        "John Doe is the CEO of Acme Corp, a tech company.",
        "Company Profile",
      );

      // Verify entities
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0].name).toBe("Acme Corp");
      expect(result.entities[0].label).toBe("Organization");
      expect(result.entities[0].properties.industry).toBe("Tech");

      expect(result.entities[1].name).toBe("John Doe");
      expect(result.entities[1].label).toBe("Person");
      expect(result.entities[1].properties.role).toBe("CEO");

      // Verify relationships
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].sourceEntityId).toBe("John Doe");
      expect(result.relationships[0].targetEntityId).toBe("Acme Corp");
      expect(result.relationships[0].type).toBe("WORKS_AT");
    });

    it("handles malformed JSON gracefully (returns empty arrays)", async () => {
      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse("This is not valid JSON {{{"),
      );

      const result = await extractEntitiesFromChunk(
        "Some text chunk",
        "Document",
      );

      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);
    });

    it("handles empty content from OpenAI (null choices)", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      });

      const result = await extractEntitiesFromChunk(
        "Some text chunk",
        "Document",
      );

      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);
    });

    it("handles empty entities and relationships arrays in response", async () => {
      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse(
          JSON.stringify({ entities: [], relationships: [] }),
        ),
      );

      const result = await extractEntitiesFromChunk(
        "No entities here.",
        "Empty Document",
      );

      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);
    });

    it("normalizes entity types via the normalizeEntityType function", async () => {
      const payload = {
        entities: [
          {
            name: "Some Company",
            label: "company", // should be normalized to "Organization"
            properties: {},
          },
        ],
        relationships: [],
      };

      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse(JSON.stringify(payload)),
      );

      const result = await extractEntitiesFromChunk(
        "Some Company is a big firm.",
        "Test Doc",
      );

      // The extraction code calls normalizeEntityType which maps "company" -> "Organization"
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].label).toBe("Organization");
    });

    it("normalizes relationship types to uppercase with underscores", async () => {
      const payload = {
        entities: [
          { name: "A", label: "Person", properties: {} },
          { name: "B", label: "Organization", properties: {} },
        ],
        relationships: [
          {
            sourceEntity: "A",
            targetEntity: "B",
            type: "works at",
            properties: {},
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse(JSON.stringify(payload)),
      );

      const result = await extractEntitiesFromChunk(
        "A works at B.",
        "Test Doc",
      );

      // "works at" should become "WORKS_AT"
      expect(result.relationships[0].type).toBe("WORKS_AT");
    });

    it("trims entity and relationship names", async () => {
      const payload = {
        entities: [
          { name: "  Spacey Name  ", label: "Person", properties: {} },
        ],
        relationships: [
          {
            sourceEntity: "  Spacey Name  ",
            targetEntity: "  Another  ",
            type: "RELATED_TO",
            properties: {},
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(
        makeOpenAIResponse(JSON.stringify(payload)),
      );

      const result = await extractEntitiesFromChunk(
        "Spacey Name is related to Another.",
        "Test Doc",
      );

      expect(result.entities[0].name).toBe("Spacey Name");
      expect(result.relationships[0].sourceEntityId).toBe("Spacey Name");
      expect(result.relationships[0].targetEntityId).toBe("Another");
    });
  });

  // ────────────────────────────────────────────
  // normalizeEntityType
  // ────────────────────────────────────────────

  describe("normalizeEntityType", () => {
    it("returns canonical type for exact matches (case-insensitive)", () => {
      expect(normalizeEntityType("Person")).toBe("Person");
      expect(normalizeEntityType("person")).toBe("Person");
      expect(normalizeEntityType("ORGANIZATION")).toBe("Organization");
    });

    it("maps aliases to canonical types", () => {
      expect(normalizeEntityType("company")).toBe("Organization");
      expect(normalizeEntityType("firm")).toBe("Organization");
      expect(normalizeEntityType("employee")).toBe("Person");
      expect(normalizeEntityType("city")).toBe("Location");
      expect(normalizeEntityType("software")).toBe("Product");
      expect(normalizeEntityType("report")).toBe("Document");
      expect(normalizeEntityType("conference")).toBe("Event");
      expect(normalizeEntityType("framework")).toBe("Concept");
    });

    it("falls back to Concept for unrecognized types", () => {
      expect(normalizeEntityType("unknown_type")).toBe("Concept");
      expect(normalizeEntityType("xyzzy")).toBe("Concept");
    });

    it("falls back to Concept for empty/null input", () => {
      expect(normalizeEntityType("")).toBe("Concept");
    });
  });

  // ────────────────────────────────────────────
  // Entity deduplication (integration-level)
  // ────────────────────────────────────────────

  describe("Entity deduplication across chunks", () => {
    it("deduplicates entities by name+label across multiple extraction calls", async () => {
      // Simulate two chunks returning overlapping entities.
      // The processKnowledgeBase function deduplicates by (name.toLowerCase() + "::" + label).
      // We test the dedup logic directly since processKnowledgeBase requires full DB setup.

      const chunk1Response = {
        entities: [
          { name: "Acme Corp", label: "Organization", properties: { industry: "Tech" } },
          { name: "John Doe", label: "Person", properties: { role: "CEO" } },
        ],
        relationships: [],
      };

      const chunk2Response = {
        entities: [
          { name: "Acme Corp", label: "Organization", properties: { sector: "Software" } },
          { name: "Jane Smith", label: "Person", properties: { role: "CTO" } },
        ],
        relationships: [],
      };

      mockCreate
        .mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(chunk1Response)))
        .mockResolvedValueOnce(makeOpenAIResponse(JSON.stringify(chunk2Response)));

      const result1 = await extractEntitiesFromChunk("Chunk 1 text", "Doc");
      const result2 = await extractEntitiesFromChunk("Chunk 2 text", "Doc");

      // Simulate the deduplication logic from processKnowledgeBase
      const allEntities = [...result1.entities, ...result2.entities];
      const entityMap = new Map<string, (typeof allEntities)[0]>();
      for (const entity of allEntities) {
        const key = `${entity.name.toLowerCase()}::${entity.label}`;
        const existing = entityMap.get(key);
        if (existing) {
          existing.properties = { ...entity.properties, ...existing.properties };
        } else {
          entityMap.set(key, entity);
        }
      }
      const uniqueEntities = Array.from(entityMap.values());

      // "Acme Corp::Organization" should only appear once
      expect(uniqueEntities).toHaveLength(3); // Acme Corp, John Doe, Jane Smith
      const acme = uniqueEntities.find(
        (e) => e.name === "Acme Corp",
      );
      expect(acme).toBeDefined();
      // Properties should be merged (existing takes precedence for overlapping keys)
      expect(acme!.properties.industry).toBe("Tech");
    });
  });

  // ────────────────────────────────────────────
  // Chunk failure isolation
  // ────────────────────────────────────────────

  describe("Chunk failure isolation", () => {
    it("individual chunk failures do not stop other chunks from being processed", async () => {
      // Simulate: first call succeeds, second fails, third succeeds
      mockCreate
        .mockResolvedValueOnce(
          makeOpenAIResponse(
            JSON.stringify({
              entities: [{ name: "Entity A", label: "Person", properties: {} }],
              relationships: [],
            }),
          ),
        )
        .mockRejectedValueOnce(new Error("OpenAI rate limit exceeded"))
        .mockResolvedValueOnce(
          makeOpenAIResponse(
            JSON.stringify({
              entities: [{ name: "Entity C", label: "Concept", properties: {} }],
              relationships: [],
            }),
          ),
        );

      // First call should succeed
      const result1 = await extractEntitiesFromChunk("Chunk 1", "Doc");
      expect(result1.entities).toHaveLength(1);
      expect(result1.entities[0].name).toBe("Entity A");

      // Second call should throw (this is what processKnowledgeBase catches)
      await expect(
        extractEntitiesFromChunk("Chunk 2", "Doc"),
      ).rejects.toThrow("OpenAI rate limit exceeded");

      // Third call should still succeed (mock is independent)
      const result3 = await extractEntitiesFromChunk("Chunk 3", "Doc");
      expect(result3.entities).toHaveLength(1);
      expect(result3.entities[0].name).toBe("Entity C");
    });
  });
});
