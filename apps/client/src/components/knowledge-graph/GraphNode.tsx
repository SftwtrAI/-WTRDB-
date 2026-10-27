import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

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

export interface GraphNodeData {
  label: string;
  entityType: string;
  properties: Record<string, string>;
  connectionCount: number;
  searchMatch?: boolean;
  dimmed?: boolean;
}

function GraphNodeComponent({ data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const nodeData = data as unknown as GraphNodeData;
  const color = ENTITY_COLORS[nodeData.entityType] || ENTITY_COLORS.Other;
  const connectionCount = nodeData.connectionCount || 1;
  // Scale node size based on connection count (min 1, max ~2x)
  const scale = Math.min(1 + Math.log2(connectionCount) * 0.15, 2);
  const baseSize = 140;
  const nodeWidth = baseSize * scale;

  const propertyEntries = Object.entries(nodeData.properties || {}).slice(0, 6);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: nodeWidth }}
    >
      {/* Glow effect */}
      <div
        className={cn(
          "absolute -inset-1 rounded-2xl opacity-0 blur-md transition-opacity duration-300",
          (hovered || selected) && "opacity-60",
        )}
        style={{ backgroundColor: color }}
      />

      {/* Main node card */}
      <div
        className={cn(
          "relative rounded-xl border-2 px-3 py-2.5 transition-all duration-200 cursor-pointer",
          "bg-[#111A21]",
          selected && "ring-2 ring-offset-1 ring-offset-transparent",
          nodeData.dimmed && "opacity-30",
        )}
        style={{
          borderColor: selected ? color : `${color}80`,
          boxShadow: selected
            ? `0 0 20px ${color}40, 0 0 40px ${color}20`
            : hovered
              ? `0 0 12px ${color}30`
              : `0 0 6px ${color}15`,
          transform: hovered ? "scale(1.05)" : "scale(1)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          ...(selected && { ringColor: color }),
        }}
      >
        {/* Colored left accent bar */}
        <div
          className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
          style={{ backgroundColor: color }}
        />

        {/* Entity type badge */}
        <div className="flex items-center gap-1.5 mb-1 pl-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span
            className="text-[10px] font-medium uppercase tracking-wider truncate"
            style={{ color: `${color}CC` }}
          >
            {nodeData.entityType}
          </span>
        </div>

        {/* Entity name */}
        <div className="pl-2">
          <p
            className="text-sm font-semibold text-gray-100 leading-tight truncate"
            title={nodeData.label}
          >
            {nodeData.label}
          </p>
        </div>

        {/* Connection count indicator */}
        {connectionCount > 1 && (
          <div className="pl-2 mt-1">
            <span className="text-[10px] text-gray-500">
              {connectionCount} connections
            </span>
          </div>
        )}
      </div>

      {/* Hover tooltip with properties */}
      {hovered && propertyEntries.length > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 min-w-[200px] max-w-[280px] rounded-lg border border-[#243645] bg-[#0B1014] p-3 shadow-xl"
          style={{ borderColor: `${color}40` }}
        >
          <div className="space-y-1.5">
            {propertyEntries.map(([key, value]) => (
              <div key={key} className="flex items-start gap-2 text-xs">
                <span className="text-gray-500 font-medium whitespace-nowrap">
                  {key}:
                </span>
                <span className="text-gray-300 truncate">{String(value)}</span>
              </div>
            ))}
            {Object.keys(nodeData.properties || {}).length > 6 && (
              <span className="text-[10px] text-gray-600">
                +{Object.keys(nodeData.properties).length - 6} more...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border-2 !bg-[#111A21]"
        style={{ borderColor: color }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-2 !bg-[#111A21]"
        style={{ borderColor: color }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !border-2 !bg-[#111A21]"
        style={{ borderColor: color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !border-2 !bg-[#111A21]"
        style={{ borderColor: color }}
      />
    </div>
  );
}

export const GraphNode = memo(GraphNodeComponent);
export { ENTITY_COLORS };
