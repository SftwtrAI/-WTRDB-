import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  RotateCw,
  Tag,
  Network,
  Bot,
  Star,
  Plus,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnowledgeBaseItem {
  id: string;
  name: string;
  entityCount: number;
  relationshipCount: number;
  freshness: number;
  lastUpdated: string;
  isExtracting?: boolean;
  entityTypes?: Record<string, number>;
}

interface FederationItem {
  id: string;
  name: string;
  constituentKbIds: string[];
  status: string;
  sharedEntityCount?: number;
}

interface StarPosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowIntensity: number;
  pulseOffset: number;
  rotationAngle: number;
  rotationSpeed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_KBS: KnowledgeBaseItem[] = [
  {
    id: "kb_001",
    name: "IT Engineer Docs",
    entityCount: 142,
    relationshipCount: 267,
    freshness: 0.87,
    lastUpdated: "2026-03-28T14:22:00Z",
    isExtracting: false,
    entityTypes: {
      Person: 34,
      Technology: 28,
      Infrastructure: 45,
      Process: 20,
      Document: 15,
    },
  },
  {
    id: "kb_002",
    name: "Google Admin Export",
    entityCount: 89,
    relationshipCount: 156,
    freshness: 0.93,
    lastUpdated: "2026-04-01T09:15:00Z",
    entityTypes: { Person: 22, Service: 31, Policy: 18, Group: 18 },
  },
  {
    id: "kb_003",
    name: "Security Handbook",
    entityCount: 56,
    relationshipCount: 98,
    freshness: 0.65,
    lastUpdated: "2026-02-20T11:00:00Z",
    entityTypes: { Policy: 19, Threat: 14, Control: 12, Compliance: 11 },
  },
  {
    id: "kb_004",
    name: "Compliance Docs",
    entityCount: 34,
    relationshipCount: 61,
    freshness: 0.91,
    lastUpdated: "2026-03-30T16:45:00Z",
    entityTypes: { Regulation: 12, Control: 9, Process: 8, Document: 5 },
  },
  {
    id: "kb_005",
    name: "Incident Reports",
    entityCount: 78,
    relationshipCount: 134,
    freshness: 0.42,
    lastUpdated: "2026-01-15T08:30:00Z",
    isExtracting: true,
    entityTypes: { Incident: 28, Person: 15, System: 20, Resolution: 15 },
  },
  {
    id: "kb_006",
    name: "CRM Export",
    entityCount: 210,
    relationshipCount: 340,
    freshness: 0.95,
    lastUpdated: "2026-04-02T08:00:00Z",
    entityTypes: {
      Contact: 65,
      Company: 42,
      Deal: 38,
      Activity: 40,
      Product: 25,
    },
  },
  {
    id: "kb_007",
    name: "Onboarding Playbook",
    entityCount: 45,
    relationshipCount: 72,
    freshness: 0.78,
    lastUpdated: "2026-03-25T14:00:00Z",
    entityTypes: { Step: 15, Role: 10, Tool: 12, Milestone: 8 },
  },
];

