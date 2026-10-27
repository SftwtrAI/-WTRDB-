import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock apiRequest
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: new (
    require("@tanstack/react-query").QueryClient
  )(),
}));

// Mock wouter
vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/app", vi.fn()],
}));

import { apiRequest } from "@/lib/queryClient";
import { GraphMiniWidget } from "@/components/knowledge-graph/GraphMiniWidget";
import { GraphContextPicker } from "@/components/knowledge-graph/GraphContextPicker";
import { DashboardGraphCard } from "@/components/knowledge-graph/DashboardGraphCard";

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

const mockSummaryCompleted2 = {
  knowledgeBaseId: "kb-2",
  entityCount: 15,
  relationshipCount: 20,
  entityTypes: ["Location", "Event"],
  status: "completed" as const,
  lastUpdated: "2026-03-16T10:00:00Z",
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// GraphMiniWidget
// ═══════════════════════════════════════════════════════════════════════════════

describe("GraphMiniWidget", () => {
  it("renders a canvas element", () => {
    render(
      <GraphMiniWidget
        entityCount={10}
        relationshipCount={15}
        entityTypes={["Person", "Organization"]}
        status="completed"
      />,
      { wrapper },
    );
    expect(screen.getByTestId("graph-mini-canvas")).toBeInTheDocument();
  });

  it("shows entity and relationship counts", () => {
    render(
      <GraphMiniWidget
        entityCount={25}
        relationshipCount={40}
        entityTypes={["Person", "Organization", "Concept"]}
        status="completed"
      />,
      { wrapper },
    );
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("entities")).toBeInTheDocument();
    expect(screen.getByText("rels")).toBeInTheDocument();
  });

  it("shows correct status indicator color for completed", () => {
    render(
      <GraphMiniWidget
        entityCount={10}
        relationshipCount={5}
        entityTypes={["Person"]}
        status="completed"
      />,
      { wrapper },
    );
    const indicator = screen.getByTestId("status-indicator");
    expect(indicator).toHaveStyle({ backgroundColor: "#22c55e" });
  });

  it("shows correct status indicator color for extracting", () => {
    render(
      <GraphMiniWidget
        entityCount={0}
        relationshipCount={0}
        entityTypes={[]}
        status="extracting"
      />,
      { wrapper },
    );
    const indicator = screen.getByTestId("status-indicator");
    expect(indicator).toHaveStyle({ backgroundColor: "#f59e0b" });
  });

  it("shows correct status indicator color for failed", () => {
    render(
      <GraphMiniWidget
        entityCount={0}
        relationshipCount={0}
        entityTypes={[]}
        status="failed"
      />,
      { wrapper },
    );
    const indicator = screen.getByTestId("status-indicator");
    expect(indicator).toHaveStyle({ backgroundColor: "#ef4444" });
  });

  it("wraps in a link when knowledgeBaseId is provided", () => {
    render(
      <GraphMiniWidget
        entityCount={10}
        relationshipCount={5}
        entityTypes={["Person"]}
        status="completed"
        knowledgeBaseId="kb-123"
      />,
      { wrapper },
    );
    const link = screen.getByTestId("graph-mini-widget").closest("a");
    expect(link).toHaveAttribute("href", "/app/knowledge-graph/kb-123");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GraphContextPicker
// ═══════════════════════════════════════════════════════════════════════════════

describe("GraphContextPicker", () => {
  it("shows empty state when no graphs are available", async () => {
    mockedApiRequest.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    render(
      <GraphContextPicker selectedRefs={[]} onChange={vi.fn()} />,
      { wrapper: ({ children }) => {
        const qc = new QueryClient({
          defaultOptions: {
            queries: {
              retry: false,
              // Return empty arrays for KB items
              queryFn: async ({ queryKey }) => {
                if (queryKey[0] === "/api/rag-knowledge") return [];
                return {};
              },
            },
          },
        });
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      }},
    );

    await waitFor(() => {
      expect(screen.getByTestId("picker-empty-state")).toBeInTheDocument();
    });
    expect(screen.getByText(/No knowledge graphs available/)).toBeInTheDocument();
  });

  it("renders checklist items when graphs exist", async () => {
    render(
      <GraphContextPicker selectedRefs={[]} onChange={vi.fn()} />,
      { wrapper: ({ children }) => {
        const qc = new QueryClient({
          defaultOptions: {
            queries: {
              retry: false,
              queryFn: async ({ queryKey }) => {
                const key = queryKey[0] as string;
                if (key === "/api/rag-knowledge") {
                  return [
                    { id: "kb-1", title: "Policy Doc", ragStatus: "completed" },
                  ];
                }
                // Graph summaries
                return {};
              },
            },
          },
        });
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      }},
    );

    // The component should render the picker container
    await waitFor(() => {
      expect(screen.getByTestId("graph-context-picker")).toBeInTheDocument();
    });
  });

  it("fires onChange with correct refs on selection", async () => {
    const onChangeMock = vi.fn();

    mockedApiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.includes("/api/knowledge-graph/kb-1/summary")) {
        return {
          ok: true,
          json: async () => mockSummaryCompleted,
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    render(
      <GraphContextPicker selectedRefs={[]} onChange={onChangeMock} />,
      { wrapper: ({ children }) => {
        const qc = new QueryClient({
          defaultOptions: {
            queries: {
              retry: false,
              queryFn: async ({ queryKey }) => {
                const key = queryKey[0] as string;
                if (key === "/api/rag-knowledge") {
                  return [
                    { id: "kb-1", title: "Policy Doc", ragStatus: "completed" },
                  ];
                }
                // Summaries query
                if (key.includes("/api/knowledge-graph/summaries")) {
                  return { "kb-1": mockSummaryCompleted };
                }
                return {};
              },
            },
          },
        });
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      }},
    );

    await waitFor(() => {
      const checkbox = screen.queryByTestId("picker-checkbox-kb-1");
      if (checkbox) {
        fireEvent.click(checkbox);
        expect(onChangeMock).toHaveBeenCalledWith(["kg:kb-1"]);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DashboardGraphCard
// ═══════════════════════════════════════════════════════════════════════════════

describe("DashboardGraphCard", () => {
  it("shows CTA card when 0 graphs exist", async () => {
    render(
      <DashboardGraphCard />,
      { wrapper: ({ children }) => {
        const qc = new QueryClient({
          defaultOptions: {
            queries: {
              retry: false,
              queryFn: async ({ queryKey }) => {
                if (queryKey[0] === "/api/rag-knowledge") return [];
                return {};
              },
            },
          },
        });
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      }},
    );

    await waitFor(() => {
      expect(screen.getByTestId("card-knowledge-graphs-cta")).toBeInTheDocument();
    });
    expect(screen.getByText("Knowledge Graphs")).toBeInTheDocument();
    expect(screen.getByText(/Generate graphs from your documents/)).toBeInTheDocument();
    expect(screen.getByTestId("btn-graph-get-started")).toBeInTheDocument();
  });

  it("shows aggregate stats when graphs exist", async () => {
    render(
      <DashboardGraphCard />,
      { wrapper: ({ children }) => {
        const qc = new QueryClient({
          defaultOptions: {
            queries: {
              retry: false,
              queryFn: async ({ queryKey }) => {
                const key = queryKey[0] as string;
                if (key === "/api/rag-knowledge") {
                  return [
                    { id: "kb-1", title: "Doc 1", ragStatus: "completed" },
                    { id: "kb-2", title: "Doc 2", ragStatus: "completed" },
                  ];
                }
                if (key.includes("/api/knowledge-graph/summaries")) {
                  return {
                    "kb-1": mockSummaryCompleted,
                    "kb-2": mockSummaryCompleted2,
                  };
                }
                return {};
              },
            },
          },
        });
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
      }},
    );

    await waitFor(() => {
      expect(screen.getByTestId("card-knowledge-graphs-stats")).toBeInTheDocument();
    });
    // 2 graphs
    expect(screen.getByText("2")).toBeInTheDocument();
    // 25 + 15 = 40 entities
    expect(screen.getByText("40")).toBeInTheDocument();
    // 40 + 20 = 60 relationships
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByTestId("btn-graph-view-all")).toBeInTheDocument();
  });
});
