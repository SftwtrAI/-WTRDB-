/**
 * 3D Knowledge Graph -- Top Toolbar.
 *
 * Consolidates search, entity-type filters, depth slider, generate button,
 * stats, hidden-node badge, and legend into one horizontal bar that overlays
 * the top edge of the 3D viewport.
 */

import { useEffect, useRef, useState } from "react";
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
  Sparkles,
  EyeOff,
  Info,
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { GraphEntity } from "./types";

// ── Display metadata per entity label ──

const TYPE_INFO: Record<
  string,
  { label: string; color: string; codename: string }
> = {
  Organization: { label: "ORG", color: "#07A288", codename: "Station Core" },
  Event: { label: "EVT", color: "#FF4F79", codename: "Subspace Anomaly" },
  Person: { label: "USR", color: "#FFD60A", codename: "Delta Shield" },
  Document: { label: "DOC", color: "#5AC8FA", codename: "Deflector Array" },
  Product: { label: "PRD", color: "#BF5AF2", codename: "Warp Assembly" },
  Location: { label: "LOC", color: "#0A84FF", codename: "Sensor Pod" },
  Concept: { label: "CPT", color: "#FF375F", codename: "Containment Grid" },
};

// ── Props ──

export interface GraphToolbarProps {
  // Navigation
  knowledgeBaseId: string;

  // Data
  entities: GraphEntity[];
  totalEntities: number;
  nodeCount: number;
  edgeCount: number;
  typeDistribution: Record<string, number>;

  // Search
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchResults: GraphEntity[];
  searchResultIndex: number;
  onSearchResultNext: () => void;
  onSearchResultPrev: () => void;
  onSearchResultSelect: (entity: GraphEntity) => void;
  isSearchOpen: boolean;
  onSearchToggle: () => void;

  // Entity type filtering
  activeTypes: Set<string>;
  onToggleType: (label: string) => void;
  onShowAllTypes: () => void;
  onHideAllTypes: () => void;

  // Depth
  depth: number;
  onDepthChange: (depth: number) => void;
  selectedNodeName: string | null;

  // Graph status
  graphStatus: "pending" | "extracting" | "completed" | "failed";
  onGenerate: () => void;
  isGenerating: boolean;

  // Hidden entities
  hiddenCount: number;
  onUnhideAll: () => void;
}

// ── Component ──

