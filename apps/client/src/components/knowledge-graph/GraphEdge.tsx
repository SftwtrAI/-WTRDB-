import { memo, useState } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  EdgeLabelRenderer,
} from "@xyflow/react";

export interface GraphEdgeData {
  relationshipType: string;
  properties?: Record<string, string>;
  dimmed?: boolean;
  /** Vertical pixel offset to avoid label collisions with nearby edges */
  labelOffsetY?: number;
  /** Current viewport zoom level — used to reduce label opacity at low zoom */
  zoom?: number;
}

function GraphEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const edgeData = data as unknown as GraphEdgeData;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const isActive = hovered || selected;
  const isDimmed = edgeData?.dimmed;
  const labelYOffset = edgeData?.labelOffsetY ?? 0;
  const zoom = edgeData?.zoom ?? 1;
  // Reduce label opacity at low zoom to prevent visual clutter
  const zoomOpacityFactor = zoom < 0.5 ? 0.3 : zoom < 0.75 ? 0.6 : 1;

  return (
    <>
      {/* Invisible wider path for easier hovering */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />

      {/* Actual visible edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: isActive ? "#07A288" : isDimmed ? "#24364520" : "#24364580",
          strokeWidth: isActive ? 2.5 : 1.5,
          transition: "stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease",
          opacity: isDimmed ? 0.2 : 1,
          ...(selected && {
            strokeDasharray: "8 4",
            animation: "dash-flow 1s linear infinite",
          }),
        }}
      />

      {/* Edge label */}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + labelYOffset}px)`,
            zIndex: 10,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div
            className="px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap transition-all duration-200 cursor-pointer"
            style={{
              backgroundColor: isActive ? "#111A21" : "#111A21CC",
              color: isActive ? "#07A288" : "#9CA3AF80",
              border: `1px solid ${isActive ? "#07A28860" : "#24364540"}`,
              opacity: isDimmed ? 0.2 : (isActive ? 1 : 0.7) * zoomOpacityFactor,
              transform: isActive ? "scale(1.1)" : "scale(1)",
              boxShadow: isActive ? "0 0 8px #07A28830" : "none",
            }}
          >
            {edgeData?.relationshipType || "related"}
          </div>
        </div>
      </EdgeLabelRenderer>

      {/* CSS for dash animation */}
      <style>{`
        @keyframes dash-flow {
          to { stroke-dashoffset: -24; }
        }
      `}</style>
    </>
  );
}

export const GraphEdge = memo(GraphEdgeComponent);
