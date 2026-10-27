import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup ──

// vi.mock is hoisted above module scope, so any mock referenced inside a factory
// must be created with vi.hoisted.
const {
  mockDbSelect,
  mockDbFrom,
  mockDbWhere,
  mockSearchKnowledge,
  mockFormatResultsForAgent,
  mockKGQuerySearch,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbWhere: vi.fn(),
  mockSearchKnowledge: vi.fn(),
  mockFormatResultsForAgent: vi.fn(),
  mockKGQuerySearch: vi.fn(),
}));

// Mock db

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockDbWhere,
      }),
    }),
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ _type: "eq", left: a, right: b })),
  and: vi.fn((...args: any[]) => ({ _type: "and", conditions: args })),
  inArray: vi.fn((col, vals) => ({ _type: "inArray", column: col, values: vals })),
}));

// Mock shared schema
vi.mock("@wtrops/shared", () => ({
  knowledgeGraphs: {
    knowledgeBaseId: "knowledgeBaseId",
    userId: "userId",
    status: "status",
  },
}));

// Mock RAG knowledge service
vi.mock("../services/rag-knowledge", () => ({
  RAGKnowledgeService: {
    searchKnowledge: mockSearchKnowledge,
    formatResultsForAgent: mockFormatResultsForAgent,
  },
}));

// Mock the knowledge-graph-query module (dynamically imported by the service)
vi.mock("../services/knowledge-graph-query", () => ({
  KnowledgeGraphQueryService: {
    search: mockKGQuerySearch,
  },
}));

// Mock FalkorDB infrastructure (used by runDirectGraphSearch fallback)
vi.mock("../infrastructure", () => ({
  falkordbPoolManager: {
    isReady: () => false,
    getClient: vi.fn(),
  },
}));

vi.mock("../infrastructure/falkordb/client", () => ({
  getGraphName: (userId: string, kbId: string) => `kg_${userId}_${kbId}`,
}));

// Mock logger
vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import after mocks ──

import { HybridKnowledgeSearchService } from "../services/hybrid-knowledge-search";

// ── Tests ──

