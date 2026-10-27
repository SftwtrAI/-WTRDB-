/**
 * 3D Knowledge Graph -- Main React Component (v3).
 *
 * Orchestrates the Three.js scene lifecycle, data fetching, screen-space
 * picking for hover/click interaction, floating overlays, toolbar with
 * search / type-filter / depth-slider / generate, right-click context menu,
 * keyboard shortcuts, smooth camera animations, and the controls panel.
 *
 * Designed to fill its container (typically 100vh x 100vw).
 *
 * Key design choice: hover and click detection uses screen-space distance
 * picking (project every node to NDC, compare to mouse NDC) instead of
 * THREE.Raycaster.intersectObjects. This approach is simple, fast for
 * 300 nodes, and works with ANY geometry type (meshframes contain Lines
 * and LineSegments that are nearly impossible to raycast reliably).
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import * as THREE from "three";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

import type {
  Node3D,
  Edge3D,
  GraphEntity,
  GraphRelationship,
  ControlsConfig,
  SceneState,
} from "./types";
import {
  DEFAULT_CONTROLS,
  MESHFRAME_COLORS,
  ENTITY_TYPE_TO_MESHFRAME,
} from "./types";
import { createSceneManager, type SceneManager } from "./scene";
import { createDataBridge } from "./data-bridge";
import { createForceLayout } from "./force-layout";
import { createMeshframe } from "./meshframes";
import { createEdgeManager, type EdgeManager } from "./edges";
import { createLabelManager, type LabelManager } from "./labels";
import { ControlsPanel } from "./controls-panel";
import { GraphToolbar } from "./graph-toolbar";
import { NodeContextMenu } from "./context-menu";
import {
  animateCameraTo,
  fitViewToNodes,
  computeReachableNodeIds,
  createKeyboardHandler,
} from "./camera-utils";

// ── API response shapes ─────────────────────────────────────────────────────

interface EntitiesResponse {
  entities: GraphEntity[];
  total: number;
}

interface RelationshipsResponse {
  relationships: GraphRelationship[];
  total: number;
}

interface SummaryResponse {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: "pending" | "extracting" | "completed" | "failed";
  lastUpdated: string;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface KnowledgeGraph3DProps {
  knowledgeBaseId: string;
}

// ── Reverse mapping: meshframe type → entity label ─────────────────────────

const MESHFRAME_TO_ENTITY_TYPE: Record<string, string> = {};
for (const [entityLabel, meshType] of Object.entries(
  ENTITY_TYPE_TO_MESHFRAME,
)) {
  MESHFRAME_TO_ENTITY_TYPE[meshType] = entityLabel;
}

// ── Screen-Space Picking ────────────────────────────────────────────────────

/**
 * Find the closest node to the mouse in NDC (normalized device coordinates).
 *
 * For each node we project its world position into NDC space and compute 2D
 * distance to the mouse. A threshold of 0.1 in NDC space corresponds to
 * roughly 50px at typical zoom levels. This is O(N) for N nodes and trivially
 * fast for graphs up to several thousand nodes.
 */
function findClosestNode(
  mouseNDC: THREE.Vector2,
  camera: THREE.Camera,
  nodes: Node3D[],
): Node3D | null {
  let closest: Node3D | null = null;
  let minDist = Infinity;
  const projected = new THREE.Vector3();

  for (const node of nodes) {
    if (!node.group || !node.group.visible) continue;

    projected.copy(node.group.position);
    projected.project(camera);

    const dx = projected.x - mouseNDC.x;
    const dy = projected.y - mouseNDC.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist && dist < 0.1) {
      minDist = dist;
      closest = node;
    }
  }

  return closest;
}

// ── Stats Overlay Component ─────────────────────────────────────────────────

