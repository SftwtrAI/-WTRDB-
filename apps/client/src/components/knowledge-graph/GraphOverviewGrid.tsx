import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Brain,
  Network,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Layers,
  ArrowRight,
} from "lucide-react";
import { GraphMiniWidget } from "./GraphMiniWidget";

interface GraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: string;
  lastUpdated?: string;
}

interface KnowledgeBaseItem {
  id: string;
  type: string;
  title: string;
  ragStatus?: string;
  chunkCount?: number;
  createdAt: string;
}

interface GraphCardData extends KnowledgeBaseItem {
  graphSummary?: GraphSummary;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="outline" className="text-emerald-400 border-emerald-800 text-xs gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="outline" className="text-blue-400 border-blue-800 text-xs gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Building
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="text-red-400 border-red-800 text-xs gap-1">
          <AlertCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground text-xs">
          Pending
        </Badge>
      );
  }
}

/**
 * Grid display of all knowledge graphs.
 * Supports multi-select for merged graph viewing.
 */
export function GraphOverviewGrid() {
  const [, setLocation] = useLocation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: knowledgeBase = [], isLoading: kbLoading } = useQuery<
    KnowledgeBaseItem[]
  >({
    queryKey: ["/api/rag-knowledge"],
  });

  const completedKbIds = knowledgeBase
    .filter(item => item.ragStatus === "completed")
    .map(item => item.id);

  const { data: graphSummariesRaw, isLoading: graphLoading } = useQuery<GraphSummary[]>({
    queryKey: ["knowledge-graph-summaries", "overview", completedKbIds.join(",")],
    queryFn: async () => {
      if (completedKbIds.length === 0) return [];
      const results: GraphSummary[] = [];
      await Promise.all(
        completedKbIds.map(async (id) => {
          try {
            const res = await apiRequest("GET", `/api/knowledge-graph/${id}/summary`);
            if (res.ok) {
              results.push(await res.json());
            }
          } catch {}
        })
      );
      return results;
    },
    enabled: completedKbIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || !Array.isArray(data)) return false;
      const hasProcessing = data.some(
        (s: GraphSummary) => s.status === "pending" || s.status === "extracting"
      );
      return hasProcessing ? 3000 : false;
    },
  });
  const graphSummaries = Array.isArray(graphSummariesRaw) ? graphSummariesRaw : [];

  const isLoading = kbLoading || graphLoading;

  // Merge KB items with their graph summaries
  const graphCards: GraphCardData[] = useMemo(() => {
    return knowledgeBase
      .filter((item) => item.ragStatus === "completed")
      .map((item) => {
        const summary = graphSummaries.find(
          (s) => s.knowledgeBaseId === item.id
        );
        return { ...item, graphSummary: summary || undefined };
      });
  }, [knowledgeBase, graphSummaries]);

  const completedGraphs = graphCards.filter(
    (c) => c.graphSummary?.status === "completed"
  );

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedCount = selectedIds.size;
  const selectedEntities = graphCards
    .filter((c) => selectedIds.has(c.id))
    .reduce((sum, c) => sum + (c.graphSummary?.entityCount || 0), 0);
  const selectedRelationships = graphCards
    .filter((c) => selectedIds.has(c.id))
    .reduce((sum, c) => sum + (c.graphSummary?.relationshipCount || 0), 0);

  const handleViewMerged = (ids: string[]) => {
    setLocation(`/app/knowledge-graph/merged?ids=${ids.join(",")}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (graphCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Brain className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium mb-1">No Knowledge Graphs Yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Upload documents and enable auto-generate, or switch to the Documents tab
          to generate graphs from your existing knowledge base items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="graph-overview-grid">
      {/* View Merged Graph button - shown when 2+ completed graphs exist */}
      {completedGraphs.length >= 2 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {completedGraphs.length} completed graphs available
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() =>
              handleViewMerged(completedGraphs.map((g) => g.id))
            }
            data-testid="button-view-merged-all"
          >
            <Layers className="h-4 w-4" />
            View Merged Graph
          </Button>
        </div>
      )}

      {/* Graph cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {graphCards.map((card) => {
          const isSelected = selectedIds.has(card.id);
          const isCompleted = card.graphSummary?.status === "completed";
          return (
            <Card
              key={card.id}
              className={`relative transition-all cursor-pointer group hover:border-primary/40 ${
                isSelected
                  ? "border-primary ring-1 ring-primary/30"
                  : "border-border"
              }`}
              data-testid={`graph-card-${card.id}`}
            >
              {/* Selection checkbox */}
              {isCompleted && (
                <div className="absolute top-3 left-3 z-10">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelection(card.id)}
                    data-testid={`checkbox-graph-${card.id}`}
                  />
                </div>
              )}

              <CardContent
                className="p-4 space-y-3"
                onClick={() => {
                  if (isCompleted) {
                    setLocation(`/app/knowledge-graph/${card.id}`);
                  }
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 pl-7">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium truncate">
                      {card.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {card.type}
                    </p>
                  </div>
                  {card.graphSummary
                    ? getStatusBadge(card.graphSummary.status)
                    : getStatusBadge("pending")}
                </div>

                {/* Mini widget */}
                {card.graphSummary && (
                  <div className="flex justify-center">
                    <GraphMiniWidget
                      variant="card"
                      entityCount={card.graphSummary.entityCount}
                      relationshipCount={card.graphSummary.relationshipCount}
                      entityTypes={card.graphSummary.entityTypes}
                      status={card.graphSummary.status}
                    />
                  </div>
                )}

                {/* Stats */}
                {card.graphSummary && (
                  <div className="flex items-center justify-around text-center text-xs">
                    <div>
                      <span className="font-semibold text-foreground">
                        {card.graphSummary.entityCount}
                      </span>
                      <span className="text-muted-foreground ml-1">entities</span>
                    </div>
                    <div className="h-3 w-px bg-border" />
                    <div>
                      <span className="font-semibold text-foreground">
                        {card.graphSummary.relationshipCount}
                      </span>
                      <span className="text-muted-foreground ml-1">relations</span>
                    </div>
                  </div>
                )}

                {/* Entity types */}
                {card.graphSummary?.entityTypes &&
                  card.graphSummary.entityTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {card.graphSummary.entityTypes.slice(0, 4).map((type) => (
                        <Badge
                          key={type}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {type}
                        </Badge>
                      ))}
                      {card.graphSummary.entityTypes.length > 4 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          +{card.graphSummary.entityTypes.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Floating action button for selected merge */}
      {selectedCount >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50" data-testid="fab-merge-selected">
          <div className="flex items-center gap-3 bg-card border border-primary/40 rounded-xl px-4 py-3 shadow-lg shadow-primary/10">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selectedCount}</span>{" "}
              selected
              <span className="mx-2 text-border">|</span>
              <span className="text-primary">{selectedEntities}</span> entities,{" "}
              <span className="text-emerald-400">{selectedRelationships}</span>{" "}
              relations
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() =>
                handleViewMerged(Array.from(selectedIds))
              }
              data-testid="button-view-selected-merged"
            >
              <Network className="h-3.5 w-3.5" />
              View Selected Merged
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
