import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  useViewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { GraphNode, ENTITY_COLORS, type GraphNodeData } from "@/components/knowledge-graph/GraphNode";
import { GraphEdge, type GraphEdgeData } from "@/components/knowledge-graph/GraphEdge";
import { GraphControls, type LayoutType } from "@/components/knowledge-graph/GraphControls";
import { GraphLegend } from "@/components/knowledge-graph/GraphLegend";
import { GraphSidebar } from "@/components/knowledge-graph/GraphSidebar";
import { GenerationHalo } from "@/components/knowledge-graph/cinematic/GenerationHalo";
import { GraphEmptyStates } from "@/components/knowledge-graph/GraphEmptyStates";
import { GraphStatsBar } from "@/components/knowledge-graph/GraphStatsBar";
import { GraphQueryPanel } from "@/components/knowledge-graph/GraphQueryPanel";
import { GraphEntityModal } from "@/components/knowledge-graph/GraphEntityModal";
import {
  GraphNodeContextMenu,
  type ContextMenuPosition,
} from "@/components/knowledge-graph/GraphNodeContextMenu";
import { useGraphKeyboardShortcuts } from "@/hooks/useGraphKeyboardShortcuts";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useExtractionEvents } from "@/hooks/useExtractionEvents";
import {
  Loader2,
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Rotate3d,
  Film,
} from "lucide-react";

// --- Types ---

interface GraphEntity {
  id: string;
  label: string;
  name: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
  sourceChunkIndex: number;
}

interface GraphRelationship {
  id: string;
  type: string;
  sourceEntityId: string;
  targetEntityId: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
}

interface KnowledgeGraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: "pending" | "extracting" | "completed" | "failed";
  lastUpdated: string;
  extractedChunks?: number;
  totalChunks?: number;
}

function ExtractionProgressOverlay({
  knowledgeBaseId,
  extractedChunks,
  totalChunks,
  entityCount,
  relationshipCount,
  status,
}: {
  knowledgeBaseId: string;
  extractedChunks: number;
  totalChunks: number;
  entityCount: number;
  relationshipCount: number;
  status: string;
}) {
  const { latestEvent } = useExtractionEvents({ knowledgeBaseId });
  const pct = totalChunks > 0 ? Math.round((extractedChunks / totalChunks) * 100) : 0;
  const label =
    totalChunks > 0
      ? `Chunk ${extractedChunks} of ${totalChunks}`
      : status === "pending"
      ? "Queued…"
      : "Starting…";
  return (
    <div
      data-testid="kg-progress-overlay"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(460px,90vw)] rounded-xl border border-[#243645] bg-[#0B1014]/90 backdrop-blur-md p-4 shadow-lg"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-[#07A288]">
          Extracting knowledge graph
        </span>
        <span className="text-xs text-gray-400">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
        <span>{label}</span>
        <span>
          {entityCount} entities · {relationshipCount} relationships
        </span>
      </div>
      {latestEvent?.entityName && (
        <div className="mt-2 text-xs text-gray-500 truncate">
          Latest: <span className="text-gray-300">{latestEvent.entityName}</span>
        </div>
      )}
    </div>
  );
}

// --- Depth-filtering helper ---

/**
 * Compute the set of entity IDs reachable within `maxDepth` hops from a
 * seed node.  Uses BFS over the adjacency list built from all relationships.
 */
function computeReachableIds(
  seedId: string,
  allRelationships: GraphRelationship[],
  maxDepth: number,
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const r of allRelationships) {
    if (!adj.has(r.sourceEntityId)) adj.set(r.sourceEntityId, []);
    if (!adj.has(r.targetEntityId)) adj.set(r.targetEntityId, []);
    adj.get(r.sourceEntityId)!.push(r.targetEntityId);
    adj.get(r.targetEntityId)!.push(r.sourceEntityId);
  }
  const visited = new Set<string>([seedId]);
  let frontier = [seedId];
  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adj.get(id) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

/**
 * Find the hub node (most connected) -- used as default seed for depth
 * filtering when no node is selected.
 */
function findHubNodeId(
  entities: GraphEntity[],
  relationships: GraphRelationship[],
): string | null {
  if (entities.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of relationships) {
    counts.set(r.sourceEntityId, (counts.get(r.sourceEntityId) || 0) + 1);
    counts.set(r.targetEntityId, (counts.get(r.targetEntityId) || 0) + 1);
  }
  let hubId = entities[0].id;
  let max = 0;
  counts.forEach((c, id) => {
    if (c > max) {
      max = c;
      hubId = id;
    }
  });
  return hubId;
}

// --- Layout algorithms ---

function computeCircleLayout(nodes: Node[], _edges: Edge[]): Node[] {
  const count = nodes.length;
  if (count === 0) return nodes;
  if (count === 1) {
    return [{ ...nodes[0], position: { x: 400, y: 400 } }];
  }
  const radius = Math.max(300, count * 30);
  return nodes.map((node, i) => ({
    ...node,
    position: {
      x: Math.cos((2 * Math.PI * i) / count) * radius + radius + 100,
      y: Math.sin((2 * Math.PI * i) / count) * radius + radius + 100,
    },
  }));
}

function computeRadialLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const connectionCounts = new Map<string, number>();
  edges.forEach((e) => {
    connectionCounts.set(e.source, (connectionCounts.get(e.source) || 0) + 1);
    connectionCounts.set(e.target, (connectionCounts.get(e.target) || 0) + 1);
  });

  let centerId = nodes[0].id;
  let maxConnections = 0;
  connectionCounts.forEach((count, id) => {
    if (count > maxConnections) {
      maxConnections = count;
      centerId = id;
    }
  });

  const centerX = 600;
  const centerY = 500;
  const positioned = new Map<string, { x: number; y: number }>();
  positioned.set(centerId, { x: centerX, y: centerY });

  const visited = new Set<string>([centerId]);
  const queue: string[] = [centerId];
  let ring = 1;

  const adjacency = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source)!.push(e.target);
    adjacency.get(e.target)!.push(e.source);
  });

  while (queue.length > 0) {
    const ringNodes: string[] = [];
    const currentQueueLength = queue.length;
    for (let i = 0; i < currentQueueLength; i++) {
      const nodeId = queue.shift()!;
      const neighbors = adjacency.get(nodeId) || [];
      neighbors.forEach((n) => {
        if (!visited.has(n)) {
          visited.add(n);
          ringNodes.push(n);
          queue.push(n);
        }
      });
    }

    if (ringNodes.length > 0) {
      const r = ring * 180;
      ringNodes.forEach((nodeId, idx) => {
        const angle = (2 * Math.PI * idx) / ringNodes.length;
        positioned.set(nodeId, {
          x: centerX + Math.cos(angle) * r,
          y: centerY + Math.sin(angle) * r,
        });
      });
      ring++;
    }
  }

  const unplaced = nodes.filter((n) => !positioned.has(n.id));
  if (unplaced.length > 0) {
    const outerR = ring * 180;
    unplaced.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / unplaced.length;
      positioned.set(node.id, {
        x: centerX + Math.cos(angle) * outerR,
        y: centerY + Math.sin(angle) * outerR,
      });
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || { x: centerX, y: centerY },
  }));
}

function computeHierarchicalLayout(nodes: Node[], _edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const typeGroups = new Map<string, string[]>();
  nodes.forEach((node) => {
    const data = node.data as unknown as GraphNodeData;
    const type = data.entityType || "Other";
    if (!typeGroups.has(type)) typeGroups.set(type, []);
    typeGroups.get(type)!.push(node.id);
  });

  const positioned = new Map<string, { x: number; y: number }>();
  let layerY = 80;
  const horizontalSpacing = 200;
  const verticalSpacing = 200;

  typeGroups.forEach((ids) => {
    const totalWidth = (ids.length - 1) * horizontalSpacing;
    const startX = Math.max(100, 600 - totalWidth / 2);
    ids.forEach((id, idx) => {
      positioned.set(id, {
        x: startX + idx * horizontalSpacing,
        y: layerY,
      });
    });
    layerY += verticalSpacing;
  });

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || { x: 400, y: 400 },
  }));
}

/**
 * Synchronous force layout (used for small graphs or as a fallback).
 */
function computeForceLayoutSync(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const positions = new Map<string, { x: number; y: number }>();
  const count = nodes.length;
  const radius = Math.max(300, count * 25);

  nodes.forEach((node, i) => {
    positions.set(node.id, {
      x: Math.cos((2 * Math.PI * i) / count) * radius + radius + 100,
      y: Math.sin((2 * Math.PI * i) / count) * radius + radius + 100,
    });
  });

  const repulsionStrength = 50000;
  const attractionStrength = 0.01;
  const damping = 0.85;

  const velocities = new Map<string, { vx: number; vy: number }>();
  nodes.forEach((n) => velocities.set(n.id, { vx: 0, vy: 0 }));

  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 1;
        const dist = Math.sqrt(distSq);
        const force = repulsionStrength / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        const va = velocities.get(nodes[i].id)!;
        const vb = velocities.get(nodes[j].id)!;
        va.vx += fx;
        va.vy += fy;
        vb.vx -= fx;
        vb.vy -= fy;
      }
    }

    edges.forEach((edge) => {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const force = dist * attractionStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      const va = velocities.get(edge.source);
      const vb = velocities.get(edge.target);
      if (va) { va.vx += fx; va.vy += fy; }
      if (vb) { vb.vx -= fx; vb.vy -= fy; }
    });

    nodes.forEach((node) => {
      const pos = positions.get(node.id)!;
      const vel = velocities.get(node.id)!;
      pos.x += vel.vx;
      pos.y += vel.vy;
      vel.vx *= damping;
      vel.vy *= damping;
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) || { x: 400, y: 400 },
  }));
}

/**
 * Async non-blocking force layout: runs 10 iterations per macrotask to
 * avoid freezing the UI on large graphs.
 */