const PLACEHOLDER_FEDERATIONS: FederationItem[] = [
  {
    id: "fed_001",
    name: "IT Infrastructure Knowledge",
    constituentKbIds: ["kb_001", "kb_002"],
    status: "materialized",
    sharedEntityCount: 47,
  },
  {
    id: "fed_002",
    name: "Security Policies",
    constituentKbIds: ["kb_003", "kb_004", "kb_005"],
    status: "stale",
    sharedEntityCount: 23,
  },
  {
    id: "fed_003",
    name: "Customer Onboarding",
    constituentKbIds: ["kb_006", "kb_007"],
    status: "pending",
    sharedEntityCount: 12,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshnessToColor(freshness: number): string {
  // 1.0 = #07A288 (teal), 0.5 = #5BBE4E (green), 0.0 = #3A4A56 (muted)
  if (freshness >= 0.75) {
    const t = (freshness - 0.75) / 0.25;
    return lerpColor("#5BBE4E", "#07A288", t);
  } else if (freshness >= 0.25) {
    const t = (freshness - 0.25) / 0.5;
    return lerpColor("#3A4A56", "#5BBE4E", t);
  }
  return "#3A4A56";
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff,
    ag = (ah >> 8) & 0xff,
    ab = ah & 0xff;
  const br = (bh >> 16) & 0xff,
    bg = (bh >> 8) & 0xff,
    bb = bh & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
}

function entityCountToRadius(count: number): number {
  // Log scale: 10 entities = small, 10000 = large. Range: 12 to 48 px
  if (count <= 0) return 12;
  const log = Math.log10(Math.max(count, 1));
  return Math.min(48, Math.max(12, log * 16));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Constellation Canvas Component
// ---------------------------------------------------------------------------

function ConstellationCanvas({
  knowledgeBases,
  federations,
  showLabels,
  showFederationLines,
  showAgentOverlay,
  autoRotate,
  starScale,
  selectedStarId,
  hoveredStarId,
  onStarClick,
  onStarDoubleClick,
  onStarHover,
  onStarLeave,
  onBackgroundClick,
}: {
  knowledgeBases: KnowledgeBaseItem[];
  federations: FederationItem[];
  showLabels: boolean;
  showFederationLines: boolean;
  showAgentOverlay: boolean;
  autoRotate: boolean;
  starScale: number;
  selectedStarId: string | null;
  hoveredStarId: string | null;
  onStarClick: (id: string) => void;
  onStarDoubleClick: (id: string) => void;
  onStarHover: (id: string, x: number, y: number) => void;
  onStarLeave: () => void;
  onBackgroundClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const starPositionsRef = useRef<Map<string, StarPosition>>(new Map());
  const rotationRef = useRef(0);
  const timeRef = useRef(0);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // Initialize star positions
  useEffect(() => {
    if (knowledgeBases.length === 0) return;
    const map = new Map<string, StarPosition>();
    const cx = 0.5;
    const cy = 0.5;
    const angleStep = (2 * Math.PI) / knowledgeBases.length;

    knowledgeBases.forEach((kb, i) => {
      const angle = angleStep * i;
      const dist = 0.2 + Math.random() * 0.15;
      map.set(kb.id, {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.0001,
        vy: (Math.random() - 0.5) * 0.0001,
        radius: entityCountToRadius(kb.entityCount),
        color: freshnessToColor(kb.freshness),
        glowIntensity: 0.5 + kb.freshness * 0.5,
        pulseOffset: Math.random() * Math.PI * 2,
        rotationAngle: Math.random() * Math.PI * 2,
        rotationSpeed: (0.3 + Math.random() * 0.7) * 0.002,
      });
    });
    starPositionsRef.current = map;
  }, [knowledgeBases]);

  // Initialize particles
  useEffect(() => {
    const particles: Particle[] = [];
    for (let i = 0; i < 500; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0002,
        vy: (Math.random() - 0.5) * 0.0002,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
      });
    }
    particlesRef.current = particles;
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      timeRef.current += 0.016;

      if (autoRotate) {
        rotationRef.current += 0.0005;
      }

      // Clear
      ctx.fillStyle = "#0B1014";
      ctx.fillRect(0, 0, w, h);

      // Draw particles
      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;
        if (p.y < 0) p.y = 1;
        if (p.y > 1) p.y = 0;

        const flickerAlpha =
          p.alpha * (0.7 + 0.3 * Math.sin(timeRef.current * 2 + p.x * 100));
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 212, 224, ${flickerAlpha})`;
        ctx.fill();
      });

      // Build index for federation lines
      const kbPositions = new Map<string, { sx: number; sy: number }>();
      starPositionsRef.current.forEach((pos, id) => {
        const rot = rotationRef.current;
        const cx = w / 2;
        const cy = h / 2;
        const dx = (pos.x - 0.5) * w;
        const dy = (pos.y - 0.5) * h;
        const sx = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
        const sy = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
        kbPositions.set(id, { sx, sy });
      });

      // Draw federation lines
      if (showFederationLines) {
        federations.forEach((fed) => {
          const isStale = fed.status === "stale";
          for (let i = 0; i < fed.constituentKbIds.length; i++) {
            for (let j = i + 1; j < fed.constituentKbIds.length; j++) {
              const posA = kbPositions.get(fed.constituentKbIds[i]);
              const posB = kbPositions.get(fed.constituentKbIds[j]);
              if (!posA || !posB) continue;

              const mx = (posA.sx + posB.sx) / 2;
              const my = (posA.sy + posB.sy) / 2 - 30;

              ctx.beginPath();
              ctx.moveTo(posA.sx, posA.sy);
              ctx.quadraticCurveTo(mx, my, posB.sx, posB.sy);

              if (isStale) {
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = "rgba(212, 160, 23, 0.4)";
              } else {
                ctx.setLineDash([]);
                ctx.strokeStyle = "rgba(91, 190, 78, 0.35)";
              }
              ctx.lineWidth = Math.max(
                1,
                Math.min(3, (fed.sharedEntityCount ?? 10) / 30),
              );
              ctx.stroke();
              ctx.setLineDash([]);

              // Pulse dot along curve
              const t = (Math.sin(timeRef.current * 0.4 + i * 2) + 1) / 2;
              const px =
                (1 - t) * (1 - t) * posA.sx +
                2 * (1 - t) * t * mx +
                t * t * posB.sx;
              const py =
                (1 - t) * (1 - t) * posA.sy +
                2 * (1 - t) * t * my +
                t * t * posB.sy;
              ctx.beginPath();
              ctx.arc(px, py, 3, 0, Math.PI * 2);
              ctx.fillStyle = isStale
                ? "rgba(212, 160, 23, 0.8)"
                : "rgba(91, 190, 78, 0.8)";
              ctx.fill();
            }
          }
        });
      }

      // Draw stars
      knowledgeBases.forEach((kb) => {
        const pos = starPositionsRef.current.get(kb.id);
        if (!pos) return;
        const screenPos = kbPositions.get(kb.id);
        if (!screenPos) return;
        const { sx, sy } = screenPos;

        const isSelected = selectedStarId === kb.id;
        const isHovered = hoveredStarId === kb.id;
        const baseRadius = pos.radius * starScale;
        const pulse = Math.sin(timeRef.current * 3 + pos.pulseOffset) * 0.08;
        const r =
          baseRadius * (1 + pulse) * (isSelected ? 1.3 : isHovered ? 1.15 : 1);

        // Glow
        const glowRadius = r * 3;
        const glow = ctx.createRadialGradient(
          sx,
          sy,
          r * 0.5,
          sx,
          sy,
          glowRadius,
        );
        glow.addColorStop(0, pos.color + "60");
        glow.addColorStop(0.5, pos.color + "20");
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(sx, sy, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Star body
        const gradient = ctx.createRadialGradient(
          sx - r * 0.2,
          sy - r * 0.2,
          r * 0.1,
          sx,
          sy,
          r,
        );
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.3, pos.color);
        gradient.addColorStop(1, pos.color + "80");
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Selection halo
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? "#07A288" : "rgba(7, 162, 136, 0.5)";
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.stroke();
        }

        // Extraction ring animation
        if (kb.isExtracting) {
          const numParticles = 10;
          const orbitR = r + 10;
          for (let p = 0; p < numParticles; p++) {
            const angle =
              (p / numParticles) * Math.PI * 2 + timeRef.current * 2;
            const px = sx + Math.cos(angle) * orbitR;
            const py = sy + Math.sin(angle) * orbitR * 0.4;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(7, 162, 136, 0.7)";
            ctx.fill();
          }
        }

        // Label
        if (showLabels || isHovered || isSelected) {
          const labelAlpha = isHovered || isSelected ? 1 : 0.7;
          ctx.font = "12px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = `rgba(231, 238, 246, ${labelAlpha})`;
          const labelText =
            kb.name.length > 24 ? kb.name.slice(0, 22) + "..." : kb.name;
          ctx.fillText(labelText, sx, sy + r + 18);
        }
      });

      // Agent overlay
      if (showAgentOverlay) {
        knowledgeBases.forEach((kb) => {
          const screenPos = kbPositions.get(kb.id);
          if (!screenPos) return;
          const { sx, sy } = screenPos;
          const pos = starPositionsRef.current.get(kb.id);
          if (!pos) return;
          const r = pos.radius * starScale;

          // Simulated agents (1-2 per KB)
          const agentCount = (kb.entityCount % 3) + 1;
          for (let a = 0; a < agentCount; a++) {
            const agentAngle =
              timeRef.current * 0.5 + (a * Math.PI * 2) / agentCount;
            const agentDist = r + 20 + a * 8;
            const ax = sx + Math.cos(agentAngle) * agentDist;
            const ay = sy + Math.sin(agentAngle) * agentDist;

            // Diamond shape
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = "rgba(7, 162, 136, 0.8)";
            ctx.fillRect(-4, -4, 8, 8);
            ctx.restore();

            // Connection line
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ax, ay);
            ctx.strokeStyle = "rgba(7, 162, 136, 0.2)";
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [
    knowledgeBases,
    federations,
    showLabels,
    showFederationLines,
    showAgentOverlay,
    autoRotate,
    starScale,
    selectedStarId,
    hoveredStarId,
  ]);

  // Resize handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Mouse interaction
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvas.width;
      const h = canvas.height;

      let hitId: string | null = null;
      const rot = rotationRef.current;

      starPositionsRef.current.forEach((pos, id) => {
        const cx = w / 2;
        const cy = h / 2;
        const dx = (pos.x - 0.5) * w;
        const dy = (pos.y - 0.5) * h;
        const sx = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
        const sy = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
        const r = pos.radius * starScale * 1.5;
        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist < r) {
          hitId = id;
        }
      });

      if (hitId) {
        const now = Date.now();
        if (
          lastClickRef.current &&
          lastClickRef.current.id === hitId &&
          now - lastClickRef.current.time < 400
        ) {
          onStarDoubleClick(hitId);
          lastClickRef.current = null;
        } else {
          lastClickRef.current = { id: hitId, time: now };
          onStarClick(hitId);
        }
      } else {
        onBackgroundClick();
      }
    },
    [starScale, onStarClick, onStarDoubleClick, onBackgroundClick],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvas.width;
      const h = canvas.height;
      const rot = rotationRef.current;

      let hitId: string | null = null;

      starPositionsRef.current.forEach((pos, id) => {
        const cx = w / 2;
        const cy = h / 2;
        const dx = (pos.x - 0.5) * w;
        const dy = (pos.y - 0.5) * h;
        const sx = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
        const sy = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
        const r = pos.radius * starScale * 1.5;
        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist < r) {
          hitId = id;
        }
      });

      if (hitId) {
        onStarHover(hitId, e.clientX, e.clientY);
        canvas.style.cursor = "pointer";
      } else {
        onStarLeave();
        canvas.style.cursor = "default";
      }
    },
    [starScale, onStarHover, onStarLeave],
  );

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      onClick={handleCanvasClick}
      onMouseMove={handleCanvasMouseMove}
      onMouseLeave={onStarLeave}
    />
  );
}

// ---------------------------------------------------------------------------
// Detail Card (right side)
// ---------------------------------------------------------------------------

function StarDetailCard({
  kb,
  federations,
  onClose,
  onNavigate,
}: {
  kb: KnowledgeBaseItem;
  federations: FederationItem[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const relatedFeds = federations.filter((f) =>
    f.constituentKbIds.includes(kb.id),
  );

  const entityTypes = kb.entityTypes ?? {};
  const totalEntities = Object.values(entityTypes).reduce(
    (sum, c) => sum + c,
    0,
  );

  // Simple bar chart for entity distribution
  const typeColors = [
    "hsl(var(--primary))",
    "hsl(var(--secondary))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(var(--muted-foreground))",
  ];

  return (
    <Card className="absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-y-auto bg-card/95 backdrop-blur-xl border-border z-20">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {kb.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Last updated {formatDate(kb.lastUpdated)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-lg font-bold text-foreground">
              {kb.entityCount}
            </p>
            <p className="text-xs text-muted-foreground">Entities</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-lg font-bold text-foreground">
              {kb.relationshipCount}
            </p>
            <p className="text-xs text-muted-foreground">Edges</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p
              className={`text-lg font-bold ${kb.freshness >= 0.7 ? "text-primary" : kb.freshness >= 0.4 ? "text-amber-500" : "text-destructive"}`}
            >
              {Math.round(kb.freshness * 100)}%
            </p>
            <p className="text-xs text-muted-foreground">Fresh</p>
          </div>
        </div>

        {/* Extraction status */}
        {kb.isExtracting && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-xs text-primary font-medium">
              Extraction in progress
            </span>
          </div>
        )}

        {/* Entity type distribution */}
        {totalEntities > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Entity Types
            </h4>
            <div className="space-y-1.5">
              {Object.entries(entityTypes)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count], idx) => (
                  <div key={type} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: typeColors[idx % typeColors.length],
                      }}
                    />
                    <span className="text-xs text-foreground flex-1 truncate">
                      {type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {count}
                    </span>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(count / totalEntities) * 100}%`,
                          backgroundColor: typeColors[idx % typeColors.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Federations */}
        {relatedFeds.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Federations
            </h4>
            <div className="space-y-1">
              {relatedFeds.map((fed) => (
                <div
                  key={fed.id}
                  className="flex items-center gap-2 p-1.5 rounded bg-muted/30"
                >
                  <Network className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {fed.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {fed.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onNavigate(kb.id)}
          >
            Open Graph
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hover Tooltip
// ---------------------------------------------------------------------------

function HoverTooltip({
  kb,
  federations,
  x,
  y,
}: {
  kb: KnowledgeBaseItem;
  federations: FederationItem[];
  x: number;
  y: number;
}) {
  const relatedFeds = federations.filter((f) =>
    f.constituentKbIds.includes(kb.id),
  );

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: x + 16, top: y - 8 }}
    >
      <div className="bg-card/95 backdrop-blur-xl border border-border rounded-lg p-3 shadow-lg max-w-60">
        <p className="text-sm font-medium text-foreground">{kb.name}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          <span>{kb.entityCount} entities</span>
          <span>{kb.relationshipCount} edges</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-muted-foreground">Freshness:</span>
          <span
            className={`text-xs font-medium ${kb.freshness >= 0.7 ? "text-primary" : kb.freshness >= 0.4 ? "text-amber-500" : "text-destructive"}`}
          >
            {Math.round(kb.freshness * 100)}%
          </span>
        </div>
        {relatedFeds.length > 0 && (
          <div className="mt-1.5 text-xs text-muted-foreground">
            In {relatedFeds.length} federation
            {relatedFeds.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health Panel
// ---------------------------------------------------------------------------

function HealthPanel({
  knowledgeBases,
  federations,
}: {
  knowledgeBases: KnowledgeBaseItem[];
  federations: FederationItem[];
}) {
  const totalEntities = knowledgeBases.reduce((s, kb) => s + kb.entityCount, 0);
  const totalRelationships = knowledgeBases.reduce(
    (s, kb) => s + kb.relationshipCount,
    0,
  );
  const avgFreshness =
    knowledgeBases.length > 0
      ? knowledgeBases.reduce((s, kb) => s + kb.freshness, 0) /
        knowledgeBases.length
      : 0;

  const federatedKbIds = new Set(
    federations.flatMap((f) => f.constituentKbIds),
  );
  const federationCoverage =
    knowledgeBases.length > 0 ? federatedKbIds.size : 0;

  return (
    <div
      className="absolute top-4 left-4 z-20 rounded-xl border border-border p-4 space-y-3 w-56"
      style={{
        background: "rgba(17, 26, 33, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Constellation Health
      </h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total Entities</span>
          <span className="text-sm font-bold text-foreground">
            {totalEntities.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Total Relationships
          </span>
          <span className="text-sm font-bold text-foreground">
            {totalRelationships.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Avg Freshness</span>
          <span
            className={`text-sm font-bold ${avgFreshness >= 0.7 ? "text-primary" : avgFreshness >= 0.4 ? "text-amber-500" : "text-destructive"}`}
          >
            {Math.round(avgFreshness * 100)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Federation Coverage
          </span>
          <span className="text-sm font-bold text-foreground">
            {federationCoverage} / {knowledgeBases.length}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls Bar
// ---------------------------------------------------------------------------

function ControlsBar({
  autoRotate,
  setAutoRotate,
  showLabels,
  setShowLabels,
  showFederationLines,
  setShowFederationLines,
  showAgentOverlay,
  setShowAgentOverlay,
  starScale,
  setStarScale,
}: {
  autoRotate: boolean;
  setAutoRotate: (v: boolean) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  showFederationLines: boolean;
  setShowFederationLines: (v: boolean) => void;
  showAgentOverlay: boolean;
  setShowAgentOverlay: (v: boolean) => void;
  starScale: number;
  setStarScale: (v: number) => void;
}) {
  return (
    <div
      className="absolute bottom-4 right-4 z-20 rounded-xl border border-border p-3 space-y-3 w-56"
      style={{
        background: "rgba(17, 26, 33, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Controls
      </h3>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-foreground flex items-center gap-1.5">
            <RotateCw className="h-3 w-3 text-muted-foreground" />
            Auto-rotate
          </label>
          <Switch
            checked={autoRotate}
            onCheckedChange={setAutoRotate}
            className="scale-75"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-foreground flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-muted-foreground" />
            Labels
          </label>
          <Switch
            checked={showLabels}
            onCheckedChange={setShowLabels}
            className="scale-75"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-foreground flex items-center gap-1.5">
            <Network className="h-3 w-3 text-muted-foreground" />
            Federation Lines
          </label>
          <Switch
            checked={showFederationLines}
            onCheckedChange={setShowFederationLines}
            className="scale-75"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-foreground flex items-center gap-1.5">
            <Bot className="h-3 w-3 text-muted-foreground" />
            Agent Overlay
          </label>
          <Switch
            checked={showAgentOverlay}
            onCheckedChange={setShowAgentOverlay}
            className="scale-75"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-foreground flex items-center gap-1.5">
              <Star className="h-3 w-3 text-muted-foreground" />
              Star Scale
            </label>
            <span className="text-xs font-mono text-muted-foreground">
              {starScale.toFixed(1)}x
            </span>
          </div>
          <Slider
            min={50}
            max={200}
            step={10}
            value={[starScale * 100]}
            onValueChange={([v]) => setStarScale(v / 100)}
            className="py-0"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyConstellation({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
      {/* Animated placeholder star */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-muted/30 animate-pulse flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
            <Plus className="h-6 w-6 text-primary animate-pulse" />
          </div>
        </div>
        {/* Glow ring */}
        <div
          className="absolute inset-0 rounded-full border border-primary/20 animate-ping"
          style={{ animationDuration: "3s" }}
        />
      </div>
      <p className="text-sm text-foreground font-medium mb-1">
        Your first knowledge graph
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Upload a document to create your first star
      </p>
      <Button size="sm" onClick={onNavigate}>
        <Plus className="h-4 w-4 mr-2" />
        Create Knowledge Base
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ConstellationPage() {
  const [, setLocation] = useLocation();
  const [autoRotate, setAutoRotate] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showFederationLines, setShowFederationLines] = useState(true);
  const [showAgentOverlay, setShowAgentOverlay] = useState(false);
  const [starScale, setStarScale] = useState(1.0);
  const [selectedStarId, setSelectedStarId] = useState<string | null>(null);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  // Fetch KBs
  const { data: knowledgeBases = [], isLoading: kbLoading } = useQuery<
    KnowledgeBaseItem[]
  >({
    queryKey: ["/api/knowledge-base/constellation"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/knowledge-base");
        if (res.ok) {
          const data = await res.json();
          const items = data.knowledgeBases ?? data;
          if (Array.isArray(items) && items.length > 0) {
            return items.map((kb: any) => ({
              id: kb.id,
              name: kb.name || kb.filename || "Untitled",
              entityCount: kb.entityCount ?? 0,
              relationshipCount: kb.relationshipCount ?? 0,
              freshness: kb.freshness ?? 0.5,
              lastUpdated:
                kb.updatedAt || kb.createdAt || new Date().toISOString(),
              isExtracting: kb.extractionStatus === "running",
              entityTypes: kb.entityTypes ?? {},
            }));
          }
        }
      } catch {
        // API not available yet
      }
      return PLACEHOLDER_KBS;
    },
  });

  // Fetch Federations
  const { data: federations = [], isLoading: fedLoading } = useQuery<
    FederationItem[]
  >({
    queryKey: ["/api/federations/constellation"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/federations");
        if (res.ok) {
          const data = await res.json();
          const items = data.federations ?? data;
          if (Array.isArray(items) && items.length > 0) {
            return items.map((f: any) => ({
              id: f.id,
              name: f.name,
              constituentKbIds: f.constituentKbIds ?? [],
              status: f.status ?? "pending",
              sharedEntityCount: f.sharedEntityCount ?? 10,
            }));
          }
        }
      } catch {
        // API not available yet
      }
      return PLACEHOLDER_FEDERATIONS;
    },
  });

  const isLoading = kbLoading || fedLoading;

  const selectedKb = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedStarId) ?? null,
    [knowledgeBases, selectedStarId],
  );

  const hoveredKb = useMemo(
    () => knowledgeBases.find((kb) => kb.id === hoveredStarId) ?? null,
    [knowledgeBases, hoveredStarId],
  );

  const handleStarClick = useCallback((id: string) => {
    setSelectedStarId(id);
  }, []);

  const handleStarDoubleClick = useCallback(
    (id: string) => {
      setLocation(`/app/knowledge-graph-3d/${id}`);
    },
    [setLocation],
  );

  const handleStarHover = useCallback((id: string, x: number, y: number) => {
    setHoveredStarId(id);
    setHoverPos({ x, y });
  }, []);

  const handleStarLeave = useCallback(() => {
    setHoveredStarId(null);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedStarId(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedStarId(null);
      } else if (e.key === "l") {
        setShowLabels((v) => !v);
      } else if (e.key === "a") {
        setShowAgentOverlay((v) => !v);
      } else if (e.key === "Enter" && selectedStarId) {
        setLocation(`/app/knowledge-graph-3d/${selectedStarId}`);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedStarId, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isEmpty = knowledgeBases.length === 0;

  return (
    <div className="relative w-full h-full min-h-[560px] rounded-xl overflow-hidden border border-border bg-background">
      {/* Canvas */}
      <ConstellationCanvas
        knowledgeBases={knowledgeBases}
        federations={federations}
        showLabels={showLabels}
        showFederationLines={showFederationLines}
        showAgentOverlay={showAgentOverlay}
        autoRotate={autoRotate}
        starScale={starScale}
        selectedStarId={selectedStarId}
        hoveredStarId={hoveredStarId}
        onStarClick={handleStarClick}
        onStarDoubleClick={handleStarDoubleClick}
        onStarHover={handleStarHover}
        onStarLeave={handleStarLeave}
        onBackgroundClick={handleBackgroundClick}
      />

      {/* Empty state overlay */}
      {isEmpty && (
        <EmptyConstellation
          onNavigate={() => setLocation("/app/knowledge-base")}
        />
      )}

      {/* Health Panel (top-left) */}
      {!isEmpty && (
        <HealthPanel
          knowledgeBases={knowledgeBases}
          federations={federations}
        />
      )}

      {/* Controls (bottom-right) */}
      <ControlsBar
        autoRotate={autoRotate}
        setAutoRotate={setAutoRotate}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        showFederationLines={showFederationLines}
        setShowFederationLines={setShowFederationLines}
        showAgentOverlay={showAgentOverlay}
        setShowAgentOverlay={setShowAgentOverlay}
        starScale={starScale}
        setStarScale={setStarScale}
      />

      {/* Detail Card (right side) */}
      {selectedKb && (
        <StarDetailCard
          kb={selectedKb}
          federations={federations}
          onClose={() => setSelectedStarId(null)}
          onNavigate={(id) => setLocation(`/app/knowledge-graph-3d/${id}`)}
        />
      )}

      {/* Hover Tooltip */}
      {hoveredKb && hoveredStarId !== selectedStarId && (
        <HoverTooltip
          kb={hoveredKb}
          federations={federations}
          x={hoverPos.x}
          y={hoverPos.y}
        />
      )}

      {/* Page title overlay */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <h1 className="text-sm font-semibold text-foreground/80 tracking-wide">
          Constellation View
        </h1>
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 text-[10px] text-muted-foreground/50">
        <span>
          <kbd className="px-1 py-0.5 rounded bg-muted/40 text-muted-foreground/70">
            L
          </kbd>{" "}
          labels
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded bg-muted/40 text-muted-foreground/70">
            A
          </kbd>{" "}
          agents
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded bg-muted/40 text-muted-foreground/70">
            Esc
          </kbd>{" "}
          deselect
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded bg-muted/40 text-muted-foreground/70">
            Enter
          </kbd>{" "}
          open graph
        </span>
      </div>
    </div>
  );
}
