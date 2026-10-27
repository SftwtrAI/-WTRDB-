import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GraphEnhancedBadge } from "../../components/knowledge-graph/GraphEnhancedBadge";
import { AgentGraphPreview } from "../../components/knowledge-graph/AgentGraphPreview";

describe("GraphEnhancedBadge", () => {
  it("renders Network icon when hasGraph=true", () => {
    const { container } = render(<GraphEnhancedBadge hasGraph={true} />);
    const badge = screen.getByTestId("graph-enhanced-badge");
    expect(badge).toBeDefined();
    // Network icon should be present as an SVG
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("returns null when hasGraph=false", () => {
    const { container } = render(<GraphEnhancedBadge hasGraph={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows entity count when provided", () => {
    render(<GraphEnhancedBadge hasGraph={true} entityCount={42} />);
    const countEl = screen.getByTestId("graph-entity-count");
    expect(countEl.textContent).toContain("42");
  });

  it("hides text in compact mode", () => {
    render(<GraphEnhancedBadge hasGraph={true} compact />);
    const badge = screen.getByTestId("graph-enhanced-badge");
    expect(badge.textContent).not.toContain("Graph-enhanced");
  });

  it("shows 'Graph-enhanced' text in non-compact mode", () => {
    render(<GraphEnhancedBadge hasGraph={true} />);
    const badge = screen.getByTestId("graph-enhanced-badge");
    expect(badge.textContent).toContain("Graph-enhanced");
  });
});

describe("AgentGraphPreview", () => {
  const completedSummary = {
    "kb-1": {
      knowledgeBaseId: "kb-1",
      entityCount: 50,
      relationshipCount: 30,
      entityTypes: ["Person", "Organization"],
      status: "completed" as const,
      lastUpdated: "2026-01-01",
    },
    "kb-2": {
      knowledgeBaseId: "kb-2",
      entityCount: 25,
      relationshipCount: 15,
      entityTypes: ["Concept"],
      status: "completed" as const,
      lastUpdated: "2026-01-02",
    },
  };

  it("shows 'Graph-Enhanced' when graphs exist", () => {
    render(
      <AgentGraphPreview
        selectedKbIds={["kb-1", "kb-2"]}
        graphSummaries={completedSummary}
      />
    );
    const card = screen.getByTestId("agent-graph-preview-enhanced");
    expect(card.textContent).toContain("Graph-Enhanced Agent");
    expect(card.textContent).toContain("2 knowledge graphs");
    expect(card.textContent).toContain("75 total entities");
  });

  it("shows 'Standard search' when no graphs", () => {
    render(
      <AgentGraphPreview selectedKbIds={["kb-1"]} graphSummaries={{}} />
    );
    const card = screen.getByTestId("agent-graph-preview-standard");
    expect(card.textContent).toContain("Standard search only");
  });

  it("returns null when no KBs selected", () => {
    const { container } = render(
      <AgentGraphPreview selectedKbIds={[]} graphSummaries={completedSummary} />
    );
    expect(container.innerHTML).toBe("");
  });
});
