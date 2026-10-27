import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Network, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { SpiderwebCanvas, ENTITY_COLORS } from "@/components/knowledge-graph/meta/SpiderwebCanvas";
import { MetaGraphSidebar } from "@/components/knowledge-graph/meta/MetaGraphSidebar";
import type { SimNode, SimEdge } from "@/components/knowledge-graph/meta/SpiderwebSimulation";

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

interface KbBundle {
  kbId: string;
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  summary: {
    knowledgeBaseId: string;
    entityCount: number;
    relationshipCount: number;
    entityTypes: string[];
    status: string;
    lastUpdated: string;
  } | null;
}

interface DocumentMeta {
  kbId: string;
  title: string;
}

function mergeKeyFor(label: string, name: string): string {
  return `${label.toLowerCase()}:${name.toLowerCase().trim()}`;
}

export default function MetaGraphPage() {
  // Re-run when wouter location changes (URL has query params in search, not path).
  const [location] = useLocation();

  // Parse ?ids= from the search string (wouter location only gives path).
  const ids = useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const raw = params.get("ids") || "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Fetch entities + relationships + summary for each KB id in parallel.
  const kbQuery = useQuery<KbBundle[]>({
    queryKey: ["meta-graph", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        ids.map(async (id): Promise<KbBundle> => {
          try {
            const [entitiesRes, relsRes, summaryRes] = await Promise.all([
              apiRequest("GET", `/api/knowledge-graph/${id}/entities?limit=200`),
              apiRequest("GET", `/api/knowledge-graph/${id}/relationships?limit=200`),
              apiRequest("GET", `/api/knowledge-graph/${id}/summary`),
            ]);
            const entitiesJson = entitiesRes.ok ? await entitiesRes.json() : { entities: [] };
            const relsJson = relsRes.ok ? await relsRes.json() : { relationships: [] };
            const summary = summaryRes.ok ? await summaryRes.json() : null;
            const entities: GraphEntity[] = ((entitiesJson.entities as GraphEntity[]) || []).filter(
              Boolean,
            );
            const relationships: GraphRelationship[] = (
              (relsJson.relationships as GraphRelationship[]) || []
            ).filter(Boolean);
            return { kbId: id, entities, relationships, summary };
          } catch (err) {
            console.warn(`[MetaGraphPage] Failed to load KB ${id}`, err);
            return { kbId: id, entities: [], relationships: [], summary: null };
          }
        }),
      );
      return results;
    },
  });

  // Fetch document titles in parallel.
  const titlesQuery = useQuery<DocumentMeta[]>({
    queryKey: ["meta-graph-titles", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        ids.map(async (id): Promise<DocumentMeta> => {
          try {
            const res = await apiRequest("GET", `/api/knowledge-base/${id}`);
            if (!res.ok) return { kbId: id, title: id };
            const data = await res.json();
            return { kbId: id, title: data.title || data.fileName || id };
          } catch {
            return { kbId: id, title: id };
          }
        }),
      );
      return results;
    },
  });

  const documentTitles = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    (titlesQuery.data || []).forEach((d) => {
      map[d.kbId] = d.title;
    });
    return map;
  }, [titlesQuery.data]);

  // ---- Merge entities across documents by (label, name) case-insensitive ----
  const { mergedNodes, mergedEdges, stats } = useMemo(() => {
    const nodes: Map<string, SimNode> = new Map();
    const edges: Map<string, SimEdge> = new Map();
    // Per-KB map from original entityId -> mergeKey, so we can resolve
    // relationships (which reference the original entity IDs, not merged keys).
    const entityIdToMergeKey: Map<string, Map<string, string>> = new Map();

    const data = kbQuery.data || [];
    let totalEntities = 0;
    let totalRelationships = 0;

    for (const bundle of data) {
      const localMap = new Map<string, string>();
      entityIdToMergeKey.set(bundle.kbId, localMap);
      totalEntities += bundle.entities.length;
      totalRelationships += bundle.relationships.length;

      for (const entity of bundle.entities) {
        if (!entity || !entity.name) continue;
        const key = mergeKeyFor(entity.label || "Other", entity.name);
        localMap.set(entity.id, key);

        const existing = nodes.get(key);
        if (existing) {
          if (!existing.documentIds.includes(bundle.kbId)) {
            existing.documentIds.push(bundle.kbId);
          }
        } else {
          // Random-ish initial position; simulation scatters them on a ring.
          nodes.set(key, {
            id: key,
            name: entity.name,
            label: entity.label || "Other",
            documentIds: [bundle.kbId],
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0,
          });
        }
      }
    }

    for (const bundle of data) {
      const localMap = entityIdToMergeKey.get(bundle.kbId);
      if (!localMap) continue;
      for (const rel of bundle.relationships) {
        if (!rel) continue;
        const srcKey = localMap.get(rel.sourceEntityId);
        const tgtKey = localMap.get(rel.targetEntityId);
        if (!srcKey || !tgtKey || srcKey === tgtKey) continue;
        // Normalize direction so A-B and B-A collapse to the same edge.
        const [a, b] = srcKey < tgtKey ? [srcKey, tgtKey] : [tgtKey, srcKey];
        const edgeKey = `${a}::${b}`;
        const existing = edges.get(edgeKey);
        if (existing) {
          if (!existing.types.includes(rel.type)) {
            existing.types.push(rel.type);
          }
          // Track weight as unique source-KB count.
          const kbSet = new Set(
            (existing as SimEdge & { _kbs?: Set<string> })._kbs || [],
          );
          kbSet.add(bundle.kbId);
          (existing as SimEdge & { _kbs?: Set<string> })._kbs = kbSet;
          existing.weight = kbSet.size;
        } else {
          const kbSet = new Set<string>([bundle.kbId]);
          edges.set(edgeKey, {
            id: edgeKey,
            sourceId: a,
            targetId: b,
            weight: 1,
            types: [rel.type],
            // @ts-expect-error internal helper for weight tracking
            _kbs: kbSet,
          });
        }
      }
    }

    const nodeArr = Array.from(nodes.values());
    const edgeArr = Array.from(edges.values()).map(({ id, sourceId, targetId, weight, types }) => ({
      id,
      sourceId,
      targetId,
      weight,
      types,
    }));

    const hubCount = nodeArr.filter((n) => n.documentIds.length >= 3).length;

    return {
      mergedNodes: nodeArr,
      mergedEdges: edgeArr,
      stats: {
        documents: data.length,
        totalEntities,
        totalRelationships,
        mergedNodeCount: nodeArr.length,
        mergedEdgeCount: edgeArr.length,
        hubCount,
      },
    };
  }, [kbQuery.data]);

  // ---- UI state ----
  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [hubsOnly, setHubsOnly] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Responsive viewport tracking.
  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const node of mergedNodes) set.add(node.label);
    return Array.from(set).sort();
  }, [mergedNodes]);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  // Hovered node is tracked for cursor highlight; it's already drawn
  // by SpiderwebCanvas internally — we just mirror the value for parity.
  void hoveredNode;

  // ---- Rendering branches ----

  if (ids.length === 0) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B1014]">
        <div className="max-w-md space-y-4 rounded-xl border border-[#243645] bg-[#111A21] p-8 text-center">
          <Network className="mx-auto h-10 w-10 text-[#B8E52B]" />
          <h2 className="text-lg font-bold text-[#E7EEF6]">No documents selected</h2>
          <p className="text-sm text-[#8FA2B5]">
            Go back and select graphs to merge into the meta-graph spider-web.
          </p>
          <Link href="/app/knowledge-base?tab=graphs">
            <a className="inline-flex items-center gap-2 rounded-md border border-[#243645] bg-[#0B1014] px-4 py-2 text-sm text-[#E7EEF6] transition-colors hover:border-[#B8E52B]/50 hover:text-[#B8E52B]">
              <ArrowLeft className="h-4 w-4" />
              Back to Knowledge Base
            </a>
          </Link>
        </div>
      </div>
    );
  }

  if (kbQuery.isLoading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B1014]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-[#B8E52B]/20" />
            <Loader2 className="relative h-10 w-10 animate-spin text-[#B8E52B]" />
          </div>
          <div className="text-sm font-medium tracking-wider text-[#B8E52B]">
            Weaving the meta-graph...
          </div>
          <div className="text-xs text-[#8FA2B5]">
            Loading {ids.length} document{ids.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    );
  }

  if (!kbQuery.data || mergedNodes.length === 0) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B1014]">
        <div className="max-w-md space-y-4 rounded-xl border border-[#243645] bg-[#111A21] p-8 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-[#B8E52B]" />
          <h2 className="text-lg font-bold text-[#E7EEF6]">No entities to weave</h2>
          <p className="text-sm text-[#8FA2B5]">
            The selected documents don't contain any extracted entities yet.
          </p>
          <Link href="/app/knowledge-base?tab=graphs">
            <a className="inline-flex items-center gap-2 rounded-md border border-[#243645] bg-[#0B1014] px-4 py-2 text-sm text-[#E7EEF6] transition-colors hover:border-[#B8E52B]/50 hover:text-[#B8E52B]">
              <ArrowLeft className="h-4 w-4" />
              Back to Knowledge Base
            </a>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-[#0B1014]">
      {/* Canvas fills viewport */}
      <SpiderwebCanvas
        nodes={mergedNodes}
        edges={mergedEdges}
        width={viewport.width}
        height={viewport.height}
        hubsOnly={hubsOnly}
        selectedTypes={selectedTypes}
        onNodeHover={setHoveredNode}
        onNodeClick={(node) => setSelectedNode(node)}
        selectedNodeId={selectedNode?.id ?? null}
      />

      {/* Floating top toolbar */}
      <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(96vw,1100px)] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl border border-[#243645] bg-[#0B1014]/80 px-4 py-3 shadow-[0_0_30px_rgba(184,229,43,0.12)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3">
            {/* Title */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Network className="h-5 w-5 text-[#B8E52B]" />
                <div className="absolute inset-0 animate-pulse">
                  <Network className="h-5 w-5 text-[#B8E52B] opacity-40" />
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-[#E7EEF6]">Meta-Graph</div>
                <div className="text-[10px] text-[#8FA2B5]">
                  {stats.documents} docs · {stats.mergedNodeCount} entities ·{" "}
                  {stats.mergedEdgeCount} connections · {stats.hubCount} hubs
                </div>
              </div>
            </div>

            <div className="mx-1 hidden h-6 w-px bg-[#243645] md:block" />

            {/* Hubs-only toggle */}
            <button
              type="button"
              onClick={() => setHubsOnly((v) => !v)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                hubsOnly
                  ? "border-[#B8E52B] bg-[#B8E52B]/15 text-[#B8E52B] shadow-[0_0_12px_rgba(184,229,43,0.35)]"
                  : "border-[#243645] text-[#8FA2B5] hover:border-[#B8E52B]/40 hover:text-[#E7EEF6]"
              }`}
            >
              Hubs Only
            </button>

            {/* Type filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {availableTypes.map((type) => {
                const color = ENTITY_COLORS[type] || ENTITY_COLORS.Other;
                const active = selectedTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className="rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-all"
                    style={{
                      borderColor: active ? color : `${color}40`,
                      color: active ? "#041514" : color,
                      backgroundColor: active ? color : "transparent",
                      boxShadow: active ? `0 0 10px ${color}60` : "none",
                    }}
                  >
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: active ? "#041514" : color }}
                    />
                    {type}
                  </button>
                );
              })}
              {selectedTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTypes([])}
                  className="rounded-full border border-[#243645] px-2 py-0.5 text-[10px] text-[#8FA2B5] transition-colors hover:border-[#B8E52B]/40 hover:text-[#E7EEF6]"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="ml-auto">
              <Link href="/app/knowledge-base?tab=graphs">
                <a className="inline-flex items-center gap-1.5 rounded-md border border-[#243645] bg-[#0B1014] px-3 py-1.5 text-xs text-[#E7EEF6] transition-colors hover:border-[#B8E52B]/50 hover:text-[#B8E52B]">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </a>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar (slides in on node select) */}
      <MetaGraphSidebar
        node={selectedNode}
        documentTitles={documentTitles}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
