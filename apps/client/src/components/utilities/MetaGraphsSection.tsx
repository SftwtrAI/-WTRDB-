import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Brain,
  ChevronRight,
  Plus,
  Sparkles,
  Telescope,
  Trash2,
  Network,
  Eye,
  Wand2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppView } from "@/contexts/app-view-context";

// ── API types (kept local; mirror the server schema) ──

export interface MetaSlot {
  id: string;
  name: string;
  description?: string;
  expectedEntityTypes: string[];
  colorHint?: string;
}

export interface MetaPatternEdge {
  id: string;
  fromSlotId: string;
  toSlotId: string;
  relType: string;
  description?: string;
}

export interface MetaGraphRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  source: "manual" | "induced" | "hybrid";
  derivedFromKbIds: string[];
  slots: MetaSlot[];
  pattern: MetaPatternEdge[];
  proceduralNodeCount: number | null;
  proceduralEdgeCount: number | null;
  isPublishedAsBrain: boolean | null;
  brainEndpointId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MetaGraphFederationRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  metaGraphId: string;
  constituentKbIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InducedDraft {
  name: string;
  description: string;
  source: "induced";
  derivedFromKbIds: string[];
  slots: MetaSlot[];
  pattern: MetaPatternEdge[];
  proceduralNodes: Array<{
    tempId: string;
    name: string;
    slotId: string | null;
    description?: string;
  }>;
  proceduralEdges: Array<{
    fromTempId: string;
    toTempId: string;
    relType: string;
    description?: string;
  }>;
  inductionStats: {
    kbsAnalyzed: number;
    entityTypeCandidates: number;
    relationshipCandidates: number;
    minSupport: number;
  };
}

interface KbStar {
  id: string;
  name: string;
}

interface MetaGraphsSectionProps {
  stars: KbStar[];
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
}

