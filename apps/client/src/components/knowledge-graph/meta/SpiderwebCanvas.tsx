import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpiderwebSimulation, type SimNode, type SimEdge } from "./SpiderwebSimulation";

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

const SPIDERWEB_YELLOW = "#B8E52B";
const BG_COLOR = "#0B1014";

export interface SpiderwebCanvasProps {
  nodes: SimNode[];
  edges: SimEdge[];
  width: number;
  height: number;
  hubsOnly?: boolean;
  selectedTypes?: string[];
  onNodeHover?: (node: SimNode | null) => void;
  onNodeClick?: (node: SimNode) => void;
  selectedNodeId?: string | null;
}

interface TransformState {
  translateX: number;
  translateY: number;
  zoom: number;
}

export function SpiderwebCanvas({
  nodes,
  edges,
  width,
  height,
  hubsOnly = false,
  selectedTypes = [],
  onNodeHover,
  onNodeClick,
  selectedNodeId = null,
}: SpiderwebCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<SpiderwebSimulation | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const transformRef = useRef<TransformState>({
    translateX: 0,
    translateY: 0,
    zoom: 1,
  });
  const draggingRef = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null);

  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Rebuild simulation whenever nodes/edges identity changes.
  useEffect(() => {
    simRef.current = new SpiderwebSimulation(nodes, edges, {
      width: Math.max(width, 800),
      height: Math.max(height, 600),
    });
    frameCountRef.current = 0;
    // Warm up with a small synchronous burst so nothing pops from center.
    simRef.current.tick(20);
  }, [nodes, edges, width, height]);

  // Center the default view so the simulated layout is visible on load.
  useEffect(() => {
    transformRef.current = {
      translateX: (width - Math.max(width, 800)) / 2,
      translateY: (height - Math.max(height, 600)) / 2,
      zoom: 1,
    };
  }, [width, height]);

  // Visibility maps (filtered by hubsOnly / selectedTypes).
  const visibleNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const node of nodes) {
      if (hubsOnly && node.documentIds.length < 3) continue;
      if (selectedTypes.length > 0 && !selectedTypes.includes(node.label)) continue;
      set.add(node.id);
    }
    return set;
  }, [nodes, hubsOnly, selectedTypes]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { translateX, translateY, zoom } = transformRef.current;

    // Reset + background
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    // World transform
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * translateX, dpr * translateY);

    const simNodes = sim.getNodes();
    const simEdges = sim.getEdges();
    const now = performance.now();

    // ---- Edges first (so nodes paint over them) ----
    ctx.lineCap = "round";
    for (const edge of simEdges) {
      if (!visibleNodeIds.has(edge.sourceId) || !visibleNodeIds.has(edge.targetId)) continue;
      const a = simNodes.find((n) => n.id === edge.sourceId);
      const b = simNodes.find((n) => n.id === edge.targetId);
      if (!a || !b) continue;

      const opacity = Math.min(0.15 + edge.weight * 0.12, 0.6);
      ctx.strokeStyle = `rgba(184, 229, 43, ${opacity})`;
      ctx.lineWidth = Math.max(0.5, edge.weight * 0.8);
      ctx.shadowBlur = 8;
      ctx.shadowColor = SPIDERWEB_YELLOW;

      // Curved midpoint gives the web an organic, non-grid feel.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / len;
      const perpY = dx / len;
      // Stable offset per edge (hash from id) so curves don't wobble per frame.
      let h = 0;
      for (let k = 0; k < edge.id.length; k++) h = (h * 31 + edge.id.charCodeAt(k)) | 0;
      const offset = ((h % 21) - 10); // -10..10
      const cpX = mx + perpX * offset;
      const cpY = my + perpY * offset;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cpX, cpY, b.x, b.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // ---- Nodes ----
    for (let i = 0; i < simNodes.length; i++) {
      const node = simNodes[i];
      if (!visibleNodeIds.has(node.id)) continue;

      const docCount = node.documentIds.length;
      const isHub = docCount >= 3;
      const isSelected = node.id === selectedNodeId;
      const isHovered = hoveredNode?.id === node.id;

      const baseRadius = 4 + Math.min(docCount, 5) * 1.5;
      const pulse = isHub ? 1 + 0.2 * Math.sin(now * 0.003 + i) : 1;
      const hoverScale = isHovered ? 1.25 : 1;
      const radius = baseRadius * pulse * hoverScale;

      const fillColor = ENTITY_COLORS[node.label] || ENTITY_COLORS.Other;

      if (isHub) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = SPIDERWEB_YELLOW;
      } else {
        ctx.shadowBlur = 0;
      }

      // Fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Yellow spider-web stroke — thickness scales with document count.
      ctx.shadowBlur = 0;
      ctx.strokeStyle = SPIDERWEB_YELLOW;
      ctx.lineWidth = Math.max(0.8, Math.min(docCount, 5) * 0.5);
      ctx.stroke();

      // Hover ring
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(184, 229, 43, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Selection ring (outer white halo)
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(231, 238, 246, 0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;
  }, [width, height, visibleNodeIds, hoveredNode, selectedNodeId]);

  // Animation loop.
  useEffect(() => {
    let stopped = false;

    const loop = () => {
      if (stopped) return;
      const sim = simRef.current;
      if (sim) {
        const frame = frameCountRef.current;
        // Full speed for the first 200 frames, then 1-in-3 to keep it alive
        // for pulse animation but settle the layout.
        if (frame < 200 || frame % 3 === 0) {
          sim.step();
        }
        frameCountRef.current = frame + 1;
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [draw]);

  // Set up canvas pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [width, height]);

  // Screen → world coordinate conversion for hit-testing.
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const { translateX, translateY, zoom } = transformRef.current;
      return {
        x: (sx - translateX) / zoom,
        y: (sy - translateY) / zoom,
      };
    },
    [],
  );

  const pickNodeAt = useCallback(
    (wx: number, wy: number): SimNode | null => {
      const sim = simRef.current;
      if (!sim) return null;
      const simNodes = sim.getNodes();
      const HIT_RADIUS = 20;
      let best: SimNode | null = null;
      let bestDistSq = HIT_RADIUS * HIT_RADIUS;
      for (const node of simNodes) {
        if (!visibleNodeIds.has(node.id)) continue;
        const dx = node.x - wx;
        const dy = node.y - wy;
        const d = dx * dx + dy * dy;
        if (d < bestDistSq) {
          bestDistSq = d;
          best = node;
        }
      }
      return best;
    },
    [visibleNodeIds],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    const hit = pickNodeAt(wx, wy);
    if (hit) {
      // Click on node, not pan
      return;
    }
    draggingRef.current = {
      startX: sx,
      startY: sy,
      origTx: transformRef.current.translateX,
      origTy: transformRef.current.translateY,
    };
  }, [pickNodeAt, screenToWorld]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (draggingRef.current) {
        transformRef.current.translateX = draggingRef.current.origTx + (sx - draggingRef.current.startX);
        transformRef.current.translateY = draggingRef.current.origTy + (sy - draggingRef.current.startY);
        setCursorPos(null);
        return;
      }

      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const hit = pickNodeAt(wx, wy);
      if (hit !== hoveredNode) {
        setHoveredNode(hit);
        if (onNodeHover) onNodeHover(hit);
      }
      setCursorPos(hit ? { x: sx, y: sy } : null);
    },
    [hoveredNode, onNodeHover, pickNodeAt, screenToWorld],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDragging = draggingRef.current !== null;
    const dragDistance = wasDragging
      ? Math.abs(e.clientX - e.currentTarget.getBoundingClientRect().left - draggingRef.current!.startX) +
        Math.abs(e.clientY - e.currentTarget.getBoundingClientRect().top - draggingRef.current!.startY)
      : 0;
    draggingRef.current = null;

    if (!wasDragging || dragDistance < 3) {
      // Treat as click
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const hit = pickNodeAt(wx, wy);
      if (hit && onNodeClick) {
        onNodeClick(hit);
      }
    }
  }, [onNodeClick, pickNodeAt, screenToWorld]);

  const handleMouseLeave = useCallback(() => {
    draggingRef.current = null;
    if (hoveredNode) {
      setHoveredNode(null);
      if (onNodeHover) onNodeHover(null);
    }
    setCursorPos(null);
  }, [hoveredNode, onNodeHover]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { translateX, translateY, zoom } = transformRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.max(0.2, Math.min(3.0, zoom * delta));

    // Zoom toward cursor: anchor world point under cursor.
    const wx = (sx - translateX) / zoom;
    const wy = (sy - translateY) / zoom;
    const nextTx = sx - wx * nextZoom;
    const nextTy = sy - wy * nextZoom;

    transformRef.current = {
      translateX: nextTx,
      translateY: nextTy,
      zoom: nextZoom,
    };
  }, []);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{
          display: "block",
          cursor: hoveredNode ? "pointer" : draggingRef.current ? "grabbing" : "grab",
        }}
      />
      {hoveredNode && cursorPos && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-[#B8E52B]/40 bg-[#0B1014]/95 px-3 py-2 shadow-[0_0_20px_rgba(184,229,43,0.25)] backdrop-blur-sm"
          style={{
            left: cursorPos.x + 16,
            top: cursorPos.y + 16,
            maxWidth: 260,
          }}
        >
          <div className="text-xs font-semibold text-[#E7EEF6] truncate">
            {hoveredNode.name}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[#8FA2B5]">
            {hoveredNode.label}
          </div>
          <div className="mt-1 text-[11px] text-[#B8E52B]">
            Found in {hoveredNode.documentIds.length} document
            {hoveredNode.documentIds.length === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}

export { ENTITY_COLORS, SPIDERWEB_YELLOW };
