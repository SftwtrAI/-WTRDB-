import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import React from "react";

// Mock apiRequest
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: new (
    // inline QueryClient to avoid circular deps in mock
    require("@tanstack/react-query").QueryClient
  )(),
}));

// Mock wouter Link
vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

import { apiRequest } from "@/lib/queryClient";
import { useGraphSummaries } from "@/hooks/useGraphSummaries";
import { GraphQualityBadge } from "@/components/knowledge-graph/GraphQualityBadge";
import { GraphOverviewGrid } from "@/components/knowledge-graph/GraphOverviewGrid";

const mockedApiRequest = apiRequest as ReturnType<typeof vi.fn>;

// --- Fixtures ---

const mockSummaryCompleted = {
  knowledgeBaseId: "kb-1",
  entityCount: 25,
  relationshipCount: 40,
  entityTypes: ["Person", "Organization", "Concept"],
  status: "completed" as const,
  lastUpdated: "2026-03-15T10:00:00Z",
};

const mockSummaryExtracting = {
  knowledgeBaseId: "kb-2",
  entityCount: 0,
  relationshipCount: 0,
  entityTypes: [],
  status: "extracting" as const,
  lastUpdated: "2026-03-15T10:00:00Z",
};

const mockKbItems = [
  {
    id: "kb-1",
    type: "file",
    title: "Design Doc",
    storageSize: 1024,
    createdAt: "2026-03-01T00:00:00Z",
    ragStatus: "completed" as const,
    chunkCount: 10,
  },
  {
    id: "kb-2",
    type: "url",
    title: "API Reference",
    storageSize: 2048,
    createdAt: "2026-03-02T00:00:00Z",
    ragStatus: "completed" as const,
    chunkCount: 20,
  },
  {
    id: "kb-3",
    type: "text",
    title: "Internal Notes",
    storageSize: 512,
    createdAt: "2026-03-03T00:00:00Z",
    ragStatus: "completed" as const,
    chunkCount: 5,
  },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// --- useGraphSummaries tests ---

describe("useGraphSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty record for empty array", async () => {
    const { result } = renderHook(() => useGraphSummaries([]), {
      wrapper: createWrapper(),
    });
    // With enabled: false, data should be undefined initially
    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it("fetches summaries for given IDs", async () => {
    mockedApiRequest.mockImplementation((_method: string, url: string) => {
      if (url.includes("kb-1")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSummaryCompleted),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      });
    });

    const { result } = renderHook(() => useGraphSummaries(["kb-1"]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      "kb-1": mockSummaryCompleted,
    });
    expect(mockedApiRequest).toHaveBeenCalledWith("GET", "/api/knowledge-graph/kb-1/summary");
  });
});

// --- GraphQualityBadge tests ---

describe("GraphQualityBadge", () => {
  it("renders 5 dots total", () => {
    render(
      <GraphQualityBadge entityCount={10} relationshipCount={20} entityTypes={["Person"]} />,
    );
    const badge = screen.getByTestId("graph-quality-badge");
    const dots = badge.querySelectorAll("span");
    expect(dots.length).toBe(5);
  });

  it("renders correct number of filled dots for low score", () => {
    // entityScore = min(1/50,1)*0.4 = 0.008, relScore = min(1/100,1)*0.4 = 0.004
    // typeScore = min(1/5,1)*0.2 = 0.04, raw = 0.052, ceil(0.052*5) = ceil(0.26) = 1
    render(
      <GraphQualityBadge entityCount={1} relationshipCount={1} entityTypes={["Person"]} />,
    );
    const filled = screen.getAllByTestId("dot-filled");
    expect(filled.length).toBe(1);
  });

  it("renders correct number of filled dots for high score", () => {
    // entityScore = min(50/50,1)*0.4 = 0.4, relScore = min(100/100,1)*0.4 = 0.4
    // typeScore = min(5/5,1)*0.2 = 0.2, raw = 1.0, ceil(1.0*5) = 5
    render(
      <GraphQualityBadge
        entityCount={50}
        relationshipCount={100}
        entityTypes={["Person", "Organization", "Concept", "Location", "Event"]}
      />,
    );
    const filled = screen.getAllByTestId("dot-filled");
    expect(filled.length).toBe(5);
  });

  it("renders correct number of filled dots for medium score", () => {
    // entityScore = min(25/50,1)*0.4 = 0.2, relScore = min(50/100,1)*0.4 = 0.2
    // typeScore = min(3/5,1)*0.2 = 0.12, raw = 0.52, ceil(0.52*5) = ceil(2.6) = 3
    render(
      <GraphQualityBadge
        entityCount={25}
        relationshipCount={50}
        entityTypes={["Person", "Organization", "Concept"]}
      />,
    );
    const filled = screen.getAllByTestId("dot-filled");
    expect(filled.length).toBe(3);
  });
});

