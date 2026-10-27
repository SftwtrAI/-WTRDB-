import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as THREE from "three";
import {
  ArrowLeft,
  Activity,
  BrainCircuit,
  Crosshair,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  EyeOff,
  Hammer,
  Loader2,
  Search,
  SlidersHorizontal,
  Telescope,
  Volume2,
  VolumeX,
  BookOpen,
  Network,
  AlertTriangle,
  RadioTower,
  FlaskConical,
  GitMerge,
  LayoutDashboard,
  Settings,
  FileText,
  CreditCard,
  Shield,
  LogOut,
  User,
  Key,
  Bell,
  Lock,
  Coins,
  Ghost,
  Layers,
  Send,
  BarChart3,
  Map as MapIcon,
  Compass,
  Sparkles,
  Share2,
  Crown,
  ShieldCheck,
  Upload,
  Plus,
  X,
  Globe,
  Download,
  Trash2,
  Users,
  Brain,
  Ban,
  Clock,
  Mail,
  Mic,
  Copy,
  RefreshCw,
  Server,
  Check,
} from "lucide-react";
import { AuthStorage } from "@/lib/auth-storage";
import { useAppView } from "@/contexts/app-view-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GraphEntity, GraphRelationship, Node3D, Edge3D } from "@/components/knowledge-graph-3d/types";
import { createSceneManager, type SceneManager } from "@/components/knowledge-graph-3d/scene";
import { createDataBridge } from "@/components/knowledge-graph-3d/data-bridge";
import { createForceLayout } from "@/components/knowledge-graph-3d/force-layout";
import { createMeshframe } from "@/components/knowledge-graph-3d/meshframes";
import { createEdgeManager, type EdgeManager } from "@/components/knowledge-graph-3d/edges";
import { NodeContextMenu } from "@/components/knowledge-graph-3d/context-menu";
import {
  animateCameraTo,
  computeReachableNodeIds,
  fitViewToNodes,
} from "@/components/knowledge-graph-3d/camera-utils";
import { createAmbientAudio, type AmbientAudioEngine } from "@/components/knowledge-graph-3d/ambient-audio";
import { MetaGraphsSection } from "@/components/utilities/MetaGraphsSection";

type GraphStatus = "pending" | "extracting" | "completed" | "failed";

interface RagKnowledgeItem {
  id: string;
  title: string;
  createdAt: string;
  ragStatus?: "pending" | "processing" | "completed" | "failed";
}

interface GraphSummaryResponse {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  status: GraphStatus;
  lastUpdated?: string;
  extractedChunks?: number;
  totalChunks?: number;
}

interface GraphEntitiesResponse {
  entities: GraphEntity[];
  total?: number;
}

interface GraphRelationshipsResponse {
  relationships: GraphRelationship[];
  total?: number;
}

interface FieldGraphSnapshot {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

interface FederationRow {
  id: string;
  constituentKbIds?: string[];
}

interface CelestialStar {
  id: string;
  name: string;
  entityCount: number;
  relationshipCount: number;
  freshness: number;
  radius: number;
  colorHex: string;
  status: GraphStatus;
  isExtracting: boolean;
  isFederated: boolean;
  extractedChunks: number;
  totalChunks: number;
}

interface StarRenderEntry {
  id: string;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  materials: Array<{ material: THREE.Material; baseOpacity: number }>;
  baseScale: number;
  isExtracting: boolean;
}

type UtilityView =
  | "merge-playground"
  | "eval-harness"
  | "graph-pulse";

interface RouteViewInfo {
  view: string | null;
  id: string | null;
}

interface EvalRunRow {
  id: string;
  name?: string;
  status?: "running" | "complete" | "failed";
  overallScore?: number;
  createdAt?: string;
  date?: string;
}

const FIELD_CAMERA_POSITION = new THREE.Vector3(0, 16, 34);
const FIELD_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff;
  const ag = (ah >> 8) & 0xff;
  const ab = ah & 0xff;
  const br = (bh >> 16) & 0xff;
  const bg = (bh >> 8) & 0xff;
  const bb = bh & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
}

function colorFromFreshness(freshness: number): string {
  if (freshness >= 0.65) {
    const t = (freshness - 0.65) / 0.35;
    return lerpColor("#5BBE4E", "#07A288", clamp01(t));
  }
  const t = freshness / 0.65;
  return lerpColor("#3A4A56", "#5BBE4E", clamp01(t));
}

function toHexNumber(color: string): number {
  return parseInt(color.replace("#", ""), 16);
}

function starRadius(entityCount: number): number {
  const r = 0.42 + Math.log10(Math.max(1, entityCount) + 1) * 0.55;
  return Math.max(0.42, Math.min(1.9, r));
}

function freshnessFromDate(lastUpdated?: string): number {
  if (!lastUpdated) return 0.3;
  const parsed = Date.parse(lastUpdated);
  if (!Number.isFinite(parsed)) return 0.3;
  const ageDays = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
  return clamp01(1 - ageDays / 90);
}

function circlePoints(radius: number, segments = 24): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
  }
  return pts;
}

function collectOpacityMaterials(
  root: THREE.Object3D,
): Array<{ material: THREE.Material; baseOpacity: number }> {
  const materials: Array<{ material: THREE.Material; baseOpacity: number }> = [];

  root.traverse((obj) => {
    const source = (obj as { material?: THREE.Material | THREE.Material[] }).material;
    if (!source) return;

    const list = Array.isArray(source) ? source : [source];
    for (const material of list) {
      const mat = material as THREE.Material & { opacity?: number };
      if (typeof mat.opacity !== "number") continue;
      materials.push({
        material,
        baseOpacity: mat.opacity,
      });
    }
  });

  return materials;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as any).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      for (const mat of material) mat.dispose();
    } else if (material) {
      material.dispose();
    }
  });
}

function parseAppViewFromPath(pathname: string): RouteViewInfo {
  const match = pathname.match(/^\/app\/([^/?#]+)(?:\/([^/?#]+))?/);
  return {
    view: match?.[1] ?? null,
    id: match?.[2] ?? null,
  };
}

function isUtilityView(value: string | null): value is UtilityView {
  return (
    value === "merge-playground" ||
    value === "eval-harness" ||
    value === "graph-pulse"
  );
}

function findClosestGraphNode(
  mouseNdc: THREE.Vector2,
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
    const dx = projected.x - mouseNdc.x;
    const dy = projected.y - mouseNdc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist && dist < 0.1) {
      minDist = dist;
      closest = node;
    }
  }

  return closest;
}

function pointToSegmentDistanceSquared(
  p: THREE.Vector2,
  a: THREE.Vector2,
  b: THREE.Vector2,
): number {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const abLenSq = Math.max(1e-6, ab.lengthSq());
  const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
  const projection = a.clone().add(ab.multiplyScalar(t));
  return projection.distanceToSquared(p);
}

function findClosestGraphEdge(
  mouseNdc: THREE.Vector2,
  camera: THREE.Camera,
  edges: Edge3D[],
): Edge3D | null {
  let closest: Edge3D | null = null;
  let minDistanceSq = Infinity;
  const p = new THREE.Vector2(mouseNdc.x, mouseNdc.y);
  const projected = new THREE.Vector3();

  for (const edge of edges) {
    if (!edge.curve || !edge.line?.visible) continue;
    const points = edge.curve.getPoints(10);
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const aNdc = projected.copy(a).project(camera);
      const av = new THREE.Vector2(aNdc.x, aNdc.y);
      const bNdc = projected.copy(b).project(camera);
      const bv = new THREE.Vector2(bNdc.x, bNdc.y);
      const distSq = pointToSegmentDistanceSquared(p, av, bv);
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closest = edge;
      }
    }
  }

  return minDistanceSq < 0.0015 ? closest : null;
}

/* ── Utilities Panel — the painter's tray ── */

interface UtilitySection {
  id: string;
  label: string;
  items: { label: string; route: string; icon: React.ElementType; desc?: string }[];
  adminOnly?: boolean;
}

