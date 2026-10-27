import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GraphStatsBar } from "@/components/knowledge-graph/GraphStatsBar";
import { GraphQueryPanel } from "@/components/knowledge-graph/GraphQueryPanel";
import { GraphExportMenu } from "@/components/knowledge-graph/GraphExportMenu";
import { GraphEntityModal } from "@/components/knowledge-graph/GraphEntityModal";
import { useGraphKeyboardShortcuts } from "@/hooks/useGraphKeyboardShortcuts";
import { renderHook } from "@testing-library/react";

// Mock apiRequest
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

// Mock lucide-react icons to avoid rendering issues in tests
vi.mock("lucide-react", async () => {
  const actual = await vi.importActual("lucide-react");
  return actual;
});

describe("GraphStatsBar", () => {
  it("renders entity and relationship counts correctly", () => {
    render(
      <GraphStatsBar
        entityCount={42}
        relationshipCount={87}
        entityTypes={["Person", "Organization", "Concept"]}
        isCollapsed={false}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
    expect(screen.getByText("Entities")).toBeInTheDocument();
    expect(screen.getByText("Relationships")).toBeInTheDocument();
  });

  it("computes and displays density and avg connections", () => {
    render(
      <GraphStatsBar
        entityCount={10}
        relationshipCount={15}
        entityTypes={["Person"]}
        isCollapsed={false}
        onToggle={() => {}}
      />
    );

    // density = 15 / (10 * 9 / 2) = 15 / 45 = 0.333
    expect(screen.getByText("0.333")).toBeInTheDocument();
    // avg connections = 2 * 15 / 10 = 3.0
    expect(screen.getByText("3.0")).toBeInTheDocument();
  });

  it("collapses to compact view when isCollapsed is true", () => {
    render(
      <GraphStatsBar
        entityCount={42}
        relationshipCount={87}
        entityTypes={["Person"]}
        isCollapsed={true}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
    // Density and avg connections should NOT be visible in collapsed mode
    expect(screen.queryByText("Density")).not.toBeInTheDocument();
    expect(screen.queryByText("Avg Conn.")).not.toBeInTheDocument();
  });

  it("calls onToggle when toggle button is clicked", () => {
    const onToggle = vi.fn();
    render(
      <GraphStatsBar
        entityCount={10}
        relationshipCount={5}
        entityTypes={["Person"]}
        isCollapsed={false}
        onToggle={onToggle}
      />
    );

    // Find and click the toggle button (the ChevronUp)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe("GraphQueryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires API call on submit", async () => {
    const { apiRequest } = await import("@/lib/queryClient");
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () =>
        Promise.resolve({
          answer: "Test answer",
          entities: [{ id: "1", name: "Entity1", label: "Person" }],
        }),
    });

    const onHighlight = vi.fn();
    render(
      <GraphQueryPanel
        knowledgeBaseId="kb-123"
        onHighlightEntities={onHighlight}
        isOpen={true}
        onClose={() => {}}
      />
    );

    const input = screen.getByPlaceholderText(
      "Ask a question about your knowledge graph..."
    );
    fireEvent.change(input, { target: { value: "What are the key entities?" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("POST", "/api/knowledge-graph/query", {
        query: "What are the key entities?",
        knowledgeBaseIds: ["kb-123"],
      });
    });
  });

  it("does not render when isOpen is false", () => {
    render(
      <GraphQueryPanel
        knowledgeBaseId="kb-123"
        onHighlightEntities={() => {}}
        isOpen={false}
        onClose={() => {}}
      />
    );

    expect(
      screen.queryByText("Query Knowledge Graph")
    ).not.toBeInTheDocument();
  });
});

describe("GraphExportMenu", () => {
  it("creates download links when export options are clicked", () => {
    const createObjectURLSpy = vi.fn(() => "blob:test");
    const revokeObjectURLSpy = vi.fn();
    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    const entities = [
      {
        id: "e1",
        label: "Person",
        name: "Alice",
        properties: { role: "Engineer" },
        sourceKnowledgeBaseId: "kb-1",
        sourceChunkIndex: 0,
      },
    ];
    const relationships = [
      {
        id: "r1",
        type: "WORKS_AT",
        sourceEntityId: "e1",
        targetEntityId: "e2",
        properties: {},
        sourceKnowledgeBaseId: "kb-1",
      },
    ];

    render(
      <GraphExportMenu
        entities={entities}
        relationships={relationships}
        knowledgeBaseId="kb-1"
      />
    );

    // Open the dropdown
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    // Click JSON export
    const jsonItem = screen.getByText("Export as JSON");
    fireEvent.click(jsonItem);

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });
});

describe("useGraphKeyboardShortcuts", () => {
  it("fires correct callbacks for each key", () => {
    const handlers = {
      onSearch: vi.fn(),
      onEscape: vi.fn(),
      onLayoutForce: vi.fn(),
      onLayoutRadial: vi.fn(),
      onLayoutHierarchical: vi.fn(),
      onFitView: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
    };

    renderHook(() => useGraphKeyboardShortcuts(handlers));

    fireEvent.keyDown(window, { key: "/" });
    expect(handlers.onSearch).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handlers.onEscape).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "1" });
    expect(handlers.onLayoutForce).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "2" });
    expect(handlers.onLayoutRadial).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "3" });
    expect(handlers.onLayoutHierarchical).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "f" });
    expect(handlers.onFitView).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "+" });
    expect(handlers.onZoomIn).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "-" });
    expect(handlers.onZoomOut).toHaveBeenCalledOnce();
  });

  it("does not fire when target is an input element", () => {
    const handlers = {
      onSearch: vi.fn(),
      onEscape: vi.fn(),
      onLayoutForce: vi.fn(),
      onLayoutRadial: vi.fn(),
      onLayoutHierarchical: vi.fn(),
      onFitView: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
    };

    renderHook(() => useGraphKeyboardShortcuts(handlers));

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "/" });
    expect(handlers.onSearch).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

