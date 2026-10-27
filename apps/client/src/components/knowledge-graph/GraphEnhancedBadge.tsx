import { Network } from "lucide-react";

interface GraphEnhancedBadgeProps {
  hasGraph: boolean;
  entityCount?: number;
  compact?: boolean;
}

export function GraphEnhancedBadge({
  hasGraph,
  entityCount,
  compact = false,
}: GraphEnhancedBadgeProps) {
  if (!hasGraph) return null;

  return (
    <span
      className="inline-flex items-center gap-1 text-[#07A288]"
      data-testid="graph-enhanced-badge"
    >
      <Network className="h-3 w-3 flex-shrink-0" />
      {!compact && (
        <span className="text-xs font-medium">Graph-enhanced</span>
      )}
      {entityCount !== undefined && entityCount > 0 && (
        <span className="text-[10px] text-[#07A288]/70" data-testid="graph-entity-count">
          ({entityCount})
        </span>
      )}
    </span>
  );
}