// --- GraphOverviewGrid tests ---

describe("GraphOverviewGrid", () => {
  const onGenerate = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders correct number of cards for completed items", () => {
    const summaries: Record<string, any> = {
      "kb-1": mockSummaryCompleted,
    };

    render(
      <GraphOverviewGrid
        items={mockKbItems}
        graphSummaries={summaries}
        onGenerate={onGenerate}
        onDelete={onDelete}
      />,
    );

    const grid = screen.getByTestId("graph-overview-grid");
    // Should have 3 cards total (kb-1 with graph, kb-2 & kb-3 as CTA)
    expect(grid.children.length).toBe(3);
  });

  it("shows CTA for items without graphs", () => {
    render(
      <GraphOverviewGrid
        items={mockKbItems}
        graphSummaries={{}}
        onGenerate={onGenerate}
        onDelete={onDelete}
      />,
    );

    // All three should be CTA cards
    expect(screen.getByTestId("graph-cta-card-kb-1")).toBeTruthy();
    expect(screen.getByTestId("graph-cta-card-kb-2")).toBeTruthy();
    expect(screen.getByTestId("graph-cta-card-kb-3")).toBeTruthy();
  });

  it("shows empty state when no items", () => {
    render(
      <GraphOverviewGrid
        items={[]}
        graphSummaries={{}}
        onGenerate={onGenerate}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("No knowledge base items yet")).toBeTruthy();
  });

  it("calls onGenerate when Generate Graph button is clicked", () => {
    render(
      <GraphOverviewGrid
        items={mockKbItems}
        graphSummaries={{}}
        onGenerate={onGenerate}
        onDelete={onDelete}
      />,
    );

    const generateBtn = screen.getByTestId("button-generate-graph-kb-1");
    fireEvent.click(generateBtn);
    expect(onGenerate).toHaveBeenCalledWith("kb-1");
  });

  it("calls onDelete when delete button is clicked on completed graph card", () => {
    const summaries: Record<string, any> = {
      "kb-1": mockSummaryCompleted,
    };

    render(
      <GraphOverviewGrid
        items={mockKbItems}
        graphSummaries={summaries}
        onGenerate={onGenerate}
        onDelete={onDelete}
      />,
    );

    const deleteBtn = screen.getByTestId("button-delete-graph-kb-1");
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("kb-1");
  });
});

// --- Tab switching test (KnowledgeBase page integration) ---
// This is a lighter integration-style test. The full KnowledgeBase page
// requires many providers; we test the Tabs primitive behavior instead.

describe("Tab switching between Documents and Knowledge Graphs", () => {
  it("renders both tabs and switches content", async () => {
    // Use Tabs directly from shadcn
    const { Tabs, TabsList, TabsTrigger, TabsContent } = await import(
      "@/components/ui/tabs"
    );

    render(
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="graphs">Knowledge Graphs</TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <div data-testid="documents-content">Documents table here</div>
        </TabsContent>
        <TabsContent value="graphs">
          <div data-testid="graphs-content">Graphs grid here</div>
        </TabsContent>
      </Tabs>,
    );

    // Documents tab should be visible by default
    expect(screen.getByTestId("documents-content")).toBeTruthy();

    // Click Knowledge Graphs tab
    fireEvent.click(screen.getByText("Knowledge Graphs"));
    await waitFor(() => {
      expect(screen.getByTestId("graphs-content")).toBeTruthy();
    });
  });
});
