import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GraphOnboarding } from "../../components/knowledge-graph/GraphOnboarding";
import { GraphEmptyStates } from "../../components/knowledge-graph/GraphEmptyStates";
import { GraphCompletionCelebration } from "../../components/knowledge-graph/GraphCompletionCelebration";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

vi.stubGlobal("localStorage", localStorageMock);

// Mock wouter Link
vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

describe("GraphOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders when localStorage key not set", () => {
    localStorageMock.getItem.mockReturnValue(null);
    render(<GraphOnboarding />);
    expect(screen.getByTestId("graph-onboarding")).toBeDefined();
    expect(screen.getByText("Knowledge Graphs")).toBeDefined();
  });

  it("hidden when localStorage key set", () => {
    localStorageMock.getItem.mockReturnValue("true");
    const { container } = render(<GraphOnboarding />);
    // The component checks localStorage in useEffect, but the initial state
    // is dismissed=true, so nothing renders
    expect(container.querySelector('[data-testid="graph-onboarding"]')).toBeNull();
  });

  it("dismiss sets localStorage and hides card", () => {
    localStorageMock.getItem.mockReturnValue(null);
    render(<GraphOnboarding />);
    const gotItBtn = screen.getByTestId("graph-onboarding-got-it");
    fireEvent.click(gotItBtn);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "wtrops-kg-tour-dismissed",
      "true"
    );
  });
});

describe("GraphEmptyStates", () => {
  it("renders 'no-docs' variant content", () => {
    render(<GraphEmptyStates variant="no-docs" />);
    const el = screen.getByTestId("empty-state-no-docs");
    expect(el.textContent).toContain("Upload your first document");
  });

  it("renders 'no-graphs' variant content", () => {
    render(<GraphEmptyStates variant="no-graphs" />);
    const el = screen.getByTestId("empty-state-no-graphs");
    expect(el.textContent).toContain("Your documents are ready");
  });

  it("'no-graphs' variant fires onGenerateAll", () => {
    const onGenerate = vi.fn();
    render(<GraphEmptyStates variant="no-graphs" onGenerateAll={onGenerate} />);
    const btn = screen.getByTestId("empty-state-generate-all");
    fireEvent.click(btn);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("renders 'graph-page-empty' variant with steps and FAQ", () => {
    render(<GraphEmptyStates variant="graph-page-empty" />);
    const el = screen.getByTestId("empty-state-graph-page");
    expect(el.textContent).toContain("No knowledge graph yet");
    expect(el.textContent).toContain("Chunks");
    expect(el.textContent).toContain("AI Extraction");
    expect(el.textContent).toContain("Interactive Graph");
    expect(el.textContent).toContain("1-3 minutes");
  });
});

describe("GraphCompletionCelebration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("shows when show=true", () => {
    const onDismiss = vi.fn();
    render(
      <GraphCompletionCelebration
        show={true}
        entityCount={42}
        relationshipCount={18}
        knowledgeBaseId="kb-123"
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByTestId("graph-completion-celebration")).toBeDefined();
    expect(screen.getByText("Knowledge Graph Ready!")).toBeDefined();
    expect(
      screen.getByText(/Extracted 42 entities and 18 relationships/)
    ).toBeDefined();
  });

  it("hides when show=false", () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <GraphCompletionCelebration
        show={false}
        entityCount={42}
        relationshipCount={18}
        knowledgeBaseId="kb-123"
        onDismiss={onDismiss}
      />
    );
    expect(
      container.querySelector('[data-testid="graph-completion-celebration"]')
    ).toBeNull();
  });

  it("auto-dismisses after timeout", () => {
    const onDismiss = vi.fn();
    render(
      <GraphCompletionCelebration
        show={true}
        entityCount={10}
        relationshipCount={5}
        knowledgeBaseId="kb-1"
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByTestId("graph-completion-celebration")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on click", () => {
    const onDismiss = vi.fn();
    render(
      <GraphCompletionCelebration
        show={true}
        entityCount={10}
        relationshipCount={5}
        knowledgeBaseId="kb-1"
        onDismiss={onDismiss}
      />
    );
    const dismissBtn = screen.getByTestId("graph-celebration-dismiss");
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
