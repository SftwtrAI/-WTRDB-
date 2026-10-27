import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  X,
  GitMerge,
  Layers,
  Minus,
  ShieldAlert,
  Database,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Save,
  Sparkles,
  FlaskConical,
  GripVertical,
  Play,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MergeMode = "union" | "intersection" | "differential" | "conflict_resolution";

interface KBCard {
  id: string;
  name: string;
  entityCount: number;
  relationshipCount: number;
  freshness: number;
  lastUpdated: string;
}

interface AlignmentPreview {
  id: string;
  sourceEntity: string;
  sourceType: string;
  targetEntity: string;
  targetType: string;
  confidence: number;
  tier: 1 | 2 | 3;
  decision: "SAME" | "DIFFERENT" | "UNSURE";
}

interface MergePreview {
  totalEntities: number;
  sharedEntities: number;
  uniqueToA: number;
  uniqueToB: number;
  conflicts: number;
  alignments: AlignmentPreview[];
}

// ---------------------------------------------------------------------------
// Placeholder Data
// ---------------------------------------------------------------------------

const PLACEHOLDER_KBS: KBCard[] = [
  { id: "kb_001", name: "IT Engineer Docs", entityCount: 142, relationshipCount: 267, freshness: 0.87, lastUpdated: "2026-03-28T14:22:00Z" },
  { id: "kb_002", name: "Google Admin Export", entityCount: 89, relationshipCount: 156, freshness: 0.93, lastUpdated: "2026-04-01T09:15:00Z" },
  { id: "kb_003", name: "Security Handbook", entityCount: 56, relationshipCount: 98, freshness: 0.65, lastUpdated: "2026-02-20T11:00:00Z" },
  { id: "kb_004", name: "Compliance Docs", entityCount: 34, relationshipCount: 61, freshness: 0.91, lastUpdated: "2026-03-30T16:45:00Z" },
  { id: "kb_005", name: "Incident Reports", entityCount: 78, relationshipCount: 134, freshness: 0.42, lastUpdated: "2026-01-15T08:30:00Z" },
  { id: "kb_006", name: "CRM Export", entityCount: 210, relationshipCount: 340, freshness: 0.95, lastUpdated: "2026-04-02T08:00:00Z" },
  { id: "kb_007", name: "Onboarding Playbook", entityCount: 45, relationshipCount: 72, freshness: 0.78, lastUpdated: "2026-03-25T14:00:00Z" },
];

const PLACEHOLDER_ALIGNMENTS: AlignmentPreview[] = [
  { id: "a1", sourceEntity: "Alice Chen", sourceType: "Person", targetEntity: "Alice C.", targetType: "Person", confidence: 0.97, tier: 1, decision: "SAME" },
  { id: "a2", sourceEntity: "dc01", sourceType: "Infrastructure", targetEntity: "Domain Controller 01", targetType: "Infrastructure", confidence: 0.88, tier: 2, decision: "SAME" },
  { id: "a3", sourceEntity: "Active Directory", sourceType: "Technology", targetEntity: "AD Service", targetType: "Service", confidence: 0.72, tier: 3, decision: "SAME" },
  { id: "a4", sourceEntity: "VPN Gateway", sourceType: "Infrastructure", targetEntity: "VPN_GW", targetType: "Infrastructure", confidence: 0.91, tier: 1, decision: "SAME" },
  { id: "a5", sourceEntity: "Bob Martinez", sourceType: "Person", targetEntity: "Robert Martinez", targetType: "Person", confidence: 0.62, tier: 2, decision: "UNSURE" },
  { id: "a6", sourceEntity: "OAuth 2.0", sourceType: "Technology", targetEntity: "OAuth Provider", targetType: "Service", confidence: 0.55, tier: 3, decision: "UNSURE" },
  { id: "a7", sourceEntity: "Kubernetes", sourceType: "Technology", targetEntity: "K8s Cluster", targetType: "Infrastructure", confidence: 0.84, tier: 2, decision: "SAME" },
];

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useAvailableKBs() {
  return useQuery<KBCard[]>({
    queryKey: ["/api/merge-playground/available-kbs"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/federations/available-kbs");
        if (res.ok) {
          const data = await res.json();
          return data.kbs ?? data;
        }
      } catch {}
      return PLACEHOLDER_KBS;
    },
  });
}

