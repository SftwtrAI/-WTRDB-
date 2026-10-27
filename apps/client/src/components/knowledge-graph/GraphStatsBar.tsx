import { ChevronDown, ChevronUp, CircleDot, GitFork, Layers, Activity } from "lucide-react";
import { ENTITY_COLORS } from "./GraphNode";

interface GraphStatsBarProps {
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  isCollapsed: boolean;
  onToggle: () => void;
}

export function GraphStatsBar({
  entityCount,
  relationshipCount,
  entityTypes,
  isCollapsed,
  onToggle,
}: GraphStatsBarProps) {
  const maxPossibleEdges =
    entityCount > 1 ? (entityCount * (entityCount - 1)) / 2 : 0;
  const density =
    maxPossibleEdges > 0
      ? (relationshipCount / maxPossibleEdges).toFixed(3)
      : "0.000";
  const avgConnections =
    entityCount > 0
      ? ((2 * relationshipCount) / entityCount).toFixed(1)
      : "0.0";

  // Count entities per type (approximate even distribution for visual bar)
  const typeDistribution = entityTypes.map((type) => ({
    type,
    color: ENTITY_COLORS[type] || ENTITY_COLORS.Other,
  }));

  if (isCollapsed) {
    return (
      <div className="bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] rounded-xl px-3 py-1.5 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <CircleDot className="h-3 w-3 text-[#07A288]" />
          <span className="text-[11px] text-gray-300 font-medium">
            {entityCount}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <GitFork className="h-3 w-3 text-[#5BBE4E]" />
          <span className="text-[11px] text-gray-300 font-medium">
            {relationshipCount}
          </span>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-500 hover:text-gray-300 transition-colors ml-1"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] rounded-xl px-4 py-2.5 flex items-center gap-5">
      {/* Entity count */}
      <div className="flex items-center gap-1.5">
        <CircleDot className="h-3.5 w-3.5 text-[#07A288]" />
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">
            Entities
          </span>
          <span className="text-sm text-gray-200 font-semibold leading-tight">
            {entityCount}
          </span>
        </div>
      </div>

      {/* Relationship count */}
      <div className="flex items-center gap-1.5">
        <GitFork className="h-3.5 w-3.5 text-[#5BBE4E]" />
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">
            Relationships
          </span>
          <span className="text-sm text-gray-200 font-semibold leading-tight">
            {relationshipCount}
          </span>
        </div>
      </div>

      {/* Density */}
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-[#B8E52B]" />
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">
            Density
          </span>
          <span className="text-sm text-gray-200 font-semibold leading-tight">
            {density}
          </span>
        </div>
      </div>

      {/* Avg connections */}
      <div className="flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-[#3B82F6]" />
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none">
            Avg Conn.
          </span>
          <span className="text-sm text-gray-200 font-semibold leading-tight">
            {avgConnections}
          </span>
        </div>
      </div>

      {/* Type distribution bar */}
      {typeDistribution.length > 0 && (
        <div className="flex items-center gap-1.5 ml-1">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-none mb-1">
              Types
            </span>
            <div className="flex h-2 w-24 rounded-full overflow-hidden bg-[#111A21]">
              {typeDistribution.map((t, i) => (
                <div
                  key={t.type}
                  className="h-full"
                  style={{
                    backgroundColor: t.color,
                    width: `${100 / typeDistribution.length}%`,
                    opacity: 0.8,
                  }}
                  title={t.type}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="text-gray-500 hover:text-gray-300 transition-colors ml-auto"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
