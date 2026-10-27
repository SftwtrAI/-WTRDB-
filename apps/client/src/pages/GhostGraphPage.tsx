import { useState, useMemo, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Ghost,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Loader2,
  Eye,
  Network,
  ExternalLink,
  Sparkles,
  ShieldQuestion,
  Layers,
} from "lucide-react";
import { ENTITY_COLORS } from "@/components/knowledge-graph/GraphNode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A ghost entity predicted by the pattern completion engine */
interface GhostEntity {
  id: string;
  /** The real entity that is missing a relationship */
  sourceEntityName: string;
  sourceEntityType: string;
  /** The predicted missing relationship type */
  missingRelationshipType: string;
  /** The predicted missing entity type */
  predictedEntityType: string;
  /** Confidence score (0 to 1) */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string;
  /** Whether this ghost has been verified or dismissed */
  status: "pending" | "verified" | "dismissed";
}

/** A coverage gap: underrepresented entity types */
interface CoverageGap {
  id: string;
  entityType: string;
  actualCount: number;
  expectedMin: number;
  expectedMax: number;
  description: string;
}

/** A cross-graph gap (federation only) */
interface CrossGraphGap {
  id: string;
  entityType: string;
  sourceGraphName: string;
  sourceGraphId: string;
  sourceCount: number;
  localCount: number;
  description: string;
}

/** A node in the graph visualization (real or ghost) */
interface GraphNode {
  id: string;
  name: string;
  entityType: string;
  isGhost: boolean;
  x: number;
  y: number;
  connectionCount: number;
}

/** An edge in the graph visualization */
interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  isGhost: boolean;
}