function computeForceLayoutAsync(
  nodes: Node[],
  edges: Edge[],
): Promise<Node[]> {
  return new Promise((resolve) => {
    if (nodes.length === 0) { resolve(nodes); return; }

    const positions = new Map<string, { x: number; y: number }>();
    const count = nodes.length;
    const radius = Math.max(300, count * 25);

    nodes.forEach((node, i) => {
      positions.set(node.id, {
        x: Math.cos((2 * Math.PI * i) / count) * radius + radius + 100,
        y: Math.sin((2 * Math.PI * i) / count) * radius + radius + 100,
      });
    });

    const TOTAL_ITERATIONS = 80;
    const CHUNK_SIZE = 10;
    const repulsionStrength = 50000;
    const attractionStrength = 0.01;
    const damping = 0.85;

    const velocities = new Map<string, { vx: number; vy: number }>();
    nodes.forEach((n) => velocities.set(n.id, { vx: 0, vy: 0 }));

    let currentIter = 0;

    function runChunk() {
      const end = Math.min(currentIter + CHUNK_SIZE, TOTAL_ITERATIONS);
      for (let iter = currentIter; iter < end; iter++) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = positions.get(nodes[i].id)!;
            const b = positions.get(nodes[j].id)!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distSq = dx * dx + dy * dy + 1;
            const dist = Math.sqrt(distSq);
            const force = repulsionStrength / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            const va = velocities.get(nodes[i].id)!;
            const vb = velocities.get(nodes[j].id)!;
            va.vx += fx;
            va.vy += fy;
            vb.vx -= fx;
            vb.vy -= fy;
          }
        }

        edges.forEach((edge) => {
          const a = positions.get(edge.source);
          const b = positions.get(edge.target);
          if (!a || !b) return;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const force = dist * attractionStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          const va = velocities.get(edge.source);
          const vb = velocities.get(edge.target);
          if (va) { va.vx += fx; va.vy += fy; }
          if (vb) { vb.vx -= fx; vb.vy -= fy; }
        });

        nodes.forEach((node) => {
          const pos = positions.get(node.id)!;
          const vel = velocities.get(node.id)!;
          pos.x += vel.vx;
          pos.y += vel.vy;
          vel.vx *= damping;
          vel.vy *= damping;
        });
      }

      currentIter = end;

      if (currentIter < TOTAL_ITERATIONS) {
        setTimeout(runChunk, 0);
      } else {
        resolve(
          nodes.map((node) => ({
            ...node,
            position: positions.get(node.id) || { x: 400, y: 400 },
          })),
        );
      }
    }

    setTimeout(runChunk, 0);
  });
}

/**
 * Cluster layout: groups entities by entityType and arranges each group
 * in a separate region with a grid pattern inside.
 */
function computeClusterLayout(nodes: Node[], _edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const groups = new Map<string, Node[]>();
  nodes.forEach((node) => {
    const data = node.data as unknown as GraphNodeData;
    const type = data.entityType || "Other";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(node);
  });

  const positioned = new Map<string, { x: number; y: number }>();
  const groupKeys = Array.from(groups.keys()).sort();
  const clusterPadding = 100;
  const nodeSpacing = 180;

  const clustersPerRow = Math.ceil(Math.sqrt(groupKeys.length));
  let clusterIndex = 0;

  for (const type of groupKeys) {
    const clusterNodes = groups.get(type)!;
    const clusterRow = Math.floor(clusterIndex / clustersPerRow);
    const clusterCol = clusterIndex % clustersPerRow;

    const nodesPerRow = Math.ceil(Math.sqrt(clusterNodes.length));
    const clusterWidth = nodesPerRow * nodeSpacing + clusterPadding * 2;
    const clusterHeight =
      Math.ceil(clusterNodes.length / nodesPerRow) * nodeSpacing +
      clusterPadding * 2;

    const baseX = clusterCol * (clusterWidth + clusterPadding);
    const baseY = clusterRow * (clusterHeight + clusterPadding);

    clusterNodes.forEach((node, idx) => {
      const col = idx % nodesPerRow;
      const row = Math.floor(idx / nodesPerRow);
      positioned.set(node.id, {
        x: baseX + clusterPadding + col * nodeSpacing,
        y: baseY + clusterPadding + row * nodeSpacing,
      });
    });

    clusterIndex++;
  }

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || { x: 400, y: 400 },
  }));
}

// --- Edge label collision helper ---

function computeEdgeLabelOffsets(
  edges: Edge[],
  nodes: Node[],
): Map<string, number> {
  const offsets = new Map<string, number>();
  if (edges.length === 0) return offsets;

  const posMap = new Map<string, { x: number; y: number }>();
  nodes.forEach((n) => posMap.set(n.id, n.position));

  const midpoints: { id: string; mx: number; my: number }[] = [];
  edges.forEach((e) => {
    const s = posMap.get(e.source);
    const t = posMap.get(e.target);
    if (s && t) {
      midpoints.push({ id: e.id, mx: (s.x + t.x) / 2, my: (s.y + t.y) / 2 });
    }
  });

  midpoints.sort((a, b) => a.mx - b.mx);

  const THRESHOLD = 40;
  const SHIFT = 20;

  for (let i = 0; i < midpoints.length; i++) {
    let currentOffset = 0;
    for (let j = 0; j < i; j++) {
      const dx = Math.abs(midpoints[i].mx - midpoints[j].mx);
      if (dx > THRESHOLD) continue;
      const dy = Math.abs(midpoints[i].my - midpoints[j].my);
      if (dy < THRESHOLD) {
        currentOffset += SHIFT;
      }
    }
    if (currentOffset !== 0) {
      offsets.set(midpoints[i].id, currentOffset);
    }
  }

  return offsets;
}

// --- Animated position interpolation ---

function interpolatePositions(
  from: Map<string, { x: number; y: number }>,
  to: Map<string, { x: number; y: number }>,
  t: number,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  to.forEach((toPos, id) => {
    const fromPos = from.get(id);
    if (fromPos) {
      result.set(id, {
        x: fromPos.x + (toPos.x - fromPos.x) * t,
        y: fromPos.y + (toPos.y - fromPos.y) * t,
      });
    } else {
      result.set(id, toPos);
    }
  });
  return result;
}

// --- Custom Node/Edge types ---

const nodeTypes: NodeTypes = {
  graphNode: GraphNode,
};

const edgeTypes: EdgeTypes = {
  graphEdge: GraphEdge,
};

// --- Viewport zoom tracker component ---

function ViewportZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  const { zoom } = useViewport();
  useEffect(() => {
    onZoomChange(zoom);
  }, [zoom, onZoomChange]);
  return null;
}

// --- Inner component (needs ReactFlowProvider) ---

