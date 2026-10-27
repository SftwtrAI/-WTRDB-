import { useEffect, useMemo, useState } from "react";
import { Network, ArrowRight, X, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface ExistingGraphSummary {
  entityCount: number;
  entityTypes: string[];
  knowledgeBaseId: string;
  title?: string;
}

interface GraphCompletionCelebrationProps {
  show: boolean;
  entityCount: number;
  relationshipCount: number;
  knowledgeBaseId: string;
  onDismiss: () => void;
  /** Summaries of other existing graphs, keyed by their knowledgeBaseId */
  existingGraphSummaries?: Record<string, ExistingGraphSummary>;
  /** Entity types found in the just-completed graph */
  newEntityTypes?: string[];
}

export function GraphCompletionCelebration({
  show,
  entityCount,
  relationshipCount,
  knowledgeBaseId,
  onDismiss,
  existingGraphSummaries,
  newEntityTypes,
}: GraphCompletionCelebrationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss();
      }, 8000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [show, onDismiss]);

  // Detect cross-document connections by comparing entity types
  const crossDocConnections = useMemo(() => {
    if (!existingGraphSummaries || !newEntityTypes || newEntityTypes.length === 0) {
      return [];
    }

    const connections: Array<{
      existingId: string;
      existingTitle: string;
      overlappingTypes: string[];
    }> = [];

    for (const [id, summary] of Object.entries(existingGraphSummaries)) {
      // Skip the current graph itself
      if (id === knowledgeBaseId) continue;

      const overlapping = newEntityTypes.filter((type) =>
        summary.entityTypes.includes(type),
      );

      if (overlapping.length > 0) {
        connections.push({
          existingId: id,
          existingTitle: summary.title || "Untitled document",
          overlappingTypes: overlapping,
        });
      }
    }

    // Sort by most overlapping types first
    return connections.sort((a, b) => b.overlappingTypes.length - a.overlappingTypes.length);
  }, [existingGraphSummaries, newEntityTypes, knowledgeBaseId]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300"
      data-testid="graph-completion-celebration"
    >
      <div className="relative rounded-xl border border-[#07A288]/50 bg-[#111A21] p-4 shadow-lg shadow-[#07A288]/10 animate-pulse-border">
        <button
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
          data-testid="graph-celebration-dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#07A288]/10 flex items-center justify-center flex-shrink-0">
            <Network className="h-5 w-5 text-[#07A288]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground mb-1">
              Knowledge Graph Ready!
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Extracted {entityCount} entities and {relationshipCount}{" "}
              relationships
            </p>
            <div className="flex items-center gap-2">
              <Link href={`/app/knowledge-graph/${knowledgeBaseId}`}>
                <Button
                  size="sm"
                  className="gap-1.5 h-7 text-xs bg-gradient-to-r from-[#07A288] to-[#5BBE4E] text-[#041514] font-semibold hover:brightness-110"
                >
                  Explore Now
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
              <Link href={`/app/knowledge-graph/${knowledgeBaseId}/theatre`}>
                <button
                  className="text-[11px] text-[#B8E52B] hover:text-[#B8E52B]/80 underline underline-offset-2 transition-colors"
                  data-testid="watch-how-built-link"
                >
                  Watch how it was built
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Cross-document connection detection — additive section (WS5) */}
        {crossDocConnections.length > 0 && (
          <div
            className="mt-3 pt-3 border-t border-[#243645]"
            data-testid="cross-document-connections"
          >
            {crossDocConnections.slice(0, 2).map((conn) => (
              <div key={conn.existingId} className="flex items-start gap-2 mb-2 last:mb-0">
                <GitMerge className="h-3.5 w-3.5 text-[#5BBE4E] mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  This document shares{" "}
                  <span className="text-gray-200 font-medium">
                    {conn.overlappingTypes.length} entity type{conn.overlappingTypes.length !== 1 ? "s" : ""}
                  </span>{" "}
                  with <span className="text-gray-200 font-medium">{conn.existingTitle}</span>.{" "}
                  <Link
                    href={`/app/knowledge-graph/merged?ids=${knowledgeBaseId},${conn.existingId}`}
                  >
                    <span className="text-[#07A288] hover:text-[#07A288]/80 underline underline-offset-2 cursor-pointer transition-colors">
                      View them together
                    </span>
                  </Link>{" "}
                  for cross-document insights.
                </p>
              </div>
            ))}
          </div>
        )}

        <style>{`
          @keyframes pulse-border {
            0%, 100% { box-shadow: 0 0 0 0 rgba(7, 162, 136, 0.2); }
            50% { box-shadow: 0 0 0 4px rgba(7, 162, 136, 0.1); }
          }
          .animate-pulse-border {
            animation: pulse-border 2s ease-in-out infinite;
          }
        `}</style>
      </div>
    </div>
  );
}
