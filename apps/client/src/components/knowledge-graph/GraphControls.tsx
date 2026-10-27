import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Maximize2,
  ZoomIn,
  ZoomOut,
  GitBranch,
  Share2,
  Layers,
  Grid3X3,
  RotateCcw,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  HelpCircle,
} from "lucide-react";
import { ENTITY_COLORS } from "./GraphNode";
import { GraphExportMenu } from "./GraphExportMenu";

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

export type LayoutType = "force" | "radial" | "hierarchical" | "cluster";

interface GraphControlsProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSearchSubmit?: () => void;
  activeEntityTypes: string[];
  availableEntityTypes: string[];
  onEntityTypeToggle: (type: string) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  layout: LayoutType;
  onLayoutChange: (layout: LayoutType) => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  entityCount: number;
  relationshipCount: number;
  onToggleQueryPanel?: () => void;
  entities?: GraphEntity[];
  relationships?: GraphRelationship[];
  knowledgeBaseId?: string;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Whether layout buttons should be disabled (e.g. during animation) */
  layoutAnimating?: boolean;
  /** Whether the force layout is currently computing */
  isComputingLayout?: boolean;
  // Search navigation
  searchResultCount?: number;
  searchResultIndex?: number;
  onSearchNavigate?: (direction: "prev" | "next") => void;
  // Depth context
  selectedEntityName?: string;
  // Help / tour replay
  onReplayTour?: () => void;
}