/** Ghost graph summary data */
interface GhostGraphData {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  completenessScore: number;
  completenessHistory: number[];
  totalRealEntities: number;
  totalGhostEntities: number;
  ghosts: GhostEntity[];
  coverageGaps: CoverageGap[];
  crossGraphGaps: CrossGraphGap[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_DATA: GhostGraphData = {
  knowledgeBaseId: "kb_001",
  knowledgeBaseName: "IT Infrastructure Knowledge Base",
  completenessScore: 0.73,
  completenessHistory: [0.61, 0.65, 0.68, 0.71, 0.73],
  totalRealEntities: 142,
  totalGhostEntities: 18,
  ghosts: [
    {
      id: "ghost_001",
      sourceEntityName: "dc01",
      sourceEntityType: "Infrastructure",
      missingRelationshipType: "BACKED_UP_BY",
      predictedEntityType: "Backup Solution",
      confidence: 0.87,
      reasoning: "87% of Infrastructure entities in this domain have a BACKED_UP_BY relationship.",
      status: "pending",
    },
    {
      id: "ghost_002",
      sourceEntityName: "auth-server-01",
      sourceEntityType: "Infrastructure",
      missingRelationshipType: "MONITORED_BY",
      predictedEntityType: "Monitoring System",
      confidence: 0.82,
      reasoning: "Production servers typically have monitoring. 82% of similar servers in this graph are monitored.",
      status: "pending",
    },
    {
      id: "ghost_003",
      sourceEntityName: "vpn-gateway",
      sourceEntityType: "Infrastructure",
      missingRelationshipType: "HAS_CERTIFICATE",
      predictedEntityType: "SSL Certificate",
      confidence: 0.79,
      reasoning: "VPN gateways require SSL certificates. None documented for this entity.",
      status: "pending",
    },
    {
      id: "ghost_004",
      sourceEntityName: "web-app-prod",
      sourceEntityType: "Product",
      missingRelationshipType: "DEPENDS_ON",
      predictedEntityType: "Database",
      confidence: 0.91,
      reasoning: "Web applications almost always have database dependencies. No database relationship found.",
      status: "pending",
    },
    {
      id: "ghost_005",
      sourceEntityName: "staging-env",
      sourceEntityType: "Infrastructure",
      missingRelationshipType: "MIRRORS",
      predictedEntityType: "Infrastructure",
      confidence: 0.68,
      reasoning: "Staging environments typically mirror production. Expected relationship to a production environment.",
      status: "verified",
    },
    {
      id: "ghost_006",
      sourceEntityName: "k8s-cluster-01",
      sourceEntityType: "Infrastructure",
      missingRelationshipType: "MANAGED_BY",
      predictedEntityType: "Person",
      confidence: 0.74,
      reasoning: "Kubernetes clusters typically have documented administrators.",
      status: "dismissed",
    },
  ],
  coverageGaps: [
    {
      id: "gap_001",
      entityType: "Router/Switch",
      actualCount: 0,
      expectedMin: 8,
      expectedMax: 15,
      description: "This graph has 0 Router/Switch entities. Similar infrastructure graphs average 8-15.",
    },
    {
      id: "gap_002",
      entityType: "DNS Record",
      actualCount: 2,
      expectedMin: 20,
      expectedMax: 50,
      description: "Only 2 DNS records documented. Infrastructure of this scale typically has 20-50.",
    },
    {
      id: "gap_003",
      entityType: "Firewall Rule",
      actualCount: 3,
      expectedMin: 15,
      expectedMax: 40,
      description: "3 firewall rules documented. Expected 15-40 for this network topology.",
    },
  ],
  crossGraphGaps: [
    {
      id: "xgap_001",
      entityType: "OAuth Application",
      sourceGraphName: "Google Admin Export",
      sourceGraphId: "kb_002",
      sourceCount: 12,
      localCount: 0,
      description: "Google Admin graph contains 12 OAuth Application entities. This IT documentation graph contains 0.",
    },
    {
      id: "xgap_002",
      entityType: "User Group",
      sourceGraphName: "Google Admin Export",
      sourceGraphId: "kb_002",
      sourceCount: 8,
      localCount: 1,
      description: "Google Admin graph contains 8 User Group entities. This graph documents only 1.",
    },
  ],
  nodes: [
    // Real nodes
    { id: "n1", name: "dc01", entityType: "Infrastructure", isGhost: false, x: 200, y: 300, connectionCount: 5 },
    { id: "n2", name: "auth-server-01", entityType: "Infrastructure", isGhost: false, x: 400, y: 200, connectionCount: 4 },
    { id: "n3", name: "web-app-prod", entityType: "Product", isGhost: false, x: 350, y: 450, connectionCount: 3 },
    { id: "n4", name: "vpn-gateway", entityType: "Infrastructure", isGhost: false, x: 150, y: 150, connectionCount: 2 },
    { id: "n5", name: "k8s-cluster-01", entityType: "Infrastructure", isGhost: false, x: 500, y: 350, connectionCount: 6 },
    { id: "n6", name: "staging-env", entityType: "Infrastructure", isGhost: false, x: 600, y: 200, connectionCount: 2 },
    { id: "n7", name: "prod-db-01", entityType: "Infrastructure", isGhost: false, x: 300, y: 100, connectionCount: 3 },
    { id: "n8", name: "load-balancer", entityType: "Infrastructure", isGhost: false, x: 450, y: 500, connectionCount: 4 },
    // Ghost nodes
    { id: "g1", name: "Backup Solution?", entityType: "Infrastructure", isGhost: true, x: 80, y: 380, connectionCount: 1 },
    { id: "g2", name: "Monitoring System?", entityType: "Infrastructure", isGhost: true, x: 520, y: 100, connectionCount: 1 },
    { id: "g3", name: "SSL Certificate?", entityType: "Document", isGhost: true, x: 50, y: 80, connectionCount: 1 },
    { id: "g4", name: "Database?", entityType: "Infrastructure", isGhost: true, x: 250, y: 550, connectionCount: 1 },
  ],
  edges: [
    // Real edges
    { id: "e1", sourceId: "n1", targetId: "n2", type: "HOSTS", isGhost: false },
    { id: "e2", sourceId: "n2", targetId: "n7", type: "CONNECTS_TO", isGhost: false },
    { id: "e3", sourceId: "n3", targetId: "n5", type: "DEPLOYED_ON", isGhost: false },
    { id: "e4", sourceId: "n4", targetId: "n1", type: "ROUTES_TO", isGhost: false },
    { id: "e5", sourceId: "n5", targetId: "n8", type: "MANAGED_BY", isGhost: false },
    { id: "e6", sourceId: "n6", targetId: "n5", type: "MIRRORS", isGhost: false },
    { id: "e7", sourceId: "n8", targetId: "n3", type: "DISTRIBUTES_TO", isGhost: false },
    // Ghost edges
    { id: "ge1", sourceId: "n1", targetId: "g1", type: "BACKED_UP_BY", isGhost: true },
    { id: "ge2", sourceId: "n2", targetId: "g2", type: "MONITORED_BY", isGhost: true },
    { id: "ge3", sourceId: "n4", targetId: "g3", type: "HAS_CERTIFICATE", isGhost: true },
    { id: "ge4", sourceId: "n3", targetId: "g4", type: "DEPENDS_ON", isGhost: true },
  ],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Circular donut chart showing graph completeness score.
 * Color-coded: green >= 80%, amber 50-80%, red < 50%.
 */
function CompletenessDonut({ score, size = 120 }: { score: number; size?: number }) {
  const pct = Math.round(score * 100);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - score * circumference;

  const color = score >= 0.8 ? "#07A288" : score >= 0.5 ? "#D4A017" : "#E63946";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#243645"
          strokeWidth={8}
        />
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>
          {pct}%
        </span>
        <span className="text-[10px] text-muted-foreground">Complete</span>
      </div>
    </div>
  );
}

/** Small sparkline showing completeness trend over last batches */
function CompleteSpark({ values, width = 100, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values) - 0.05;
  const max = Math.max(...values) + 0.05;
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points}
        fill="none"
        stroke="#07A288"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Confidence score badge with color coding */
function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.8 ? "text-primary" : value >= 0.6 ? "text-amber-500" : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1 border-[#243645]", color)}>
      <Sparkles className="h-2.5 w-2.5" />
      {pct}%
    </Badge>
  );
}

/** Card for a single pattern-completion ghost */
function GhostCard({
  ghost,
  onVerify,
  onDismiss,
}: {
  ghost: GhostEntity;
  onVerify: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const typeColor = ENTITY_COLORS[ghost.sourceEntityType] || ENTITY_COLORS.Other;

  return (
    <Card
      className={cn(
        "border border-[#243645] bg-[#111A21] p-3 transition-all",
        ghost.status === "verified" && "border-primary/30 bg-primary/5",
        ghost.status === "dismissed" && "opacity-50",
      )}
      data-testid={`ghost-card-${ghost.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Ghost className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">
            {ghost.sourceEntityName}
          </span>
        </div>
        <ConfidenceBadge value={ghost.confidence} />
      </div>

      {/* Missing relationship */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] text-muted-foreground">Missing:</span>
        <Badge
          variant="outline"
          className="text-[10px] gap-1 border-[#243645] font-mono"
          style={{ color: typeColor }}
        >
          {ghost.missingRelationshipType}
        </Badge>
      </div>

      {/* Predicted entity type */}
      <p className="text-[11px] text-muted-foreground mb-2">
        Expected: a{" "}
        <span className="text-foreground font-medium">{ghost.predictedEntityType}</span> connected
        to {ghost.sourceEntityName}
      </p>

      {/* Reasoning */}
      <p className="text-[10px] text-muted-foreground/70 italic mb-3 leading-relaxed">
        {ghost.reasoning}
      </p>

      {/* Actions */}
      {ghost.status === "pending" && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => onVerify(ghost.id)}
          >
            <CheckCircle2 className="h-3 w-3" />
            Verify
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={() => onDismiss(ghost.id)}
          >
            <XCircle className="h-3 w-3" />
            Dismiss
          </Button>
        </div>
      )}

      {ghost.status === "verified" && (
        <Badge className="text-[10px] gap-1 bg-primary/15 text-primary border-primary/30">
          <CheckCircle2 className="h-3 w-3" />
          Verified - needs documentation
        </Badge>
      )}

      {ghost.status === "dismissed" && (
        <Badge variant="outline" className="text-[10px] gap-1 border-[#243645] text-muted-foreground">
          <XCircle className="h-3 w-3" />
          Dismissed
        </Badge>
      )}
    </Card>
  );
}

/** Card for a coverage gap */
function CoverageGapCard({ gap }: { gap: CoverageGap }) {
  const typeColor = ENTITY_COLORS[gap.entityType] || ENTITY_COLORS.Other;
  const fillPct = Math.min(100, (gap.actualCount / gap.expectedMin) * 100);

  return (
    <Card className="border border-[#243645] bg-[#111A21] p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: typeColor }} />
        <span className="text-xs font-medium text-foreground">{gap.entityType}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {gap.actualCount} / {gap.expectedMin}-{gap.expectedMax}
        </span>
      </div>
      <Progress value={fillPct} className="h-1.5 mb-2" />
      <p className="text-[10px] text-muted-foreground leading-relaxed">{gap.description}</p>
    </Card>
  );
}

/** Card for a cross-graph gap */
function CrossGraphGapCard({ gap }: { gap: CrossGraphGap }) {
  return (
    <Card className="border border-[#243645] bg-[#111A21] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Network className="h-3.5 w-3.5 text-[#3B82F6]" />
        <span className="text-xs font-medium text-foreground">{gap.entityType}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">{gap.description}</p>
      <Link href={`/app/knowledge-graph/${gap.sourceGraphId}`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] gap-1 text-[#3B82F6] hover:text-[#3B82F6] hover:bg-[#3B82F6]/10 p-0"
        >
          <ExternalLink className="h-3 w-3" />
          View {gap.sourceGraphName}
        </Button>
      </Link>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Graph Visualization (SVG)
// ---------------------------------------------------------------------------

/**
 * Simplified SVG-based graph visualization showing real and ghost entities.
 * Ghost nodes render with dashed borders at 20% opacity fill and 30% saturation.
 * Ghost edges render with dashed stroke at 15% opacity.
 */
function GhostGraphVisualization({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  return (
    <div className="relative w-full h-full bg-[#0B1014] rounded-lg border border-[#243645] overflow-hidden">
      <svg viewBox="0 0 700 600" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Edges */}
        {edges.map((edge) => {
          const source = nodes.find((n) => n.id === edge.sourceId);
          const target = nodes.find((n) => n.id === edge.targetId);
          if (!source || !target) return null;

          return (
            <g key={edge.id}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edge.isGhost ? "#243645" : "#3A5068"}
                strokeWidth={edge.isGhost ? 1 : 1.5}
                strokeDasharray={edge.isGhost ? "6 3" : "none"}
                opacity={edge.isGhost ? 0.15 : 0.5}
              />
              {/* Edge label */}
              <text
                x={(source.x + target.x) / 2}
                y={(source.y + target.y) / 2 - 6}
                fill={edge.isGhost ? "#8FA2B580" : "#8FA2B5"}
                fontSize={8}
                textAnchor="middle"
                className="pointer-events-none"
              >
                {edge.type}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const color = ENTITY_COLORS[node.entityType] || ENTITY_COLORS.Other;
          const isHovered = hoveredNode === node.id;
          const baseSize = 8 + Math.min(node.connectionCount * 2, 10);
          const nodeSize = isHovered ? baseSize * 1.2 : baseSize;

          return (
            <g
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer"
            >
              {/* Glow ring */}
              {(isHovered || !node.isGhost) && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeSize + 4}
                  fill={color}
                  opacity={isHovered ? 0.2 : node.isGhost ? 0 : 0.08}
                  className="transition-opacity duration-200"
                />
              )}

              {/* Node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeSize}
                fill={node.isGhost ? `${color}33` : `${color}40`}
                stroke={color}
                strokeWidth={node.isGhost ? 1.5 : 2}
                strokeDasharray={node.isGhost ? "4 4" : "none"}
                opacity={node.isGhost ? 0.3 : 1}
                className="transition-all duration-200"
              />

              {/* Inner dot for real nodes */}
              {!node.isGhost && <circle cx={node.x} cy={node.y} r={3} fill={color} />}

              {/* Label */}
              <text
                x={node.x}
                y={node.y + nodeSize + 14}
                fill={node.isGhost ? "#8FA2B566" : "#E7EEF6CC"}
                fontSize={10}
                textAnchor="middle"
                fontStyle={node.isGhost ? "italic" : "normal"}
                className="pointer-events-none select-none"
              >
                {node.name}
              </text>

              {/* Hover tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={node.x + nodeSize + 8}
                    y={node.y - 20}
                    width={140}
                    height={36}
                    rx={6}
                    fill="#111A21"
                    stroke="#243645"
                    strokeWidth={1}
                  />
                  <text
                    x={node.x + nodeSize + 16}
                    y={node.y - 5}
                    fill="#E7EEF6"
                    fontSize={10}
                    fontWeight="500"
                  >
                    {node.name}
                  </text>
                  <text
                    x={node.x + nodeSize + 16}
                    y={node.y + 8}
                    fill="#8FA2B5"
                    fontSize={9}
                  >
                    {node.entityType} {node.isGhost ? "(Ghost)" : ""}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 flex items-center gap-4 px-3 py-2 rounded-lg bg-[#111A21]/90 backdrop-blur-sm border border-[#243645]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-primary/40 border-2 border-primary" />
          <span className="text-[10px] text-muted-foreground">Real Entity</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-full border-[1.5px] opacity-40"
            style={{
              borderColor: "#07A288",
              borderStyle: "dashed",
              backgroundColor: "#07A28833",
            }}
          />
          <span className="text-[10px] text-muted-foreground">Ghost Entity</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

/**
 * Ghost Graph Analysis page.
 *
 * Split view: graph visualization (left, 70%) + ghost inventory (right, 30%).
 * Shows predicted missing entities and relationships, completeness scoring,
 * coverage gaps, and cross-graph gaps. Users can verify or dismiss ghost
 * predictions.
 *
 * Route: /app/knowledge-graph/:id/ghosts
 */
export default function GhostGraphPage() {
  const [, params] = useRoute("/app/knowledge-graph/:id/ghosts");
  const graphId = params?.id;

  // Fetch ghost graph data (placeholder for demo)
  const { data, isLoading } = useQuery<GhostGraphData>({
    queryKey: ["/api/knowledge-graph", graphId, "ghosts"],
    queryFn: async () => {
      // Placeholder: returns demo data. In production, this calls the API.
      return { ...PLACEHOLDER_DATA, knowledgeBaseId: graphId || "kb_001" };
    },
    enabled: !!graphId,
  });

  // Local state for optimistic ghost action UI
  const [ghostStatuses, setGhostStatuses] = useState<
    Record<string, "pending" | "verified" | "dismissed">
  >({});

  const handleVerify = useCallback((id: string) => {
    setGhostStatuses((prev) => ({ ...prev, [id]: "verified" }));
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setGhostStatuses((prev) => ({ ...prev, [id]: "dismissed" }));
  }, []);

  // Merge local statuses with server data
  const ghosts = useMemo(() => {
    if (!data) return [];
    return data.ghosts.map((g) => ({
      ...g,
      status: ghostStatuses[g.id] || g.status,
    }));
  }, [data, ghostStatuses]);

  const pendingCount = ghosts.filter((g) => g.status === "pending").length;
  const verifiedCount = ghosts.filter((g) => g.status === "verified").length;

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]" data-testid="ghost-graph-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/app/knowledge-graph/${graphId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back to Graph
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Ghost className="h-5 w-5 text-primary" />
              Ghost Graph Analysis
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.knowledgeBaseName} — Predicted missing entities and relationships
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1 border-[#243645]">
            <Eye className="h-3 w-3" />
            {pendingCount} pending
          </Badge>
          <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
            <CheckCircle2 className="h-3 w-3" />
            {verifiedCount} verified
          </Badge>
        </div>
      </div>

      {/* Split view */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Graph Visualization (70%) */}
        <div className="w-[70%] shrink-0">
          <GhostGraphVisualization nodes={data.nodes} edges={data.edges} />
        </div>

        {/* Right: Ghost Inventory (30%) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Ghost Score donut */}
          <Card className="border border-[#243645] bg-[#111A21] p-4 mb-4 shrink-0">
            <div className="flex items-center gap-4">
              <CompletenessDonut score={data.completenessScore} size={100} />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground mb-1">Ghost Score</h3>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {data.totalRealEntities} real entities / {data.totalGhostEntities} high-confidence
                  ghosts
                </p>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <CompleteSpark values={data.completenessHistory} width={80} height={20} />
                  <span className="text-[10px] text-muted-foreground">Last 5 batches</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Tabbed inventory */}
          <Tabs defaultValue="patterns" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full justify-start bg-[#111A21] border border-[#243645] shrink-0">
              <TabsTrigger value="patterns" className="text-xs gap-1">
                <ShieldQuestion className="h-3 w-3" />
                Patterns ({ghosts.length})
              </TabsTrigger>
              <TabsTrigger value="coverage" className="text-xs gap-1">
                <Layers className="h-3 w-3" />
                Coverage ({data.coverageGaps.length})
              </TabsTrigger>
              <TabsTrigger value="cross-graph" className="text-xs gap-1">
                <Network className="h-3 w-3" />
                Cross-Graph ({data.crossGraphGaps.length})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-3">
              {/* Pattern Completion Ghosts */}
              <TabsContent value="patterns" className="mt-0 space-y-3 pr-2">
                {ghosts.map((ghost) => (
                  <GhostCard
                    key={ghost.id}
                    ghost={ghost}
                    onVerify={handleVerify}
                    onDismiss={handleDismiss}
                  />
                ))}
                {ghosts.length === 0 && (
                  <div className="text-center py-8">
                    <Ghost className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No pattern completion ghosts detected.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Coverage Gaps */}
              <TabsContent value="coverage" className="mt-0 space-y-3 pr-2">
                {data.coverageGaps.map((gap) => (
                  <CoverageGapCard key={gap.id} gap={gap} />
                ))}
                {data.coverageGaps.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No coverage gaps detected. Entity type distribution looks healthy.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Cross-Graph Gaps */}
              <TabsContent value="cross-graph" className="mt-0 space-y-3 pr-2">
                {data.crossGraphGaps.map((gap) => (
                  <CrossGraphGapCard key={gap.id} gap={gap} />
                ))}
                {data.crossGraphGaps.length === 0 && (
                  <div className="text-center py-8">
                    <Network className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No cross-graph gaps detected. This graph is not part of a federation.
                    </p>
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
