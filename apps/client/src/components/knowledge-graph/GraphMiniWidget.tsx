import { useEffect, useRef } from "react";
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

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  extracting: "#f59e0b",
  pending: "#f59e0b",
  failed: "#ef4444",
};

interface GraphMiniWidgetProps {
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: string;
  knowledgeBaseId?: string;
  variant?: "dashboard" | "sidebar" | "inline" | "context-editor" | "agent-builder";
  selected?: boolean;
  onClick?: () => void;
}

const VARIANT_STYLES: Record<string, { width: number; height: number; showTitle: boolean; className: string }> = {
  dashboard: { width: 180, height: 100, showTitle: false, className: "w-full" },
  sidebar: { width: 140, height: 80, showTitle: false, className: "w-[170px]" },
  inline: { width: 120, height: 60, showTitle: false, className: "w-[150px]" },
  "context-editor": { width: 180, height: 100, showTitle: true, className: "w-full" },
  "agent-builder": { width: 160, height: 90, showTitle: false, className: "w-[190px]" },
};

export function GraphMiniWidget({
  entityCount,
  relationshipCount,
  entityTypes,
  status,
  knowledgeBaseId,
  variant = "dashboard",
  selected = false,
  onClick,
}: GraphMiniWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.dashboard;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Generate node positions in a circular layout
    const nodeCount = Math.min(entityCount, 20);
    if (nodeCount === 0) return;

    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.35;

    const nodes: Array<{ x: number; y: number; color: string }> = [];
    for (let i = 0; i < nodeCount; i++) {
      const angle = (2 * Math.PI * i) / nodeCount - Math.PI / 2;
      const jitterX = (Math.random() - 0.5) * radius * 0.3;
      const jitterY = (Math.random() - 0.5) * radius * 0.3;
      const x = centerX + Math.cos(angle) * radius + jitterX;
      const y = centerY + Math.sin(angle) * radius + jitterY;

      const typeIndex = i % (entityTypes.length || 1);
      const entityType = entityTypes[typeIndex] || "Other";
      const color = ENTITY_COLORS[entityType] || ENTITY_COLORS.Other;

      nodes.push({ x, y, color });
    }

    // Draw relationship lines
    const lineCount = Math.min(relationshipCount, nodeCount * 2);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
    for (let i = 0; i < lineCount && nodes.length > 1; i++) {
      const from = nodes[i % nodes.length];
      const to = nodes[(i + 1 + Math.floor(i / 2)) % nodes.length];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    // Draw entity dots
    const dotRadius = variant === "inline" ? 2.5 : variant === "agent-builder" ? 3 : 3.5;
    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, dotRadius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();
    }
  }, [entityCount, relationshipCount, entityTypes, variant]);

  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.failed;

  const selectedBorderClass = selected
    ? "border-[#07A288]/50 shadow-[0_0_8px_rgba(7,162,136,0.15)]"
    : "border-[#243645]";

  const agentBuilderGlow = variant === "agent-builder" && selected
    ? "shadow-[0_0_12px_rgba(7,162,136,0.2)]"
    : "";

  const hoverClass = onClick
    ? "cursor-pointer hover:scale-[1.02] hover:brightness-110 transition-all duration-150"
    : knowledgeBaseId
      ? "cursor-pointer hover:border-[#07A288]/50 transition-colors"
      : "transition-colors";

  const content = (
    <div
      className={`bg-[#111A21] border rounded-lg p-3 ${selectedBorderClass} ${agentBuilderGlow} ${hoverClass} ${variantStyle.className}`}
      data-testid="graph-mini-widget"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      {variantStyle.showTitle && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-300">Knowledge Graph</span>
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
            data-testid="status-indicator"
          />
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={variantStyle.width}
        height={variantStyle.height}
        className="w-full rounded"
        style={{ height: variantStyle.height }}
        data-testid="graph-mini-canvas"
      />

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">
            <span className="text-gray-200 font-medium">{entityCount}</span> entities
          </span>
          <span className="text-[10px] text-gray-400">
            <span className="text-gray-200 font-medium">{relationshipCount}</span> rels
          </span>
        </div>
        {!variantStyle.showTitle && (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
            data-testid="status-indicator"
          />
        )}
      </div>
    </div>
  );

  // If onClick is provided, it handles navigation — don't wrap in Link
  if (onClick) {
    return content;
  }

  if (knowledgeBaseId) {
    return (
      <Link href={`/app/knowledge-graph/${knowledgeBaseId}`}>
        {content}
      </Link>
    );
  }

  return content;
}