function KnowledgeGraphInner({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const { toast } = useToast();
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [activeEntityTypes, setActiveEntityTypes] = useState<string[]>([]);
  const [layout, setLayout] = useState<LayoutType>("force");
  const [depth, setDepth] = useState(3);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [showQueryPanel, setShowQueryPanel] = useState(false);
  const [modalEntity, setModalEntity] = useState<GraphEntity | null>(null);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
  const [hiddenEntityIds, setHiddenEntityIds] = useState<Set<string>>(new Set());
  const [layoutAnimating, setLayoutAnimating] = useState(false);
  const [isComputingLayout, setIsComputingLayout] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const layoutApplied = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const animationRef = useRef<number | null>(null);

  // Data queries
  const { data: summary, isLoading: summaryLoading } = useQuery<KnowledgeGraphSummary>({
    queryKey: ["/api/knowledge-graph", knowledgeBaseId, "summary"],
    refetchInterval: (query) => {
      const data = query.state.data as KnowledgeGraphSummary | undefined;
      if (data?.status === "extracting" || data?.status === "pending") return 3000;
      return false;
    },
  });

  const { data: entitiesData, isLoading: entitiesLoading } = useQuery<{
    entities: GraphEntity[];
    total: number;
  }>({
    queryKey: ["/api/knowledge-graph", knowledgeBaseId, "entities"],
    enabled: summary?.status === "completed",
  });

  const { data: relationshipsData, isLoading: relationshipsLoading } = useQuery<{
    relationships: GraphRelationship[];
    total: number;
  }>({
    queryKey: ["/api/knowledge-graph", knowledgeBaseId, "relationships"],
    enabled: summary?.status === "completed",
  });

  // Sanitize: API can return null entries in arrays
  const safeEntitiesData = useMemo(() => {
    if (!entitiesData) return undefined;
    return {
      ...entitiesData,
      entities: (entitiesData.entities || []).filter(Boolean),
    };
  }, [entitiesData]);

  const safeRelationshipsData = useMemo(() => {
    if (!relationshipsData) return undefined;
    return {
      ...relationshipsData,
      relationships: (relationshipsData.relationships || []).filter(Boolean),
    };
  }, [relationshipsData]);

  const { data: kbItem } = useQuery<{ id: string; title: string; fileName: string }>({
    queryKey: ["/api/knowledge-base", knowledgeBaseId],
  });
  const kbTitle = kbItem?.title || kbItem?.fileName || "Document";

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/knowledge-graph/${knowledgeBaseId}/generate`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/knowledge-graph", knowledgeBaseId],
      });
      toast({
        title: "Graph generation started",
        description: "The knowledge graph is being extracted. This may take a moment.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate graph",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  // Entity map for quick lookups
  const entityMap = useMemo(() => {
    const map = new Map<string, GraphEntity>();
    (safeEntitiesData?.entities || []).forEach((e) => map.set(e.id, e));
    return map;
  }, [safeEntitiesData]);

  // Build connection counts
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (safeRelationshipsData?.relationships || []).forEach((r) => {
      counts.set(r.sourceEntityId, (counts.get(r.sourceEntityId) || 0) + 1);
      counts.set(r.targetEntityId, (counts.get(r.targetEntityId) || 0) + 1);
    });
    return counts;
  }, [safeRelationshipsData]);

  // Hub node id (for depth from hub)
  const hubNodeId = useMemo(
    () => findHubNodeId(
      safeEntitiesData?.entities || [],
      safeRelationshipsData?.relationships || [],
    ),
    [safeEntitiesData, safeRelationshipsData],
  );

  // Available entity types
  const availableEntityTypes = useMemo(() => {
    const types = new Set<string>();
    (safeEntitiesData?.entities || []).forEach((e) => types.add(e.label));
    return Array.from(types).sort();
  }, [safeEntitiesData]);

  // Initialize active entity types when data loads
  useEffect(() => {
    if (availableEntityTypes.length > 0 && activeEntityTypes.length === 0) {
      setActiveEntityTypes(availableEntityTypes);
    }
  }, [availableEntityTypes]);

  // Search results list
  const searchResults = useMemo(() => {
    if (!searchTerm || !safeEntitiesData?.entities) return [];
    const lower = searchTerm.toLowerCase();
    return safeEntitiesData.entities.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        e.label.toLowerCase().includes(lower),
    );
  }, [searchTerm, safeEntitiesData]);

  // Reset search index when results change
  useEffect(() => {
    setSearchResultIndex(0);
  }, [searchResults.length, searchTerm]);

  // ---- Animate node positions from previous to target ----
  const animateToPositions = useCallback(
    (targetNodes: Node[], newEdges: Edge[]) => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      const targetPositions = new Map<string, { x: number; y: number }>();
      targetNodes.forEach((n) => targetPositions.set(n.id, n.position));

      const fromPositions = new Map(previousPositions.current);

      // If no previous positions (first load), set directly
      if (fromPositions.size === 0) {
        setNodes(targetNodes);
        setEdges(newEdges);
        previousPositions.current = targetPositions;
        return;
      }

      setLayoutAnimating(true);
      setEdges(newEdges);

      const DURATION = 400;
      const startTime = performance.now();

      function tick(now: number) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / DURATION, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

        const interpolated = interpolatePositions(fromPositions, targetPositions, eased);

        setNodes((prev) =>
          prev.map((node) => {
            const pos = interpolated.get(node.id);
            return pos ? { ...node, position: pos } : node;
          }),
        );

        if (t < 1) {
          animationRef.current = requestAnimationFrame(tick);
        } else {
          setNodes(targetNodes);
          previousPositions.current = targetPositions;
          setLayoutAnimating(false);
          animationRef.current = null;
        }
      }

      animationRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  // Transform data into ReactFlow nodes and edges
  useEffect(() => {
    if (!safeEntitiesData?.entities || !safeRelationshipsData?.relationships) return;

    const activeSet = new Set(activeEntityTypes);
    const searchLower = searchTerm.toLowerCase();

    // Start with type-filtered entities (also exclude hidden)
    let filteredEntities = safeEntitiesData.entities.filter(
      (e) => activeSet.has(e.label) && !hiddenEntityIds.has(e.id),
    );

    // Apply depth filtering
    const allRels = safeRelationshipsData.relationships;
    if (depth < 3) {
      const seedId = selectedEntity?.id || hubNodeId;
      if (seedId) {
        const reachable = computeReachableIds(seedId, allRels, depth);
        filteredEntities = filteredEntities.filter((e) => reachable.has(e.id));
      }
    }

    // Cap rendered nodes for performance — show the most connected entities
    const MAX_RENDER_NODES = 200;
    if (filteredEntities.length > MAX_RENDER_NODES) {
      const connCounts = new Map<string, number>();
      allRels.forEach((r) => {
        connCounts.set(r.sourceEntityId, (connCounts.get(r.sourceEntityId) || 0) + 1);
        connCounts.set(r.targetEntityId, (connCounts.get(r.targetEntityId) || 0) + 1);
      });
      filteredEntities.sort(
        (a, b) => (connCounts.get(b.id) || 0) - (connCounts.get(a.id) || 0),
      );
      filteredEntities = filteredEntities.slice(0, MAX_RENDER_NODES);
    }

    const filteredIds = new Set(filteredEntities.map((e) => e.id));

    // Build nodes
    const newNodes: Node[] = filteredEntities.map((entity) => {
      const isSearchMatch =
        searchTerm.length > 0 &&
        (entity.name.toLowerCase().includes(searchLower) ||
          entity.label.toLowerCase().includes(searchLower));
      const isDimmed = searchTerm.length > 0 && !isSearchMatch;

      return {
        id: entity.id,
        type: "graphNode",
        position: { x: 0, y: 0 },
        data: {
          label: entity.name || entity.label,
          entityType: entity.label,
          properties: entity.properties || {},
          connectionCount: connectionCounts.get(entity.id) || 0,
          searchMatch: isSearchMatch,
          dimmed: isDimmed,
        } satisfies GraphNodeData,
      };
    });

    // Build edges (only between visible nodes)
    const rawEdges: Edge[] = allRels
      .filter(
        (r) => filteredIds.has(r.sourceEntityId) && filteredIds.has(r.targetEntityId),
      )
      .map((rel) => ({
        id: rel.id,
        source: rel.sourceEntityId,
        target: rel.targetEntityId,
        type: "graphEdge",
        data: {
          relationshipType: rel.type,
          properties: rel.properties || {},
          dimmed:
            searchTerm.length > 0 &&
            !entityMap.get(rel.sourceEntityId)?.name.toLowerCase().includes(searchLower) &&
            !entityMap.get(rel.targetEntityId)?.name.toLowerCase().includes(searchLower),
          zoom: currentZoom,
        } satisfies GraphEdgeData,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "#24364580",
        },
      }));

    // Apply layout
    const applyLayout = (lt: LayoutType, n: Node[], e: Edge[]): Node[] | Promise<Node[]> => {
      switch (lt) {
        case "radial":
          return computeRadialLayout(n, e);
        case "hierarchical":
          return computeHierarchicalLayout(n, e);
        case "cluster":
          return computeClusterLayout(n, e);
        case "force":
          if (n.length > 30) {
            setIsComputingLayout(true);
            return computeForceLayoutAsync(n, e).then((result) => {
              setIsComputingLayout(false);
              return result;
            });
          }
          return computeForceLayoutSync(n, e);
        default:
          return computeCircleLayout(n, e);
      }
    };

    const layoutResult = applyLayout(layout, newNodes, rawEdges);

    const applyResult = (layoutedNodes: Node[]) => {
      // Compute edge label offsets for collision avoidance
      const edgeLabelOffsets = computeEdgeLabelOffsets(rawEdges, layoutedNodes);

      const finalEdges = rawEdges.map((e) => ({
        ...e,
        data: {
          ...e.data,
          labelOffsetY: edgeLabelOffsets.get(e.id) || 0,
          zoom: currentZoom,
        },
      }));

      // Use animated transition if we have previous positions
      if (previousPositions.current.size > 0 && layoutedNodes.length > 0) {
        animateToPositions(layoutedNodes, finalEdges);
      } else {
        setNodes(layoutedNodes);
        setEdges(finalEdges);
        previousPositions.current = new Map(
          layoutedNodes.map((n) => [n.id, n.position]),
        );
      }

      // Fit view on first layout
      if (!layoutApplied.current && layoutedNodes.length > 0) {
        layoutApplied.current = true;
        setTimeout(() => {
          reactFlowInstance.fitView({ padding: 0.15, duration: 400 });
        }, 100);
      }
    };

    if (layoutResult instanceof Promise) {
      layoutResult.then(applyResult);
    } else {
      applyResult(layoutResult);
    }
  }, [
    safeEntitiesData,
    safeRelationshipsData,
    activeEntityTypes,
    searchTerm,
    layout,
    depth,
    selectedEntity?.id,
    hubNodeId,
    hiddenEntityIds,
    connectionCounts,
    entityMap,
    currentZoom,
    animateToPositions,
    reactFlowInstance,
  ]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const handleNodeClick = useCallback(
    (_: any, node: Node) => {
      const entity = entityMap.get(node.id);
      if (entity) {
        setContextMenu(null);
        setSelectedEdge(null);
        setSelectedEntity({
          id: entity.id,
          name: entity.name,
          label: entity.label,
          entityType: entity.label,
          properties: entity.properties,
          sourceKnowledgeBaseId: entity.sourceKnowledgeBaseId,
        });
      }
    },
    [entityMap],
  );

  const handleEdgeClick = useCallback(
    (_: any, edge: Edge) => {
      const rel = (safeRelationshipsData?.relationships || []).find(
        (r) => r.id === edge.id,
      );
      if (rel) {
        const sourceEntity = entityMap.get(rel.sourceEntityId);
        const targetEntity = entityMap.get(rel.targetEntityId);
        setSelectedEntity(null);
        setSelectedEdge({
          id: rel.id,
          type: rel.type,
          sourceName: sourceEntity?.name || rel.sourceEntityId,
          targetName: targetEntity?.name || rel.targetEntityId,
          sourceType: sourceEntity?.label || "Unknown",
          targetType: targetEntity?.label || "Unknown",
          properties: rel.properties,
        });
      }
    },
    [safeRelationshipsData, entityMap],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedEntity(null);
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  const handleNodeDoubleClick = useCallback(
    (_: any, node: Node) => {
      const entity = entityMap.get(node.id);
      if (entity) {
        setModalEntity(entity);
      }
    },
    [entityMap],
  );

  // Right-click context menu on nodes
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const data = node.data as unknown as GraphNodeData;
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
        nodeName: data.label || node.id,
      });
    },
    [],
  );

  // Context menu action handlers
  const handleContextFocus = useCallback(
    (nodeId: string) => {
      setSelectedEntity(null);
      const entity = entityMap.get(nodeId);
      if (entity) {
        setSelectedEntity({
          id: entity.id,
          name: entity.name,
          label: entity.label,
          entityType: entity.label,
          properties: entity.properties,
          sourceKnowledgeBaseId: entity.sourceKnowledgeBaseId,
        });
      }
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        reactFlowInstance.setCenter(node.position.x, node.position.y, {
          zoom: 1.5,
          duration: 400,
        });
      }
    },
    [entityMap, nodes, reactFlowInstance],
  );

  const handleContextExpand = useCallback(
    (nodeId: string) => {
      setDepth(3);
      handleContextFocus(nodeId);
    },
    [handleContextFocus],
  );

  const handleContextHide = useCallback((nodeId: string) => {
    setHiddenEntityIds((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
    setSelectedEntity((prev: any) => (prev?.id === nodeId ? null : prev));
  }, []);

  const handleContextOpenDetails = useCallback(
    (nodeId: string) => {
      const entity = entityMap.get(nodeId);
      if (entity) {
        setModalEntity(entity);
      }
    },
    [entityMap],
  );

  const handleNavigateToEntity = useCallback(
    (entityId: string) => {
      const entity = entityMap.get(entityId);
      if (entity) {
        setModalEntity(null);
        setSelectedEdge(null);
        setSelectedEntity({
          id: entity.id,
          name: entity.name,
          label: entity.label,
          entityType: entity.label,
          properties: entity.properties,
          sourceKnowledgeBaseId: entity.sourceKnowledgeBaseId,
        });
        const node = nodes.find((n) => n.id === entityId);
        if (node) {
          reactFlowInstance.setCenter(node.position.x, node.position.y, {
            zoom: 1.5,
            duration: 400,
          });
        }
      }
    },
    [entityMap, nodes, reactFlowInstance],
  );

  const handleExpandToModal = useCallback(() => {
    if (selectedEntity) {
      const fullEntity = entityMap.get(selectedEntity.id);
      if (fullEntity) {
        setModalEntity(fullEntity);
      }
    }
  }, [selectedEntity, entityMap]);

  const handleHighlightEntities = useCallback(
    (entityIds: string[]) => {
      const idSet = new Set(entityIds);
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            searchMatch: idSet.has(node.id),
            dimmed: !idSet.has(node.id),
          },
        })),
      );
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          data: {
            ...edge.data,
            dimmed: !idSet.has(edge.source) && !idSet.has(edge.target),
          },
        })),
      );
    },
    [],
  );

  const handleEntityTypeToggle = useCallback((type: string) => {
    setActiveEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.15, duration: 400 });
  }, [reactFlowInstance]);

  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn({ duration: 200 });
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut({ duration: 200 });
  }, [reactFlowInstance]);

  const handleReset = useCallback(() => {
    layoutApplied.current = false;
    setSearchTerm("");
    setActiveEntityTypes(availableEntityTypes);
    setHiddenEntityIds(new Set());
    setDepth(3);
    setSelectedEntity(null);
    previousPositions.current = new Map();
    setLayout((prev) => {
      const temp = prev;
      setTimeout(() => setLayout(temp), 0);
      return prev;
    });
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.15, duration: 400 });
    }, 200);
  }, [reactFlowInstance, availableEntityTypes]);

  const handleLayoutChange = useCallback(
    (newLayout: LayoutType) => {
      if (layoutAnimating || isComputingLayout) return;
      setLayout(newLayout);
      layoutApplied.current = false;
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.15, duration: 400 });
      }, 500);
    },
    [reactFlowInstance, layoutAnimating, isComputingLayout],
  );

  // --- Search navigation ---
  const handleSearchSubmit = useCallback(() => {
    if (searchResults.length === 0) return;
    const targetEntity = searchResults[searchResultIndex];
    if (!targetEntity) return;
    const node = nodes.find((n) => n.id === targetEntity.id);
    if (node) {
      reactFlowInstance.fitView({
        nodes: [node],
        duration: 400,
        padding: 0.5,
      });
    }
  }, [searchResults, searchResultIndex, nodes, reactFlowInstance]);

  const handleSearchNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (searchResults.length === 0) return;
      setSearchResultIndex((prev) => {
        let next: number;
        if (direction === "next") {
          next = (prev + 1) % searchResults.length;
        } else {
          next = (prev - 1 + searchResults.length) % searchResults.length;
        }
        const targetEntity = searchResults[next];
        if (targetEntity) {
          const node = nodes.find((n) => n.id === targetEntity.id);
          if (node) {
            reactFlowInstance.fitView({
              nodes: [node],
              duration: 400,
              padding: 0.5,
            });
          }
        }
        return next;
      });
    },
    [searchResults, nodes, reactFlowInstance],
  );

  // Hide currently selected entity (keyboard shortcut H)
  const handleHideSelected = useCallback(() => {
    if (selectedEntity?.id) {
      handleContextHide(selectedEntity.id);
    }
  }, [selectedEntity, handleContextHide]);

  // Keyboard shortcuts
  const keyboardHandlers = useMemo(
    () => ({
      onSearch: () => {
        searchInputRef.current?.focus();
      },
      onEscape: () => {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        setSelectedEntity(null);
        setSelectedEdge(null);
        setShowQueryPanel(false);
        setModalEntity(null);
        setSearchTerm("");
      },
      onLayoutForce: () => handleLayoutChange("force"),
      onLayoutRadial: () => handleLayoutChange("radial"),
      onLayoutHierarchical: () => handleLayoutChange("hierarchical"),
      onLayoutCluster: () => handleLayoutChange("cluster"),
      onFitView: handleFitView,
      onZoomIn: handleZoomIn,
      onZoomOut: handleZoomOut,
      onHideSelected: handleHideSelected,
      onToggleQuery: () => setShowQueryPanel((p) => !p),
      onSearchArrowUp: () => handleSearchNavigate("prev"),
      onSearchArrowDown: () => handleSearchNavigate("next"),
      isSearchActive: searchTerm.length > 0 && searchResults.length > 0,
      isContextMenuOpen: contextMenu !== null,
    }),
    [
      handleLayoutChange,
      handleFitView,
      handleZoomIn,
      handleZoomOut,
      handleHideSelected,
      handleSearchNavigate,
      searchTerm,
      searchResults,
      contextMenu,
    ],
  );
  useGraphKeyboardShortcuts(keyboardHandlers);

  const summaryLoadingFlag = summaryLoading;
  const isExtracting = summary?.status === "extracting";
  const isPending = summary?.status === "pending";
  const isFailed = summary?.status === "failed";
  const isCompleted = summary?.status === "completed";
  const hasNoGraph = !summary || (!isExtracting && !isCompleted && !isFailed);

  // -- Render states --

  if (summaryLoadingFlag) {
    return (
      <div className="fixed inset-0 bg-[#0B1014] flex items-center justify-center z-40">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#07A288]" />
          <p className="text-sm text-gray-400">Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  if (hasNoGraph || isPending) {
    return (
      <div className="fixed inset-0 bg-[#0B1014] flex items-center justify-center z-40">
        <div className="max-w-lg">
          <GraphEmptyStates variant="graph-page-empty" />
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link href="/app/knowledge-base">
              <Button variant="outline" className="gap-2 border-[#243645] text-gray-300">
                <ArrowLeft className="h-4 w-4" />
                Back to Knowledge Base
              </Button>
            </Link>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="gap-2 bg-gradient-to-r from-[#07A288] to-[#5BBE4E] text-[#041514] font-semibold hover:brightness-110"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Graph
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isExtracting || isPending) {
    return (
      <>
        <GenerationHalo
          knowledgeBaseId={knowledgeBaseId}
          documentTitle={kbTitle}
        />
        <Link href="/app/knowledge-base">
          <Button
            variant="outline"
            className="fixed top-4 left-4 z-50 gap-2 border-[#243645] text-gray-300 bg-[#0B1014]/80 backdrop-blur-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <ExtractionProgressOverlay
          knowledgeBaseId={knowledgeBaseId}
          extractedChunks={summary?.extractedChunks ?? 0}
          totalChunks={summary?.totalChunks ?? 0}
          entityCount={summary?.entityCount ?? 0}
          relationshipCount={summary?.relationshipCount ?? 0}
          status={summary?.status ?? "pending"}
        />
      </>
    );
  }

  if (isFailed) {
    return (
      <div className="fixed inset-0 bg-[#0B1014] flex items-center justify-center z-40">
        <div className="max-w-md text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-100 mb-2">
              Graph Generation Failed
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Something went wrong while extracting the knowledge graph.
              You can try again or go back to the knowledge base.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link href="/app/knowledge-base">
              <Button variant="outline" className="gap-2 border-[#243645] text-gray-300">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="gap-2 bg-gradient-to-r from-[#07A288] to-[#5BBE4E] text-[#041514] font-semibold hover:brightness-110"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted && entitiesLoading) {
    return (
      <div className="fixed inset-0 bg-[#0B1014] flex items-center justify-center z-40">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#07A288]" />
          <p className="text-sm text-gray-400">Loading graph data...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="knowledge-graph-canvas"
      className="fixed inset-0 bg-[#0B1014] overflow-hidden z-40"
      style={{ width: "100vw", height: "100vh" }}
    >
      {/* Breadcrumb navigation */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <div className="bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-xs">
          <Link href="/app/knowledge-base">
            <span className="text-gray-400 hover:text-[#07A288] transition-colors cursor-pointer">
              Knowledge Base
            </span>
          </Link>
          <ChevronRight className="h-3 w-3 text-gray-600" />
          <Link href="/app/knowledge-base">
            <span className="text-gray-400 hover:text-[#07A288] transition-colors cursor-pointer truncate max-w-[180px] inline-block">
              {kbTitle}
            </span>
          </Link>
          <ChevronRight className="h-3 w-3 text-gray-600" />
          <span className="text-gray-200 font-medium">Graph</span>
          <span className="mx-1 text-gray-600">|</span>
          <Link href={`/app/knowledge-graph-3d/${knowledgeBaseId}`}>
            <span className="inline-flex items-center gap-1 text-gray-400 hover:text-[#00f0b5] transition-colors cursor-pointer">
              <Rotate3d className="h-3 w-3" />
              3D
            </span>
          </Link>
          <span className="mx-1 text-gray-600">|</span>
          <Link href={`/app/knowledge-graph/${knowledgeBaseId}/theatre`}>
            <span
              className="inline-flex items-center gap-1 text-gray-400 hover:text-[#B8E52B] transition-colors cursor-pointer"
              data-testid="replay-creation-link"
              title="Watch how this graph was created"
            >
              <Film className="h-3 w-3" />
              Replay
            </span>
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <GraphStatsBar
          entityCount={safeEntitiesData?.entities?.length || 0}
          relationshipCount={safeRelationshipsData?.relationships?.length || 0}
          entityTypes={availableEntityTypes}
          isCollapsed={statsCollapsed}
          onToggle={() => setStatsCollapsed((prev) => !prev)}
        />
      </div>

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0B1014" }}
      >
        <Background
          color="#243645"
          gap={24}
          size={1}
          style={{ opacity: 0.4 }}
        />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as unknown as GraphNodeData;
            return ENTITY_COLORS[data.entityType] || ENTITY_COLORS.Other;
          }}
          maskColor="#0B101490"
          style={{
            backgroundColor: "#111A21",
            border: "1px solid #243645",
            borderRadius: 8,
          }}
          pannable
          zoomable
        />
        <ViewportZoomTracker onZoomChange={setCurrentZoom} />
      </ReactFlow>

      {/* Floating controls */}
      <GraphControls
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onSearchSubmit={handleSearchSubmit}
        activeEntityTypes={activeEntityTypes}
        availableEntityTypes={availableEntityTypes}
        onEntityTypeToggle={handleEntityTypeToggle}
        depth={depth}
        onDepthChange={setDepth}
        layout={layout}
        onLayoutChange={handleLayoutChange}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        entityCount={safeEntitiesData?.entities?.length || 0}
        relationshipCount={safeRelationshipsData?.relationships?.length || 0}
        onToggleQueryPanel={() => setShowQueryPanel((prev) => !prev)}
        entities={safeEntitiesData?.entities}
        relationships={safeRelationshipsData?.relationships}
        knowledgeBaseId={knowledgeBaseId}
        searchInputRef={searchInputRef}
        layoutAnimating={layoutAnimating}
        isComputingLayout={isComputingLayout}
        searchResultCount={searchResults.length}
        searchResultIndex={searchResultIndex}
        onSearchNavigate={handleSearchNavigate}
        selectedEntityName={selectedEntity?.name}
      />

      {/* Legend */}
      <GraphLegend entityTypes={availableEntityTypes} />

      {/* Sidebar */}
      <GraphSidebar
        entity={selectedEntity}
        edge={selectedEdge}
        onClose={() => {
          setSelectedEntity(null);
          setSelectedEdge(null);
        }}
        onExpandToModal={handleExpandToModal}
      />

      {/* Entity modal */}
      <GraphEntityModal
        entity={modalEntity}
        relationships={safeRelationshipsData?.relationships || []}
        allEntities={safeEntitiesData?.entities || []}
        isOpen={!!modalEntity}
        onClose={() => setModalEntity(null)}
        onNavigateToEntity={handleNavigateToEntity}
      />

      {/* Query panel */}
      <GraphQueryPanel
        knowledgeBaseId={knowledgeBaseId}
        onHighlightEntities={handleHighlightEntities}
        isOpen={showQueryPanel}
        onClose={() => setShowQueryPanel(false)}
      />

      {/* Right-click context menu */}
      <GraphNodeContextMenu
        position={contextMenu}
        onClose={() => setContextMenu(null)}
        onFocus={handleContextFocus}
        onExpand={handleContextExpand}
        onHide={handleContextHide}
        onOpenDetails={handleContextOpenDetails}
      />

      {/* CSS overrides */}
      <style>{`
        .react-flow__minimap {
          bottom: 16px !important;
          right: 340px !important;
        }
        .react-flow__node {
          cursor: pointer !important;
        }
        .react-flow__edge {
          cursor: pointer !important;
        }
        .react-flow__controls {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

// --- Main page component ---

export default function KnowledgeGraphPage() {
  const [matched, params] = useRoute("/app/knowledge-graph/:id");

  if (!matched || !params?.id) {
    return (
      <div className="fixed inset-0 bg-[#0B1014] flex items-center justify-center z-40">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto" />
          <h2 className="text-lg font-bold text-gray-100">Invalid Knowledge Graph</h2>
          <p className="text-sm text-gray-400">No knowledge base ID was provided.</p>
          <Link href="/app/knowledge-base">
            <Button variant="outline" className="gap-2 border-[#243645] text-gray-300">
              <ArrowLeft className="h-4 w-4" />
              Back to Knowledge Base
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner knowledgeBaseId={params.id} />
    </ReactFlowProvider>
  );
}