describe("HybridKnowledgeSearchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: RAG returns some context
    mockSearchKnowledge.mockResolvedValue([
      { chunkText: "Relevant document chunk about Acme Corp.", score: 0.85 },
    ]);
    mockFormatResultsForAgent.mockReturnValue(
      "Relevant document chunk about Acme Corp.",
    );
  });

  // ────────────────────────────────────────────
  // search: RAG-only
  // ────────────────────────────────────────────

  describe("search (RAG-only)", () => {
    it("returns RAG-only results when no graph exists", async () => {
      // No completed knowledge graphs found
      mockDbWhere.mockResolvedValueOnce([]);

      const result = await HybridKnowledgeSearchService.search(
        "What is Acme Corp?",
        ["kb1"],
        "user1",
      );

      // Should still have RAG context
      expect(result.ragContext).toBe(
        "Relevant document chunk about Acme Corp.",
      );

      // Should have RAG in sources
      expect(result.sources).toContainEqual({ type: "rag", count: 1 });

      // Should NOT have graph entities or relationships
      expect(result.graphEntities).toEqual([]);
      expect(result.graphRelationships).toEqual([]);

      // Graph search mock should NOT have been called
      expect(mockKGQuerySearch).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────
  // search: hybrid results
  // ────────────────────────────────────────────

  describe("search (hybrid)", () => {
    it("returns hybrid results when graph exists", async () => {
      // DB returns a completed knowledge graph
      mockDbWhere.mockResolvedValueOnce([
        { knowledgeBaseId: "kb1", userId: "user1", status: "completed" },
      ]);

      // Graph query returns entities and relationships
      mockKGQuerySearch.mockResolvedValueOnce({
        entities: [
          { name: "Acme Corp", type: "Organization" },
          { name: "John Doe", type: "Person" },
        ],
        relationships: [
          { source: "John Doe", target: "Acme Corp", type: "WORKS_AT" },
        ],
      });

      const result = await HybridKnowledgeSearchService.search(
        "What is Acme Corp?",
        ["kb1"],
        "user1",
      );

      // Should have both RAG and graph data
      expect(result.ragContext).toContain("Acme Corp");
      expect(result.graphEntities).toHaveLength(2);
      expect(result.graphRelationships).toHaveLength(1);

      // Sources should include both RAG and graph
      expect(result.sources).toContainEqual({ type: "rag", count: 1 });
      expect(result.sources).toContainEqual({ type: "graph", count: 3 }); // 2 entities + 1 relationship

      // Context should contain both document and graph sections
      expect(result.context).toContain("Document Context");
      expect(result.context).toContain("Knowledge Graph");
    });
  });

  // ────────────────────────────────────────────
  // search: graceful degradation
  // ────────────────────────────────────────────

  describe("search (graceful degradation)", () => {
    it("gracefully degrades when graph query fails (still returns RAG results)", async () => {
      // DB returns a completed knowledge graph
      mockDbWhere.mockResolvedValueOnce([
        { knowledgeBaseId: "kb1", userId: "user1", status: "completed" },
      ]);

      // Graph query service throws an error
      mockKGQuerySearch.mockRejectedValueOnce(
        new Error("FalkorDB connection refused"),
      );

      const result = await HybridKnowledgeSearchService.search(
        "What is Acme Corp?",
        ["kb1"],
        "user1",
      );

      // RAG results should still be present
      expect(result.ragContext).toBe(
        "Relevant document chunk about Acme Corp.",
      );

      // Graph results should be empty (degraded gracefully)
      expect(result.graphEntities).toEqual([]);
      expect(result.graphRelationships).toEqual([]);

      // Sources should only include RAG
      expect(result.sources).toContainEqual({ type: "rag", count: 1 });
      expect(
        result.sources.find((s) => s.type === "graph"),
      ).toBeUndefined();
    });

    it("gracefully degrades when knowledge_graphs table query fails", async () => {
      // DB query throws (table might not exist)
      mockDbWhere.mockRejectedValueOnce(
        new Error("relation \"knowledge_graphs\" does not exist"),
      );

      const result = await HybridKnowledgeSearchService.search(
        "What is Acme Corp?",
        ["kb1"],
        "user1",
      );

      // Should fall back to RAG-only
      expect(result.ragContext).toBe(
        "Relevant document chunk about Acme Corp.",
      );
      expect(result.graphEntities).toEqual([]);
      expect(result.graphRelationships).toEqual([]);
    });
  });

  // ────────────────────────────────────────────
  // formatHybridResult
  // ────────────────────────────────────────────

  describe("formatHybridResult", () => {
    it("produces correctly structured output with both RAG and graph sections", () => {
      const ragContext = "Acme Corp is a technology company founded in 2020.";
      const graphEntities = [
        { name: "Acme Corp", type: "Organization", properties: { industry: "Tech" } },
        { name: "John Doe", type: "Person", properties: { role: "CEO" } },
      ];
      const graphRelationships = [
        { source: "John Doe", target: "Acme Corp", type: "WORKS_AT" },
      ];

      const output = HybridKnowledgeSearchService.formatHybridResult(
        ragContext,
        graphEntities,
        graphRelationships,
      );

      // Document Context section
      expect(output).toContain("=== Document Context ===");
      expect(output).toContain(ragContext);

      // Knowledge Graph section
      expect(output).toContain("=== Knowledge Graph ===");

      // Entity listing
      expect(output).toContain("Entities:");
      expect(output).toContain("[Organization] Acme Corp");
      expect(output).toContain("industry: Tech");
      expect(output).toContain("[Person] John Doe");

      // Relationship listing
      expect(output).toContain("Relationships:");
      expect(output).toContain("John Doe --[WORKS_AT]--> Acme Corp");
    });

    it("returns only RAG section when no graph data", () => {
      const ragContext = "Some RAG context.";

      const output = HybridKnowledgeSearchService.formatHybridResult(
        ragContext,
        [],
        [],
      );

      expect(output).toContain("=== Document Context ===");
      expect(output).toContain("Some RAG context.");
      expect(output).not.toContain("=== Knowledge Graph ===");
    });

    it("returns only graph section when RAG context is empty", () => {
      const graphEntities = [
        { name: "Entity X", type: "Concept" },
      ];

      const output = HybridKnowledgeSearchService.formatHybridResult(
        "",
        graphEntities,
        [],
      );

      expect(output).not.toContain("=== Document Context ===");
      expect(output).toContain("=== Knowledge Graph ===");
      expect(output).toContain("[Concept] Entity X");
    });

    it("returns empty string when both RAG and graph are empty", () => {
      const output = HybridKnowledgeSearchService.formatHybridResult(
        "",
        [],
        [],
      );

      expect(output).toBe("");
    });

    it("caps entities at 20 and relationships at 20 for context overflow prevention", () => {
      const entities = Array.from({ length: 30 }, (_, i) => ({
        name: `Entity${i}`,
        type: "Concept",
      }));
      const relationships = Array.from({ length: 30 }, (_, i) => ({
        source: `Entity${i}`,
        target: `Entity${i + 1}`,
        type: "RELATED_TO",
      }));

      const output = HybridKnowledgeSearchService.formatHybridResult(
        "Some RAG context.",
        entities,
        relationships,
      );

      // Should not include Entity20 through Entity29 in the entities listing
      expect(output).toContain("Entity0");
      expect(output).toContain("Entity19");
      // Entity20 should not appear in the entity listing lines
      // (it could appear in a relationship line, so check specifically the entities section)
      const entitiesSection = output.split("Relationships:")[0];
      expect(entitiesSection).not.toContain("Entity20");
    });
  });

  // ────────────────────────────────────────────
  // search: parallelism
  // ────────────────────────────────────────────

  describe("search (parallelism)", () => {
    it("runs RAG and graph queries in parallel via Promise.all", async () => {
      // Track the order of operations to verify parallelism
      const callOrder: string[] = [];

      // DB returns a completed knowledge graph
      mockDbWhere.mockResolvedValueOnce([
        { knowledgeBaseId: "kb1", userId: "user1", status: "completed" },
      ]);

      // RAG search with a small delay to simulate async work
      mockSearchKnowledge.mockImplementation(async () => {
        callOrder.push("rag_start");
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push("rag_end");
        return [{ chunkText: "RAG chunk", score: 0.9 }];
      });
      mockFormatResultsForAgent.mockReturnValue("RAG chunk");

      // Graph search with a small delay
      mockKGQuerySearch.mockImplementation(async () => {
        callOrder.push("graph_start");
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push("graph_end");
        return {
          entities: [{ name: "Test", type: "Concept" }],
          relationships: [],
        };
      });

      const result = await HybridKnowledgeSearchService.search(
        "test query",
        ["kb1"],
        "user1",
      );

      // Both should have been called
      expect(mockSearchKnowledge).toHaveBeenCalled();
      expect(mockKGQuerySearch).toHaveBeenCalled();

      // Both searches should have started before either ended (parallel execution)
      // Since they run via Promise.all, rag_start and graph_start should both
      // appear before at least one of the _end markers
      const ragStartIdx = callOrder.indexOf("rag_start");
      const graphStartIdx = callOrder.indexOf("graph_start");
      const firstEndIdx = Math.min(
        callOrder.indexOf("rag_end"),
        callOrder.indexOf("graph_end"),
      );

      expect(ragStartIdx).toBeLessThan(firstEndIdx);
      expect(graphStartIdx).toBeLessThan(firstEndIdx);

      // Result should contain both RAG and graph data
      expect(result.ragContext).toBe("RAG chunk");
      expect(result.graphEntities).toHaveLength(1);
    });
  });
});
