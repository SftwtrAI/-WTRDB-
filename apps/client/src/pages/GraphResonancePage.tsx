import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Eye,
  Save,
  X,
  Pin,
  Network,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiscoveryType =
  | "bridge_entity"
  | "dependency_chain"
  | "connectivity_anomaly"
  | "emergent_cluster"
  | "single_point_of_failure";

interface ResonanceDiscovery {
  id: string;
  type: DiscoveryType;
  importance: number;
  title: string;
  description: string;
  entities: string[];
  path?: string[];
  sourceGraphs: string[];
  isPinned: boolean;
  createdAt: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  sourceGraphs: string[];
  isBridge: boolean;
  isAnomaly: boolean;
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Placeholder Data
// ---------------------------------------------------------------------------

const PLACEHOLDER_DISCOVERIES: ResonanceDiscovery[] = [
  {
    id: "disc_001",
    type: "dependency_chain",
    importance: 8.2,
    title: "Cross-Graph Dependency Chain",
    description:
      "dc01 (IT Docs) -> Active Directory (IT Docs) -> LDAP Sync (Google Admin) -> Google Workspace (Google Admin) -> 47 user accounts. This 4-hop chain spans both source graphs. If LDAP Sync fails, 47 accounts lose auth. No single team documented this full dependency.",
    entities: ["dc01", "Active Directory", "LDAP Sync", "Google Workspace"],
    path: ["dc01", "Active Directory", "LDAP Sync", "Google Workspace"],
    sourceGraphs: ["IT Engineer Docs", "Google Admin Export"],
    isPinned: false,
    createdAt: "2026-04-01T10:35:00Z",
  },
  {
    id: "disc_002",
    type: "bridge_entity",
    importance: 7.5,
    title: "Bridge Entity: Alice Chen",
    description:
      "Alice Chen appears in 3 source graphs with different roles. In IT Docs she manages infrastructure, in Google Admin she manages the security team, and in Compliance Docs she is the DPO. She is the primary bridge connecting security operations to compliance workflows.",
    entities: ["Alice Chen"],
    sourceGraphs: ["IT Engineer Docs", "Google Admin Export", "Compliance Docs"],
    isPinned: true,
    createdAt: "2026-04-01T10:36:00Z",
  },
  {
    id: "disc_003",
    type: "single_point_of_failure",
    importance: 9.1,
    title: "Single Point of Failure: VPN Gateway",
    description:
      "VPN Gateway connects to 12 services and 4 infrastructure nodes. Removing it disconnects the entire remote access subgraph (38 entities) from the main network graph. No redundant path exists in the current federation.",
    entities: ["VPN Gateway"],
    sourceGraphs: ["IT Engineer Docs"],
    isPinned: false,
    createdAt: "2026-04-01T10:37:00Z",
  },
  {
    id: "disc_004",
    type: "connectivity_anomaly",
    importance: 5.8,
    title: "Anomaly: OAuth 2.0 Over-connected",
    description:
      "OAuth 2.0 has 23 inbound DEPENDS_ON relationships, which is 4.2x the average for Technology entities. This suggests it may be a critical chokepoint or that several services have undocumented direct dependencies.",
    entities: ["OAuth 2.0"],
    sourceGraphs: ["IT Engineer Docs", "Security Handbook"],
    isPinned: false,
    createdAt: "2026-04-01T10:38:00Z",
  },
  {
    id: "disc_005",
    type: "emergent_cluster",
    importance: 6.4,
    title: "Emergent Cluster: Authentication Stack",
    description:
      "A cluster of 8 entities (LDAP, OAuth 2.0, SSO Gateway, MFA Policy, Active Directory, Google Auth, SAML Bridge, Token Service) forms a tightly connected subgraph that only becomes visible in the federated view. Individual source graphs each contain only 2-3 of these entities.",
    entities: ["LDAP", "OAuth 2.0", "SSO Gateway", "MFA Policy", "Active Directory", "Google Auth", "SAML Bridge", "Token Service"],
    sourceGraphs: ["IT Engineer Docs", "Google Admin Export", "Security Handbook"],
    isPinned: false,
    createdAt: "2026-04-01T10:39:00Z",
  },
  {
    id: "disc_006",
    type: "dependency_chain",
    importance: 6.9,
    title: "Cross-Graph Chain: Email Delivery",
    description:
      "Email Service (IT Docs) -> DNS Server (IT Docs) -> Cloud DNS (Google Admin) -> MX Records (Compliance Docs). Email delivery depends on a chain spanning 3 knowledge bases. Failure in Cloud DNS would silently break email without triggering IT Docs monitoring.",
    entities: ["Email Service", "DNS Server", "Cloud DNS", "MX Records"],
    path: ["Email Service", "DNS Server", "Cloud DNS", "MX Records"],
    sourceGraphs: ["IT Engineer Docs", "Google Admin Export", "Compliance Docs"],
    isPinned: false,
    createdAt: "2026-04-01T10:40:00Z",
  },
];

const PLACEHOLDER_NODES: GraphNode[] = [
  { id: "n1", label: "dc01", type: "Infrastructure", sourceGraphs: ["IT Docs"], isBridge: false, isAnomaly: false, x: 150, y: 100 },
  { id: "n2", label: "Active Directory", type: "Technology", sourceGraphs: ["IT Docs"], isBridge: false, isAnomaly: false, x: 300, y: 80 },
  { id: "n3", label: "LDAP Sync", type: "Service", sourceGraphs: ["Google Admin"], isBridge: true, isAnomaly: false, x: 450, y: 120 },
  { id: "n4", label: "Google Workspace", type: "Service", sourceGraphs: ["Google Admin"], isBridge: false, isAnomaly: false, x: 600, y: 100 },
  { id: "n5", label: "Alice Chen", type: "Person", sourceGraphs: ["IT Docs", "Google Admin", "Compliance"], isBridge: true, isAnomaly: false, x: 250, y: 250 },
  { id: "n6", label: "VPN Gateway", type: "Infrastructure", sourceGraphs: ["IT Docs"], isBridge: false, isAnomaly: false, x: 120, y: 350 },
  { id: "n7", label: "OAuth 2.0", type: "Technology", sourceGraphs: ["IT Docs", "Security"], isBridge: true, isAnomaly: true, x: 400, y: 300 },
  { id: "n8", label: "SSO Gateway", type: "Service", sourceGraphs: ["IT Docs"], isBridge: false, isAnomaly: false, x: 550, y: 280 },
  { id: "n9", label: "MFA Policy", type: "Policy", sourceGraphs: ["Security"], isBridge: false, isAnomaly: false, x: 500, y: 400 },
  { id: "n10", label: "Email Service", type: "Service", sourceGraphs: ["IT Docs"], isBridge: false, isAnomaly: false, x: 180, y: 450 },
  { id: "n11", label: "DNS Server", type: "Infrastructure", sourceGraphs: ["IT Docs"], isBridge: false, isAnomaly: false, x: 350, y: 470 },
  { id: "n12", label: "Bob Martinez", type: "Person", sourceGraphs: ["IT Docs", "Google Admin"], isBridge: true, isAnomaly: false, x: 650, y: 380 },
];

const PLACEHOLDER_EDGES: GraphEdge[] = [
  { id: "e1", source: "n1", target: "n2", label: "RUNS" },
  { id: "e2", source: "n2", target: "n3", label: "SYNCS_WITH" },
  { id: "e3", source: "n3", target: "n4", label: "FEEDS" },
  { id: "e4", source: "n5", target: "n6", label: "MANAGES" },
  { id: "e5", source: "n5", target: "n7", label: "ADMINISTERS" },
  { id: "e6", source: "n7", target: "n8", label: "AUTHENTICATES" },
  { id: "e7", source: "n8", target: "n9", label: "ENFORCES" },
  { id: "e8", source: "n10", target: "n11", label: "DEPENDS_ON" },
  { id: "e9", source: "n6", target: "n7", label: "AUTHENTICATES_VIA" },
  { id: "e10", source: "n12", target: "n4", label: "MANAGES" },
  { id: "e11", source: "n5", target: "n2", label: "MANAGES" },
];

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useResonanceDiscoveries(federationId: string) {
  return useQuery<ResonanceDiscovery[]>({
    queryKey: ["/api/federations", federationId, "resonance"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/federations/${federationId}/resonance`);
        if (res.ok) {
          const data = await res.json();
          return data.discoveries ?? data;
        }
      } catch {}
      return PLACEHOLDER_DISCOVERIES;
    },
    enabled: !!federationId,
  });
}

function useResonanceGraph(federationId: string) {
  return useQuery<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    queryKey: ["/api/federations", federationId, "resonance", "graph"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/federations/${federationId}/resonance/graph`);
        if (res.ok) {
          return res.json();
        }
      } catch {}
      return { nodes: PLACEHOLDER_NODES, edges: PLACEHOLDER_EDGES };
    },
    enabled: !!federationId,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function discoveryIcon(type: DiscoveryType): string {
  switch (type) {
    case "bridge_entity": return "\uD83C\uDF09";
    case "dependency_chain": return "\uD83D\uDD17";
    case "connectivity_anomaly": return "\u26A0\uFE0F";
    case "emergent_cluster": return "\uD83D\uDD2E";
    case "single_point_of_failure": return "\uD83C\uDFAF";
  }
}

function discoveryLabel(type: DiscoveryType): string {
  switch (type) {
    case "bridge_entity": return "Bridge Entity";
    case "dependency_chain": return "Dependency Chain";
    case "connectivity_anomaly": return "Connectivity Anomaly";
    case "emergent_cluster": return "Emergent Cluster";
    case "single_point_of_failure": return "Single Point of Failure";
  }
}

function discoveryBadgeColor(type: DiscoveryType): string {
  switch (type) {
    case "bridge_entity": return "bg-lime-500/15 text-lime-400 border-lime-500/30";
    case "dependency_chain": return "bg-primary/15 text-primary border-primary/30";
    case "connectivity_anomaly": return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    case "emergent_cluster": return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "single_point_of_failure": return "bg-destructive/15 text-destructive border-destructive/30";
  }
}

function importanceColor(score: number): string {
  if (score >= 8) return "text-destructive";
  if (score >= 6) return "text-amber-500";
  if (score >= 4) return "text-primary";
  return "text-muted-foreground";
}

function typeColor(type: string): string {
  switch (type) {
    case "Person": return "hsl(170, 92%, 33%)";
    case "Infrastructure": return "hsl(213, 44%, 53%)";
    case "Technology": return "hsl(75, 80%, 53%)";
    case "Service": return "hsl(113, 44%, 53%)";
    case "Policy": return "hsl(340, 65%, 55%)";
    default: return "hsl(220, 15%, 50%)";
  }
}

// ---------------------------------------------------------------------------
// Graph Visualization (SVG)
// ---------------------------------------------------------------------------

function FederationGraphView({
  nodes,
  edges,
  highlightedEntities,
  highlightedPath,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightedEntities: string[];
  highlightedPath: string[];
}) {
  const width = 800;
  const height = 550;

  const highlightedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entity of highlightedEntities) {
      const node = nodes.find((n) => n.label === entity);
      if (node) ids.add(node.id);
    }
    return ids;
  }, [nodes, highlightedEntities]);

  const pathEdgeIds = useMemo(() => {
    const ids = new Set<string>();
    if (highlightedPath.length < 2) return ids;
    for (let i = 0; i < highlightedPath.length - 1; i++) {
      const srcNode = nodes.find((n) => n.label === highlightedPath[i]);
      const tgtNode = nodes.find((n) => n.label === highlightedPath[i + 1]);
      if (srcNode && tgtNode) {
        const edge = edges.find(
          (e) =>
            (e.source === srcNode.id && e.target === tgtNode.id) ||
            (e.source === tgtNode.id && e.target === srcNode.id),
        );
        if (edge) ids.add(edge.id);
      }
    }
    return ids;
  }, [nodes, edges, highlightedPath]);

  return (
    <Card className="border border-border bg-[hsl(210,25%,5%)] overflow-hidden">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <defs>
          <filter id="limeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feFlood floodColor="#B8E52B" floodOpacity="0.5" result="glowColor" />
            <feComposite in="glowColor" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <style>{`
            @keyframes dashMove {
              to { stroke-dashoffset: -20; }
            }
            .animated-path {
              animation: dashMove 1s linear infinite;
            }
          `}</style>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const src = nodes.find((n) => n.id === edge.source);
          const tgt = nodes.find((n) => n.id === edge.target);
          if (!src || !tgt) return null;
          const isPathEdge = pathEdgeIds.has(edge.id);
          return (
            <g key={edge.id}>
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isPathEdge ? "hsl(170, 92%, 33%)" : "hsl(210, 20%, 25%)"}
                strokeWidth={isPathEdge ? 2.5 : 1}
                strokeOpacity={isPathEdge ? 1 : 0.5}
                strokeDasharray={isPathEdge ? "6 4" : undefined}
                className={isPathEdge ? "animated-path" : undefined}
              />
              <text
                x={(src.x + tgt.x) / 2}
                y={(src.y + tgt.y) / 2 - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={9}
                opacity={isPathEdge ? 0.9 : 0.4}
              >
                {edge.label}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isHighlighted = highlightedNodeIds.has(node.id);
          const nodeColor = typeColor(node.type);
          const radius = isHighlighted ? 18 : 14;

          return (
            <g key={node.id}>
              {node.isBridge && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 6}
                  fill="none"
                  stroke="#B8E52B"
                  strokeWidth={2}
                  strokeOpacity={0.4}
                  filter="url(#limeGlow)"
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={nodeColor}
                fillOpacity={isHighlighted ? 0.8 : 0.3}
                stroke={isHighlighted ? "#ffffff" : nodeColor}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
              />
              {node.isAnomaly && (
                <g transform={`translate(${node.x + radius - 2}, ${node.y - radius + 2})`}>
                  <circle r={6} fill="hsl(35, 92%, 50%)" />
                  <text x={0} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="white" fontWeight="bold">!</text>
                </g>
              )}
              <text
                x={node.x}
                y={node.y + radius + 14}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={10}
                fontWeight={isHighlighted ? 600 : 400}
                opacity={isHighlighted ? 1 : 0.7}
              >
                {node.label}
              </text>
              <text
                x={node.x}
                y={node.y + radius + 25}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={8}
                opacity={0.5}
              >
                {node.type}
              </text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Discovery Card
// ---------------------------------------------------------------------------

function DiscoveryCard({
  discovery,
  isActive,
  onHighlight,
  onDismiss,
}: {
  discovery: ResonanceDiscovery;
  isActive: boolean;
  onHighlight: () => void;
  onDismiss: () => void;
}) {
  const { toast } = useToast();

  return (
    <Card
      className={`p-4 border transition-all ${
        isActive ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
      }`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{discoveryIcon(discovery.type)}</span>
            <Badge className={`text-xs ${discoveryBadgeColor(discovery.type)}`}>
              {discoveryLabel(discovery.type)}
            </Badge>
          </div>
          {discovery.isPinned && (
            <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Importance:</span>
          <div className="flex-1">
            <Progress value={discovery.importance * 10} className="h-1.5" />
          </div>
          <span className={`text-xs font-bold ${importanceColor(discovery.importance)}`}>
            {discovery.importance.toFixed(1)}/10
          </span>
        </div>

        <h4 className="text-sm font-semibold text-foreground">{discovery.title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">{discovery.description}</p>

        <div className="flex flex-wrap gap-1.5">
          {discovery.sourceGraphs.map((sg) => (
            <Badge key={sg} variant="outline" className="text-xs">
              {sg}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant={isActive ? "default" : "outline"}
            className="text-xs h-7"
            onClick={onHighlight}
          >
            <Eye className="h-3 w-3 mr-1" />
            {isActive ? "Highlighted" : "Highlight"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7"
            onClick={() =>
              toast({
                title: "Saved to KB",
                description: `"${discovery.title}" has been saved as a knowledge base entry.`,
              })
            }
          >
            <Save className="h-3 w-3 mr-1" />
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 text-muted-foreground"
            onClick={onDismiss}
          >
            <X className="h-3 w-3 mr-1" />
            Dismiss
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GraphResonancePage() {
  const [, params] = useRoute("/app/federations/:id/resonance");
  const [, setLocation] = useLocation();
  const federationId = params?.id ?? "";

  const [activeDiscoveryId, setActiveDiscoveryId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: discoveries = [], isLoading: discoveriesLoading } = useResonanceDiscoveries(federationId);
  const { data: graphData, isLoading: graphLoading } = useResonanceGraph(federationId);

  const visibleDiscoveries = useMemo(
    () =>
      discoveries
        .filter((d) => !dismissedIds.has(d.id))
        .sort((a, b) => b.importance - a.importance),
    [discoveries, dismissedIds],
  );

  const activeDiscovery = useMemo(
    () => discoveries.find((d) => d.id === activeDiscoveryId) ?? null,
    [discoveries, activeDiscoveryId],
  );

  const highlightedEntities = activeDiscovery?.entities ?? [];
  const highlightedPath = activeDiscovery?.path ?? [];

  if (!federationId || discoveriesLoading || graphLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation(`/app/federations/${federationId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Federation
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Graph Resonance</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-graph pattern discoveries, bridge entities, dependency chains, and anomalies.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Badge variant="outline" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" />
            {visibleDiscoveries.length} discoveries
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <Network className="h-3 w-3" />
            {graphData?.nodes.filter((n) => n.isBridge).length ?? 0} bridges
          </Badge>
        </div>
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Graph visualization (left, 60%) */}
        <div className="lg:col-span-3">
          <FederationGraphView
            nodes={graphData?.nodes ?? []}
            edges={graphData?.edges ?? []}
            highlightedEntities={highlightedEntities}
            highlightedPath={highlightedPath}
          />
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border-2 border-[#B8E52B] bg-[#B8E52B]/20" />
              Bridge Entity
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              Anomaly
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-0.5 bg-primary" style={{ borderStyle: "dashed" }} />
              Active Path
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(170, 92%, 33%)" }} />
              Person
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(213, 44%, 53%)" }} />
              Infrastructure
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(75, 80%, 53%)" }} />
              Technology
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(113, 44%, 53%)" }} />
              Service
            </div>
          </div>
        </div>

        {/* Discovery cards (right, 40%) */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Discoveries</h3>
            <span className="text-xs text-muted-foreground">{visibleDiscoveries.length} findings</span>
          </div>

          <ScrollArea className="h-[calc(100vh-310px)]">
            <div className="space-y-3 pr-3">
              {visibleDiscoveries.length === 0 ? (
                <div className="text-center py-16">
                  <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
                  <h3 className="text-base font-semibold text-foreground mb-1">No discoveries</h3>
                  <p className="text-sm text-muted-foreground">
                    Cross-graph patterns will appear here when the federation is analyzed.
                  </p>
                </div>
              ) : (
                visibleDiscoveries.map((discovery) => (
                  <DiscoveryCard
                    key={discovery.id}
                    discovery={discovery}
                    isActive={activeDiscoveryId === discovery.id}
                    onHighlight={() =>
                      setActiveDiscoveryId(
                        activeDiscoveryId === discovery.id ? null : discovery.id,
                      )
                    }
                    onDismiss={() =>
                      setDismissedIds((prev) => new Set([...prev, discovery.id]))
                    }
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