export function GraphToolbar(props: GraphToolbarProps) {
  const {
    knowledgeBaseId,
    entities,
    totalEntities,
    nodeCount,
    edgeCount,
    typeDistribution,
    searchTerm,
    onSearchChange,
    searchResults,
    searchResultIndex,
    onSearchResultNext,
    onSearchResultPrev,
    onSearchResultSelect,
    isSearchOpen,
    onSearchToggle,
    activeTypes,
    onToggleType,
    onShowAllTypes,
    onHideAllTypes,
    depth,
    onDepthChange,
    selectedNodeName,
    graphStatus,
    onGenerate,
    isGenerating,
    hiddenCount,
    onUnhideAll,
  } = props;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isSearchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isSearchOpen]);

  // Keyboard handler for search input
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onSearchToggle();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults.length > 0 && searchResults[searchResultIndex]) {
        onSearchResultSelect(searchResults[searchResultIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (searchResults.length > 0) onSearchResultNext();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (searchResults.length > 0) onSearchResultPrev();
    }
  }

  // Gather the entity types actually present in the data
  const presentTypes = Object.keys(typeDistribution).filter(
    (t) => typeDistribution[t] > 0 && TYPE_INFO[t],
  );

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#111A21]/90 backdrop-blur-md border-b border-[#243645] select-none">
      {/* ── Navigation ── */}
      <div className="flex items-center gap-1 shrink-0 mr-1">
        <Link href="/app/knowledge-base">
          <button className="text-[10px] text-gray-500 hover:text-[#07A288] transition-colors font-mono">
            KB
          </button>
        </Link>
        <ChevronRight className="h-3 w-3 text-gray-600" />
        <span className="text-[10px] text-[#07A288] font-mono font-bold">
          GRAPH
        </span>
      </div>

      <div className="w-px h-5 bg-[#243645] shrink-0" />

      {/* ── Left: Search + Type Filters ── */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Search toggle */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 shrink-0",
            isSearchOpen && "bg-[#243645] text-[#07A288]",
          )}
          onClick={onSearchToggle}
        >
          <Search className="h-3.5 w-3.5" />
        </Button>

        {/* Search input (expanded) */}
        {isSearchOpen && (
          <div className="flex items-center gap-1.5 bg-[#0B1014] border border-[#243645] rounded-md px-2 py-1 min-w-0">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search entities..."
              className="bg-transparent text-xs text-gray-200 placeholder:text-gray-600 outline-none w-32 min-w-0"
            />

            {searchTerm.length > 0 && (
              <span className="text-[10px] text-gray-500 font-mono tabular-nums whitespace-nowrap">
                {searchResults.length > 0
                  ? `${searchResultIndex + 1}/${searchResults.length}`
                  : "0"}
              </span>
            )}

            <button
              onClick={onSearchResultPrev}
              disabled={searchResults.length === 0}
              className="text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={onSearchResultNext}
              disabled={searchResults.length === 0}
              className="text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              onClick={onSearchToggle}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Divider */}
        {presentTypes.length > 0 && (
          <div className="h-4 w-px bg-[#243645] shrink-0" />
        )}

        {/* Entity type filter pills */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {presentTypes.map((entityType) => {
            const info = TYPE_INFO[entityType];
            const isActive = activeTypes.has(entityType);
            return (
              <button
                key={entityType}
                onClick={() => onToggleType(entityType)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-all whitespace-nowrap",
                  isActive
                    ? "border-current opacity-100"
                    : "border-[#243645] opacity-30",
                )}
                style={{ color: info.color }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: info.color }}
                />
                {info.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Center: Depth Slider ── */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-gray-500 font-mono uppercase">
          Depth
        </span>
        <Slider
          value={[depth]}
          min={1}
          max={5}
          step={1}
          onValueChange={([v]) => onDepthChange(v)}
          disabled={!selectedNodeName}
          className="w-24"
        />
        <span className="text-[10px] text-gray-400 tabular-nums font-mono w-3 text-center">
          {selectedNodeName ? depth : "-"}
        </span>
        {!selectedNodeName && (
          <span className="text-[9px] text-gray-600 italic whitespace-nowrap">
            (select a node)
          </span>
        )}
      </div>

      {/* ── Right: Stats, Hidden, Generate, Legend ── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Divider */}
        <div className="h-4 w-px bg-[#243645]" />

        {/* Stats */}
        <span className="text-[10px] text-gray-500 font-mono tabular-nums whitespace-nowrap">
          {nodeCount} nodes &middot; {edgeCount} edges
        </span>

        {/* Hidden count badge */}
        {hiddenCount > 0 && (
          <button
            onClick={onUnhideAll}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#243645]/60 text-gray-400 hover:text-gray-200 border border-[#243645] transition-colors"
          >
            <EyeOff className="h-3 w-3" />
            {hiddenCount} hidden
          </button>
        )}

        {/* Generate button */}
        {graphStatus !== "completed" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onGenerate}
            disabled={isGenerating}
            className="h-7 text-[10px] font-mono uppercase gap-1.5 text-[#07A288] hover:bg-[#07A288]/10"
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isGenerating ? "Extracting..." : "Generate"}
          </Button>
        )}

        {/* Divider */}
        <div className="h-4 w-px bg-[#243645]" />

        {/* Legend toggle */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              legendOpen && "bg-[#243645] text-[#07A288]",
            )}
            onClick={() => setLegendOpen((o) => !o)}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>

          {legendOpen && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-[#111A21]/95 backdrop-blur-md border border-[#243645] rounded-lg p-3 w-52 shadow-xl">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Entity Type Legend
              </h4>
              <div className="space-y-1.5">
                {Object.entries(TYPE_INFO).map(([entityType, info]) => (
                  <div
                    key={entityType}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: info.color }}
                    />
                    <span
                      className="font-mono text-[10px] w-7"
                      style={{ color: info.color }}
                    >
                      {info.label}
                    </span>
                    <span className="text-gray-400 text-[11px]">
                      {info.codename}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