const UTILITY_SECTIONS: UtilitySection[] = [
  {
    id: "celestial",
    label: "Celestial Field",
    items: [
      { label: "Constellation View", route: "/app/constellation", icon: Sparkles, desc: "Star field of all knowledge graphs" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    adminOnly: true,
    items: [
      { label: "Admin Dashboard", route: "/admin", icon: Shield, desc: "System administration" },
      { label: "User Management", route: "/admin", icon: Users, desc: "Accounts & credits" },
      { label: "Roles & Permissions", route: "/admin", icon: ShieldCheck, desc: "RBAC configuration" },
      { label: "LLM Models", route: "/admin", icon: Brain, desc: "Model catalog" },
      { label: "Branding", route: "/admin", icon: Globe, desc: "Logo, colors, company" },
      { label: "Email Settings", route: "/admin", icon: Mail, desc: "SMTP & templates" },
      { label: "Banned Words", route: "/admin", icon: Ban, desc: "Content moderation" },
      { label: "Batch Jobs", route: "/admin", icon: Clock, desc: "Background jobs" },
      { label: "System Settings", route: "/admin", icon: SlidersHorizontal, desc: "Diagnostics & cache" },
    ],
  },
];

interface SchemaType {
  id: string;
  name: string;
  category: "entity" | "relationship";
  instanceCount: number;
  examples: string[];
}

interface UtilitiesPanelProps {
  activeUtility: UtilityView | null;
  openUtility: (view: UtilityView) => void;
  inGraphMode: boolean;
  selectedGraphId: string | null;
  stars: CelestialStar[];
  graphSummary: GraphSummaryResponse | undefined;
  graphVisibleCount: number;
  graphEntities: GraphEntity[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  searchResults: Node3D[];
  searchResultIndex: number;
  handleSearchResultSelect: () => void;
  handleSearchResultNext: () => void;
  handleSearchResultPrev: () => void;
  graphTypes: string[];
  activeTypes: Set<string>;
  graphTypeDistribution: Record<string, number>;
  handleToggleType: (label: string) => void;
  depth: number;
  setDepth: (v: number) => void;
  selectedNode: Node3D | null;
  showEdges: boolean;
  setShowEdges: (v: boolean) => void;
  showPulses: boolean;
  setShowPulses: (v: boolean) => void;
  nodeScale: number;
  setNodeScale: (v: number) => void;
  handleFitView: () => void;
  handleUnhideAll: () => void;
  hiddenNodeIds: Set<string>;
  handleShowAllTypes: () => void;
  handleHideAllTypes: () => void;
  audioEnabled: boolean;
  toggleAudio: () => void;
  audioVolume: number;
  setAudioVolume: (v: number) => void;
}

interface ModelOption {
  id: string;
  label: string;
  family: string;
  api: "responses" | "chat";
  reasoning: boolean;
  speed: "fast" | "medium" | "slow" | "very-slow";
  cost: "$" | "$$" | "$$$" | "$$$$";
  quality: "good" | "great" | "best";
  description: string;
}

interface StageInfo {
  id: "extraction" | "adjudication" | "query";
  label: string;
  description: string;
  whyItMatters: string;
  recommendedTier: "premium" | "balanced" | "budget";
}

interface StageConfig {
  model: string;
  reasoningEffort: "low" | "medium" | "high" | null;
}

interface KgPreferences {
  extraction: StageConfig;
  adjudication: StageConfig;
  query: StageConfig;
}

function KgModelSettingsSection({
  expandedSections,
  toggleSection,
}: {
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
}) {
  const isExpanded = expandedSections.has("kg-models");
  const [editingStage, setEditingStage] = useState<string | null>(null);

  const { data: catalog } = useQuery<{
    models: ModelOption[];
    stages: StageInfo[];
    defaults: KgPreferences;
  }>({
    queryKey: ["/api/kg-models/catalog"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/kg-models/catalog");
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 5 * 60_000,
  });

  const { data: settings } = useQuery<{ preferences: KgPreferences }>({
    queryKey: ["/api/kg-models/settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/kg-models/settings");
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (preferences: KgPreferences) => {
      return apiRequest("PUT", "/api/kg-models/settings", { preferences });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kg-models/settings"] });
    },
  });

  const handlePickModel = (
    stageId: "extraction" | "adjudication" | "query",
    model: string,
    reasoningEffort: "low" | "medium" | "high" | null,
  ) => {
    if (!settings) return;
    const next: KgPreferences = {
      ...settings.preferences,
      [stageId]: { model, reasoningEffort },
    };
    updateMutation.mutate(next);
    setEditingStage(null);
  };

  const stages = catalog?.stages ?? [];
  const models = catalog?.models ?? [];
  const prefs = settings?.preferences;

  const tierColor = (tier: string) =>
    tier === "premium" ? "text-[#B8E52B]"
    : tier === "balanced" ? "text-[#5BBE4E]"
    : "text-[#07A288]";

  return (
    <div className="border-t border-[#243645] pt-3 mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground hover:bg-[#07A288]/10 transition-colors"
        onClick={() => toggleSection("kg-models")}
      >
        <span>Models</span>
        <ChevronRight className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
      </button>
      {isExpanded && (
        <div className="mt-1 px-1 space-y-2">
          <p className="text-[10px] text-muted-foreground px-2 leading-relaxed">
            Choose which OpenAI model handles each stage of the extraction pipeline. Spend on what matters.
          </p>

          {stages.map((stage) => {
            const current = prefs?.[stage.id];
            const currentModel = current ? models.find((m) => m.id === current.model) : null;
            const isEditing = editingStage === stage.id;

            return (
              <div key={stage.id} className="rounded border border-[#243645] bg-[#0B1014]/60 overflow-hidden">
                {/* Header */}
                <div className="px-2.5 py-2 border-b border-[#243645]/60">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-semibold text-foreground">{stage.label}</span>
                    <span className={`text-[9px] uppercase tracking-wider ${tierColor(stage.recommendedTier)}`}>
                      {stage.recommendedTier}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">{stage.description}</p>
                  <p className="text-[10px] text-muted-foreground/70 leading-snug mt-1 italic">
                    {stage.whyItMatters}
                  </p>
                </div>

                {/* Current selection */}
                <div className="px-2.5 py-2">
                  {currentModel && current ? (
                    <button
                      type="button"
                      className="w-full text-left rounded px-2 py-1.5 hover:bg-[#07A288]/10 transition-colors"
                      onClick={() => setEditingStage(isEditing ? null : stage.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-foreground">{currentModel.label}</span>
                            {current.reasoningEffort && (
                              <span className="text-[9px] rounded px-1.5 py-0.5 bg-[#07A288]/15 text-[#07A288]">
                                {current.reasoningEffort}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {currentModel.cost} · {currentModel.speed} · {currentModel.quality}
                          </div>
                        </div>
                        <ChevronRight className={`h-3 w-3 transition-transform ${isEditing ? "rotate-90" : ""}`} />
                      </div>
                    </button>
                  ) : (
                    <div className="text-[10px] text-muted-foreground px-2 py-1">Loading...</div>
                  )}

                  {/* Picker */}
                  {isEditing && (
                    <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
                      {models.map((m) => {
                        const isCurrent = m.id === current?.model;
                        return (
                          <div key={m.id} className="rounded border border-[#243645] bg-[#0B1014]/40 p-2">
                            <div className="flex items-center justify-between mb-1">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-foreground font-medium">{m.label}</span>
                                  {isCurrent && (
                                    <span className="text-[8px] rounded px-1 py-0.5 bg-[#07A288]/20 text-[#07A288]">CURRENT</span>
                                  )}
                                </div>
                                <div className="text-[9px] text-muted-foreground">
                                  {m.family} · {m.cost} · {m.speed} · {m.quality}
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground mb-1.5 leading-snug">{m.description}</p>
                            {m.reasoning ? (
                              <div className="grid grid-cols-3 gap-1">
                                {(["low", "medium", "high"] as const).map((effort) => (
                                  <button
                                    key={effort}
                                    type="button"
                                    className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
                                      isCurrent && current?.reasoningEffort === effort
                                        ? "border-[#07A288] bg-[#07A288]/20 text-[#07A288]"
                                        : "border-[#243645] text-muted-foreground hover:border-[#07A288]/40 hover:text-foreground"
                                    }`}
                                    onClick={() => handlePickModel(stage.id, m.id, effort)}
                                    disabled={updateMutation.isPending}
                                  >
                                    {effort}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`w-full text-[10px] rounded px-2 py-1 border transition-colors ${
                                  isCurrent
                                    ? "border-[#07A288] bg-[#07A288]/20 text-[#07A288]"
                                    : "border-[#243645] text-muted-foreground hover:border-[#07A288]/40 hover:text-foreground"
                                }`}
                                onClick={() => handlePickModel(stage.id, m.id, null)}
                                disabled={updateMutation.isPending}
                              >
                                {isCurrent ? "Selected" : "Select"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface BrainEndpoint {
  id: string;
  knowledgeBaseId: string;
  name: string;
  apiKey: string;
  queryModel: string | null;
  queryReasoningEffort: string | null;
  traversalModel: string | null;
  traversalReasoningEffort: string | null;
  rateLimitPerMinute: number;
  allowNlQueries: boolean;
  allowCypher: boolean;
  expiresAt: string | null;
  queryCount: number;
  avgLatencyMs: number;
  lastUsedAt: string | null;
  createdAt: string;
}

function BrainEndpointsSection({
  selectedGraphId,
  selectedStarName,
  expandedSections,
  toggleSection,
}: {
  selectedGraphId: string | null;
  selectedStarName: string | null;
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
}) {
  const isExpanded = expandedSections.has("brain-endpoints");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  // Form state for creating a new endpoint
  const [formName, setFormName] = useState("");
  const [formQueryModel, setFormQueryModel] = useState<string>("");
  const [formQueryEffort, setFormQueryEffort] = useState<"low" | "medium" | "high">("medium");
  const [formTraversalModel, setFormTraversalModel] = useState<string>("");
  const [formTraversalEffort, setFormTraversalEffort] = useState<"low" | "medium" | "high">("medium");
  const [formAllowCypher, setFormAllowCypher] = useState(false);

  const { data: endpointsData } = useQuery<{ endpoints: BrainEndpoint[] }>({
    queryKey: ["/api/brain-endpoints"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/brain-endpoints");
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 30_000,
  });

  // Reuse the model catalog from the DIAL-KG settings endpoint
  const { data: catalog } = useQuery<{ models: ModelOption[] }>({
    queryKey: ["/api/kg-models/catalog"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/kg-models/catalog");
      return res.json();
    },
    enabled: isExpanded && showCreate,
    staleTime: 5 * 60_000,
  });
  const models = catalog?.models ?? [];

  const createMutation = useMutation({
    mutationFn: async (input: any) => {
      const res = await apiRequest("POST", "/api/brain-endpoints", input);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain-endpoints"] });
      setShowCreate(false);
      setFormName("");
      setFormQueryModel("");
      setFormTraversalModel("");
      setFormAllowCypher(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/brain-endpoints/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain-endpoints"] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/brain-endpoints/${id}/regenerate-key`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brain-endpoints"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async ({ apiKey, question }: { apiKey: string; question: string }) => {
      const res = await fetch(`/api/brain/${apiKey}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      return res.json();
    },
    onSuccess: (data, vars) => {
      setTestResults((prev) => ({ ...prev, [vars.apiKey]: data.answer || "(no answer)" }));
    },
    onError: (err: any, vars) => {
      setTestResults((prev) => ({ ...prev, [vars.apiKey]: `Error: ${err.message}` }));
    },
  });

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  const handleCreate = () => {
    if (!selectedGraphId || !formName.trim()) return;
    createMutation.mutate({
      knowledgeBaseId: selectedGraphId,
      name: formName.trim(),
      queryModel: formQueryModel || null,
      queryReasoningEffort: formQueryModel && models.find((m) => m.id === formQueryModel)?.reasoning ? formQueryEffort : null,
      traversalModel: formTraversalModel || null,
      traversalReasoningEffort: formTraversalModel && models.find((m) => m.id === formTraversalModel)?.reasoning ? formTraversalEffort : null,
      allowCypher: formAllowCypher,
    });
  };

  // Default form name to the current graph's name when opening the form
  useEffect(() => {
    if (showCreate && selectedStarName && !formName) {
      setFormName(`${selectedStarName} Brain`);
    }
  }, [showCreate, selectedStarName, formName]);

  const endpoints = endpointsData?.endpoints ?? [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="border-t border-[#243645] pt-3 mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground hover:bg-[#07A288]/10 transition-colors"
        onClick={() => toggleSection("brain-endpoints")}
      >
        <span>Brain Endpoints</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-normal normal-case tracking-normal opacity-60">
            {endpoints.length} published
          </span>
          <ChevronRight className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
        </div>
      </button>
      {isExpanded && (
        <div className="mt-1 px-1 space-y-2">
          <div className="px-2 flex items-start justify-between gap-2">
            <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">
              Publish a graph as a queryable Brain. Each endpoint exposes both REST and an MCP server with model config baked in.
            </p>
            <a
              href="/docs/brain"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] uppercase tracking-wider text-[#07A288] hover:text-[#5BBE4E] whitespace-nowrap flex-shrink-0"
            >
              📖 Docs
            </a>
          </div>

          {/* Create button */}
          {!showCreate ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-[#243645] px-2 py-2 text-[11px] text-muted-foreground hover:border-[#07A288]/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setShowCreate(true)}
              disabled={!selectedGraphId}
            >
              <Plus className="h-3.5 w-3.5" />
              {selectedGraphId ? "Publish current graph" : "Open a graph to publish it"}
            </button>
          ) : (
            <div className="rounded border border-[#243645] bg-[#0B1014]/60 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">New Brain Endpoint</span>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Endpoint name..."
                className="w-full h-7 rounded border border-[#243645] bg-[#0B1014]/80 px-2 text-[11px] text-foreground outline-none"
              />

              {/* Query model */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground block mb-1">
                  Query Model (NL → Cypher)
                </label>
                <select
                  value={formQueryModel}
                  onChange={(e) => setFormQueryModel(e.target.value)}
                  className="w-full h-7 rounded border border-[#243645] bg-[#0B1014]/80 px-2 text-[11px] text-foreground outline-none"
                >
                  <option value="">Inherit from app default</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.cost})
                    </option>
                  ))}
                </select>
                {formQueryModel && models.find((m) => m.id === formQueryModel)?.reasoning && (
                  <div className="flex gap-1 mt-1">
                    {(["low", "medium", "high"] as const).map((effort) => (
                      <button
                        key={effort}
                        type="button"
                        className={`flex-1 text-[9px] rounded px-1.5 py-0.5 border ${
                          formQueryEffort === effort
                            ? "border-[#07A288] bg-[#07A288]/20 text-[#07A288]"
                            : "border-[#243645] text-muted-foreground"
                        }`}
                        onClick={() => setFormQueryEffort(effort)}
                      >
                        {effort}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Traversal model */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground block mb-1">
                  Traversal Model (results → answer)
                </label>
                <select
                  value={formTraversalModel}
                  onChange={(e) => setFormTraversalModel(e.target.value)}
                  className="w-full h-7 rounded border border-[#243645] bg-[#0B1014]/80 px-2 text-[11px] text-foreground outline-none"
                >
                  <option value="">Inherit from app default</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.cost})
                    </option>
                  ))}
                </select>
                {formTraversalModel && models.find((m) => m.id === formTraversalModel)?.reasoning && (
                  <div className="flex gap-1 mt-1">
                    {(["low", "medium", "high"] as const).map((effort) => (
                      <button
                        key={effort}
                        type="button"
                        className={`flex-1 text-[9px] rounded px-1.5 py-0.5 border ${
                          formTraversalEffort === effort
                            ? "border-[#07A288] bg-[#07A288]/20 text-[#07A288]"
                            : "border-[#243645] text-muted-foreground"
                        }`}
                        onClick={() => setFormTraversalEffort(effort)}
                      >
                        {effort}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={formAllowCypher}
                  onChange={(e) => setFormAllowCypher(e.target.checked)}
                  className="accent-[#07A288]"
                />
                Allow raw Cypher passthrough
              </label>

              <button
                type="button"
                className="w-full rounded bg-[#07A288]/20 border border-[#07A288]/40 px-2 py-1.5 text-[11px] text-[#07A288] hover:bg-[#07A288]/30 transition-colors disabled:opacity-40"
                disabled={!formName.trim() || createMutation.isPending}
                onClick={handleCreate}
              >
                {createMutation.isPending ? "Creating..." : "Publish Brain Endpoint"}
              </button>
            </div>
          )}

          {/* Endpoint list */}
          <div className="space-y-1.5">
            {endpoints.length === 0 && !showCreate && (
              <p className="text-[10px] text-muted-foreground px-2 py-2">
                No endpoints published yet.
              </p>
            )}
            {endpoints.map((ep) => {
              const restUrl = `${origin}/api/brain/${ep.apiKey}/ask`;
              const mcpUrl = `${origin}/api/brain/${ep.apiKey}/mcp`;
              const isExpanded = expandedEndpoint === ep.id;
              return (
                <div key={ep.id} className="rounded border border-[#243645] bg-[#0B1014]/40 overflow-hidden">
                  <button
                    type="button"
                    className="w-full px-2.5 py-2 hover:bg-[#07A288]/8 transition-colors text-left"
                    onClick={() => setExpandedEndpoint(isExpanded ? null : ep.id)}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-foreground font-medium truncate">{ep.name}</span>
                      <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{ep.queryCount} queries</span>
                      <span>·</span>
                      <span>{ep.avgLatencyMs}ms avg</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-2.5 py-2 border-t border-[#243645]/60 space-y-2">
                      {/* REST URL */}
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">REST</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(restUrl, `rest-${ep.id}`)}
                            className="text-[9px] text-muted-foreground hover:text-[#07A288]"
                          >
                            {copied === `rest-${ep.id}` ? <Check className="h-3 w-3 text-[#07A288]" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-foreground bg-[#0B1014]/80 rounded px-2 py-1 break-all">
                          {restUrl}
                        </div>
                      </div>

                      {/* MCP URL */}
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Server className="h-2.5 w-2.5" /> MCP Server
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(mcpUrl, `mcp-${ep.id}`)}
                            className="text-[9px] text-muted-foreground hover:text-[#07A288]"
                          >
                            {copied === `mcp-${ep.id}` ? <Check className="h-3 w-3 text-[#07A288]" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-foreground bg-[#0B1014]/80 rounded px-2 py-1 break-all">
                          {mcpUrl}
                        </div>
                      </div>

                      {/* Models */}
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        <div>Query: <span className="text-foreground">{ep.queryModel ?? "inherit"}{ep.queryReasoningEffort ? ` (${ep.queryReasoningEffort})` : ""}</span></div>
                        <div>Traversal: <span className="text-foreground">{ep.traversalModel ?? "inherit"}{ep.traversalReasoningEffort ? ` (${ep.traversalReasoningEffort})` : ""}</span></div>
                        <div>Cypher: <span className="text-foreground">{ep.allowCypher ? "enabled" : "disabled"}</span></div>
                      </div>

                      {/* Inline test */}
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={testInputs[ep.id] ?? ""}
                            onChange={(e) => setTestInputs((prev) => ({ ...prev, [ep.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const q = testInputs[ep.id]?.trim();
                                if (q) testMutation.mutate({ apiKey: ep.apiKey, question: q });
                              }
                            }}
                            placeholder="Test question..."
                            className="flex-1 h-7 rounded border border-[#243645] bg-[#0B1014]/80 px-2 text-[10px] text-foreground outline-none"
                          />
                          <button
                            type="button"
                            disabled={testMutation.isPending || !testInputs[ep.id]?.trim()}
                            onClick={() => {
                              const q = testInputs[ep.id]?.trim();
                              if (q) testMutation.mutate({ apiKey: ep.apiKey, question: q });
                            }}
                            className="text-[10px] rounded border border-[#07A288]/40 bg-[#07A288]/10 px-2 text-[#07A288] hover:bg-[#07A288]/20 transition-colors disabled:opacity-40"
                          >
                            {testMutation.isPending ? "..." : "Test"}
                          </button>
                        </div>
                        {testResults[ep.apiKey] && (
                          <div className="text-[10px] text-foreground bg-[#0B1014]/80 rounded px-2 py-1 max-h-24 overflow-y-auto">
                            {testResults[ep.apiKey]}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => regenerateMutation.mutate(ep.id)}
                          disabled={regenerateMutation.isPending}
                          className="flex-1 text-[9px] rounded border border-[#243645] px-2 py-1 text-muted-foreground hover:border-[#B8E52B]/40 hover:text-[#B8E52B] transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="h-2.5 w-2.5" /> Rotate Key
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(ep.id)}
                          disabled={deleteMutation.isPending}
                          className="flex-1 text-[9px] rounded border border-[#243645] px-2 py-1 text-muted-foreground hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          <Trash2 className="h-2.5 w-2.5" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GraphSourcesSection({
  stars,
  expandedSections,
  toggleSection,
}: {
  stars: CelestialStar[];
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
}) {
  const { setView } = useAppView();
  const isExpanded = expandedSections.has("graphs");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [textName, setTextName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [addMode, setAddMode] = useState<"file" | "text">("file");

  // Poll if anything is extracting OR anything is "completed but empty" (extraction in progress under the hood)
  const needsPolling = stars.some(
    (s) => s.status === "extracting" || s.status === "pending" || (s.status === "completed" && s.entityCount === 0),
  );

  // Track which stars we've recently triggered to keep polling them even if status flickers
  const [recentlyTriggered, setRecentlyTriggered] = useState<Set<string>>(new Set());
  const shouldPoll = needsPolling || recentlyTriggered.size > 0;

  // Poll every 3s aggressively while extraction may be running. Never give up while any graph
  // is still in a non-final state. Stops only when ALL graphs have entities and are completed.
  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/celestial-field/summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rag-knowledge"] });
    }, 3000);
    return () => clearInterval(interval);
  }, [shouldPoll]);

  // Clear recently-triggered IDs once their graph reports a non-zero entity count
  useEffect(() => {
    if (recentlyTriggered.size === 0) return;
    const cleared = new Set(recentlyTriggered);
    let changed = false;
    for (const id of recentlyTriggered) {
      const star = stars.find((s) => s.id === id);
      if (star && star.entityCount > 0) {
        cleared.delete(id);
        changed = true;
      }
    }
    if (changed) setRecentlyTriggered(cleared);
  }, [stars, recentlyTriggered]);

  // Upload → auto-generate
  const uploadAndGenerate = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const token = AuthStorage.getAuthHeader();
      const res = await fetch("/api/rag-knowledge/upload", {
        method: "POST",
        headers: token ? { Authorization: token } : {},
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      // Auto-generate the graph immediately
      await apiRequest("POST", `/api/knowledge-graph/${data.id}/generate`);
      return data;
    },
    onSuccess: (data) => {
      setRecentlyTriggered((prev) => new Set(prev).add(data.id));
      queryClient.invalidateQueries({ queryKey: ["/api/rag-knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/celestial-field/summaries"] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (kbId: string) => {
      await apiRequest("POST", `/api/knowledge-graph/${kbId}/generate`);
      return kbId;
    },
    onSuccess: (kbId) => {
      setRecentlyTriggered((prev) => new Set(prev).add(kbId));
      queryClient.invalidateQueries({ queryKey: ["/api/celestial-field/summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rag-knowledge"] });
    },
  });

  const textAndGenerate = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const res = await apiRequest("POST", "/api/rag-knowledge/text", { title, content });
      const data = await res.json();
      await apiRequest("POST", `/api/knowledge-graph/${data.id}/generate`);
      return data;
    },
    onSuccess: (data) => {
      setTextName("");
      setTextContent("");
      setShowUpload(false);
      setRecentlyTriggered((prev) => new Set(prev).add(data.id));
      queryClient.invalidateQueries({ queryKey: ["/api/rag-knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/celestial-field/summaries"] });
    },
  });

  // Delete a knowledge graph (and its underlying KB) via the rag-knowledge endpoint.
  const deleteGraphMutation = useMutation({
    mutationFn: async (kbId: string) => {
      await apiRequest("DELETE", `/api/rag-knowledge/${kbId}`);
      return kbId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rag-knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/celestial-field/summaries"] });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      try { await uploadAndGenerate.mutateAsync(files[i]); } catch { /* mutation handles */ }
    }
    setUploading(false);
    setShowUpload(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="border-t border-[#243645] pt-3 mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground hover:bg-[#07A288]/10 transition-colors"
        onClick={() => toggleSection("graphs")}
      >
        <span>Knowledge Graphs</span>
        <div className="flex items-center gap-2">
          {shouldPoll && <span className="w-1.5 h-1.5 rounded-full bg-[#B8E52B] animate-pulse" />}
          <span className="text-[9px] font-normal normal-case tracking-normal opacity-60">
            {stars.length} graph{stars.length !== 1 ? "s" : ""}
          </span>
          <ChevronRight className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
        </div>
      </button>
      {isExpanded && (
        <div className="mt-1 px-1">
          {/* Add new source */}
          {!showUpload ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded border border-dashed border-[#243645] px-2 py-2 text-[11px] text-muted-foreground hover:border-[#07A288]/50 hover:text-foreground transition-colors mb-2"
              onClick={() => setShowUpload(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add documents to build a graph
            </button>
          ) : (
            <div className="rounded border border-[#243645] bg-[#0B1014]/60 p-2.5 mb-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">New Graph</span>
                <button type="button" onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>

              <div className="flex rounded border border-[#243645] overflow-hidden">
                <button type="button" className={`flex-1 py-1 text-[10px] uppercase tracking-wider ${addMode === "file" ? "bg-[#07A288]/20 text-foreground" : "text-muted-foreground"}`} onClick={() => setAddMode("file")}>Upload</button>
                <button type="button" className={`flex-1 py-1 text-[10px] uppercase tracking-wider ${addMode === "text" ? "bg-[#07A288]/20 text-foreground" : "text-muted-foreground"}`} onClick={() => setAddMode("text")}>Text</button>
              </div>

              {addMode === "file" && (
                <>
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.html,.htm,.json,.xml,.csv" className="hidden" onChange={handleFileSelect} />
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-[#07A288]/40 bg-[#07A288]/5 px-3 py-3 text-xs text-[#07A288] hover:bg-[#07A288]/10 transition-colors disabled:opacity-40"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading & generating..." : "Choose files — graph builds automatically"}
                  </button>
                </>
              )}

              {addMode === "text" && (
                <div className="space-y-1.5">
                  <input type="text" value={textName} onChange={(e) => setTextName(e.target.value)} placeholder="Graph name..." className="w-full h-7 rounded border border-[#243645] bg-[#0B1014]/80 px-2 text-[11px] text-foreground outline-none" />
                  <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Paste content..." rows={3} className="w-full rounded border border-[#243645] bg-[#0B1014]/80 px-2 py-1.5 text-[11px] text-foreground outline-none resize-none" />
                  <button
                    type="button"
                    className="w-full rounded bg-[#07A288]/20 border border-[#07A288]/40 px-2 py-1.5 text-[11px] text-[#07A288] hover:bg-[#07A288]/30 transition-colors disabled:opacity-40"
                    disabled={!textName.trim() || !textContent.trim() || textAndGenerate.isPending}
                    onClick={() => textAndGenerate.mutate({ title: textName.trim(), content: textContent.trim() })}
                  >
                    {textAndGenerate.isPending ? "Creating & generating..." : "Create & build graph"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Existing graphs */}
          <div className="space-y-0.5">
            {stars.length === 0 && !showUpload && (
              <p className="text-[10px] text-muted-foreground px-2 py-2">No graphs yet. Add documents to build your first knowledge graph.</p>
            )}
            {stars.map((star) => {
              const isPending = recentlyTriggered.has(star.id) && star.entityCount === 0;
              const isEmpty = star.status === "completed" && star.entityCount === 0;
              const displayStatus = isPending ? "extracting" : isEmpty ? "empty" : star.status;
              const showRegen = isEmpty && !isPending;
              const isClickable = star.status === "completed" && star.entityCount > 0;
              const showProgress =
                (star.isExtracting || isPending || star.status === "pending") &&
                star.totalChunks > 0;
              const progressPct = showProgress
                ? Math.min(100, Math.round((star.extractedChunks / star.totalChunks) * 100))
                : 0;

              return (
                <div key={star.id} className="flex w-full flex-wrap items-center gap-2.5 rounded px-2 py-1.5 text-xs hover:bg-[#07A288]/8 transition-colors group">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: star.colorHex }}>
                    {(star.isExtracting || isPending) && <div className="w-2 h-2 rounded-full bg-[#B8E52B] animate-pulse" />}
                  </div>
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left text-muted-foreground hover:text-foreground disabled:cursor-default"
                    disabled={!isClickable}
                    onClick={() => isClickable && setView("knowledge-graph-3d", star.id)}
                  >
                    <span className="block truncate text-foreground">{star.name}</span>
                    <div className="flex items-center gap-1.5 text-[10px] opacity-60">
                      <span>{star.entityCount} entities</span>
                      <span>·</span>
                      <span>{star.relationshipCount} rels</span>
                      {(star.isExtracting || isPending) && <Loader2 className="h-2.5 w-2.5 animate-spin text-[#B8E52B]" />}
                    </div>
                  </button>
                  <span className={`text-[9px] rounded px-1.5 py-0.5 flex-shrink-0 ${
                    isPending ? "bg-[#B8E52B]/15 text-[#B8E52B]"
                      : isEmpty ? "bg-amber-500/15 text-amber-400"
                      : star.status === "completed" ? "bg-[#07A288]/15 text-[#07A288]"
                      : star.status === "extracting" ? "bg-[#B8E52B]/15 text-[#B8E52B]"
                      : star.status === "failed" ? "bg-red-500/15 text-red-400"
                      : "bg-[#243645] text-muted-foreground"
                  }`}>
                    {displayStatus}
                  </span>
                  {showRegen && (
                    <button
                      type="button"
                      className="text-[9px] rounded border border-[#07A288]/40 bg-[#07A288]/10 px-1.5 py-0.5 text-[#07A288] hover:bg-[#07A288]/20 transition-colors disabled:opacity-40"
                      disabled={regenerateMutation.isPending}
                      onClick={(e) => { e.stopPropagation(); regenerateMutation.mutate(star.id); }}
                      title="Re-run extraction"
                    >
                      Re-extract
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-[9px] rounded border border-[#243645] px-1.5 py-0.5 text-muted-foreground hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40 flex items-center gap-1"
                    disabled={deleteGraphMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${star.name}"? This permanently removes the knowledge graph and its source documents.`)) {
                        deleteGraphMutation.mutate(star.id);
                      }
                    }}
                    title="Delete knowledge graph"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                  {showProgress && (
                    <div className="basis-full pl-4 pr-1 mt-1">
                      <div className="flex items-center justify-between gap-2 text-[9px] text-muted-foreground mb-0.5">
                        <span>Extracting chunks</span>
                        <span>{star.extractedChunks}/{star.totalChunks} ({progressPct}%)</span>
                      </div>
                      <div className="h-1 w-full rounded bg-[#243645] overflow-hidden">
                        <div
                          className="h-full bg-[#B8E52B] transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface SchemaProposal {
  id: string;
  graphId: string;
  proposalType: string;
  proposedName: string;
  proposedDefinition: any;
  observedFrequency: number;
  status: string;
  acceptedAt: string | null;
  createdAt: string;
}

interface CanonicalMapping {
  surfaceForm: string;
  canonicalType: string;
  frequency: number;
}

type SchemaTab = "schema" | "proposals" | "mappings";

function SchemaObservatorySection({
  graphId,
  expandedSections,
  toggleSection,
}: {
  graphId: string;
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<SchemaTab>("schema");
  const [mapSearch, setMapSearch] = useState("");
  const isExpanded = expandedSections.has("schema");

  // ── Active Schema data ──
  const { data: schemaData } = useQuery<{ types: SchemaType[] }>({
    queryKey: ["/api/knowledge-graph", graphId, "schema/types"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/knowledge-graph/${graphId}/schema/types`);
      return res.json();
    },
    staleTime: 30_000,
    enabled: isExpanded,
  });

  // ── Proposals data ──
  const { data: proposalData } = useQuery<{ proposals: SchemaProposal[]; total: number }>({
    queryKey: ["/api/knowledge-graph", graphId, "schema/proposals"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/knowledge-graph/${graphId}/schema/proposals`);
      return res.json();
    },
    staleTime: 15_000,
    enabled: isExpanded && activeTab === "proposals",
  });

  // ── Mappings data ──
  const { data: mappingsData } = useQuery<{ mappings: CanonicalMapping[] }>({
    queryKey: ["/api/knowledge-graph", graphId, "schema/mappings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/knowledge-graph/${graphId}/schema/mappings`);
      return res.json();
    },
    staleTime: 30_000,
    enabled: isExpanded && activeTab === "mappings",
  });

  // ── Resolve proposal mutation ──
  const resolveMutation = useMutation({
    mutationFn: async ({ proposalId, action }: { proposalId: string; action: "accept" | "merge" | "dismiss" }) => {
      return apiRequest("POST", `/api/knowledge-graph/${graphId}/schema/proposals/${proposalId}/resolve`, { action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-graph", graphId, "schema/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-graph", graphId, "schema/types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-graph", graphId, "schema/mappings"] });
    },
  });

  const acceptAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/knowledge-graph/${graphId}/schema/proposals/accept-all`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-graph", graphId, "schema/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-graph", graphId, "schema/types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-graph", graphId, "schema/mappings"] });
    },
  });

  const types = schemaData?.types ?? [];
  const entityTypes = types.filter((t) => t.category === "entity");
  const relTypes = types.filter((t) => t.category === "relationship");
  const proposals = proposalData?.proposals ?? [];
  const pendingProposals = proposals.filter((p) => p.status === "proposed");
  const resolvedProposals = proposals.filter((p) => p.status !== "proposed");
  const mappings = mappingsData?.mappings ?? [];
  const filteredMappings = mapSearch
    ? mappings.filter((m) => m.surfaceForm.toLowerCase().includes(mapSearch.toLowerCase()) || m.canonicalType.toLowerCase().includes(mapSearch.toLowerCase()))
    : mappings;

  return (
    <div className="border-t border-[#243645] pt-3 mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground hover:bg-[#07A288]/10 transition-colors"
        onClick={() => toggleSection("schema")}
      >
        <span>Schema Observatory</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-normal normal-case tracking-normal opacity-60">
            {entityTypes.length}E · {relTypes.length}R
            {pendingProposals.length > 0 && ` · ${pendingProposals.length} pending`}
          </span>
          <ChevronRight className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
        </div>
      </button>
      {isExpanded && (
        <div className="mt-1">
          {/* Tab bar */}
          <div className="flex rounded border border-[#243645] overflow-hidden mb-2 mx-1">
            {(["schema", "proposals", "mappings"] as SchemaTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`flex-1 py-1 text-[10px] uppercase tracking-wider font-medium transition-colors ${
                  activeTab === tab ? "bg-[#07A288]/20 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "schema" ? "Schema" : tab === "proposals" ? `Proposals${pendingProposals.length > 0 ? ` (${pendingProposals.length})` : ""}` : "Mappings"}
              </button>
            ))}
          </div>

          {/* ── Zone 1: Active Schema ── */}
          {activeTab === "schema" && (
            <div className="space-y-2 px-1">
              {entityTypes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">Entity Types</p>
                  <div className="space-y-0.5">
                    {entityTypes.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[#07A288]/8 transition-colors group">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-[#07A288] flex-shrink-0" />
                          <span className="text-foreground">{t.name}</span>
                          {t.examples.length > 0 && (
                            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity truncate">
                              {t.examples.slice(0, 2).join(", ")}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">{t.instanceCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {relTypes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">Relationship Types</p>
                  <div className="space-y-0.5">
                    {relTypes.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[#07A288]/8 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#5BBE4E] flex-shrink-0" />
                          <span className="text-foreground">{t.name}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">{t.instanceCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {types.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 py-2">No schema types discovered yet.</p>
              )}
            </div>
          )}

          {/* ── Zone 2: Proposal Stream ── */}
          {activeTab === "proposals" && (
            <div className="space-y-1.5 px-1">
              {pendingProposals.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1 px-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</p>
                    <button
                      type="button"
                      className="text-[10px] rounded border border-[#07A288]/40 bg-[#07A288]/10 px-2 py-0.5 text-[#07A288] hover:bg-[#07A288]/20 transition-colors disabled:opacity-40"
                      disabled={acceptAllMutation.isPending || resolveMutation.isPending}
                      onClick={() => acceptAllMutation.mutate()}
                    >
                      {acceptAllMutation.isPending ? "Accepting..." : `Accept All (${pendingProposals.length})`}
                    </button>
                  </div>
                  {pendingProposals.map((p) => (
                    <div key={p.id} className="rounded border border-[#243645] bg-[#0B1014]/60 p-2 mb-1.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-foreground font-medium">{p.proposedName}</span>
                        <span className="text-[9px] rounded px-1.5 py-0.5 bg-[#B8E52B]/15 text-[#B8E52B]">
                          {p.proposalType.replace(/_/g, " ")}
                        </span>
                      </div>
                      {p.observedFrequency > 1 && (
                        <p className="text-[10px] text-muted-foreground mb-1.5">Observed {p.observedFrequency} times</p>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="flex-1 rounded border border-[#07A288]/40 bg-[#07A288]/10 px-2 py-1 text-[10px] text-[#07A288] hover:bg-[#07A288]/20 transition-colors disabled:opacity-40"
                          disabled={resolveMutation.isPending}
                          onClick={() => resolveMutation.mutate({ proposalId: p.id, action: "accept" })}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded border border-[#5BBE4E]/40 bg-[#5BBE4E]/10 px-2 py-1 text-[10px] text-[#5BBE4E] hover:bg-[#5BBE4E]/20 transition-colors disabled:opacity-40"
                          disabled={resolveMutation.isPending}
                          onClick={() => resolveMutation.mutate({ proposalId: p.id, action: "merge" })}
                        >
                          Merge
                        </button>
                        <button
                          type="button"
                          className="flex-1 rounded border border-[#243645] px-2 py-1 text-[10px] text-muted-foreground hover:bg-[#243645]/40 transition-colors disabled:opacity-40"
                          disabled={resolveMutation.isPending}
                          onClick={() => resolveMutation.mutate({ proposalId: p.id, action: "dismiss" })}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {resolvedProposals.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">Resolved</p>
                  {resolvedProposals.slice(0, 10).map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded px-2 py-1 text-xs">
                      <span className="text-muted-foreground">{p.proposedName}</span>
                      <span className={`text-[9px] rounded px-1.5 py-0.5 ${
                        p.status === "accepted" ? "bg-[#07A288]/15 text-[#07A288]"
                          : p.status === "merged" ? "bg-[#5BBE4E]/15 text-[#5BBE4E]"
                          : "bg-[#243645] text-muted-foreground"
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {proposals.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 py-3">No schema proposals yet. Proposals emerge during extraction as new types are discovered.</p>
              )}
            </div>
          )}

          {/* ── Zone 3: Canonicalization Map ── */}
          {activeTab === "mappings" && (
            <div className="space-y-2 px-1">
              <input
                type="text"
                value={mapSearch}
                onChange={(e) => setMapSearch(e.target.value)}
                placeholder="Search mappings..."
                className="w-full h-7 rounded border border-[#243645] bg-[#0B1014]/80 px-2 text-[11px] text-foreground outline-none"
              />
              {filteredMappings.length > 0 ? (
                <div className="space-y-0.5">
                  {filteredMappings.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[#07A288]/8 transition-colors">
                      <span className="text-muted-foreground min-w-0 truncate flex-1">{m.surfaceForm}</span>
                      <span className="text-[10px] text-muted-foreground/60">→</span>
                      <span className="text-foreground min-w-0 truncate flex-1">{m.canonicalType}</span>
                      <div className="w-12 h-1.5 rounded-full bg-[#243645] flex-shrink-0 overflow-hidden">
                        <div className="h-full rounded-full bg-[#07A288]" style={{ width: `${Math.min(100, m.frequency * 10)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground px-2 py-3">
                  {mappings.length === 0
                    ? "No canonical mappings yet. Accept type synonym proposals to create mappings."
                    : "No matches."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UtilitiesPanel({
  activeUtility, openUtility,
  inGraphMode, selectedGraphId, stars, graphSummary, graphVisibleCount, graphEntities,
  searchTerm, setSearchTerm, searchResults, searchResultIndex,
  handleSearchResultSelect, handleSearchResultNext, handleSearchResultPrev,
  graphTypes, activeTypes, graphTypeDistribution, handleToggleType,
  depth, setDepth, selectedNode,
  showEdges, setShowEdges, showPulses, setShowPulses, nodeScale, setNodeScale,
  handleFitView, handleUnhideAll, hiddenNodeIds,
  handleShowAllTypes, handleHideAllTypes,
  audioEnabled, toggleAudio, audioVolume, setAudioVolume,
}: UtilitiesPanelProps) {
  const { setView: appSetView } = useAppView();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const { data: userData } = useQuery<{ role?: string; name?: string; email?: string; credits?: number; planType?: string }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const visibleSections = useMemo(
    () => UTILITY_SECTIONS.filter((s) => s.id !== "celestial" && s.id !== "admin"),
    [userData?.role],
  );

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const navigate = (route: string) => {
    // Convert route strings to view state
    const match = route.match(/^\/app\/([^/?#]+)/);
    const viewName = match?.[1] ?? "constellation";
    appSetView(viewName as any);
  };

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    AuthStorage.clearAuth();
    window.location.href = "/";
  };

  const userName = userData?.name || "User";
  const userInitial = userName.charAt(0).toUpperCase();

  // Sidebar collapsed/expanded state — persisted to localStorage so it
  // survives navigation. Default: expanded.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("wtrdb_utilities_collapsed") === "1"; }
    catch { return false; }
  });
  const setAndPersistCollapsed = (next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem("wtrdb_utilities_collapsed", next ? "1" : "0"); }
    catch { /* localStorage may be unavailable */ }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setAndPersistCollapsed(false)}
        className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-2 rounded-lg border border-[#243645] bg-[#111A21]/84 px-3 py-2 backdrop-blur-md text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground hover:border-[#07A288]/40 transition-colors"
        title="Expand utilities panel"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        Utilities
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute top-4 bottom-4 right-4 w-[380px] overflow-y-auto rounded-lg border border-[#243645] bg-[#111A21]/84 p-3 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Utilities</span>
        <button
          type="button"
          onClick={() => setAndPersistCollapsed(true)}
          className="h-5 w-5 rounded border border-[#243645] hover:border-[#07A288]/40 hover:text-foreground inline-flex items-center justify-center transition-colors"
          title="Collapse utilities panel"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Graph controls (when in graph mode) */}
      {inGraphMode && graphSummary?.status === "completed" ? (
        <div className="mb-3 border-t border-[#243645] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Graph Controls</p>
            <span className="text-[11px] text-muted-foreground">{graphVisibleCount}/{graphEntities.length} visible</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" /> Entity Search</div>
              <div className="flex items-center gap-1">
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearchResultSelect(); } else if (e.key === "ArrowDown") { e.preventDefault(); handleSearchResultNext(); } else if (e.key === "ArrowUp") { e.preventDefault(); handleSearchResultPrev(); } }} placeholder="Search entity name..." className="h-8 flex-1 rounded-md border border-[#243645] bg-[#0B1014]/90 px-2 text-xs text-foreground outline-none" />
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-[#243645]" onClick={handleSearchResultPrev} disabled={searchResults.length === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-[#243645]" onClick={handleSearchResultNext} disabled={searchResults.length === 0}><ChevronDown className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-[#243645]" onClick={handleSearchResultSelect} disabled={searchResults.length === 0}><Crosshair className="h-3.5 w-3.5" /></Button>
              </div>
              {searchTerm ? <p className="mt-1 text-[11px] text-muted-foreground">{searchResults.length > 0 ? `${Math.min(searchResultIndex + 1, searchResults.length)}/${searchResults.length} matches` : "No matches"}</p> : null}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Type Filter</p>
              <div className="flex flex-wrap gap-1.5">{graphTypes.map((label) => { const isActive = activeTypes.has(label); return (<button key={label} type="button" onClick={() => handleToggleType(label)} className={`rounded border px-2 py-0.5 text-[10px] ${isActive ? "border-[#07A288] bg-[#07A288]/20 text-foreground" : "border-[#243645] text-muted-foreground"}`}>{label} · {graphTypeDistribution[label]}</button>); })}</div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted-foreground">Depth</span><span className="text-foreground">{selectedNode ? depth : "-"}</span></div>
              <Slider value={[depth]} min={1} max={5} step={1} disabled={!selectedNode} onValueChange={([v]) => setDepth(v)} />
              {!selectedNode && (
                <p className="text-[10px] text-muted-foreground mt-1">Select a node to enable depth filtering.</p>
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted-foreground">Node Size</span><span className="text-foreground">{nodeScale.toFixed(1)}x</span></div>
              <Slider value={[nodeScale]} min={0.3} max={3} step={0.1} onValueChange={([v]) => setNodeScale(v)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded border border-[#243645] px-2 py-1"><span className="text-xs text-muted-foreground">Edges</span><Switch checked={showEdges} onCheckedChange={setShowEdges} /></div>
              <div className="flex items-center justify-between rounded border border-[#243645] px-2 py-1"><span className="text-xs text-muted-foreground">Pulses</span><Switch checked={showPulses} onCheckedChange={setShowPulses} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" className="justify-start border-[#243645]" onClick={handleFitView}><SlidersHorizontal className="mr-2 h-3.5 w-3.5" /> Fit</Button>
              <Button size="sm" variant="outline" className="justify-start border-[#243645]" onClick={handleUnhideAll} disabled={hiddenNodeIds.size === 0}><EyeOff className="mr-2 h-3.5 w-3.5" /> Unhide {hiddenNodeIds.size > 0 ? hiddenNodeIds.size : ""}</Button>
              <Button size="sm" variant="outline" className="justify-start border-[#243645]" onClick={handleShowAllTypes}>Show Types</Button>
              <Button size="sm" variant="outline" className="justify-start border-[#243645]" onClick={handleHideAllTypes}>Hide Types</Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Knowledge Graphs — inline with upload + generation */}
      <GraphSourcesSection stars={stars} expandedSections={expandedSections} toggleSection={toggleSection} />

      {/* DIAL-KG model picker */}
      <KgModelSettingsSection expandedSections={expandedSections} toggleSection={toggleSection} />

      {/* Schema Observatory — inline when in graph mode */}
      {inGraphMode && selectedGraphId && (
        <SchemaObservatorySection graphId={selectedGraphId} expandedSections={expandedSections} toggleSection={toggleSection} />
      )}

      {/* Brain Endpoints — REST + MCP publication for the current graph */}
      <BrainEndpointsSection
        selectedGraphId={selectedGraphId}
        selectedStarName={stars.find((s) => s.id === selectedGraphId)?.name ?? null}
        expandedSections={expandedSections}
        toggleSection={toggleSection}
      />

      {/* Meta-Knowledge Graphs — pattern + procedural facets, induction, federations */}
      <MetaGraphsSection
        stars={stars.map((s) => ({ id: s.id, name: s.name }))}
        expandedSections={expandedSections}
        toggleSection={toggleSection}
      />

      {/* Constellation View — top-level entry (no expandable wrapper) */}
      <div className="border-t border-[#243645] pt-3">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-[#07A288]/12 hover:text-foreground transition-colors"
          onClick={() => navigate("/app/constellation")}
          title="Star field of all knowledge graphs"
        >
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="block truncate">Constellation View</span>
        </button>
      </div>

      {/* Other deck sections with dropdowns */}
      <div className="border-t border-[#243645] pt-3 space-y-1">
        {visibleSections.map((section) => (
          <div key={section.id}>
            <button type="button" className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground hover:bg-[#07A288]/10 transition-colors" onClick={() => toggleSection(section.id)}>
              <span>{section.label}</span>
              <ChevronRight className={`h-3 w-3 transition-transform duration-150 ${expandedSections.has(section.id) ? "rotate-90" : ""}`} />
            </button>
            {expandedSections.has(section.id) && (
              <div className="ml-1 space-y-0.5 pb-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.label} type="button" className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-[#07A288]/12 hover:text-foreground transition-colors" onClick={() => navigate(item.route)} title={item.desc}>
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="block truncate">{item.label}</span>
                        {item.desc && <span className="block truncate text-[10px] opacity-60">{item.desc}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Account */}
      {userData && (
        <div className="border-t border-[#243645] pt-3 mt-2 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#07A288] text-[#041514] flex items-center justify-center text-xs font-semibold flex-shrink-0">{userInitial}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground truncate">{userName}</div>
            <div className="text-[10px] text-muted-foreground truncate">{userData.email}</div>
          </div>
          <button type="button" onClick={handleLogout} className="p-1.5 rounded hover:bg-[#07A288]/12 text-muted-foreground hover:text-foreground transition-colors" title="Logout"><LogOut className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

interface QueryHistoryEntry {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
  graphId: string;
}

const QUERY_HISTORY_KEY = "wtrdb_query_history";
const MAX_HISTORY = 50;

function loadQueryHistory(): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(QUERY_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveQueryHistory(entries: QueryHistoryEntry[]) {
  try {
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage full or disabled
  }
}

function GraphQueryBar({ graphId }: { graphId: string }) {
  const [question, setQuestion] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState<{ q: string; a: string } | null>(null);
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<QueryHistoryEntry[]>(() => loadQueryHistory());
  const inputRef = useRef<HTMLInputElement | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const [pendingSince, setPendingSince] = useState<number | null>(null);

  // Fetch suggestions — refetches when graph changes or when last answer changes
  const { data: suggestionData } = useQuery<{ suggestions: string[] }>({
    queryKey: ["/api/knowledge-graph/suggest", graphId, currentAnswer?.q ?? "", currentAnswer?.a ?? ""],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/knowledge-graph/suggest", {
        knowledgeBaseId: graphId,
        lastQuestion: currentAnswer?.q,
        lastAnswer: currentAnswer?.a,
      });
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
  const suggestions = suggestionData?.suggestions ?? [];

  const askMutation = useMutation({
    mutationFn: async (q: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const token = AuthStorage.getAuthHeader();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = token;
      const res = await fetch("/api/knowledge-graph/ask", {
        method: "POST",
        headers,
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ question: q, knowledgeBaseIds: [graphId] }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }
      const data = await res.json();
      return data as { answer: string; cypher: string; resultCount: number };
    },
    onSuccess: (data, q) => {
      setPendingSince(null);
      abortRef.current = null;
      setAnswerExpanded(false);
      setCurrentAnswer({ q, a: data.answer || "(empty answer)" });
      const entry: QueryHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        question: q,
        answer: data.answer || "(empty answer)",
        timestamp: Date.now(),
        graphId,
      };
      const next = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(next);
      saveQueryHistory(next);
      setQuestion("");
    },
    onError: (err: any) => {
      setPendingSince(null);
      abortRef.current = null;
      if (err?.name === "AbortError") {
        setCurrentAnswer({ q: question || "(query)", a: "Query cancelled." });
        return;
      }
      setCurrentAnswer({ q: question || "(query)", a: `Error: ${err?.message ?? "query failed"}` });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const q = question.trim();
    if (!q || askMutation.isPending) return;
    setPendingSince(Date.now());
    askMutation.mutate(q);
  };

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  // Tick timer so the elapsed time updates while pending
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!pendingSince) {
      setElapsedSec(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - pendingSince) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [pendingSince]);

  // When user starts typing again, clear the previous answer
  const handleQuestionChange = (val: string) => {
    setQuestion(val);
    if (val.length > 0 && currentAnswer) {
      setCurrentAnswer(null);
      setAnswerExpanded(false);
    }
  };

  const handleSuggestionClick = (s: string) => {
    setQuestion(s);
    setCurrentAnswer(null);
    setAnswerExpanded(false);
    setPendingSince(Date.now());
    askMutation.mutate(s);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setHistoryOpen((v) => !v);
  };

  // Close history on outside click
  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".graph-query-history") && !target.closest(".graph-query-bar")) {
        setHistoryOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [historyOpen]);

  const clearHistory = () => {
    setHistory([]);
    saveQueryHistory([]);
    setHistoryOpen(false);
  };

  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[480px] max-w-[calc(100vw-32px)]">
      {/* Answer pushed up above the bar */}
      {(currentAnswer || askMutation.isPending) && (
        <div
          className={`mb-2 rounded-lg border border-[#243645] bg-[#111A21]/92 backdrop-blur-md px-3 py-2 text-xs text-foreground shadow-lg transition-all ${
            currentAnswer && !askMutation.isPending ? "cursor-pointer hover:border-[#07A288]/40" : ""
          }`}
          onClick={() => {
            if (currentAnswer && !askMutation.isPending) {
              setAnswerExpanded((v) => !v);
            }
          }}
        >
          {askMutation.isPending ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin text-[#07A288]" />
                <span>Thinking{elapsedSec > 0 ? ` · ${elapsedSec}s` : "..."}</span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : currentAnswer ? (
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5 truncate">
                {currentAnswer.q}
              </div>
              <div className={`text-foreground ${answerExpanded ? "max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed" : "line-clamp-2"}`}>
                {currentAnswer.a}
              </div>
              {!answerExpanded && currentAnswer.a.length > 100 && (
                <div className="text-[9px] text-muted-foreground/60 mt-0.5">click to expand</div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Suggestions — shown when no answer is being processed/displayed long */}
      {!askMutation.isPending && suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 justify-center">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); handleSuggestionClick(s); }}
              className="rounded-full border border-[#243645] bg-[#111A21]/80 backdrop-blur-md px-3 py-1 text-[10px] text-muted-foreground hover:border-[#07A288]/60 hover:text-foreground hover:bg-[#07A288]/10 transition-colors shadow-md max-w-[200px] truncate"
              title={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* History dropdown (right-click) */}
      {historyOpen && (
        <div className="graph-query-history mb-2 rounded-lg border border-[#243645] bg-[#111A21]/95 backdrop-blur-md max-h-72 overflow-y-auto shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#243645]/60">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Query History ({history.length})
            </span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="text-[10px] text-muted-foreground hover:text-destructive"
              >
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
              No queries yet
            </div>
          ) : (
            <div className="divide-y divide-[#243645]/40">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-[#07A288]/10 transition-colors"
                  onClick={() => {
                    setCurrentAnswer({ q: entry.question, a: entry.answer });
                    setHistoryOpen(false);
                  }}
                >
                  <div className="text-[11px] text-foreground truncate">{entry.question}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1">{entry.answer}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Query input bar */}
      <form
        onSubmit={handleSubmit}
        onContextMenu={handleContextMenu}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="graph-query-bar"
      >
        <div className="flex items-center gap-2 rounded-full border border-[#243645] bg-[#111A21]/90 backdrop-blur-md px-4 py-2 shadow-lg focus-within:border-[#07A288]/60 transition-colors">
          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => handleQuestionChange(e.target.value)}
            placeholder="Ask this graph anything... (right-click for history)"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none"
            disabled={askMutation.isPending}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={askMutation.isPending || !question.trim()}
            className="text-[10px] uppercase tracking-wider text-[#07A288] hover:text-[#5BBE4E] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {askMutation.isPending ? "..." : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CelestialFieldPage() {
  const { view, viewId, setView, goHome } = useAppView();
  const selectedGraphId = view === "knowledge-graph-3d" ? viewId : null;
  const activeUtility = isUtilityView(view) ? view as UtilityView : null;
  const inGraphMode = !!selectedGraphId;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const fieldGroupRef = useRef<THREE.Group | null>(null);
  const edgeManagerRef = useRef<EdgeManager | null>(null);
  const starEntriesRef = useRef<StarRenderEntry[]>([]);
  const graphNodesRef = useRef<Node3D[]>([]);
  const graphEdgesRef = useRef<Edge3D[]>([]);
  const graphBaseYRef = useRef<Map<string, number>>(new Map());
  const graphNodeMaterialsRef = useRef<
    Map<string, Array<{ material: THREE.Material; baseOpacity: number }>>
  >(new Map());
  const graphNodeBaseScaleRef = useRef<Map<string, number>>(new Map());
  const graphEdgeMaterialsRef = useRef<
    Map<string, { material: THREE.LineBasicMaterial; baseOpacity: number }>
  >(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseNdcRef = useRef(new THREE.Vector2());
  const initializedRef = useRef(false);
  const selectedGraphIdRef = useRef<string | null>(selectedGraphId);
  const hoveredStarIdRef = useRef<string | null>(null);
  const hoveredNodeRef = useRef<Node3D | null>(null);
  const selectedNodeRef = useRef<Node3D | null>(null);
  const hoveredEdgeRef = useRef<Edge3D | null>(null);
  const selectedRelationshipRef = useRef<Edge3D | null>(null);
  const contextMenuNodeRef = useRef<Node3D | null>(null);

  const ambientRef = useRef<AmbientAudioEngine | null>(null);

  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node3D | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<Edge3D | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node3D | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<Edge3D | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<Node3D | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [depth, setDepth] = useState(5);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [showEdges, setShowEdges] = useState(true);
  const [showPulses, setShowPulses] = useState(true);
  const [nodeScale, setNodeScale] = useState(1);
  const nodeScaleRef = useRef(1);
  const showEdgesRef = useRef(showEdges);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioVolume, setAudioVolume] = useState(16);
  const starsRef = useRef<CelestialStar[]>([]);
  const [sceneGeneration, setSceneGeneration] = useState(0);

  const { data: knowledgeBases = [], isLoading: kbLoading } = useQuery<RagKnowledgeItem[]>({
    queryKey: ["/api/rag-knowledge"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/rag-knowledge");
      return res.json();
    },
  });

  const { data: federations = [] } = useQuery<FederationRow[]>({
    queryKey: ["/api/federations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/federations");
      const data = await res.json();
      return data.federations ?? data ?? [];
    },
  });

  const kbIdsKey = useMemo(() => knowledgeBases.map((kb) => kb.id).join(","), [knowledgeBases]);
  const { data: summaries = {} } = useQuery<Record<string, GraphSummaryResponse | null>>({
    queryKey: ["/api/celestial-field/summaries", kbIdsKey],
    enabled: knowledgeBases.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        knowledgeBases.map(async (kb) => {
          try {
            const res = await apiRequest("GET", `/api/knowledge-graph/${kb.id}/summary`);
            const summary = (await res.json()) as GraphSummaryResponse;
            return [kb.id, summary] as const;
          } catch {
            return [kb.id, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  });

  const completedGraphIds = useMemo(
    () =>
      knowledgeBases
        .filter((kb) => summaries[kb.id]?.status === "completed")
        .map((kb) => kb.id),
    [knowledgeBases, summaries],
  );

  const completedGraphIdsKey = useMemo(
    () => completedGraphIds.join(","),
    [completedGraphIds],
  );

  const { data: fieldSnapshots = {} } = useQuery<Record<string, FieldGraphSnapshot>>({
    queryKey: ["/api/celestial-field/snapshots", completedGraphIdsKey],
    enabled: completedGraphIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        completedGraphIds.map(async (graphId) => {
          try {
            const [entitiesRes, relationshipsRes] = await Promise.all([
              apiRequest("GET", `/api/knowledge-graph/${graphId}/entities?limit=60`),
              apiRequest("GET", `/api/knowledge-graph/${graphId}/relationships?limit=120`),
            ]);
            const entitiesData = (await entitiesRes.json()) as GraphEntitiesResponse;
            const relationshipsData = (await relationshipsRes.json()) as GraphRelationshipsResponse;
            return [
              graphId,
              {
                entities: entitiesData.entities ?? [],
                relationships: relationshipsData.relationships ?? [],
              },
            ] as const;
          } catch {
            return [
              graphId,
              {
                entities: [],
                relationships: [],
              },
            ] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
  });

  const {
    data: graphSummary,
    isLoading: graphSummaryLoading,
  } = useQuery<GraphSummaryResponse | null>({
    queryKey: ["/api/knowledge-graph", selectedGraphId, "summary"],
    enabled: !!selectedGraphId,
    queryFn: async () => {
      if (!selectedGraphId) return null;
      try {
        const res = await apiRequest("GET", `/api/knowledge-graph/${selectedGraphId}/summary`);
        return (await res.json()) as GraphSummaryResponse;
      } catch {
        return null;
      }
    },
  });

  const {
    data: entitiesData,
    isLoading: entitiesLoading,
  } = useQuery<GraphEntitiesResponse>({
    queryKey: ["/api/knowledge-graph", selectedGraphId, "entities"],
    enabled: !!selectedGraphId && graphSummary?.status === "completed",
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/knowledge-graph/${selectedGraphId}/entities`);
      return res.json();
    },
  });

  const {
    data: relationshipsData,
    isLoading: relationshipsLoading,
  } = useQuery<GraphRelationshipsResponse>({
    queryKey: ["/api/knowledge-graph", selectedGraphId, "relationships"],
    enabled: !!selectedGraphId && graphSummary?.status === "completed",
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/knowledge-graph/${selectedGraphId}/relationships`);
      return res.json();
    },
  });

  const { data: evalRuns = [] } = useQuery<EvalRunRow[]>({
    queryKey: ["/api/eval-harness/runs", "celestial-overlay"],
    enabled: activeUtility === "eval-harness",
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/eval-harness/runs");
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.runs)) return data.runs;
        return [];
      } catch {
        return [];
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGraphId) return;
      await apiRequest("POST", `/api/knowledge-graph/${selectedGraphId}/generate`);
    },
    onSuccess: () => {
      if (!selectedGraphId) return;
      queryClient.invalidateQueries({
        queryKey: ["/api/knowledge-graph", selectedGraphId],
      });
    },
  });

  const graphEntities = entitiesData?.entities ?? [];
  const graphRelationships = relationshipsData?.relationships ?? [];
  const graphLoading = graphSummaryLoading || entitiesLoading || relationshipsLoading;
  const graphEntityMap = useMemo(
    () => new Map(graphEntities.map((entity) => [entity.id, entity])),
    [graphEntities],
  );
  const graphTypeDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    for (const entity of graphEntities) {
      distribution[entity.label] = (distribution[entity.label] ?? 0) + 1;
    }
    return distribution;
  }, [graphEntities]);
  const graphTypes = useMemo(
    () => Object.keys(graphTypeDistribution).sort(),
    [graphTypeDistribution],
  );
  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return graphEntities.filter((entity) => entity.name.toLowerCase().includes(term));
  }, [graphEntities, searchTerm]);

  const focusNodeById = useCallback((nodeId: string) => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    const node = graphNodesRef.current.find((candidate) => candidate.id === nodeId);
    if (!node?.group || !node.group.visible) return;
    animateCameraTo(sm.camera, sm.controls, node.group.position);
    setSelectedNode(node);
    setSelectedRelationship(null);
  }, []);

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
    setActiveTypes(new Set(graphTypes));
  }, [graphTypes]);

  const handleHideAllTypes = useCallback(() => {
    setActiveTypes(new Set());
  }, []);

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

  const handleSearchResultNext = useCallback(() => {
    setSearchResultIndex((prev) => {
      if (searchResults.length === 0) return 0;
      return (prev + 1) % searchResults.length;
    });
  }, [searchResults.length]);

  const handleSearchResultPrev = useCallback(() => {
    setSearchResultIndex((prev) => {
      if (searchResults.length === 0) return 0;
      return (prev - 1 + searchResults.length) % searchResults.length;
    });
  }, [searchResults.length]);

  const handleSearchResultSelect = useCallback(() => {
    if (searchResults.length === 0) return;
    const current = searchResults[searchResultIndex] ?? searchResults[0];
    if (!current) return;
    focusNodeById(current.id);
  }, [focusNodeById, searchResultIndex, searchResults]);

  const handleFitView = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    const visibleNodes = graphNodesRef.current.filter(
      (node) => !!node.group && node.group.visible,
    );
    fitViewToNodes(sm.camera, sm.controls, visibleNodes);
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setContextMenuNode(null);
  }, []);

  const handleContextMenuFocus = useCallback((node: Node3D) => {
    focusNodeById(node.id);
  }, [focusNodeById]);

  const handleContextMenuShowDetails = useCallback((node: Node3D) => {
    setSelectedNode(node);
    setSelectedRelationship(null);
  }, []);

  const handleContextMenuExpandDepth = useCallback((node: Node3D) => {
    setSelectedNode(node);
    setSelectedRelationship(null);
    setDepth(2);
  }, []);

  const federatedKbIds = useMemo(() => {
    const set = new Set<string>();
    for (const fed of federations) {
      for (const id of fed.constituentKbIds ?? []) {
        set.add(id);
      }
    }
    return set;
  }, [federations]);

  const stars = useMemo<CelestialStar[]>(() => {
    return knowledgeBases.map((kb) => {
      const summary = summaries[kb.id];
      const status: GraphStatus =
        summary?.status ??
        (kb.ragStatus === "completed"
          ? "pending"
          : kb.ragStatus === "processing"
            ? "extracting"
            : kb.ragStatus === "failed"
              ? "failed"
              : "pending");

      const freshness = summary?.status === "completed"
        ? freshnessFromDate(summary.lastUpdated)
        : status === "extracting"
          ? 0.65
          : 0.3;

      const entityCount = summary?.entityCount ?? 0;
      const relationshipCount = summary?.relationshipCount ?? 0;

      return {
        id: kb.id,
        name: kb.title,
        entityCount,
        relationshipCount,
        freshness,
        radius: starRadius(entityCount),
        colorHex: colorFromFreshness(freshness),
        status,
        isExtracting: status === "extracting",
        isFederated: federatedKbIds.has(kb.id),
        extractedChunks: summary?.extractedChunks ?? 0,
        totalChunks: summary?.totalChunks ?? 0,
      };
    });
  }, [knowledgeBases, summaries, federatedKbIds]);

  // Keep ref in sync so the scene-init effect can access latest data
  starsRef.current = stars;

  const selectedStar = useMemo(
    () => stars.find((star) => star.id === selectedGraphId) ?? null,
    [stars, selectedGraphId],
  );
  const hoveredStar = useMemo(
    () => stars.find((star) => star.id === hoveredStarId) ?? null,
    [stars, hoveredStarId],
  );

  const retuneAudio = useCallback((data: CelestialStar[]) => {
    const engine = ambientRef.current;
    if (!engine || !engine.isRunning()) return;
    const totalEntities = data.reduce((sum, star) => sum + star.entityCount, 0);
    const avgFreshness = data.length > 0
      ? data.reduce((sum, star) => sum + star.freshness, 0) / data.length
      : 0.5;
    engine.retuneField({ entityCount: totalEntities, freshness: avgFreshness, kbCount: data.length });
  }, []);

  const stopAudio = useCallback(() => {
    if (ambientRef.current) {
      ambientRef.current.dispose();
      ambientRef.current = null;
    }
  }, []);

  const startAudio = useCallback(() => {
    if (ambientRef.current) return;
    const totalEntities = stars.reduce((sum, star) => sum + star.entityCount, 0);
    const avgFreshness = stars.length > 0
      ? stars.reduce((sum, star) => sum + star.freshness, 0) / stars.length
      : 0.5;
    const engine = createAmbientAudio({
      entityCount: totalEntities,
      freshness: avgFreshness,
      kbCount: stars.length,
    });
    engine.setVolume(audioVolume / 100);
    engine.start();
    ambientRef.current = engine;
  }, [audioVolume, stars]);

  const clearGraphVisuals = useCallback(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;

    const groups = [sm.nodesGroup, sm.edgesGroup, sm.pulsesGroup, sm.labelsGroup];
    for (const group of groups) {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        disposeObjectTree(child);
      }
    }

    edgeManagerRef.current?.dispose();
    edgeManagerRef.current = null;
    graphNodesRef.current = [];
    graphEdgesRef.current = [];
    graphBaseYRef.current.clear();
    graphNodeMaterialsRef.current.clear();
    graphNodeBaseScaleRef.current.clear();
    graphEdgeMaterialsRef.current.clear();
    hoveredNodeRef.current = null;
    selectedNodeRef.current = null;
    hoveredEdgeRef.current = null;
  }, []);

  const buildCelestialStars = useCallback(
    (starData: CelestialStar[]) => {
      const fieldGroup = fieldGroupRef.current;
      console.log("[buildCelestialStars]", { fieldGroup: !!fieldGroup, starCount: starData.length });
      if (!fieldGroup) return;

      while (fieldGroup.children.length > 0) {
        const child = fieldGroup.children[0];
        fieldGroup.remove(child);
        disposeObjectTree(child);
      }
      starEntriesRef.current = [];

      const count = Math.max(1, starData.length);
      const golden = Math.PI * (3 - Math.sqrt(5));
      const bridge = createDataBridge();
      const layout = createForceLayout();

      for (let i = 0; i < starData.length; i += 1) {
        const star = starData[i];
        const t = (i + 0.5) / count;
        const y = 1 - 2 * t;
        const radiusFlat = Math.sqrt(1 - y * y);
        const theta = golden * (i + 0.5);
        const orbit = 18 + Math.sin(i * 0.73) * 2.2;
        const x = Math.cos(theta) * radiusFlat * orbit;
        const z = Math.sin(theta) * radiusFlat * orbit;
        const py = y * orbit * 0.72;
        const color = toHexNumber(star.colorHex);

        const group = new THREE.Group();
        group.position.set(x, py, z);

        const materials: Array<{ material: THREE.Material; baseOpacity: number }> = [];
        const snapshot = fieldSnapshots[star.id];
        const hasSnapshot =
          !!snapshot &&
          snapshot.entities.length > 0;

        if (hasSnapshot) {
          const { nodes, edges } = bridge.transform(
            snapshot.entities,
            snapshot.relationships,
            40,
          );
          if (nodes.length > 0) {
            layout.simulate(nodes, edges);
          }

          const maxDistance = Math.max(
            1,
            ...nodes.map((node) => node.position.length()),
          );
          const clusterRadius = Math.max(star.radius * 2, 1.2);
          const clusterScale = clusterRadius / maxDistance;
          const nodePositionMap = new Map<string, THREE.Vector3>();

          for (const node of nodes) {
            const nodeGroup = createMeshframe(
              node.meshframeType,
              Math.max(0.12, node.scale * 0.12),
              node.seed,
              node.color,
            );
            nodeGroup.position.copy(node.position).multiplyScalar(clusterScale);
            nodeGroup.rotation.y = node.seed * 0.2;
            group.add(nodeGroup);
            nodePositionMap.set(node.id, nodeGroup.position.clone());
            materials.push(...collectOpacityMaterials(nodeGroup));
          }

          for (const edge of edges) {
            const source = nodePositionMap.get(edge.sourceId);
            const target = nodePositionMap.get(edge.targetId);
            if (!source || !target) continue;

            const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
              source,
              target,
            ]);
            const edgeMaterial = new THREE.LineBasicMaterial({
              color: edge.color || color,
              transparent: true,
              opacity: 0.2,
              depthWrite: false,
            });
            const edgeLine = new THREE.Line(edgeGeometry, edgeMaterial);
            group.add(edgeLine);
            materials.push({ material: edgeMaterial, baseOpacity: 0.2 });
          }
        } else {
          const fallbackMaterial = new THREE.MeshBasicMaterial({
            color,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          });
          const fallback = new THREE.Mesh(
            new THREE.IcosahedronGeometry(star.radius * 0.9, 0),
            fallbackMaterial,
          );
          group.add(fallback);
          materials.push({ material: fallbackMaterial, baseOpacity: 0.5 });
        }

        if (star.isFederated) {
          const ringMaterial = new THREE.LineBasicMaterial({
            color: 0xb8e52b,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          });
          const ring = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(
              circlePoints(star.radius * 2.3, 40),
            ),
            ringMaterial,
          );
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
          materials.push({ material: ringMaterial, baseOpacity: 0.5 });
        }

        const hitMesh = new THREE.Mesh(
          new THREE.SphereGeometry(star.radius * 2.6, 16, 12),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        hitMesh.userData.starId = star.id;
        group.add(hitMesh);

        fieldGroup.add(group);
        starEntriesRef.current.push({
          id: star.id,
          group,
          hitMesh,
          materials,
          baseScale: 1,
          isExtracting: star.isExtracting,
        });
      }
    },
    [fieldSnapshots],
  );

  const buildGraph = useCallback((entities: GraphEntity[], relationships: GraphRelationship[]) => {
    const sm = sceneManagerRef.current;
    if (!sm) return;

    clearGraphVisuals();
    const bridge = createDataBridge();
    const { nodes, edges } = bridge.transform(entities, relationships, 420);
    graphNodesRef.current = nodes;
    graphEdgesRef.current = edges;
    graphNodeMaterialsRef.current.clear();
    graphNodeBaseScaleRef.current.clear();
    graphEdgeMaterialsRef.current.clear();

    const layout = createForceLayout();
    layout.simulate(nodes, edges);

    for (const node of nodes) {
      const group = createMeshframe(node.meshframeType, node.scale, node.seed, node.color);
      group.position.copy(node.position);
      node.group = group;
      sm.nodesGroup.add(group);
      graphBaseYRef.current.set(node.id, node.position.y);
      graphNodeMaterialsRef.current.set(node.id, collectOpacityMaterials(group));
      graphNodeBaseScaleRef.current.set(node.id, group.scale.x);
    }

    const edgeManager = createEdgeManager();
    edgeManagerRef.current = edgeManager;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    for (let index = 0; index < edges.length; index += 1) {
      const edge = edges[index];
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);
      if (!source || !target) continue;

      const result = edgeManager.createEdge(
        source.position,
        target.position,
        edge.relationship.type,
        source.color,
        index,
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

      if (result.line.material instanceof THREE.LineBasicMaterial) {
        graphEdgeMaterialsRef.current.set(edge.id, {
          material: result.line.material,
          baseOpacity: result.line.material.opacity,
        });
      }
    }

    const types = new Set<string>();
    for (const entity of entities) {
      types.add(entity.label);
    }
    setActiveTypes(types);
    setDepth(5);
    setHiddenNodeIds(new Set());
    setShowEdges(true);
    setShowPulses(true);
    setSearchTerm("");
    setSearchResultIndex(0);
    setSelectedNode(null);
    setHoveredNode(null);
    setSelectedRelationship(null);
    setHoveredEdge(null);
    setContextMenuNode(null);

    fitViewToNodes(sm.camera, sm.controls, nodes, 1.8);
  }, [clearGraphVisuals]);

  useEffect(() => {
    selectedGraphIdRef.current = selectedGraphId;
  }, [selectedGraphId]);

  useEffect(() => {
    hoveredStarIdRef.current = hoveredStarId;
  }, [hoveredStarId]);

  useEffect(() => {
    hoveredNodeRef.current = hoveredNode;
  }, [hoveredNode]);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    hoveredEdgeRef.current = hoveredEdge;
  }, [hoveredEdge]);

  useEffect(() => {
    selectedRelationshipRef.current = selectedRelationship;
  }, [selectedRelationship]);

  useEffect(() => {
    contextMenuNodeRef.current = contextMenuNode;
  }, [contextMenuNode]);

  useEffect(() => {
    showEdgesRef.current = showEdges;
  }, [showEdges]);

  useEffect(() => {
    nodeScaleRef.current = nodeScale;
  }, [nodeScale]);

  useEffect(() => {
    if (showEdges) return;
    setHoveredEdge(null);
    setSelectedRelationship(null);
  }, [showEdges]);

  useEffect(() => {
    setSearchResultIndex(0);
  }, [searchResults.length, searchTerm]);

  useEffect(() => {
    console.log("[Scene Init]", { container: !!containerRef.current, initialized: initializedRef.current });
    if (!containerRef.current || initializedRef.current) return;

    initializedRef.current = true;
    const sm = createSceneManager();
    sm.init(containerRef.current);
    sceneManagerRef.current = sm;
    sm.setAutoRotate(true, 0.12);

    const fieldGroup = new THREE.Group();
    fieldGroup.name = "celestial-field-stars";
    sm.scene.add(fieldGroup);
    fieldGroupRef.current = fieldGroup;

    console.log("[Scene Init] Scene created, bumping generation");
    // Signal that the scene is ready so the stars effect re-runs
    setSceneGeneration((n) => n + 1);

    const handleMouseMove = (event: MouseEvent) => {
      const container = containerRef.current;
      const manager = sceneManagerRef.current;
      if (!container || !manager) return;

      const rect = container.getBoundingClientRect();
      mouseNdcRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdcRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (selectedGraphIdRef.current) {
        if (hoveredStarIdRef.current !== null) {
          setHoveredStarId(null);
        }
        const hovered = findClosestGraphNode(
          mouseNdcRef.current,
          manager.camera,
          graphNodesRef.current,
        );
        setHoveredNode(hovered);
        if (hovered) {
          setHoveredEdge(null);
          container.style.cursor = "pointer";
          return;
        }
        if (!showEdgesRef.current) {
          setHoveredEdge(null);
          container.style.cursor = "default";
          return;
        }
        const edge = findClosestGraphEdge(
          mouseNdcRef.current,
          manager.camera,
          graphEdgesRef.current,
        );
        setHoveredEdge(edge);
        container.style.cursor = edge ? "pointer" : "default";
        return;
      }

      raycasterRef.current.setFromCamera(mouseNdcRef.current, manager.camera);
      const hits = raycasterRef.current.intersectObjects(
        starEntriesRef.current.map((entry) => entry.hitMesh),
        false,
      );
      const hit = hits[0];
      const starId = hit?.object?.userData?.starId ?? null;
      setHoveredStarId(starId);
      setHoveredNode(null);
      setHoveredEdge(null);
      container.style.cursor = starId ? "pointer" : "default";
    };

    const handleClick = () => {
      const manager = sceneManagerRef.current;
      if (!manager) return;

      setContextMenuNode(null);

      if (selectedGraphIdRef.current) {
        const clickedNode = findClosestGraphNode(
          mouseNdcRef.current,
          manager.camera,
          graphNodesRef.current,
        );
        if (clickedNode?.group) {
          animateCameraTo(manager.camera, manager.controls, clickedNode.group.position);
          setSelectedNode(clickedNode);
          setSelectedRelationship(null);
        } else {
          const clickedEdge = showEdgesRef.current
            ? findClosestGraphEdge(
                mouseNdcRef.current,
                manager.camera,
                graphEdgesRef.current,
              )
            : null;
          setSelectedNode(null);
          setSelectedRelationship(clickedEdge);
        }
        return;
      }

      raycasterRef.current.setFromCamera(mouseNdcRef.current, manager.camera);
      const hits = raycasterRef.current.intersectObjects(
        starEntriesRef.current.map((entry) => entry.hitMesh),
        false,
      );
      const hit = hits[0];
      const starId = hit?.object?.userData?.starId;
      if (starId) {
        setView("knowledge-graph-3d", starId);
      }
    };

    const handleDoubleClick = () => {
      const manager = sceneManagerRef.current;
      if (!manager || !selectedGraphIdRef.current) return;
      if (!showEdgesRef.current) return;
      const edge = findClosestGraphEdge(
        mouseNdcRef.current,
        manager.camera,
        graphEdgesRef.current,
      );
      if (!edge) return;
      setSelectedRelationship(edge);
      setSelectedNode(null);

      const source = graphNodesRef.current.find((node) => node.id === edge.sourceId);
      const target = graphNodesRef.current.find((node) => node.id === edge.targetId);
      if (source?.group && target?.group) {
        const midpoint = source.group.position.clone().add(target.group.position).multiplyScalar(0.5);
        animateCameraTo(manager.camera, manager.controls, midpoint, 500);
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (!selectedGraphIdRef.current) return;
      event.preventDefault();
      const manager = sceneManagerRef.current;
      const container = containerRef.current;
      if (!manager || !container) return;

      const rect = container.getBoundingClientRect();
      mouseNdcRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdcRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const node = findClosestGraphNode(
        mouseNdcRef.current,
        manager.camera,
        graphNodesRef.current,
      );
      if (!node) {
        setContextMenuNode(null);
        return;
      }

      setContextMenuNode(node);
      setContextMenuPos({
        x: event.clientX,
        y: event.clientY,
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't intercept keys when the user is typing in an input/textarea
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping && event.key !== "Escape") return;

      if (event.key === "Escape") {
        if (contextMenuNodeRef.current) {
          setContextMenuNode(null);
          return;
        }
        if (selectedRelationshipRef.current) {
          setSelectedRelationship(null);
          return;
        }
        if (selectedNodeRef.current) {
          setSelectedNode(null);
          return;
        }
        const currentRoute = parseAppViewFromPath(window.location.pathname);
        if (
          !selectedGraphIdRef.current &&
          !isUtilityView(currentRoute.view)
        ) {
          return;
        }
        goHome();
        return;
      }

      if (!selectedGraphIdRef.current) return;
      if (event.key === "f") {
        event.preventDefault();
        handleFitView();
        return;
      }
      if (event.key === "h") {
        if (!selectedNodeRef.current) return;
        event.preventDefault();
        handleHideNode(selectedNodeRef.current.id);
        setSelectedNode(null);
        return;
      }
    };

    const container = containerRef.current;
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("click", handleClick);
    container.addEventListener("dblclick", handleDoubleClick);
    container.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    const onResize = () => sm.resize();
    window.addEventListener("resize", onResize);

    sm.animate((time) => {
      for (const entry of starEntriesRef.current) {
        entry.group.rotation.y += 0.0018;
        const isHovered = hoveredStarIdRef.current === entry.id;
        const isSelected = selectedGraphIdRef.current === entry.id;
        if (entry.isExtracting) {
          const pulse = 1 + Math.sin(time * 3.8 + entry.group.position.x * 0.2) * 0.12;
          const hoverBoost = isHovered ? 1.12 : 1;
          entry.group.scale.setScalar(entry.baseScale * pulse * hoverBoost);
        } else {
          const hoverBoost = isHovered ? 1.15 : isSelected ? 1.08 : 1;
          entry.group.scale.setScalar(entry.baseScale * hoverBoost);
        }

        const focused = isHovered || isSelected;
        const alphaMultiplier = selectedGraphIdRef.current
          ? focused
            ? 0.65
            : 0.12
          : focused
            ? 1.6
            : 1;

        for (const materialEntry of entry.materials) {
          const material = materialEntry.material as THREE.Material & {
            opacity?: number;
          };
          if (typeof material.opacity === "number") {
            material.opacity = Math.min(
              1,
              materialEntry.baseOpacity * alphaMultiplier,
            );
          }
        }
      }

      const graphNodes = graphNodesRef.current;
      for (const node of graphNodes) {
        if (!node.group) continue;
        node.group.rotation.y += 0.003;
        node.group.rotation.x += 0.001;
        const baseY = graphBaseYRef.current.get(node.id) ?? node.position.y;
        node.group.position.y = baseY + Math.sin(time * 0.7 + node.seed) * 0.2;

        const nodeBaseScale = graphNodeBaseScaleRef.current.get(node.id) ?? 1;
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const isSelected = selectedNodeRef.current?.id === node.id;
        const scaleBoost = isHovered ? 1.16 : isSelected ? 1.08 : 1;
        node.group.scale.setScalar(nodeBaseScale * scaleBoost * nodeScaleRef.current);

        const nodeMaterials = graphNodeMaterialsRef.current.get(node.id) ?? [];
        const opacityBoost = isHovered ? 1.55 : isSelected ? 1.3 : 1;
        for (const materialEntry of nodeMaterials) {
          const material = materialEntry.material as THREE.Material & { opacity?: number };
          if (typeof material.opacity !== "number") continue;
          material.opacity = Math.min(1, materialEntry.baseOpacity * opacityBoost);
        }
      }

      const em = edgeManagerRef.current;
      if (em) {
        for (const edge of graphEdgesRef.current) {
          const edgeMaterialEntry = graphEdgeMaterialsRef.current.get(edge.id);
          if (edgeMaterialEntry) {
            const highlighted =
              hoveredEdgeRef.current?.id === edge.id ||
              selectedRelationshipRef.current?.id === edge.id;
            edgeMaterialEntry.material.opacity = Math.min(
              1,
              edgeMaterialEntry.baseOpacity * (highlighted ? 2.5 : 1),
            );
          }

          if (!edge.hasPulse || !edge.pulse || !edge.curve) continue;
          edge.pulseT += edge.pulseSpeed;
          if (edge.pulseT > 1) edge.pulseT = 0;
          em.updatePulse(edge.pulse, edge.pulseTrail, edge.curve, edge.pulseT, time);
        }
      }
    });

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("click", handleClick);
      container.removeEventListener("dblclick", handleDoubleClick);
      container.removeEventListener("contextmenu", handleContextMenu);
      container.style.cursor = "default";
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onResize);
      clearGraphVisuals();
      if (fieldGroupRef.current) {
        disposeObjectTree(fieldGroupRef.current);
      }
      stopAudio();
      sm.dispose();
      sceneManagerRef.current = null;
      fieldGroupRef.current = null;
      initializedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: all deps accessed via refs
  }, []);

  useEffect(() => {
    console.log("[Stars Effect]", {
      sceneGeneration,
      fieldGroup: !!fieldGroupRef.current,
      sceneManager: !!sceneManagerRef.current,
      starsCount: stars.length,
      starNames: stars.map(s => s.name),
    });
    if (sceneGeneration === 0) return;
    if (!fieldGroupRef.current || !sceneManagerRef.current) return;
    if (stars.length === 0) return;
    console.log("[Stars Effect] Building", stars.length, "stars");
    buildCelestialStars(stars);
    retuneAudio(stars);
  }, [sceneGeneration, buildCelestialStars, stars, retuneAudio]);

  useEffect(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;
    if (fieldGroupRef.current) {
      fieldGroupRef.current.visible = !selectedGraphId;
    }

    if (!selectedGraphId) {
      clearGraphVisuals();
      setSelectedNode(null);
      setHoveredNode(null);
      setSelectedRelationship(null);
      setHoveredEdge(null);
      setContextMenuNode(null);
      sm.setAutoRotate(true, 0.12);
      sm.controls.target.copy(FIELD_CAMERA_TARGET);
      sm.camera.position.copy(FIELD_CAMERA_POSITION);
      sm.controls.update();
      ambientRef.current?.leaveGraph();
      return;
    }

    sm.setAutoRotate(false, 0);
    const selectedEntry = starEntriesRef.current.find((entry) => entry.id === selectedGraphId);
    if (selectedEntry) {
      animateCameraTo(sm.camera, sm.controls, selectedEntry.group.position);
    }
  }, [selectedGraphId, clearGraphVisuals]);

  useEffect(() => {
    if (!selectedGraphId) return;
    if (graphSummary?.status !== "completed") return;
    if (graphLoading) return;
    buildGraph(graphEntities, graphRelationships);

    // Layer 2 audio: enter graph with entity-type-derived shimmer
    if (ambientRef.current?.isRunning() && graphEntities.length > 0) {
      const typeCounts = new Map<string, number>();
      for (const e of graphEntities) {
        typeCounts.set(e.label, (typeCounts.get(e.label) ?? 0) + 1);
      }
      const dominantTypes = [...typeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t);
      const star = stars.find((s) => s.id === selectedGraphId);
      ambientRef.current.enterGraph({
        entityCount: graphEntities.length,
        relationshipCount: graphRelationships.length,
        freshness: star?.freshness ?? 0.5,
        dominantTypes,
      });
    }
  }, [
    buildGraph,
    graphEntities,
    graphLoading,
    graphRelationships,
    graphSummary?.status,
    selectedGraphId,
    stars,
  ]);

  useEffect(() => {
    const sm = sceneManagerRef.current;
    if (!sm || !inGraphMode) return;

    sm.edgesGroup.visible = showEdges;
    sm.pulsesGroup.visible = showPulses;

    const nodes = graphNodesRef.current;
    const edges = graphEdgesRef.current;
    if (nodes.length === 0) return;

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
      if (node.group) {
        node.group.visible = visible;
      }
      if (visible) {
        visibleIds.add(node.id);
      }
    }

    for (const edge of edges) {
      const visible =
        visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId);
      if (edge.line) edge.line.visible = visible;
      if (edge.pulse) edge.pulse.visible = visible;
      if (edge.pulseTrail) edge.pulseTrail.visible = visible;
    }
  }, [activeTypes, depth, hiddenNodeIds, inGraphMode, selectedNode, showEdges, showPulses]);

  useEffect(() => {
    if (!ambientRef.current) return;
    ambientRef.current.setVolume(audioVolume / 100);
  }, [audioVolume]);

  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  const toggleAudio = useCallback(() => {
    if (audioEnabled) {
      setAudioEnabled(false);
      stopAudio();
      return;
    }
    setAudioEnabled(true);
    startAudio();
  }, [audioEnabled, startAudio, stopAudio]);

  const openUtility = useCallback(
    (utilView: UtilityView) => {
      if (activeUtility === utilView) {
        goHome();
        return;
      }
      setView(utilView as any);
    },
    [activeUtility, goHome, setView],
  );

  const utilityOverview = useMemo(() => {
    const completedGraphs = stars.filter((star) => star.status === "completed").length;
    const extractingGraphs = stars.filter((star) => star.status === "extracting").length;
    const federatedGraphs = stars.filter((star) => star.isFederated).length;
    const totalEntities = stars.reduce((sum, star) => sum + star.entityCount, 0);
    return {
      completedGraphs,
      extractingGraphs,
      federatedGraphs,
      totalEntities,
    };
  }, [stars]);

  const selectedRelationshipInfo = useMemo(() => {
    if (!selectedRelationship) return null;
    return {
      edge: selectedRelationship,
      source: graphEntityMap.get(selectedRelationship.sourceId) ?? null,
      target: graphEntityMap.get(selectedRelationship.targetId) ?? null,
    };
  }, [graphEntityMap, selectedRelationship]);

  const graphVisibleCount = useMemo(() => {
    if (!inGraphMode) return 0;
    let count = 0;
    for (const node of graphNodesRef.current) {
      if (node.group?.visible) count += 1;
    }
    return count;
  }, [activeTypes, hiddenNodeIds, inGraphMode, depth, selectedNode, graphEntities.length]);

  const utilityTitle =
    activeUtility === "merge-playground"
      ? "Merge Workbench"
      : activeUtility === "eval-harness"
        ? "Observatory"
        : activeUtility === "graph-pulse"
          ? "Pulse Array"
          : null;

  const currentKbName = selectedStar?.name ?? "Knowledge Graph";
  const showGenerateHint = inGraphMode && graphSummary && graphSummary.status !== "completed";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0B1014]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading overlay — container is always in DOM so Three.js can attach */}
      {kbLoading && stars.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0B1014]">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading celestial field...
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10">

        {inGraphMode ? (
          <div className="pointer-events-auto absolute left-4 top-4">
            <Button
              variant="outline"
              size="sm"
              className="border-[#243645] bg-[#111A21]/75 text-foreground hover:bg-[#111A21]"
              onClick={() => goHome()}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back To Celestial Field
            </Button>
          </div>
        ) : null}

        {(hoveredStar || selectedNode || hoveredEdge) ? (
          <div className="pointer-events-auto absolute left-4 top-14 w-80 rounded-lg border border-[#243645] bg-[#111A21]/82 p-4 backdrop-blur-md">
            {!inGraphMode && hoveredStar ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{hoveredStar.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{hoveredStar.status}</Badge>
                  <span>{hoveredStar.entityCount} entities</span>
                  <span>{hoveredStar.relationshipCount} relationships</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to open this knowledge graph in place.
                </p>
              </div>
            ) : null}

            {inGraphMode && selectedNode ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{selectedNode.entity.name}</p>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {selectedNode.entity.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Connections: <span className="text-foreground">{selectedNode.connectionCount}</span>
                </p>
              </div>
            ) : null}

            {inGraphMode && !selectedNode && hoveredEdge ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Relationship</p>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {hoveredEdge.relationship.type}
                </p>
                <p className="text-xs text-muted-foreground">
                  Double-click this edge to open inspection.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {inGraphMode && selectedRelationshipInfo ? (
          <div className="pointer-events-auto absolute left-4 top-40 w-96 rounded-lg border border-[#243645] bg-[#111A21]/82 p-4 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Relationship Inspector
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedRelationship(null)}
              >
                Close
              </Button>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {selectedRelationshipInfo.edge.relationship.type}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedRelationshipInfo.source?.name ?? selectedRelationshipInfo.edge.sourceId} →{" "}
              {selectedRelationshipInfo.target?.name ?? selectedRelationshipInfo.edge.targetId}
            </p>
            <div className="mt-3 rounded border border-[#243645] bg-[#0D141A]/60 p-2">
              {Object.keys(selectedRelationshipInfo.edge.relationship.properties ?? {}).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(selectedRelationshipInfo.edge.relationship.properties).map(
                    ([key, value]) => (
                      <div key={key} className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="text-foreground text-right break-all">{String(value)}</span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No relationship metadata available.</p>
              )}
            </div>
          </div>
        ) : null}

        {showGenerateHint ? (
          <div className="pointer-events-auto absolute left-1/2 top-16 -translate-x-1/2 rounded-lg border border-[#243645] bg-[#111A21]/85 p-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{graphSummary?.status}</Badge>
              <span className="text-xs text-muted-foreground">
                This graph is not materialized yet.
              </span>
              <Button
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Generate Graph
              </Button>
            </div>
          </div>
        ) : null}

        {activeUtility && utilityTitle ? (
          <div className="pointer-events-auto absolute right-4 bottom-[176px] w-[360px] rounded-lg border border-[#243645] bg-[#111A21]/84 p-3 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.13em] text-muted-foreground">
                {utilityTitle}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => goHome()}
              >
                Close
              </Button>
            </div>

            {activeUtility === "merge-playground" ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  {utilityOverview.federatedGraphs} federated graphs ready for merge,{" "}
                  {utilityOverview.completedGraphs} fully materialized.
                </p>
                <p>
                  Keep this panel open while selecting stars to stage merge candidates
                  directly from the field.
                </p>
              </div>
            ) : null}

            {activeUtility === "eval-harness" ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Showing the latest run activity while staying in the live star field.
                </p>
                {evalRuns.length > 0 ? (
                  <div className="space-y-1 rounded border border-[#243645] bg-[#0D141A]/60 p-2">
                    {evalRuns.slice(0, 3).map((run) => (
                      <div key={run.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-foreground">{run.name ?? run.id}</span>
                        <Badge variant="secondary">{run.status ?? "unknown"}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No eval runs yet. Trigger a run from this utility mode.</p>
                )}
              </div>
            ) : null}

            {activeUtility === "graph-pulse" ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Pulse activity is mapped to this same scene. Active extracting graphs:{" "}
                  {utilityOverview.extractingGraphs}.
                </p>
                <p>
                  You can keep monitoring incoming learning events without leaving the
                  celestial context.
                </p>
              </div>
            ) : null}

          </div>
        ) : null}

        <UtilitiesPanel
          activeUtility={activeUtility}
          openUtility={openUtility}
          inGraphMode={inGraphMode}
          selectedGraphId={selectedGraphId}
          stars={stars}
          graphSummary={graphSummary}
          graphVisibleCount={graphVisibleCount}
          graphEntities={graphEntities}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchResults={searchResults}
          searchResultIndex={searchResultIndex}
          handleSearchResultSelect={handleSearchResultSelect}
          handleSearchResultNext={handleSearchResultNext}
          handleSearchResultPrev={handleSearchResultPrev}
          graphTypes={graphTypes}
          activeTypes={activeTypes}
          graphTypeDistribution={graphTypeDistribution}
          handleToggleType={handleToggleType}
          depth={depth}
          setDepth={setDepth}
          selectedNode={selectedNode}
          showEdges={showEdges}
          setShowEdges={setShowEdges}
          showPulses={showPulses}
          setShowPulses={setShowPulses}
          nodeScale={nodeScale}
          setNodeScale={setNodeScale}
          handleFitView={handleFitView}
          handleUnhideAll={handleUnhideAll}
          hiddenNodeIds={hiddenNodeIds}
          handleShowAllTypes={handleShowAllTypes}
          handleHideAllTypes={handleHideAllTypes}
          audioEnabled={audioEnabled}
          toggleAudio={toggleAudio}
          audioVolume={audioVolume}
          setAudioVolume={setAudioVolume}
        />
      </div>

      <NodeContextMenu
        node={contextMenuNode}
        position={contextMenuPos}
        onClose={handleContextMenuClose}
        onFocus={handleContextMenuFocus}
        onHide={(nodeId) => {
          handleHideNode(nodeId);
          if (selectedNode?.id === nodeId) {
            setSelectedNode(null);
          }
        }}
        onShowDetails={handleContextMenuShowDetails}
        onExpandDepth={handleContextMenuExpandDepth}
      />

      {/* Bottom-center query bar — only in graph mode */}
      {inGraphMode && selectedGraphId && (
        <GraphQueryBar graphId={selectedGraphId} />
      )}
    </div>
  );
}
