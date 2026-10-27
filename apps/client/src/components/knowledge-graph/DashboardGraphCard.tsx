import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, ArrowRight, Network } from "lucide-react";
import { Link } from "wouter";
import { GraphMiniWidget } from "./GraphMiniWidget";
import { apiRequest } from "@/lib/queryClient";

interface KnowledgeBaseItem {
  id: string;
  type: string;
  title: string;
  ragStatus?: string;
  chunkCount?: number;
  graphSummary?: {
    entityCount: number;
    relationshipCount: number;
    entityTypes: string[];
    status: string;
    lastUpdated?: string;
  };
}

interface GraphSummaryItem {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: string;
  lastUpdated?: string;
}

/**
 * Dashboard summary card showing total graphs, entities, relationships
 * with a visual preview via GraphMiniWidget and links to the KB hub.
 */
export function DashboardGraphCard() {
  const { data: knowledgeBase = [] } = useQuery<KnowledgeBaseItem[]>({
    queryKey: ["/api/rag-knowledge"],
  });

  const completedKbIds = knowledgeBase
    .filter(item => item.ragStatus === "completed")
    .map(item => item.id);

  const { data: graphSummariesRaw } = useQuery<GraphSummaryItem[]>({
    queryKey: ["knowledge-graph-summaries", "dashboard", completedKbIds.join(",")],
    queryFn: async () => {
      if (completedKbIds.length === 0) return [];
      const results: GraphSummaryItem[] = [];
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
        (s: GraphSummaryItem) => s.status === "pending" || s.status === "extracting"
      );
      return hasProcessing ? 3000 : false;
    },
  });
  const graphSummaries = Array.isArray(graphSummariesRaw) ? graphSummariesRaw : [];

  // Merge graph summaries into KB items
  const itemsWithGraphs = knowledgeBase.map((item) => {
    const summary = graphSummaries.find(
      (s) => s.knowledgeBaseId === item.id
    );
    return {
      ...item,
      graphSummary: summary
        ? {
            entityCount: summary.entityCount,
            relationshipCount: summary.relationshipCount,
            entityTypes: summary.entityTypes,
            status: summary.status,
            lastUpdated: summary.lastUpdated,
          }
        : undefined,
    };
  });

  const completedGraphs = itemsWithGraphs.filter(
    (item) => item.graphSummary?.status === "completed"
  );
  const totalEntities = completedGraphs.reduce(
    (sum, item) => sum + (item.graphSummary?.entityCount || 0),
    0
  );
  const totalRelationships = completedGraphs.reduce(
    (sum, item) => sum + (item.graphSummary?.relationshipCount || 0),
    0
  );

  const firstCompleted = completedGraphs[0];

  return (
    <Card data-testid="dashboard-graph-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Knowledge Graphs
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {completedGraphs.length} graph{completedGraphs.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-foreground">
              {completedGraphs.length}
            </div>
            <div className="text-xs text-muted-foreground">Graphs</div>
          </div>
          <div>
            <div className="text-lg font-bold text-primary">
              {totalEntities}
            </div>
            <div className="text-xs text-muted-foreground">Entities</div>
          </div>
          <div>
            <div className="text-lg font-bold text-emerald-400">
              {totalRelationships}
            </div>
            <div className="text-xs text-muted-foreground">Relations</div>
          </div>
        </div>

        {/* Mini widget preview */}
        {firstCompleted?.graphSummary && (
          <div className="flex justify-center py-1">
            <GraphMiniWidget
              variant="dashboard"
              entityCount={firstCompleted.graphSummary.entityCount}
              relationshipCount={firstCompleted.graphSummary.relationshipCount}
              entityTypes={firstCompleted.graphSummary.entityTypes}
              status={firstCompleted.graphSummary.status}
            />
          </div>
        )}

        {/* Action links */}
        <div className="flex items-center justify-between pt-1">
          <Link href="/app/knowledge-base?tab=graphs">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              data-testid="link-view-all-graphs"
            >
              View All
            </Button>
          </Link>
          <Link href="/app/knowledge-base?tab=graphs">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary hover:text-primary/80 gap-1"
              data-testid="link-explore-graphs"
            >
              <Network className="h-3 w-3" />
              Explore Graphs
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
