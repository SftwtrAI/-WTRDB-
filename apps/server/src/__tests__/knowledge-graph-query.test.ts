import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup ──

const mockQuery = vi.fn();
const mockClient = {
  query: mockQuery,
};

vi.mock("../infrastructure/falkordb/pool-manager", () => ({
  falkordbPoolManager: {
    getClient: vi.fn(() => mockClient),
    isReady: () => true,
  },
}));

vi.mock("../infrastructure/falkordb/client", () => ({
  getGraphName: (userId: string, kbId: string) => `kg_${userId}_${kbId}`,
  createFalkorDBClient: vi.fn(() => mockClient),
}));

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { KnowledgeGraphQueryService } from "../services/knowledge-graph-query";

// ── Tests ──

describe("KnowledgeGraphQueryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────
  // queryGraph
  // ────────────────────────────────────────────

  describe("queryGraph", () => {
    it("builds correct Cypher with case-insensitive search", async () => {
      // First call: entity search - return one entity
      mockQuery.mockResolvedValueOnce({
        records: [
          {
            n: {
              name: "Acme Corp",
              label: "Organization",
              properties: { industry: "Tech" },
            },
          },
        ],
      });

      // Second call: neighbor query
      mockQuery.mockResolvedValueOnce({
        records: [
          {
            n: {
              name: "Acme Corp",
              label: "Organization",
              properties: { industry: "Tech" },
            },
            m: {
              name: "John Doe",
              label: "Person",
              properties: { role: "CEO" },
            },
            r: {
              sourceEntity: "John Doe",
              targetEntity: "Acme Corp",
              type: "WORKS_AT",
              properties: {},
            },
          },
        ],
      });

      const result = await KnowledgeGraphQueryService.queryGraph(
        "Acme",
        ["kb1"],
        "user1",
      );

      // Verify the entity search query was called with toLower for case-insensitive matching
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const firstCallCypher = mockQuery.mock.calls[0][1] as string;
      expect(firstCallCypher).toContain("toLower(n.name) CONTAINS toLower($searchTerm)");

      // Verify params include the search term
      const firstCallParams = mockQuery.mock.calls[0][2] as Record<string, any>;
      expect(firstCallParams.searchTerm).toBe("Acme");

      // Verify results
      expect(result.entities.length).toBeGreaterThanOrEqual(1);
      expect(result.entities.some((e) => e.name === "Acme Corp")).toBe(true);
    });

    it("iterates over multiple knowledgeBaseIds", async () => {
      // KB 1: entity search, then neighbor search
      mockQuery
        .mockResolvedValueOnce({
          records: [
            {
              n: {
                name: "Entity A",
                label: "Person",
                properties: {},
              },
            },
          ],
        })
        .mockResolvedValueOnce({ records: [] }) // KB1 neighbors
        .mockResolvedValueOnce({
          records: [
            {
              n: {
                name: "Entity B",
                label: "Organization",
                properties: {},
              },
            },
          ],
        })
        .mockResolvedValueOnce({ records: [] }); // KB2 neighbors

      const result = await KnowledgeGraphQueryService.queryGraph(
        "test",
        ["kb1", "kb2"],
        "user1",
      );

      // Should have queried both graphs
      expect(mockQuery).toHaveBeenCalledTimes(4);

      // First graph call should use kg_user1_kb1
      expect(mockQuery.mock.calls[0][0]).toBe("kg_user1_kb1");
      // Third call (first entity search for kb2) should use kg_user1_kb2
      expect(mockQuery.mock.calls[2][0]).toBe("kg_user1_kb2");

      // Both entities should be in the result
      expect(result.entities).toHaveLength(2);
      expect(result.entities.some((e) => e.name === "Entity A")).toBe(true);
      expect(result.entities.some((e) => e.name === "Entity B")).toBe(true);
    });

    it("returns empty results gracefully when no matches", async () => {
      mockQuery.mockResolvedValueOnce({ records: [] });

      const result = await KnowledgeGraphQueryService.queryGraph(
        "nonexistent",
        ["kb1"],
        "user1",
      );

      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);
      expect(result.summary).toContain("No entities or relationships found");
    });

    it("continues processing remaining KBs when one fails", async () => {
      // First KB fails
      mockQuery.mockRejectedValueOnce(new Error("Graph not found"));

      // Second KB succeeds
      mockQuery
        .mockResolvedValueOnce({
          records: [
            {
              n: { name: "Fallback Entity", label: "Concept", properties: {} },
            },
          ],
        })
        .mockResolvedValueOnce({ records: [] }); // neighbors

      const result = await KnowledgeGraphQueryService.queryGraph(
        "test",
        ["kb-broken", "kb-working"],
        "user1",
      );

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("Fallback Entity");
    });
  });

  // ────────────────────────────────────────────
  // searchEntities
  // ────────────────────────────────────────────

  describe("searchEntities", () => {
    it("filters by entity type when provided", async () => {
      mockQuery.mockResolvedValueOnce({
        records: [
          {
            n: {
              name: "Acme Corp",
              label: "Organization",
              properties: {},
            },
          },
        ],
      });

      await KnowledgeGraphQueryService.searchEntities(
        "Acme",
        ["kb1"],
        "user1",
        "Organization",
      );

      const cypher = mockQuery.mock.calls[0][1] as string;
      expect(cypher).toContain("label(n) = $entityType");

      const params = mockQuery.mock.calls[0][2] as Record<string, any>;
      expect(params.entityType).toBe("Organization");
    });

    it("does not include entity type filter when not provided", async () => {
      mockQuery.mockResolvedValueOnce({ records: [] });

      await KnowledgeGraphQueryService.searchEntities(
        "Acme",
        ["kb1"],
        "user1",
      );

      const cypher = mockQuery.mock.calls[0][1] as string;
      expect(cypher).not.toContain("label(n) = $entityType");
    });

    it("deduplicates entities by name (case-insensitive)", async () => {
      // Two KBs return same entity with different casing
      mockQuery
        .mockResolvedValueOnce({
          records: [
            { n: { name: "Acme Corp", label: "Organization", properties: {} } },
          ],
        })
        .mockResolvedValueOnce({
          records: [
            { n: { name: "acme corp", label: "Organization", properties: {} } },
          ],
        });

      const result = await KnowledgeGraphQueryService.searchEntities(
        "acme",
        ["kb1", "kb2"],
        "user1",
      );

      // Should deduplicate by lowercase name
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("Acme Corp");
    });
  });

  // ────────────────────────────────────────────
  // getEntityNeighbors
  // ────────────────────────────────────────────

  describe("getEntityNeighbors", () => {
    it("caps maxHops at 5", async () => {
      mockQuery.mockResolvedValueOnce({
        records: [
          {
            n: { name: "Root", label: "Person", properties: {} },
            m: { name: "Leaf", label: "Concept", properties: {} },
            r: [
              {
                sourceEntity: "Root",
                targetEntity: "Leaf",
                type: "RELATED_TO",
                properties: {},
              },
            ],
          },
        ],
      });

      await KnowledgeGraphQueryService.getEntityNeighbors(
        "Root",
        ["kb1"],
        "user1",
        10, // Request 10 hops, should be capped at 5
      );

      const cypher = mockQuery.mock.calls[0][1] as string;
      // The cypher should use *1..5, not *1..10
      expect(cypher).toContain("*1..5");
      expect(cypher).not.toContain("*1..10");
    });

    it("defaults maxHops to 2 when not specified", async () => {
      mockQuery.mockResolvedValueOnce({ records: [] });

      await KnowledgeGraphQueryService.getEntityNeighbors(
        "Root",
        ["kb1"],
        "user1",
      );

      const cypher = mockQuery.mock.calls[0][1] as string;
      expect(cypher).toContain("*1..2");
    });

    it("returns both entities and relationships from variable-length paths", async () => {
      mockQuery.mockResolvedValueOnce({
        records: [
          {
            n: { name: "Alice", label: "Person", properties: {} },
            m: { name: "Bob", label: "Person", properties: {} },
            r: [
              {
                sourceEntity: "Alice",
                targetEntity: "Bob",
                type: "COLLABORATES_WITH",
                properties: {},
              },
            ],
          },
        ],
      });

      const result = await KnowledgeGraphQueryService.getEntityNeighbors(
        "Alice",
        ["kb1"],
        "user1",
        2,
      );

      expect(result.entities.length).toBeGreaterThanOrEqual(1);
      expect(result.relationships.length).toBeGreaterThanOrEqual(1);
      expect(result.relationships[0].type).toBe("COLLABORATES_WITH");
    });
  });

  // ────────────────────────────────────────────
  // formatGraphResultForAgent
  // ────────────────────────────────────────────

  describe("formatGraphResultForAgent", () => {
    it("produces readable text with entities and relationships", () => {
      const entities = [
        { name: "Acme Corp", label: "Organization", properties: {} },
        {
          name: "John Doe",
          label: "Person",
          properties: { description: "CEO of Acme" },
        },
      ];
      const relationships = [
        {
          sourceEntity: "John Doe",
          targetEntity: "Acme Corp",
          type: "WORKS_AT",
          properties: {},
        },
      ];

      const summary =
        KnowledgeGraphQueryService.formatGraphResultForAgent(
          entities,
          relationships,
        );

      // Should mention entity count
      expect(summary).toContain("Found 2 entities");

      // Should include entity names and labels
      expect(summary).toContain("Acme Corp (Organization)");
      expect(summary).toContain("John Doe (Person)");

      // Should include the description for John Doe
      expect(summary).toContain("CEO of Acme");

      // Should include relationships
      expect(summary).toContain("Relationships:");
      expect(summary).toContain("John Doe");
      expect(summary).toContain("WORKS AT"); // underscores replaced with spaces
      expect(summary).toContain("Acme Corp");
    });

    it("handles empty results", () => {
      const summary =
        KnowledgeGraphQueryService.formatGraphResultForAgent([], []);

      expect(summary).toBe(
        "No entities or relationships found in the knowledge graph for this query.",
      );
    });

    it("handles entities-only (no relationships)", () => {
      const entities = [
        { name: "SomeEntity", label: "Concept", properties: {} },
      ];
      const summary =
        KnowledgeGraphQueryService.formatGraphResultForAgent(entities, []);

      expect(summary).toContain("Found 1 entities");
      expect(summary).toContain("SomeEntity (Concept)");
      expect(summary).not.toContain("Relationships:");
    });

    it("handles relationships-only (no entities)", () => {
      const relationships = [
        {
          sourceEntity: "A",
          targetEntity: "B",
          type: "RELATED_TO",
          properties: {},
        },
      ];
      const summary =
        KnowledgeGraphQueryService.formatGraphResultForAgent(
          [],
          relationships,
        );

      expect(summary).toContain("Relationships:");
      expect(summary).not.toContain("Found");
    });
  });
});