export function GraphControls({
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  activeEntityTypes,
  availableEntityTypes,
  onEntityTypeToggle,
  depth,
  onDepthChange,
  layout,
  onLayoutChange,
  onFitView,
  onZoomIn,
  onZoomOut,
  onReset,
  entityCount,
  relationshipCount,
  onToggleQueryPanel,
  entities,
  relationships,
  knowledgeBaseId,
  searchInputRef,
  layoutAnimating,
  isComputingLayout,
  searchResultCount,
  searchResultIndex,
  onSearchNavigate,
  selectedEntityName,
  onReplayTour,
}: GraphControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasSearchResults =
    typeof searchResultCount === "number" && searchResultCount > 0;

  return (
    <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none">
      <div className="flex items-start gap-3">
        {/* Main controls panel */}
        <div className="pointer-events-auto bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] rounded-xl shadow-2xl overflow-hidden max-w-[480px]">
          {/* Search bar */}
          <div className="p-3 border-b border-[#243645]/60">
            <div className="relative flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  ref={searchInputRef}
                  data-testid="graph-search-input"
                  placeholder="Search entities... (press /)"
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSearchSubmit?.();
                    }
                  }}
                  className="pl-9 h-8 text-sm bg-[#111A21] border-[#243645] focus-visible:ring-[#07A288]/50"
                />
              </div>
              {/* Search result count + nav arrows */}
              {searchTerm.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    data-testid="search-result-count"
                    className="text-[10px] text-gray-500 whitespace-nowrap tabular-nums"
                  >
                    {hasSearchResults
                      ? `${(searchResultIndex ?? 0) + 1} of ${searchResultCount}`
                      : `0 of ${entityCount}`}
                  </span>
                  {hasSearchResults && onSearchNavigate && (
                    <>
                      <button
                        data-testid="search-prev"
                        className="p-0.5 rounded hover:bg-[#1a2530] text-gray-500 hover:text-gray-300 transition-colors"
                        onClick={() => onSearchNavigate("prev")}
                        aria-label="Previous result"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        data-testid="search-next"
                        className="p-0.5 rounded hover:bg-[#1a2530] text-gray-500 hover:text-gray-300 transition-colors"
                        onClick={() => onSearchNavigate("next")}
                        aria-label="Next result"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {isExpanded && (
            <>
              {/* Entity type filters */}
              {availableEntityTypes.length > 0 && (
                <div className="p-3 border-b border-[#243645]/60">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Entity Types
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableEntityTypes.map((type) => {
                      const color =
                        ENTITY_COLORS[type] || ENTITY_COLORS.Other;
                      const isActive = activeEntityTypes.includes(type);
                      return (
                        <button
                          key={type}
                          onClick={() => onEntityTypeToggle(type)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-all duration-150 border"
                          style={{
                            backgroundColor: isActive ? `${color}20` : "transparent",
                            borderColor: isActive ? `${color}60` : "#243645",
                            color: isActive ? color : "#6B7280",
                          }}
                        >
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: isActive ? color : "#4B5563",
                            }}
                          />
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Depth slider */}
              <div className="p-3 border-b border-[#243645]/60">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                      Expansion Depth
                    </p>
                    {selectedEntityName ? (
                      <p
                        data-testid="depth-context-label"
                        className="text-[9px] text-[#07A288] truncate max-w-[180px]"
                        title={`From ${selectedEntityName}`}
                      >
                        From {selectedEntityName}
                      </p>
                    ) : (
                      <p
                        data-testid="depth-context-label"
                        className="text-[9px] text-gray-600"
                      >
                        From hub
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-[#07A288] font-mono">
                    {depth} {depth === 1 ? "hop" : "hops"}
                  </span>
                </div>
                <Slider
                  data-testid="depth-slider"
                  value={[depth]}
                  min={1}
                  max={3}
                  step={1}
                  onValueChange={(val) => onDepthChange(val[0])}
                  className="w-full"
                />
              </div>

              {/* Layout buttons */}
              <div className="p-3 border-b border-[#243645]/60">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                    Layout
                  </p>
                  {isComputingLayout && (
                    <span
                      data-testid="computing-layout-indicator"
                      className="text-[10px] text-[#07A288] animate-pulse"
                    >
                      Computing...
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={layout === "force" ? "default" : "ghost"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => onLayoutChange("force")}
                        disabled={layoutAnimating || isComputingLayout}
                        style={
                          layout === "force"
                            ? {
                                backgroundColor: "#07A28830",
                                color: "#07A288",
                                border: "1px solid #07A28860",
                              }
                            : {}
                        }
                      >
                        <Share2 className="h-3 w-3 mr-1" />
                        Force
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Force-directed layout (1)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={layout === "radial" ? "default" : "ghost"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => onLayoutChange("radial")}
                        disabled={layoutAnimating || isComputingLayout}
                        style={
                          layout === "radial"
                            ? {
                                backgroundColor: "#07A28830",
                                color: "#07A288",
                                border: "1px solid #07A28860",
                              }
                            : {}
                        }
                      >
                        <GitBranch className="h-3 w-3 mr-1" />
                        Radial
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Radial layout (2)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={layout === "hierarchical" ? "default" : "ghost"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => onLayoutChange("hierarchical")}
                        disabled={layoutAnimating || isComputingLayout}
                        style={
                          layout === "hierarchical"
                            ? {
                                backgroundColor: "#07A28830",
                                color: "#07A288",
                                border: "1px solid #07A28860",
                              }
                            : {}
                        }
                      >
                        <Layers className="h-3 w-3 mr-1" />
                        Tree
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Hierarchical layout (3)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={layout === "cluster" ? "default" : "ghost"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => onLayoutChange("cluster")}
                        disabled={layoutAnimating || isComputingLayout}
                        data-testid="layout-cluster-btn"
                        style={
                          layout === "cluster"
                            ? {
                                backgroundColor: "#07A28830",
                                color: "#07A288",
                                border: "1px solid #07A28860",
                              }
                            : {}
                        }
                      >
                        <Grid3X3 className="h-3 w-3 mr-1" />
                        Cluster
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Semantic cluster layout (4/C)</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </>
          )}

          {/* Stats bar + toggle */}
          <div className="px-3 py-2 flex items-center justify-between bg-[#111A21]/50">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#07A288]" />
                <span className="text-[10px] text-gray-400">
                  {entityCount} entities
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#5BBE4E]" />
                <span className="text-[10px] text-gray-400">
                  {relationshipCount} relations
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Zoom / view controls (right side) */}
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] hover:border-[#07A288]/50 hover:bg-[#111A21]"
                onClick={onZoomIn}
              >
                <ZoomIn className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Zoom in (+)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] hover:border-[#07A288]/50 hover:bg-[#111A21]"
                onClick={onZoomOut}
              >
                <ZoomOut className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Zoom out (-)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] hover:border-[#07A288]/50 hover:bg-[#111A21]"
                onClick={onFitView}
              >
                <Maximize2 className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Fit to view (F)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] hover:border-[#07A288]/50 hover:bg-[#111A21]"
                onClick={onReset}
              >
                <RotateCcw className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Reset view</TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="h-px w-full bg-[#243645] my-0.5" />

          {/* Query button */}
          {onToggleQueryPanel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] hover:border-[#07A288]/50 hover:bg-[#111A21]"
                  onClick={onToggleQueryPanel}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Query graph</TooltipContent>
            </Tooltip>
          )}

          {/* Help / tour replay button */}
          {onReplayTour && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid="replay-tour-btn"
                  className="h-8 w-8 bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] hover:border-[#07A288]/50 hover:bg-[#111A21]"
                  onClick={onReplayTour}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Replay tour (?)</TooltipContent>
            </Tooltip>
          )}

          {/* Export menu */}
          {entities && relationships && knowledgeBaseId && (
            <GraphExportMenu
              entities={entities}
              relationships={relationships}
              knowledgeBaseId={knowledgeBaseId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