describe("GraphEntityModal", () => {
  it("renders entity properties and connected entities", () => {
    const entity = {
      id: "e1",
      label: "Person",
      name: "Alice",
      properties: { role: "Engineer", department: "R&D" },
      sourceKnowledgeBaseId: "kb-1",
      sourceChunkIndex: 0,
    };

    const relationships = [
      {
        id: "r1",
        type: "WORKS_AT",
        sourceEntityId: "e1",
        targetEntityId: "e2",
        properties: {},
        sourceKnowledgeBaseId: "kb-1",
      },
    ];

    const allEntities = [
      entity,
      {
        id: "e2",
        label: "Organization",
        name: "Acme Corp",
        properties: {},
        sourceKnowledgeBaseId: "kb-1",
        sourceChunkIndex: 1,
      },
    ];

    render(
      <GraphEntityModal
        entity={entity}
        relationships={relationships}
        allEntities={allEntities}
        isOpen={true}
        onClose={() => {}}
        onNavigateToEntity={() => {}}
      />
    );

    // Entity name
    expect(screen.getByText("Alice")).toBeInTheDocument();
    // Type badge
    expect(screen.getByText("Person")).toBeInTheDocument();
    // Properties
    expect(screen.getByText("role")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.getByText("department")).toBeInTheDocument();
    expect(screen.getByText("R&D")).toBeInTheDocument();
    // Connected entity
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("WORKS_AT")).toBeInTheDocument();
  });

  it("does not render when entity is null", () => {
    const { container } = render(
      <GraphEntityModal
        entity={null}
        relationships={[]}
        allEntities={[]}
        isOpen={true}
        onClose={() => {}}
        onNavigateToEntity={() => {}}
      />
    );

    expect(container.innerHTML).toBe("");
  });
});
