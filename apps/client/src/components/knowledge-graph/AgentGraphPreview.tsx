import { useMemo } from "react";
import { Network, Search, Upload, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";

const ENTITY_COLORS: Record<string, string> = {
  Person: "#07A288",
  Organization: "#5BBE4E",
  Concept: "#B8E52B",
  Location: "#3B82F6",
  Event: "#F59E0B",
  Product: "#8B5CF6",
  Document: "#6B7280",
  Other: "#EC4899",
};

interface KnowledgeGraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: "pending" | "extracting" | "completed" | "failed";
  lastUpdated: string;
}

interface AgentGraphPreviewProps {
  selectedKbIds: string[];
  graphSummaries: Record<string, KnowledgeGraphSummary>;
  hasAnyGraphs?: boolean;
}

export function AgentGraphPreview({
  selectedKbIds,
  graphSummaries,
  hasAnyGraphs,
}: AgentGraphPreviewProps) {
  if (selectedKbIds.length === 0) return null;

  const completedGraphs = selectedKbIds.filter(
    (id) => graphSummaries[id]?.status === "completed",
  );

  const totalEntities = completedGraphs.reduce(
    (sum, id) => sum + (graphSummaries[id]?.entityCount || 0),
    0,
  );

  // Aggregate entity types with counts across all selected completed graphs
  const entityTypeBreakdown = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    for (const id of completedGraphs) {
      const summary = graphSummaries[id];
      if (!summary) continue;
      for (const type of summary.entityTypes) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    }
    return Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [completedGraphs, graphSummaries]);

  // Determine if there are available graphs that could be enabled but aren't selected
  const hasAvailableGraphs = hasAnyGraphs || Object.keys(graphSummaries).length > 0;

  // Graph-Enhanced state
  if (completedGraphs.length > 0) {
    return (
      <Card
        className="border-[#07A288]/30 bg-[#07A288]/5 p-3"
        data-testid="agent-graph-preview-enhanced"
      >
        <div className="flex items-start gap-2">
          <div className="relative flex-shrink-0 mt-0.5">
            <Network className="h-4 w-4 text-[#07A288]" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#07A288] opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#07A288]" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-[#07A288]">
                Graph-Enhanced Agent
              </span>
              <Sparkles className="h-3 w-3 text-[#07A288]/60" />
            </div>

            {/* Entity type breakdown as colored mini-badges */}
            <div className="flex flex-wrap gap-1 mb-2" data-testid="entity-type-breakdown">
              {entityTypeBreakdown.map(([type, count]) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-transparent"
                  style={{
                    backgroundColor: `${ENTITY_COLORS[type] || ENTITY_COLORS.Other}15`,
                    color: ENTITY_COLORS[type] || ENTITY_COLORS.Other,
                  }}
                >
                  {count} {type}{count !== 1 ? "s" : ""}
                </Badge>
              ))}
            </div>

            {/* Capability description */}
            <p className="text-xs text-muted-foreground">
              Your agent can answer relationship questions, trace entity connections, and provide structured facts from{" "}
              {completedGraphs.length} knowledge graph{completedGraphs.length !== 1 ? "s" : ""} with{" "}
              <span className="text-gray-200 font-medium">{totalEntities}</span> total entities.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Graphs available but not selected
  if (hasAvailableGraphs) {
    return (
      <Card
        className="border-[#243645] bg-[#111A21]/50 p-3"
        data-testid="agent-graph-preview-standard"
      >
        <div className="flex items-start gap-2">
          <Search className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">
              <span className="font-medium text-[#5BBE4E]">Enable knowledge graphs</span> to unlock relationship-aware answers
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="text-[10px] text-[#07A288]/80 hover:text-[#07A288] underline underline-offset-2 transition-colors"
                    data-testid="agent-graph-learn-more"
                  >
                    Learn more
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  className="max-w-xs bg-[#111A21] border-[#243645] text-xs"
                  side="bottom"
                >
                  <p className="mb-1 font-medium text-gray-200">RAG-only vs Graph-enhanced</p>
                  <p className="text-muted-foreground">
                    <span className="font-medium">RAG-only:</span> Retrieves text passages matching your query. Good for factual lookups.
                  </p>
                  <p className="text-muted-foreground mt-1">
                    <span className="font-medium">Graph-enhanced:</span> Understands entity relationships, traces connections across documents, and answers complex questions like "Which people are connected to Organization X?"
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </Card>
    );
  }

  // No graphs available at all
  return (
    <Card
      className="border-[#243645] bg-[#111A21]/50 p-3"
      data-testid="agent-graph-preview-none"
    >
      <div className="flex items-start gap-2">
        <Upload className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground mb-1.5">
            Upload documents and generate knowledge graphs to enable graph-enhanced answers
          </p>
          <Link href="/app/knowledge-base">
            <span className="text-xs text-[#07A288] hover:text-[#07A288]/80 underline underline-offset-2 cursor-pointer transition-colors">
              Go to Knowledge Base
            </span>
          </Link>
        </div>
      </div>
    </Card>
  );
}