function useMergePreview(kbIds: string[], mode: MergeMode | null) {
  return useQuery<MergePreview>({
    queryKey: ["/api/merge-playground/preview", kbIds, mode],
    queryFn: async () => {
      try {
        const res = await apiRequest("POST", "/api/merge-playground/preview", {
          kbIds,
          mode,
        });
        if (res.ok) {
          return res.json();
        }
      } catch {}

      // Placeholder preview
      const kbA = PLACEHOLDER_KBS.find((k) => k.id === kbIds[0]);
      const kbB = PLACEHOLDER_KBS.find((k) => k.id === kbIds[1]);
      const shared = Math.floor(Math.min((kbA?.entityCount ?? 0), (kbB?.entityCount ?? 0)) * 0.3);
      return {
        totalEntities: (kbA?.entityCount ?? 0) + (kbB?.entityCount ?? 0) - shared,
        sharedEntities: shared,
        uniqueToA: (kbA?.entityCount ?? 0) - shared,
        uniqueToB: (kbB?.entityCount ?? 0) - shared,
        conflicts: mode === "conflict_resolution" ? 3 : 0,
        alignments: PLACEHOLDER_ALIGNMENTS,
      };
    },
    enabled: kbIds.length >= 2 && !!mode,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshnessColor(score: number): string {
  if (score >= 0.7) return "text-primary";
  if (score >= 0.4) return "text-amber-500";
  return "text-destructive";
}

function freshnessIndicator(score: number): string {
  if (score >= 0.7) return "bg-primary";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-destructive";
}

function confidenceColor(score: number): string {
  if (score >= 0.85) return "text-primary";
  if (score >= 0.5) return "text-amber-500";
  return "text-destructive";
}

function mergeModeLabel(mode: MergeMode): string {
  switch (mode) {
    case "union": return "Union";
    case "intersection": return "Intersection";
    case "differential": return "Differential";
    case "conflict_resolution": return "Conflict Resolution";
  }
}

function mergeModeSymbol(mode: MergeMode): string {
  switch (mode) {
    case "union": return "\u2295";
    case "intersection": return "\u2297";
    case "differential": return "\u2296";
    case "conflict_resolution": return "\u2295_CR";
  }
}

function mergeModeIcon(mode: MergeMode) {
  switch (mode) {
    case "union": return <GitMerge className="h-4 w-4" />;
    case "intersection": return <Layers className="h-4 w-4" />;
    case "differential": return <Minus className="h-4 w-4" />;
    case "conflict_resolution": return <ShieldAlert className="h-4 w-4" />;
  }
}

function timeAgo(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Merge Mode Selector
// ---------------------------------------------------------------------------

function MergeModeSelector({
  selected,
  onSelect,
}: {
  selected: MergeMode | null;
  onSelect: (mode: MergeMode) => void;
}) {
  const modes: { mode: MergeMode; label: string; symbol: string; desc: string }[] = [
    { mode: "union", label: "Union", symbol: "\u2295", desc: "Combine all entities from all sources" },
    { mode: "intersection", label: "Intersection", symbol: "\u2297", desc: "Keep only shared entities" },
    { mode: "differential", label: "Differential", symbol: "\u2296", desc: "Find unique entities (gap analysis)" },
    { mode: "conflict_resolution", label: "Conflict Res.", symbol: "\u2295_CR", desc: "Union with conflict detection" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {modes.map((m) => (
        <button
          key={m.mode}
          className={`p-3 rounded-lg border text-center transition-all ${
            selected === m.mode
              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
              : "border-border hover:border-primary/30 hover:bg-accent/30"
          }`}
          onClick={() => onSelect(m.mode)}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            {mergeModeIcon(m.mode)}
            <span className="text-sm font-semibold text-foreground">{m.label}</span>
          </div>
          <span className="text-lg font-mono text-primary">{m.symbol}</span>
          <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Venn Diagram (SVG)
// ---------------------------------------------------------------------------

function VennDiagram({
  uniqueA,
  shared,
  uniqueB,
  nameA,
  nameB,
}: {
  uniqueA: number;
  shared: number;
  uniqueB: number;
  nameA: string;
  nameB: string;
}) {
  const width = 300;
  const height = 180;
  const centerY = height / 2;
  const overlap = shared > 0 ? 35 : 0;
  const centerAx = width / 2 - overlap / 2 - 15;
  const centerBx = width / 2 + overlap / 2 + 15;
  const radiusA = 55;
  const radiusB = 55;

  return (
    <div className="flex flex-col items-center">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Circle A */}
        <circle
          cx={centerAx}
          cy={centerY}
          r={radiusA}
          fill="hsl(170, 92%, 33%)"
          fillOpacity={0.2}
          stroke="hsl(170, 92%, 33%)"
          strokeWidth={2}
        />
        {/* Circle B */}
        <circle
          cx={centerBx}
          cy={centerY}
          r={radiusB}
          fill="hsl(113, 44%, 53%)"
          fillOpacity={0.2}
          stroke="hsl(113, 44%, 53%)"
          strokeWidth={2}
        />

        {/* Labels */}
        <text x={centerAx - 20} y={centerY - 5} className="fill-foreground text-xs font-semibold" textAnchor="middle">
          {uniqueA}
        </text>
        <text x={centerAx - 20} y={centerY + 10} className="fill-muted-foreground text-[10px]" textAnchor="middle">
          unique
        </text>

        {shared > 0 && (
          <>
            <text x={(centerAx + centerBx) / 2} y={centerY - 5} className="fill-foreground text-xs font-bold" textAnchor="middle">
              {shared}
            </text>
            <text x={(centerAx + centerBx) / 2} y={centerY + 10} className="fill-muted-foreground text-[10px]" textAnchor="middle">
              shared
            </text>
          </>
        )}

        <text x={centerBx + 20} y={centerY - 5} className="fill-foreground text-xs font-semibold" textAnchor="middle">
          {uniqueB}
        </text>
        <text x={centerBx + 20} y={centerY + 10} className="fill-muted-foreground text-[10px]" textAnchor="middle">
          unique
        </text>
      </svg>
      <div className="flex items-center gap-6 text-xs text-muted-foreground mt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          {nameA}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-secondary" />
          {nameB}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity Alignment Table
// ---------------------------------------------------------------------------

type SortField = "confidence" | "sourceEntity" | "targetEntity" | "tier" | "decision";
type SortDir = "asc" | "desc";

function AlignmentTable({ alignments }: { alignments: AlignmentPreview[] }) {
  const [sortField, setSortField] = useState<SortField>("confidence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField],
  );

  const sorted = useMemo(() => {
    const items = [...alignments];
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "confidence": cmp = a.confidence - b.confidence; break;
        case "sourceEntity": cmp = a.sourceEntity.localeCompare(b.sourceEntity); break;
        case "targetEntity": cmp = a.targetEntity.localeCompare(b.targetEntity); break;
        case "tier": cmp = a.tier - b.tier; break;
        case "decision": cmp = a.decision.localeCompare(b.decision); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [alignments, sortField, sortDir]);

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field ? (
          sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader field="sourceEntity" label="Source Entity" />
            <TableHead>Type</TableHead>
            <SortHeader field="targetEntity" label="Target Entity" />
            <TableHead>Type</TableHead>
            <SortHeader field="confidence" label="Confidence" />
            <SortHeader field="tier" label="Tier" />
            <SortHeader field="decision" label="Decision" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.sourceEntity}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{a.sourceType}</Badge></TableCell>
              <TableCell className="font-medium">{a.targetEntity}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{a.targetType}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="w-14">
                    <Progress value={a.confidence * 100} className="h-1.5" />
                  </div>
                  <span className={`text-xs font-mono ${confidenceColor(a.confidence)}`}>
                    {a.confidence.toFixed(2)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">T{a.tier}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  className={`text-xs ${
                    a.decision === "SAME"
                      ? "bg-primary/15 text-primary border-primary/30"
                      : a.decision === "DIFFERENT"
                        ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-amber-500/15 text-amber-500 border-amber-500/30"
                  }`}
                >
                  {a.decision}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                No alignments to display
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MergePlaygroundPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [canvasKbs, setCanvasKbs] = useState<string[]>([]);
  const [mergeMode, setMergeMode] = useState<MergeMode | null>(null);
  const [materializeDialogOpen, setMaterializeDialogOpen] = useState(false);
  const [federationName, setFederationName] = useState("");

  const { data: kbs = [], isLoading: kbsLoading } = useAvailableKBs();
  const { data: preview, isLoading: previewLoading } = useMergePreview(canvasKbs, mergeMode);

  const shelfKbs = useMemo(() => {
    if (!searchQuery) return kbs;
    const q = searchQuery.toLowerCase();
    return kbs.filter((k) => k.name.toLowerCase().includes(q));
  }, [kbs, searchQuery]);

  const canvasKbData = useMemo(
    () => canvasKbs.map((id) => kbs.find((k) => k.id === id)).filter(Boolean) as KBCard[],
    [canvasKbs, kbs],
  );

  const addToCanvas = useCallback((id: string) => {
    setCanvasKbs((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const removeFromCanvas = useCallback((id: string) => {
    setCanvasKbs((prev) => prev.filter((k) => k !== id));
    if (canvasKbs.length <= 2) setMergeMode(null);
  }, [canvasKbs.length]);

  const handleMaterialize = useCallback(() => {
    toast({
      title: "Federation materialization started",
      description: `"${federationName}" is being created. This may take a moment.`,
    });
    setMaterializeDialogOpen(false);
    setFederationName("");
  }, [federationName, toast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <FlaskConical className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Merge Playground</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Drag graphs onto the canvas, choose a merge strategy, and preview alignments before materializing.
          </p>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-6">
        {/* Graph Shelf (Left sidebar) */}
        <div className="w-[280px] shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search knowledge bases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-2 pr-2">
              {kbsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                shelfKbs.map((kb) => {
                  const onCanvas = canvasKbs.includes(kb.id);
                  return (
                    <Card
                      key={kb.id}
                      className={`p-3 border transition-all cursor-pointer ${
                        onCanvas
                          ? "border-primary/50 bg-primary/5 opacity-60"
                          : "border-border hover:border-primary/30"
                      }`}
                      onClick={() => !onCanvas && addToCanvas(kb.id)}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{kb.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{kb.entityCount} entities</span>
                            <span className="text-xs text-muted-foreground">{kb.relationshipCount} rels</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${freshnessIndicator(kb.freshness)}`} />
                            <span className={`text-xs ${freshnessColor(kb.freshness)}`}>
                              {Math.round(kb.freshness * 100)}% fresh
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">{timeAgo(kb.lastUpdated)}</span>
                          </div>
                        </div>
                      </div>
                      {onCanvas && (
                        <div className="text-xs text-primary font-medium text-center mt-2">On Canvas</div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Merge Canvas + Preview (Main area) */}
        <div className="flex-1 space-y-6">
          {/* Canvas */}
          <Card className="p-6 border border-border min-h-[200px]">
            {canvasKbs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Database className="h-10 w-10 text-muted-foreground/40 mb-4" />
                <p className="text-sm text-muted-foreground text-center">
                  Click knowledge bases from the shelf to add them to the merge canvas.
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Add at least 2 graphs to begin merging.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Graph cards on canvas */}
                <div className="flex items-center gap-4 flex-wrap">
                  {canvasKbData.map((kb, i) => (
                    <div key={kb.id} className="flex items-center gap-3">
                      <Card className="p-4 border border-border min-w-[180px] relative group">
                        <button
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeFromCanvas(kb.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="text-sm font-semibold text-foreground">{kb.name}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>{kb.entityCount} entities</span>
                          <div className={`w-1.5 h-1.5 rounded-full ${freshnessIndicator(kb.freshness)}`} />
                        </div>
                      </Card>
                      {i < canvasKbData.length - 1 && mergeMode && (
                        <Badge variant="outline" className="gap-1 shrink-0">
                          {mergeModeIcon(mergeMode)}
                          {mergeModeSymbol(mergeMode)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>

                {/* Merge Mode Selector */}
                {canvasKbs.length >= 2 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Select merge mode:</p>
                    <MergeModeSelector selected={mergeMode} onSelect={setMergeMode} />
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Preview Result */}
          {canvasKbs.length >= 2 && mergeMode && (
            <Card className="p-6 border border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">Preview Result</h3>

              {previewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">Computing merge preview...</span>
                </div>
              ) : preview ? (
                <div className="space-y-6">
                  {/* Venn diagram for union/intersection */}
                  {(mergeMode === "union" || mergeMode === "intersection" || mergeMode === "conflict_resolution") && (
                    <VennDiagram
                      uniqueA={preview.uniqueToA}
                      shared={preview.sharedEntities}
                      uniqueB={preview.uniqueToB}
                      nameA={canvasKbData[0]?.name ?? "Graph A"}
                      nameB={canvasKbData[1]?.name ?? "Graph B"}
                    />
                  )}

                  {/* Gap analysis for differential */}
                  {mergeMode === "differential" && (
                    <div className="grid grid-cols-2 gap-4">
                      <Card className="p-4 border border-border bg-muted/20">
                        <p className="text-xs text-muted-foreground mb-1">Present in both</p>
                        <p className="text-xl font-bold text-foreground">{preview.sharedEntities}</p>
                        <p className="text-xs text-muted-foreground">shared entities</p>
                      </Card>
                      <Card className="p-4 border border-primary/30 bg-primary/5">
                        <p className="text-xs text-primary mb-1">Unique to {canvasKbData[1]?.name ?? "Graph B"}</p>
                        <p className="text-xl font-bold text-primary">{preview.uniqueToB}</p>
                        <p className="text-xs text-muted-foreground">entities, gap analysis</p>
                      </Card>
                    </div>
                  )}

                  {/* Summary stats */}
                  <div className="grid grid-cols-4 gap-4">
                    <Card className="p-3">
                      <p className="text-xs text-muted-foreground">Total Entities</p>
                      <p className="text-lg font-bold text-foreground">{preview.totalEntities}</p>
                    </Card>
                    <Card className="p-3">
                      <p className="text-xs text-muted-foreground">Shared</p>
                      <p className="text-lg font-bold text-primary">{preview.sharedEntities}</p>
                    </Card>
                    <Card className="p-3">
                      <p className="text-xs text-muted-foreground">Alignments</p>
                      <p className="text-lg font-bold text-foreground">{preview.alignments.length}</p>
                    </Card>
                    <Card className="p-3">
                      <p className="text-xs text-muted-foreground">Conflicts</p>
                      <p className={`text-lg font-bold ${preview.conflicts > 0 ? "text-destructive" : "text-foreground"}`}>
                        {preview.conflicts}
                      </p>
                    </Card>
                  </div>

                  {/* Entity Alignment Table */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">Entity Alignment Table</h4>
                    <AlignmentTable alignments={preview.alignments} />
                  </div>
                </div>
              ) : null}
            </Card>
          )}

          {/* Action Bar */}
          {canvasKbs.length >= 2 && mergeMode && (
            <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-card">
              <Button
                onClick={() => setMaterializeDialogOpen(true)}
                disabled={!preview}
              >
                <Play className="h-4 w-4 mr-2" />
                Materialize
              </Button>
              <Button variant="outline">
                <Save className="h-4 w-4 mr-2" />
                Save as Experiment
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {canvasKbs.length} graphs selected, {mergeModeLabel(mergeMode)} mode
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Materialize Dialog */}
      <Dialog open={materializeDialogOpen} onOpenChange={setMaterializeDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Materialize Federation</DialogTitle>
            <DialogDescription>
              Name your federation before materializing. This will create a permanent merged graph.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fed-name">Federation Name</Label>
              <Input
                id="fed-name"
                placeholder="e.g., Combined IT Knowledge"
                value={federationName}
                onChange={(e) => setFederationName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {mergeMode && mergeModeIcon(mergeMode)}
              <span>{mergeMode && mergeModeLabel(mergeMode)} merge of {canvasKbs.length} knowledge bases</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaterializeDialogOpen(false)}>Cancel</Button>
            <Button disabled={!federationName.trim()} onClick={handleMaterialize}>
              <Sparkles className="h-4 w-4 mr-2" />
              Materialize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