export function MetaGraphsSection({
  stars,
  expandedSections,
  toggleSection,
}: MetaGraphsSectionProps) {
  const isExpanded = expandedSections.has("meta-graphs");
  const { setView } = useAppView();

  // Tabs for the create dialog
  const [createMode, setCreateMode] = useState<"closed" | "manual" | "induce">("closed");
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [induceSelectedKbs, setInduceSelectedKbs] = useState<Set<string>>(new Set());
  const [induceProposedName, setInduceProposedName] = useState("");
  const [seedProcedural, setSeedProcedural] = useState(true);
  const [draft, setDraft] = useState<InducedDraft | null>(null);

  // Federation creation state
  const [showFederationForm, setShowFederationForm] = useState(false);
  const [fedName, setFedName] = useState("");
  const [fedMetaId, setFedMetaId] = useState("");
  const [fedKbIds, setFedKbIds] = useState<Set<string>>(new Set());

  const { data: metaData } = useQuery<{ metaGraphs: MetaGraphRow[] }>({
    queryKey: ["/api/meta-graphs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/meta-graphs");
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 30_000,
  });

  const { data: fedData } = useQuery<{ federations: MetaGraphFederationRow[] }>({
    queryKey: ["/api/meta-graph-federations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/meta-graph-federations");
      return res.json();
    },
    enabled: isExpanded,
    staleTime: 30_000,
  });

  const createManualMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta-graphs", {
        name: manualName.trim(),
        description: manualDescription.trim() || null,
        source: "manual",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meta-graphs"] });
      setCreateMode("closed");
      setManualName("");
      setManualDescription("");
    },
  });

  const induceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta-graphs/induce", {
        kbIds: Array.from(induceSelectedKbs),
        seedProceduralNodes: seedProcedural,
        proposedName: induceProposedName.trim() || undefined,
      });
      return res.json() as Promise<{ draft: InducedDraft }>;
    },
    onSuccess: (data) => {
      setDraft(data.draft);
    },
  });

  const acceptDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta-graphs/induce/accept", {
        draft,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meta-graphs"] });
      setDraft(null);
      setCreateMode("closed");
      setInduceSelectedKbs(new Set());
      setInduceProposedName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/meta-graphs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meta-graphs"] });
    },
  });

  const createFederationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta-graph-federations", {
        name: fedName.trim(),
        metaGraphId: fedMetaId,
        constituentKbIds: Array.from(fedKbIds),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meta-graph-federations"] });
      setShowFederationForm(false);
      setFedName("");
      setFedMetaId("");
      setFedKbIds(new Set());
    },
  });

  const deleteFederationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/meta-graph-federations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meta-graph-federations"] });
    },
  });

  const metaGraphs = metaData?.metaGraphs ?? [];
  const federations = fedData?.federations ?? [];

  const toggleKbInSet = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpen3D = (metaId: string) => {
    setView("meta-graph-3d" as any, metaId);
  };

  // Reset draft when leaving induce mode
  useEffect(() => {
    if (createMode !== "induce") setDraft(null);
  }, [createMode]);

  return (
    <div className="border-t border-[#243645] pt-3 mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground hover:bg-[#07A288]/10 transition-colors"
        onClick={() => toggleSection("meta-graphs")}
      >
        <span>Meta-Knowledge Graphs</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-normal normal-case tracking-normal opacity-60">
            {metaGraphs.length} meta · {federations.length} fed
          </span>
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-1 px-1 space-y-2">
          <p className="px-2 text-[10px] text-muted-foreground leading-relaxed">
            Distill structural know-how from your knowledge graphs. A meta-graph
            captures HOW work gets done — independent of who or what — and can
            sit on top of any number of constituent graphs in a federation.
          </p>

          {/* Create button */}
          {createMode === "closed" && (
            <div className="px-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full border-[#243645] justify-start"
                onClick={() => setCreateMode("manual")}
              >
                <Plus className="mr-2 h-3.5 w-3.5" /> New meta-graph
              </Button>
            </div>
          )}

          {/* Create dialog */}
          {createMode !== "closed" && (
            <div className="mx-2 rounded border border-[#243645] bg-[#0B1014]/90 p-2 space-y-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setCreateMode("manual")}
                  className={`flex-1 px-2 py-1 text-[10px] rounded ${
                    createMode === "manual"
                      ? "bg-[#07A288]/20 text-foreground"
                      : "text-muted-foreground hover:bg-[#07A288]/10"
                  }`}
                >
                  Author manually
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("induce")}
                  className={`flex-1 px-2 py-1 text-[10px] rounded ${
                    createMode === "induce"
                      ? "bg-[#07A288]/20 text-foreground"
                      : "text-muted-foreground hover:bg-[#07A288]/10"
                  }`}
                >
                  Induce from graphs
                </button>
              </div>

              {createMode === "manual" && (
                <>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Meta-graph name"
                    className="w-full h-8 rounded border border-[#243645] bg-[#0B1014] px-2 text-xs text-foreground outline-none"
                  />
                  <textarea
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="What know-how does this meta-graph capture? (optional)"
                    rows={2}
                    className="w-full rounded border border-[#243645] bg-[#0B1014] px-2 py-1 text-xs text-foreground outline-none resize-none"
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-[#243645]"
                      onClick={() => setCreateMode("closed")}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
                      disabled={!manualName.trim() || createManualMutation.isPending}
                      onClick={() => createManualMutation.mutate()}
                    >
                      {createManualMutation.isPending && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      Create empty
                    </Button>
                  </div>
                </>
              )}

              {createMode === "induce" && !draft && (
                <>
                  <input
                    type="text"
                    value={induceProposedName}
                    onChange={(e) => setInduceProposedName(e.target.value)}
                    placeholder="Proposed name (optional)"
                    className="w-full h-8 rounded border border-[#243645] bg-[#0B1014] px-2 text-xs text-foreground outline-none"
                  />
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      Select graphs to learn from ({induceSelectedKbs.size} selected):
                    </p>
                    <div className="max-h-32 overflow-y-auto rounded border border-[#243645] bg-[#0B1014]">
                      {stars.length === 0 ? (
                        <p className="p-2 text-[10px] text-muted-foreground italic">
                          No graphs available. Upload knowledge first.
                        </p>
                      ) : (
                        stars.map((s) => (
                          <label
                            key={s.id}
                            className="flex items-center gap-2 px-2 py-1 text-[10px] hover:bg-[#07A288]/10 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={induceSelectedKbs.has(s.id)}
                              onChange={() =>
                                toggleKbInSet(setInduceSelectedKbs, s.id)
                              }
                              className="accent-[#07A288]"
                            />
                            <span className="truncate text-foreground">{s.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={seedProcedural}
                      onChange={(e) => setSeedProcedural(e.target.checked)}
                      className="accent-[#07A288]"
                    />
                    Let the LLM seed procedural knowledge
                  </label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-[#243645]"
                      onClick={() => setCreateMode("closed")}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
                      disabled={induceSelectedKbs.size === 0 || induceMutation.isPending}
                      onClick={() => induceMutation.mutate()}
                    >
                      {induceMutation.isPending && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      <Wand2 className="mr-1 h-3 w-3" /> Generate draft
                    </Button>
                  </div>
                </>
              )}

              {createMode === "induce" && draft && (
                <div className="space-y-2">
                  <div className="rounded border border-[#243645] bg-[#0B1014] p-2">
                    <div className="text-xs font-semibold text-foreground">
                      {draft.name}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {draft.description}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[9px]">
                      <div className="rounded bg-[#07A288]/10 px-1.5 py-1 text-center">
                        <div className="text-[#07A288] font-semibold">
                          {draft.slots.length}
                        </div>
                        <div className="text-muted-foreground">slots</div>
                      </div>
                      <div className="rounded bg-[#5BBE4E]/10 px-1.5 py-1 text-center">
                        <div className="text-[#5BBE4E] font-semibold">
                          {draft.pattern.length}
                        </div>
                        <div className="text-muted-foreground">edges</div>
                      </div>
                      <div className="rounded bg-[#B8E52B]/10 px-1.5 py-1 text-center">
                        <div className="text-[#B8E52B] font-semibold">
                          {draft.proceduralNodes.length}
                        </div>
                        <div className="text-muted-foreground">seeds</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {draft.slots.slice(0, 8).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.colorHint ?? "#07A288" }}
                        />
                        <span className="truncate">{s.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-[#243645]"
                      onClick={() => setDraft(null)}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
                      disabled={acceptDraftMutation.isPending}
                      onClick={() => acceptDraftMutation.mutate()}
                    >
                      {acceptDraftMutation.isPending && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      Accept & save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meta-graphs list */}
          {metaGraphs.length > 0 && (
            <div className="space-y-1">
              {metaGraphs.map((meta) => (
                <div
                  key={meta.id}
                  className="mx-2 rounded border border-[#243645] bg-[#0B1014]/60 p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Brain className="h-3 w-3 text-[#07A288] flex-shrink-0" />
                        <span className="text-xs font-medium text-foreground truncate">
                          {meta.name}
                        </span>
                        <span
                          className={`text-[8px] uppercase px-1 rounded ${
                            meta.source === "induced"
                              ? "bg-[#B8E52B]/20 text-[#B8E52B]"
                              : "bg-[#243645] text-muted-foreground"
                          }`}
                        >
                          {meta.source}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                        <span>{meta.slots.length} slots</span>
                        <span>·</span>
                        <span>{meta.pattern.length} pattern edges</span>
                        <span>·</span>
                        <span>{meta.proceduralNodeCount ?? 0} procedural</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpen3D(meta.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-[#07A288]/15 hover:bg-[#07A288]/25 px-2 py-1 text-[10px] text-[#07A288]"
                      title="Open in 3D"
                    >
                      <Eye className="h-3 w-3" /> Open
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(meta.id)}
                      disabled={deleteMutation.isPending}
                      className="inline-flex items-center justify-center rounded bg-[#243645]/40 hover:bg-red-500/20 hover:text-red-400 px-2 py-1 text-[10px] text-muted-foreground"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Federations subsection */}
          <div className="border-t border-[#243645]/60 pt-2 mt-2">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Federations
              </span>
              {!showFederationForm && metaGraphs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowFederationForm(true);
                    setFedMetaId(metaGraphs[0]?.id ?? "");
                  }}
                  className="text-[9px] text-[#07A288] hover:text-[#5BBE4E]"
                >
                  + new
                </button>
              )}
            </div>

            {showFederationForm && (
              <div className="mx-2 mb-2 rounded border border-[#243645] bg-[#0B1014]/90 p-2 space-y-2">
                <input
                  type="text"
                  value={fedName}
                  onChange={(e) => setFedName(e.target.value)}
                  placeholder="Federation name"
                  className="w-full h-8 rounded border border-[#243645] bg-[#0B1014] px-2 text-xs text-foreground outline-none"
                />
                <select
                  value={fedMetaId}
                  onChange={(e) => setFedMetaId(e.target.value)}
                  className="w-full h-8 rounded border border-[#243645] bg-[#0B1014] px-2 text-xs text-foreground outline-none"
                >
                  <option value="">Select meta-graph (top)</option>
                  {metaGraphs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">
                    Constituent KBs ({fedKbIds.size} selected):
                  </p>
                  <div className="max-h-24 overflow-y-auto rounded border border-[#243645] bg-[#0B1014]">
                    {stars.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 px-2 py-1 text-[10px] hover:bg-[#07A288]/10 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={fedKbIds.has(s.id)}
                          onChange={() => toggleKbInSet(setFedKbIds, s.id)}
                          className="accent-[#07A288]"
                        />
                        <span className="truncate text-foreground">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-[#243645]"
                    onClick={() => setShowFederationForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
                    disabled={
                      !fedName.trim() ||
                      !fedMetaId ||
                      createFederationMutation.isPending
                    }
                    onClick={() => createFederationMutation.mutate()}
                  >
                    Create
                  </Button>
                </div>
              </div>
            )}

            {federations.length === 0 ? (
              <p className="px-2 text-[10px] text-muted-foreground italic">
                No federations yet. A federation = 1 meta-graph + N constituent KBs.
              </p>
            ) : (
              <div className="space-y-1">
                {federations.map((fed) => {
                  const meta = metaGraphs.find((m) => m.id === fed.metaGraphId);
                  return (
                    <div
                      key={fed.id}
                      className="mx-2 rounded border border-[#243645] bg-[#0B1014]/60 p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Network className="h-3 w-3 text-[#5BBE4E] flex-shrink-0" />
                            <span className="text-xs font-medium text-foreground truncate">
                              {fed.name}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[9px] text-muted-foreground">
                            <span className="text-[#07A288]">
                              {meta?.name ?? "(missing meta)"}
                            </span>
                            {" · "}
                            <span>{fed.constituentKbIds.length} constituents</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteFederationMutation.mutate(fed.id)}
                          className="rounded bg-[#243645]/40 hover:bg-red-500/20 hover:text-red-400 px-1.5 py-1 text-[10px] text-muted-foreground"
                          title="Delete federation"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