function StatsOverlay({
  stats,
  totalEntities,
  hoveredNode,
}: {
  stats: {
    nodeCount: number;
    edgeCount: number;
    typeDistribution: Record<string, number>;
  } | null;
  totalEntities: number;
  hoveredNode: Node3D | null;
}) {
  if (!stats) return null;

  const TYPE_LABELS: Record<string, string> = {
    stationCore: "Organization",
    subspaceAnomaly: "Event",
    deltaShield: "Person",
    deflectorArray: "Document",
    warpAssembly: "Product",
    redAlertBeacon: "Alert",
    sensorPod: "Location",
    containmentGrid: "Concept",
  };

  return (
    <div className="bg-[#111A21]/90 backdrop-blur-md border border-[#243645] rounded-lg p-3 min-w-[180px]">
      <div className="space-y-2">
        <div className="text-[#07A288] font-mono font-bold text-xs">
          GRAPH TELEMETRY
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Nodes</span>
          <Badge
            variant="secondary"
            className="bg-[#243645] text-gray-200 text-[10px] px-1.5 py-0"
          >
            {stats.nodeCount}
          </Badge>
          <span className="text-xs text-gray-400 ml-1">Edges</span>
          <Badge
            variant="secondary"
            className="bg-[#243645] text-gray-200 text-[10px] px-1.5 py-0"
          >
            {stats.edgeCount}
          </Badge>
        </div>

        {totalEntities > stats.nodeCount && (
          <p className="text-[10px] text-gray-500">
            Showing {stats.nodeCount} of {totalEntities} entities
          </p>
        )}

        <div className="border-t border-[#243645] pt-2 space-y-1">
          {Object.entries(stats.typeDistribution).map(([type, count]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: `#${(MESHFRAME_COLORS[type as keyof typeof MESHFRAME_COLORS] ?? 0x888888).toString(16).padStart(6, "0")}`,
                }}
              />
              <span className="text-[10px] text-gray-400 flex-1">
                {TYPE_LABELS[type] ?? type}
              </span>
              <span className="text-[10px] text-gray-500 tabular-nums">
                {count}
              </span>
            </div>
          ))}
        </div>

        {hoveredNode && (
          <div className="border-t border-[#243645] pt-2">
            <p className="text-[10px] text-gray-300 font-medium truncate">
              {hoveredNode.entity.name}
            </p>
            <p className="text-[10px] text-gray-500">
              {hoveredNode.entity.label}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Node Detail Panel ───────────────────────────────────────────────────────

function NodeDetailPanel({
  node,
  onClose,
}: {
  node: Node3D;
  onClose: () => void;
}) {
  const properties = Object.entries(node.entity.properties || {});

  return (
    <div className="bg-[#111A21]/90 backdrop-blur-md border border-[#243645] rounded-lg p-4 w-72 max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200 truncate pr-2">
          {node.entity.name}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
        >
          Close
        </button>
      </div>

      <Badge
        variant="secondary"
        className="bg-[#243645] text-gray-300 text-[10px] mb-3"
      >
        {node.entity.label}
      </Badge>

      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between text-gray-400">
          <span>Connections</span>
          <span className="text-gray-300">{node.connectionCount}</span>
        </div>
        {properties.length > 0 && (
          <>
            <div className="border-t border-[#243645] my-2" />
            {properties.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <span className="text-gray-500 truncate">{key}</span>
                <span className="text-gray-300 truncate text-right max-w-[140px]">
                  {value}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Hover Tooltip ───────────────────────────────────────────────────────────

function HoverTooltip({
  node,
  position,
}: {
  node: Node3D;
  position: { x: number; y: number };
}) {
  return (
    <div
      className="fixed z-50 pointer-events-none bg-[#111A21]/95 backdrop-blur-md border border-[#243645] rounded-md px-2.5 py-1.5 shadow-xl"
      style={{
        left: position.x + 12,
        top: position.y - 8,
      }}
    >
      <p className="text-xs text-gray-200 font-medium">{node.entity.name}</p>
      <p className="text-[10px] text-gray-500">{node.entity.label}</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function KnowledgeGraph3D({
  knowledgeBaseId,
}: KnowledgeGraph3DProps) {
  // ── DOM refs ──
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Mutable refs (avoid re-renders in the hot path) ──
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const edgeManagerRef = useRef<EdgeManager | null>(null);
  const labelManagerRef = useRef<LabelManager | null>(null);
  const nodesRef = useRef<Node3D[]>([]);
  const edgesRef = useRef<Edge3D[]>([]);
  const baseYRef = useRef<Map<string, number>>(new Map());
  const initializedRef = useRef(false);
  const mouseRef = useRef(new THREE.Vector2(-999, -999));
  const tooltipPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── React state (existing) ──
  const [controls, setControls] = useState<ControlsConfig>(DEFAULT_CONTROLS);
  const [selectedNode, setSelectedNode] = useState<Node3D | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node3D | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [stats, setStats] = useState<{
    nodeCount: number;
    edgeCount: number;
    typeDistribution: Record<string, number>;
  } | null>(null);

  // ── New state: Search ──
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResultIndex, setSearchResultIndex] = useState(0);

  // ── New state: Entity Type Filtering ──
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());

  // ── New state: Depth Slider ──
  const [depth, setDepth] = useState(5);

  // ── New state: Entity Hiding ──
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());

  // ── New state: Context Menu ──
  const [contextMenuNode, setContextMenuNode] = useState<Node3D | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  }>({
    x: 0,
    y: 0,
  });

  // ── Query client for cache invalidation ──
  const queryClient = useQueryClient();

  // ── Data fetching ──
  const { data: summaryData } = useQuery<SummaryResponse>({
    queryKey: ["/api/knowledge-graph", knowledgeBaseId, "summary"],
  });

  const {
    data: entitiesData,
    isLoading: entitiesLoading,
    isError: entitiesError,
  } = useQuery<EntitiesResponse>({
    queryKey: ["/api/knowledge-graph", knowledgeBaseId, "entities"],
    enabled: summaryData?.status === "completed",
  });

  const {
    data: relationshipsData,
    isLoading: relationshipsLoading,
    isError: relationshipsError,
  } = useQuery<RelationshipsResponse>({
    queryKey: ["/api/knowledge-graph", knowledgeBaseId, "relationships"],
    enabled: summaryData?.status === "completed",
  });

  const isLoading = entitiesLoading || relationshipsLoading;
  const isError = entitiesError || relationshipsError;
  const entities = entitiesData?.entities || [];
  const relationships = relationshipsData?.relationships || [];

  // ── Generate mutation ──
  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/knowledge-graph/${knowledgeBaseId}/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/knowledge-graph", knowledgeBaseId],
      });
    },
  });

  // ── Derive entity-label-based type distribution for toolbar ──
  const entityLabelDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const entity of entities) {
      dist[entity.label] = (dist[entity.label] ?? 0) + 1;
    }
    return dist;
  }, [entities]);

  // ── Initialize activeTypes when entities load ──
  useEffect(() => {
    if (entities.length > 0 && activeTypes.size === 0) {
      const types = new Set<string>();
      for (const entity of entities) {
        types.add(entity.label);
      }
      setActiveTypes(types);
    }
  }, [entities, activeTypes.size]);

  // ── Search results ──
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return entities.filter((e) => e.name.toLowerCase().includes(term));
  }, [entities, searchTerm]);

  // Reset search index when results change
  useEffect(() => {
    setSearchResultIndex(0);
  }, [searchResults.length]);

  // ── Search handlers ──
  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen((prev) => {
      if (prev) {
        setSearchTerm("");
        setSearchResultIndex(0);
      }
      return !prev;
    });
  }, []);

  const handleSearchResultNext = useCallback(() => {
    setSearchResultIndex((prev) =>
      searchResults.length > 0 ? (prev + 1) % searchResults.length : 0,
    );
  }, [searchResults.length]);

  const handleSearchResultPrev = useCallback(() => {
    setSearchResultIndex((prev) =>
      searchResults.length > 0
        ? (prev - 1 + searchResults.length) % searchResults.length
        : 0,
    );
  }, [searchResults.length]);

  const handleSearchResultSelect = useCallback((entity: GraphEntity) => {
    const sm = sceneManagerRef.current;
    if (!sm) return;

    // Find the node matching this entity
    const node = nodesRef.current.find((n) => n.id === entity.id);
    if (!node || !node.group) return;

    // Animate camera to the node
    animateCameraTo(sm.camera, sm.controls, node.group.position);
    setSelectedNode(node);
  }, []);

  // ── Type filter handlers ──
  const handleToggleType = useCallback((label: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const handleShowAllTypes = useCallback(() => {
    const types = new Set<string>();
    for (const entity of entities) {
      types.add(entity.label);
    }
    setActiveTypes(types);
  }, [entities]);

  const handleHideAllTypes = useCallback(() => {
    setActiveTypes(new Set());
  }, []);

  // ── Depth handler ──
  const handleDepthChange = useCallback((newDepth: number) => {
    setDepth(newDepth);
  }, []);

  // ── Hide handler ──
  const handleHideNode = useCallback((nodeId: string) => {
    setHiddenNodeIds((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  }, []);

  const handleUnhideAll = useCallback(() => {
    setHiddenNodeIds(new Set());
  }, []);

  // ── Context menu handlers ──
  const handleContextMenuClose = useCallback(() => {
    setContextMenuNode(null);
  }, []);

  const handleContextMenuFocus = useCallback((node: Node3D) => {
    const sm = sceneManagerRef.current;
    if (!sm || !node.group) return;
    animateCameraTo(sm.camera, sm.controls, node.group.position);
    setSelectedNode(node);
  }, []);

  const handleContextMenuShowDetails = useCallback((node: Node3D) => {
    setSelectedNode(node);
  }, []);

  const handleContextMenuExpandDepth = useCallback((node: Node3D) => {
    setSelectedNode(node);
    setDepth(2);
  }, []);

  // ── Mouse handlers (screen-space picking) ──

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    tooltipPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleClick = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;

    // Close context menu on any click
    setContextMenuNode(null);

    const clicked = findClosestNode(
      mouseRef.current,
      sm.camera,
      nodesRef.current,
    );

    if (clicked && clicked.group) {
      // Smooth camera animation to the clicked node
      animateCameraTo(sm.camera, sm.controls, clicked.group.position);

      setSelectedNode((prev) => (prev?.id === clicked.id ? null : clicked));
    } else {
      setSelectedNode(null);
    }
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    const sm = sceneManagerRef.current;
    if (!sm) return;

    // Update mouse NDC for picking
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    const rightClicked = findClosestNode(
      mouseRef.current,
      sm.camera,
      nodesRef.current,
    );

    if (rightClicked) {
      setContextMenuNode(rightClicked);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    } else {
      setContextMenuNode(null);
    }
  }, []);

  // ── Visibility logic (combines type filter + depth + hidden) ──

  useEffect(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const sm = sceneManagerRef.current;
    if (nodes.length === 0 || !sm) return;

    // Compute reachable set from selected node at given depth
    const reachable =
      depth < 5 && selectedNode
        ? computeReachableNodeIds(selectedNode.id, edges, depth)
        : null;

    const visibleIds = new Set<string>();

    for (const node of nodes) {
      const visible =
        activeTypes.has(node.entity.label) &&
        !hiddenNodeIds.has(node.id) &&
        (!reachable || reachable.has(node.id));

      if (node.group) node.group.visible = visible;
      if (visible) visibleIds.add(node.id);
    }

    // Update edge + pulse visibility
    for (const edge of edges) {
      const visible =
        visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId);
      if (edge.line) edge.line.visible = visible;
      if (edge.pulse) edge.pulse.visible = visible;
      if (edge.pulseTrail) edge.pulseTrail.visible = visible;
    }

    // Update label visibility
    const labelChildren = sm.labelsGroup.children;
    for (let i = 0; i < nodes.length && i < labelChildren.length; i++) {
      labelChildren[i].visible = nodes[i].group?.visible ?? false;
    }
  }, [activeTypes, hiddenNodeIds, depth, selectedNode]);

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const handler = createKeyboardHandler({
      onSearchToggle: () => {
        setIsSearchOpen((prev) => {
          if (prev) {
            setSearchTerm("");
            setSearchResultIndex(0);
          }
          return !prev;
        });
      },
      onFitView: () => {
        const sm = sceneManagerRef.current;
        if (!sm) return;
        const visibleNodes = nodesRef.current.filter(
          (n) => n.group && n.group.visible,
        );
        fitViewToNodes(sm.camera, sm.controls, visibleNodes);
      },
      onEscape: () => {
        // Close context menu first
        setContextMenuNode((prev) => {
          if (prev) return null;
          return prev;
        });
        // Close search if open
        setIsSearchOpen((prev) => {
          if (prev) {
            setSearchTerm("");
            setSearchResultIndex(0);
            return false;
          }
          return prev;
        });
        // Deselect node
        setSelectedNode(null);
      },
      onHideSelected: () => {
        setSelectedNode((prev) => {
          if (prev) {
            setHiddenNodeIds((h) => {
              const next = new Set(h);
              next.add(prev.id);
              return next;
            });
            return null;
          }
          return prev;
        });
      },
      onSearchNext: () => {
        // Only navigate if search is open
        setIsSearchOpen((isOpen) => {
          if (isOpen) {
            setSearchResultIndex((prev) =>
              searchResults.length > 0 ? (prev + 1) % searchResults.length : 0,
            );
          }
          return isOpen;
        });
      },
      onSearchPrev: () => {
        setIsSearchOpen((isOpen) => {
          if (isOpen) {
            setSearchResultIndex((prev) =>
              searchResults.length > 0
                ? (prev - 1 + searchResults.length) % searchResults.length
                : 0,
            );
          }
          return isOpen;
        });
      },
    });

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchResults.length]);

  // ── Apply controls config to the live scene ──

  useEffect(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;

    sm.setAutoRotate(controls.autoRotate, controls.autoRotateSpeed);
    sm.setBloom(
      controls.bloomStrength,
      controls.bloomRadius,
      controls.bloomThreshold,
    );
    sm.setGridVisible(controls.showGrid);
    sm.setNebulaVisible(controls.showNebula);

    // Toggle group visibility
    sm.edgesGroup.visible = controls.showEdges;
    sm.pulsesGroup.visible = controls.showPulses;
    sm.labelsGroup.visible = controls.showLabels;

    // Apply global node scale multiplier
    for (const node of nodesRef.current) {
      if (node.group) {
        node.group.scale.setScalar(controls.nodeScale);
      }
    }

    // Apply edge opacity
    sm.edgesGroup.traverse((obj) => {
      if (
        obj instanceof THREE.Line &&
        obj.material instanceof THREE.LineBasicMaterial
      ) {
        obj.material.opacity = controls.edgeOpacity;
      }
    });
  }, [controls]);

  // ── Scene initialization ──

  useEffect(() => {
    if (isLoading || isError || entities.length === 0 || initializedRef.current)
      return;
    if (!containerRef.current) return;

    initializedRef.current = true;
    const t0 = performance.now();

    // 1. Create scene manager and initialize with container
    const sm = createSceneManager();
    sm.init(containerRef.current);
    sceneManagerRef.current = sm;

    // 2. Transform data via DataBridge
    const bridge = createDataBridge();
    const { nodes, edges } = bridge.transform(entities, relationships);
    nodesRef.current = nodes;
    edgesRef.current = edges;

    // Compute stats
    const graphStats = bridge.getStats(nodes, edges);
    setStats({
      nodeCount: graphStats.nodeCount,
      edgeCount: graphStats.edgeCount,
      typeDistribution: graphStats.typeDistribution,
    });

    // 3. Run force-directed layout simulation
    const layout = createForceLayout();
    layout.simulate(nodes, edges);

    const layoutMs = (performance.now() - t0).toFixed(1);
    console.log(
      `[KG3D] Layout: ${nodes.length} nodes, ${edges.length} edges in ${layoutMs}ms`,
    );

    // 4. Create meshframes for each node and add to nodesGroup
    const baseY = baseYRef.current;
    baseY.clear();

    for (const node of nodes) {
      const group = createMeshframe(
        node.meshframeType,
        node.scale,
        node.seed,
        node.color,
      );
      group.position.copy(node.position);
      group.scale.setScalar(controls.nodeScale);

      node.group = group;
      sm.nodesGroup.add(group);

      // Store the initial Y for the floating animation baseline
      baseY.set(node.id, node.position.y);
    }

    // 5. Create edges via EdgeManager and add to edgesGroup / pulsesGroup
    const em = createEdgeManager();
    edgeManagerRef.current = em;

    const nodeMap = new Map<string, Node3D>();
    for (const n of nodes) nodeMap.set(n.id, n);

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);
      if (!source || !target) continue;

      const result = em.createEdge(
        source.position,
        target.position,
        edge.relationship.type,
        source.color,
        i,
      );

      edge.line = result.line;
      edge.curve = result.curve;
      edge.pulse = result.pulse;
      edge.pulseTrail = result.trail;
      edge.hasPulse = result.hasPulse;
      edge.pulseSpeed = result.pulseSpeed;

      sm.edgesGroup.add(result.line);
      if (result.pulse) sm.pulsesGroup.add(result.pulse);
      if (result.trail) sm.pulsesGroup.add(result.trail);
    }

    // 6. Create labels via LabelManager and add to labelsGroup
    const lm = createLabelManager();
    labelManagerRef.current = lm;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const sprite = lm.createLabel(node.entity.name, node.color, i);
      const labelPos = node.position.clone();
      labelPos.y += node.scale * 1.2 + 0.5;
      sprite.position.copy(labelPos);
      sm.labelsGroup.add(sprite);
    }

    // 7. Start animation loop
    sm.animate((t: number, _dt: number) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const currentEM = edgeManagerRef.current;
      const currentLM = labelManagerRef.current;

      // Rotate and float meshframes
      for (const node of currentNodes) {
        if (!node.group) continue;

        node.group.rotation.y += 0.003;
        node.group.rotation.x += 0.001;

        const nodeBaseY = baseY.get(node.id) ?? 0;
        const phase = node.seed * 1.3;
        node.group.position.y = nodeBaseY + Math.sin(t * 0.8 + phase) * 0.25;
      }

      // Update edge pulses
      if (currentEM) {
        for (const edge of currentEdges) {
          if (edge.hasPulse && edge.pulse && edge.curve) {
            edge.pulseT += edge.pulseSpeed;
            if (edge.pulseT > 1) edge.pulseT = 0;
            currentEM.updatePulse(
              edge.pulse,
              edge.pulseTrail,
              edge.curve,
              edge.pulseT,
              t,
            );
          }
        }
      }

      // Update labels to follow node positions
      if (currentLM) {
        for (let i = 0; i < currentNodes.length; i++) {
          const node = currentNodes[i];
          if (!node.group) continue;
          const sprite = sm.labelsGroup.children[i] as THREE.Sprite | undefined;
          if (sprite) {
            sprite.position.set(
              node.group.position.x,
              node.group.position.y + node.scale * 1.2 + 0.5,
              node.group.position.z,
            );
            currentLM.updateLabel(sprite, sprite.position, node.scale, t, i);
          }
        }
      }

      // Screen-space hover detection
      const hovered = findClosestNode(
        mouseRef.current,
        sm.camera,
        currentNodes,
      );
      setHoveredNode((prev) => {
        if (prev?.id === hovered?.id) return prev;
        return hovered;
      });
      if (hovered) {
        setTooltipPos(tooltipPosRef.current);
      }
    });

    // 8. Resize handler
    const handleResize = () => sm.resize();
    window.addEventListener("resize", handleResize);

    // 9. Mouse event listeners
    const container = containerRef.current;
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("click", handleClick);
    container.addEventListener("contextmenu", handleContextMenu);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("click", handleClick);
      container.removeEventListener("contextmenu", handleContextMenu);
      sm.dispose();
      em.dispose();
      lm.dispose();
      sceneManagerRef.current = null;
      edgeManagerRef.current = null;
      labelManagerRef.current = null;
      initializedRef.current = false;
    };
  }, [
    isLoading,
    isError,
    entities,
    relationships,
    handleMouseMove,
    handleClick,
    handleContextMenu,
    controls.nodeScale,
  ]);

  // ── Controls change handler ──

  const handleControlsChange = useCallback((newConfig: ControlsConfig) => {
    setControls(newConfig);
  }, []);

  // ── Loading state ──

  if (isLoading) {
    return (
      <div className="relative h-full min-h-[560px] w-full bg-[#0B1014] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#07A288]" />
          <p className="text-sm text-gray-400">Loading 3D graph data...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──

  if (isError) {
    return (
      <div className="relative h-full min-h-[560px] w-full bg-[#0B1014] flex items-center justify-center">
        <div className="max-w-md text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-100 mb-2">
              Failed to Load Graph
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Could not fetch the knowledge graph data. Please try again.
            </p>
          </div>
          <Link href={`/app/knowledge-graph/${knowledgeBaseId}`}>
            <Button
              variant="outline"
              className="gap-2 border-[#243645] text-gray-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to 2D Graph
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Empty data state ──

  if (entities.length === 0 && !isLoading) {
    return (
      <div className="relative h-full min-h-[560px] w-full bg-[#0B1014] flex items-center justify-center">
        <div className="max-w-md text-center space-y-6">
          <p className="text-sm text-gray-400">
            No entities found. Generate the knowledge graph first.
          </p>
          <Link href={`/app/knowledge-graph/${knowledgeBaseId}`}>
            <Button
              variant="outline"
              className="gap-2 border-[#243645] text-gray-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to 2D Graph
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Main render ──

  return (
    <div className="relative h-full min-h-[560px] w-full bg-[#0B1014] overflow-hidden flex flex-col">
      {/* GraphToolbar (full width, top) */}
      <div className="relative z-30 pointer-events-auto shrink-0">
        <GraphToolbar
          knowledgeBaseId={knowledgeBaseId}
          entities={entities}
          totalEntities={summaryData?.entityCount ?? entities.length}
          nodeCount={stats?.nodeCount ?? 0}
          edgeCount={stats?.edgeCount ?? 0}
          typeDistribution={entityLabelDistribution}
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
          searchResults={searchResults}
          searchResultIndex={searchResultIndex}
          onSearchResultNext={handleSearchResultNext}
          onSearchResultPrev={handleSearchResultPrev}
          onSearchResultSelect={handleSearchResultSelect}
          isSearchOpen={isSearchOpen}
          onSearchToggle={handleSearchToggle}
          activeTypes={activeTypes}
          onToggleType={handleToggleType}
          onShowAllTypes={handleShowAllTypes}
          onHideAllTypes={handleHideAllTypes}
          depth={depth}
          onDepthChange={handleDepthChange}
          selectedNodeName={selectedNode?.entity.name ?? null}
          graphStatus={summaryData?.status ?? "pending"}
          onGenerate={() => generateMutation.mutate()}
          isGenerating={generateMutation.isPending}
          hiddenCount={hiddenNodeIds.size}
          onUnhideAll={handleUnhideAll}
        />
      </div>

      {/* Three.js canvas + overlay container */}
      <div className="relative flex-1 min-h-0">
        {/* Three.js canvas container */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Stats overlay (top-left) */}
        <div className="absolute top-4 left-4 z-20 pointer-events-auto">
          <StatsOverlay
            stats={stats}
            totalEntities={summaryData?.entityCount ?? entities.length}
            hoveredNode={hoveredNode}
          />
        </div>

        {/* Selected node detail panel (top-right) */}
        {selectedNode && (
          <div className="absolute top-4 right-4 z-20 pointer-events-auto">
            <NodeDetailPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        )}

        {/* Controls panel (bottom-right) */}
        <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
          <ControlsPanel config={controls} onChange={handleControlsChange} />
        </div>

        {/* Hover tooltip (follows cursor) */}
        {hoveredNode && !selectedNode && (
          <HoverTooltip node={hoveredNode} position={tooltipPos} />
        )}

        {/* Right-click context menu */}
        <NodeContextMenu
          node={contextMenuNode}
          position={contextMenuPos}
          onClose={handleContextMenuClose}
          onFocus={handleContextMenuFocus}
          onHide={handleHideNode}
          onShowDetails={handleContextMenuShowDetails}
          onExpandDepth={handleContextMenuExpandDepth}
        />
      </div>
    </div>
  );
}
