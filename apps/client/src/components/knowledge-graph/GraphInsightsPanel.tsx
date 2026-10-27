import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  Layers,
  TrendingUp,
  GitMerge,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
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

interface GraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: string;
  lastUpdated: string;
}

interface KBItem {
  id: string;
  title: string;
  ragStatus?: string;
}

interface GraphInsightsPanelProps {
  graphSummaries: Record<string, GraphSummary>;
  kbItems: Array<KBItem>;
}

export function GraphInsightsPanel({ graphSummaries, kbItems }: GraphInsightsPanelProps) {
  const [crossDocOpen, setCrossDocOpen] = useState(true);
  const [activeTypesOpen, setActiveTypesOpen] = useState(true);
  const [suggestedMergesOpen, setSuggestedMergesOpen] = useState(true);
  const [freshnessOpen, setFreshnessOpen] = useState(false);

  const kbTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of kbItems) {
      map[item.id] = item.title;
    }
    return map;
  }, [kbItems]);

  const completedSummaries = useMemo(
    () =>
      Object.entries(graphSummaries).filter(
        ([, summary]) => summary.status === "completed",
      ),
    [graphSummaries],
  );

  // Cross-document overlap: entity types that appear in multiple graphs
  const crossDocOverlaps = useMemo(() => {
    const typeToGraphs: Record<string, string[]> = {};
    for (const [id, summary] of completedSummaries) {
      for (const type of summary.entityTypes) {
        if (!typeToGraphs[type]) typeToGraphs[type] = [];
        typeToGraphs[type].push(id);
      }
    }
    return Object.entries(typeToGraphs)
      .filter(([, ids]) => ids.length > 1)
      .sort(([, a], [, b]) => b.length - a.length);
  }, [completedSummaries]);

  // Most active types: aggregate entity types across all graphs
  const mostActiveTypes = useMemo(() => {
    const typeCounts: Record<string, number> = {};
    for (const [, summary] of completedSummaries) {
      for (const type of summary.entityTypes) {
        // Use entityCount / entityTypes.length as rough per-type estimate
        const estimatedCount = Math.max(
          1,
          Math.round(summary.entityCount / (summary.entityTypes.length || 1)),
        );
        typeCounts[type] = (typeCounts[type] || 0) + estimatedCount;
      }
    }
    return Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [completedSummaries]);

  // Suggested merges: graphs sharing 3+ entity types
  const suggestedMerges = useMemo(() => {
    const merges: Array<{
      idA: string;
      idB: string;
      titleA: string;
      titleB: string;
      sharedTypes: string[];
    }> = [];

    for (let i = 0; i < completedSummaries.length; i++) {
      for (let j = i + 1; j < completedSummaries.length; j++) {
        const [idA, summaryA] = completedSummaries[i];
        const [idB, summaryB] = completedSummaries[j];
        const shared = summaryA.entityTypes.filter((type) =>
          summaryB.entityTypes.includes(type),
        );
        if (shared.length >= 3) {
          merges.push({
            idA,
            idB,
            titleA: kbTitleMap[idA] || "Untitled",
            titleB: kbTitleMap[idB] || "Untitled",
            sharedTypes: shared,
          });
        }
      }
    }

    return merges.sort((a, b) => b.sharedTypes.length - a.sharedTypes.length);
  }, [completedSummaries, kbTitleMap]);

  // Freshness warnings: graphs older than 30 days
  const freshnessWarnings = useMemo(() => {
    const now = Date.now();
    const warnings: Array<{
      id: string;
      title: string;
      daysSince: number;
    }> = [];

    for (const [id, summary] of completedSummaries) {
      const daysSince = Math.floor(
        (now - new Date(summary.lastUpdated).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince > 30) {
        warnings.push({
          id,
          title: kbTitleMap[id] || "Untitled",
          daysSince,
        });
      }
    }

    return warnings.sort((a, b) => b.daysSince - a.daysSince);
  }, [completedSummaries, kbTitleMap]);

  if (completedSummaries.length === 0) {
    return null;
  }

  const hasInsights =
    crossDocOverlaps.length > 0 ||
    mostActiveTypes.length > 0 ||
    suggestedMerges.length > 0 ||
    freshnessWarnings.length > 0;

  if (!hasInsights) return null;

  return (
    <Card
      className="relative overflow-hidden border-[#243645] bg-[#111A21] p-0"
      data-testid="graph-insights-panel"
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgba(7, 162, 136, 0.03) 0%, rgba(91, 190, 78, 0.03) 100%)",
      }}
    >
      {/* Subtle gradient top border */}
      <div className="h-[1px] bg-gradient-to-r from-[#07A288]/40 via-[#5BBE4E]/30 to-[#07A288]/40" />

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="h-4 w-4 text-[#07A288]" />
          <span className="text-sm font-semibold text-gray-200">Graph Insights</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-[#243645] text-muted-foreground">
            {completedSummaries.length} graph{completedSummaries.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Cross-document overlap */}
        {crossDocOverlaps.length > 0 && (
          <Collapsible open={crossDocOpen} onOpenChange={setCrossDocOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full group">
              <Layers className="h-3.5 w-3.5 text-[#07A288]/70" />
              <span className="text-xs font-medium text-gray-300 flex-1 text-left">
                Cross-Document Overlap
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                  crossDocOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1.5 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1 duration-200">
              {crossDocOverlaps.slice(0, 5).map(([type, graphIds]) => (
                <div
                  key={type}
                  className="flex items-center gap-2 py-1 px-2 rounded bg-[#0B1014]/50"
                  data-testid={`cross-doc-overlap-${type}`}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.Other }}
                  />
                  <span className="text-[11px] text-muted-foreground flex-1">
                    <span className="text-gray-200 font-medium">{type}</span> entities appear in{" "}
                    <span className="text-gray-200 font-medium">{graphIds.length}</span> of your documents
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Most active types */}
        {mostActiveTypes.length > 0 && (
          <Collapsible open={activeTypesOpen} onOpenChange={setActiveTypesOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full group">
              <TrendingUp className="h-3.5 w-3.5 text-[#5BBE4E]/70" />
              <span className="text-xs font-medium text-gray-300 flex-1 text-left">
                Most Common Entity Types
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                  activeTypesOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1 duration-200">
              <div
                className="flex flex-wrap gap-1.5 py-1 px-2 rounded bg-[#0B1014]/50"
                data-testid="most-active-types"
              >
                {mostActiveTypes.map(([type, count]) => (
                  <Badge
                    key={type}
                    variant="outline"
                    className="text-[10px] px-2 py-0.5 border-transparent"
                    style={{
                      backgroundColor: `${ENTITY_COLORS[type] || ENTITY_COLORS.Other}15`,
                      color: ENTITY_COLORS[type] || ENTITY_COLORS.Other,
                    }}
                  >
                    {type} ({count})
                  </Badge>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Suggested merges */}
        {suggestedMerges.length > 0 && (
          <Collapsible open={suggestedMergesOpen} onOpenChange={setSuggestedMergesOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full group">
              <GitMerge className="h-3.5 w-3.5 text-[#B8E52B]/70" />
              <span className="text-xs font-medium text-gray-300 flex-1 text-left">
                Suggested Merges
              </span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-[#B8E52B]/30 text-[#B8E52B]/80 mr-1">
                {suggestedMerges.length}
              </Badge>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                  suggestedMergesOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1 duration-200">
              {suggestedMerges.slice(0, 3).map((merge) => (
                <div
                  key={`${merge.idA}-${merge.idB}`}
                  className="py-1.5 px-2 rounded bg-[#0B1014]/50"
                  data-testid={`suggested-merge-${merge.idA}-${merge.idB}`}
                >
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="text-gray-200 font-medium">{merge.titleA}</span> and{" "}
                    <span className="text-gray-200 font-medium">{merge.titleB}</span> share{" "}
                    {merge.sharedTypes.length} entity types — merge them for cross-document insights
                  </p>
                  <Link href={`/app/knowledge-graph/merged?ids=${merge.idA},${merge.idB}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 mt-1 text-[10px] text-[#07A288] hover:text-[#07A288] hover:bg-[#07A288]/10 px-2 gap-1"
                    >
                      <GitMerge className="h-3 w-3" />
                      View Merged Graph
                    </Button>
                  </Link>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Freshness warnings */}
        {freshnessWarnings.length > 0 && (
          <Collapsible open={freshnessOpen} onOpenChange={setFreshnessOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full group">
              <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]/70" />
              <span className="text-xs font-medium text-gray-300 flex-1 text-left">
                Freshness Warnings
              </span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-[#F59E0B]/30 text-[#F59E0B]/80 mr-1">
                {freshnessWarnings.length}
              </Badge>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                  freshnessOpen ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1.5 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1 duration-200">
              {freshnessWarnings.map((warning) => (
                <div
                  key={warning.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded bg-[#F59E0B]/5"
                  data-testid={`freshness-warning-${warning.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="text-gray-200 font-medium">{warning.title}</span>'s graph was generated{" "}
                      <span className="text-[#F59E0B] font-medium">{warning.daysSince} days</span> ago.
                      Consider regenerating for latest data.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-[#F59E0B] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10 px-2 gap-1 flex-shrink-0"
                    data-testid={`regenerate-${warning.id}`}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </Button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </Card>
  );
}
