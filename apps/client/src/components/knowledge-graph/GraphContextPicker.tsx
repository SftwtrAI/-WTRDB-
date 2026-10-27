import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Network, Eye, CheckSquare } from "lucide-react";
import { GraphMiniWidget } from "./GraphMiniWidget";

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

interface KBItem {
  id: string;
  title: string;
  ragStatus?: string;
}

interface KnowledgeGraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: "pending" | "extracting" | "completed" | "failed";
  lastUpdated: string;
}

interface GraphContextPickerProps {
  selectedRefs: string[];
  onChange: (refs: string[]) => void;
}

export function GraphContextPicker({ selectedRefs, onChange }: GraphContextPickerProps) {
  // Fetch KB items
  const { data: kbItems = [] } = useQuery<KBItem[]>({
    queryKey: ["/api/rag-knowledge"],
  });

  // Get IDs of completed RAG items
  const completedKbIds = kbItems
    .filter((item) => item.ragStatus === "completed")
    .map((item) => item.id);

  // Fetch graph summaries for completed items
  const { data: graphSummaries = {} } = useQuery<Record<string, KnowledgeGraphSummary>>({
    queryKey: ["/api/knowledge-graph/summaries", completedKbIds.join(",")],
    queryFn: async () => {
      if (completedKbIds.length === 0) return {};
      const summaries: Record<string, KnowledgeGraphSummary> = {};
      await Promise.all(
        completedKbIds.map(async (id) => {
          try {
            const res = await apiRequest("GET", `/api/knowledge-graph/${id}/summary`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "completed") {
                summaries[id] = data;
              }
            }
          } catch {
            // Skip items without graphs
          }
        }),
      );
      return summaries;
    },
    enabled: completedKbIds.length > 0,
  });

  // Only show KB items that have completed graphs
  const itemsWithGraphs = kbItems.filter(
    (item) => graphSummaries[item.id]?.status === "completed",
  );

  const handleToggle = (kbId: string) => {
    const ref = `kg:${kbId}`;
    if (selectedRefs.includes(ref)) {
      onChange(selectedRefs.filter((r) => r !== ref));
    } else {
      onChange([...selectedRefs, ref]);
    }
  };

  const handleSelectAll = () => {
    const allRefs = itemsWithGraphs.map((item) => `kg:${item.id}`);
    const existingNonKgRefs = selectedRefs.filter((r) => !r.startsWith("kg:"));
    onChange([...existingNonKgRefs, ...allRefs]);
  };

  // Compute combined summary for selected items
  const combinedSummary = useMemo(() => {
    const selectedKgIds = selectedRefs
      .filter((r) => r.startsWith("kg:"))
      .map((r) => r.replace("kg:", ""));

    const selectedGraphs = selectedKgIds
      .map((id) => graphSummaries[id])
      .filter(Boolean) as KnowledgeGraphSummary[];

    if (selectedGraphs.length === 0) return null;

    const totalEntities = selectedGraphs.reduce((sum, g) => sum + g.entityCount, 0);
    const totalRelationships = selectedGraphs.reduce((sum, g) => sum + g.relationshipCount, 0);

    // Aggregate entity type counts across selected graphs
    const typeCounts: Record<string, number> = {};
    for (const graph of selectedGraphs) {
      for (const type of graph.entityTypes) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    }

    return {
      totalEntities,
      totalRelationships,
      kbCount: selectedGraphs.length,
      typeCounts,
    };
  }, [selectedRefs, graphSummaries]);

  if (itemsWithGraphs.length === 0) {
    return (
      <div
        className="bg-[#111A21] border border-[#243645] rounded-lg p-4"
        data-testid="graph-context-picker"
      >
        <div className="flex items-center gap-2 mb-3">
          <Network className="h-4 w-4 text-[#07A288]" />
          <span className="text-sm font-medium text-gray-300">Knowledge Graph References</span>
        </div>
        <p className="text-xs text-muted-foreground" data-testid="picker-empty-state">
          No knowledge graphs available. Generate graphs from your Knowledge Base first.
        </p>
      </div>
    );
  }

  return (
    <div
      className="bg-[#111A21] border border-[#243645] rounded-lg p-4"
      data-testid="graph-context-picker"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-[#07A288]" />
          <span className="text-sm font-medium text-gray-300">Knowledge Graph References</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-[#07A288] hover:text-[#07A288] hover:bg-[#07A288]/10 gap-1"
          onClick={handleSelectAll}
          data-testid="picker-select-all"
        >
          <CheckSquare className="h-3 w-3" />
          Select All with Graphs
        </Button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {itemsWithGraphs.map((item) => {
          const summary = graphSummaries[item.id];
          const ref = `kg:${item.id}`;
          const isSelected = selectedRefs.includes(ref);

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-2 rounded-md hover:bg-[#1a2730] transition-colors ${
                isSelected ? "bg-[#07A288]/5 border border-[#07A288]/20" : "border border-transparent"
              }`}
              data-testid={`picker-item-${item.id}`}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggle(item.id)}
                className="cursor-pointer"
                data-testid={`picker-checkbox-${item.id}`}
              />

              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-200 truncate block">{item.title}</span>
                </div>

                {/* Inline mini widget for items with completed graphs */}
                {summary && (
                  <GraphMiniWidget
                    entityCount={summary.entityCount}
                    relationshipCount={summary.relationshipCount}
                    entityTypes={summary.entityTypes}
                    status={summary.status}
                    variant="inline"
                    selected={isSelected}
                  />
                )}
              </div>

              {summary && (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-[#243645]">
                    {summary.entityCount} entities
                  </Badge>
                  <div className="flex gap-0.5">
                    {summary.entityTypes.slice(0, 4).map((type) => (
                      <div
                        key={type}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.Other }}
                        title={type}
                      />
                    ))}
                  </div>

                  {/* Preview popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-[#07A288]"
                        data-testid={`picker-preview-${item.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 bg-[#111A21] border-[#243645] p-3"
                      side="left"
                      data-testid={`picker-preview-popover-${item.id}`}
                    >
                      <div className="space-y-3">
                        <div className="text-xs font-medium text-gray-300">
                          {item.title} — Graph Preview
                        </div>

                        {/* Top 10 entity types as colored badges */}
                        <div className="flex flex-wrap gap-1">
                          {summary.entityTypes.slice(0, 10).map((type) => (
                            <Badge
                              key={type}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-transparent"
                              style={{
                                backgroundColor: `${ENTITY_COLORS[type] || ENTITY_COLORS.Other}20`,
                                color: ENTITY_COLORS[type] || ENTITY_COLORS.Other,
                              }}
                            >
                              {type}
                            </Badge>
                          ))}
                        </div>

                        {/* Relationship count */}
                        <div className="text-xs text-muted-foreground">
                          <span className="text-gray-200 font-medium">{summary.relationshipCount}</span> relationships
                        </div>

                        {/* Entity type distribution as small color bars */}
                        <div data-testid="entity-type-distribution">
                          <div className="text-[10px] text-muted-foreground mb-1">Entity Type Distribution</div>
                          <div className="flex h-2 rounded-full overflow-hidden bg-[#0B1014]">
                            {summary.entityTypes.map((type) => (
                              <div
                                key={type}
                                className="h-full"
                                style={{
                                  backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.Other,
                                  flex: 1,
                                }}
                                title={type}
                              />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {summary.entityTypes.map((type) => (
                              <div key={type} className="flex items-center gap-1">
                                <div
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.Other }}
                                />
                                <span className="text-[9px] text-muted-foreground">{type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Combined summary when multiple items are checked */}
      {combinedSummary && combinedSummary.kbCount > 0 && (
        <div
          className="mt-3 pt-3 border-t border-[#243645]"
          data-testid="picker-combined-summary"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Selected: <span className="text-gray-200 font-medium">{combinedSummary.totalEntities}</span> entities across{" "}
              <span className="text-gray-200 font-medium">{combinedSummary.kbCount}</span> knowledge base{combinedSummary.kbCount !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Combined entity type distribution bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden bg-[#0B1014]">
            {Object.entries(combinedSummary.typeCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div
                  key={type}
                  className="h-full"
                  style={{
                    backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.Other,
                    flex: count,
                  }}
                  title={`${type}: appears in ${count} graph${count !== 1 ? "s" : ""}`}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
