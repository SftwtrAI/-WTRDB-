import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GitCompare,
  Download,
  Copy,
  FileText,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Keyframe event type for timeline markers */
export type KeyframeType =
  | "upload"
  | "agent"
  | "deprecation"
  | "schema"
  | "federation"
  | "conflict";

/** A single keyframe marker on the timeline */
export interface TimelineKeyframe {
  /** Unique identifier */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type (determines color and dot size) */
  type: KeyframeType;
  /** Short summary for the tooltip */
  summary: string;
}

/** Diff mode comparison stats */
export interface DiffStats {
  addedEntities: number;
  addedEdges: number;
  removedEntities: number;
  removedEdges: number;
  unchangedEntities: number;
  unchangedEdges: number;
}

export interface TemporalRewindProps {
  /** Start date of the timeline (oldest event) */
  startDate: string;
  /** End date of the timeline (most recent state) */
  endDate: string;
  /** Currently selected timestamp (ISO 8601) */
  currentTimestamp?: string;
  /** Keyframe markers */
  keyframes: TimelineKeyframe[];
  /** Callback when the user scrubs to a new timestamp */
  onTimestampChange?: (timestamp: string) => void;
  /** Whether diff mode is active */
  isDiffMode?: boolean;
  /** Second timestamp for diff mode */
  diffTimestamp?: string;
  /** Callback to toggle diff mode */
  onDiffModeChange?: (active: boolean) => void;
  /** Callback when the diff second thumb moves */
  onDiffTimestampChange?: (timestamp: string) => void;
  /** Diff stats (provided by the parent graph component) */
  diffStats?: DiffStats;
  /** Callback for export */
  onExport?: (type: "point_in_time" | "diff", format: "markdown" | "clipboard") => void;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const KEYFRAME_COLORS: Record<KeyframeType, string> = {
  upload: "#07A288",
  agent: "#8B5CF6",
  deprecation: "#8FA2B5",
  schema: "#B8E52B",
  federation: "#5BBE4E",
  conflict: "#E63946",
};

const KEYFRAME_SIZES: Record<KeyframeType, number> = {
  upload: 6,
  agent: 6,
  deprecation: 4,
  schema: 4,
  federation: 8,
  conflict: 4,
};

const KEYFRAME_LABELS: Record<KeyframeType, string> = {
  upload: "Document Upload",
  agent: "Agent Learning",
  deprecation: "Deprecation",
  schema: "Schema Change",
  federation: "Federation Materialization",
  conflict: "Conflict Resolution",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Convert a timestamp to a 0-1 position on the timeline */
function timestampToPosition(timestamp: string, start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const currentMs = new Date(timestamp).getTime();
  if (endMs === startMs) return 0.5;
  return Math.max(0, Math.min(1, (currentMs - startMs) / (endMs - startMs)));
}

/** Convert a 0-1 position back to a timestamp */
function positionToTimestamp(position: number, start: string, end: string): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const ms = startMs + position * (endMs - startMs);
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_KEYFRAMES: TimelineKeyframe[] = [
  { id: "kf_001", timestamp: "2026-02-01T10:00:00Z", type: "upload", summary: "Initial document upload: IT Infrastructure Guide v2.3" },
  { id: "kf_002", timestamp: "2026-02-10T14:30:00Z", type: "upload", summary: "Document upload: Security Handbook 2026" },
  { id: "kf_003", timestamp: "2026-02-15T09:00:00Z", type: "schema", summary: "Schema proposal accepted: 3 new entity types, 5 relationship types" },
  { id: "kf_004", timestamp: "2026-02-20T16:00:00Z", type: "agent", summary: 'CLAW agent "InfraBot" wrote 8 observations' },
  { id: "kf_005", timestamp: "2026-03-01T11:00:00Z", type: "federation", summary: "Federation materialized: IT Infrastructure Federation (3 sources)" },
  { id: "kf_006", timestamp: "2026-03-05T08:30:00Z", type: "conflict", summary: "Conflict resolved: os_version property discrepancy" },
  { id: "kf_007", timestamp: "2026-03-10T14:00:00Z", type: "agent", summary: 'CLAW agent "AdminSync" updated 12 entities' },
  { id: "kf_008", timestamp: "2026-03-15T10:00:00Z", type: "deprecation", summary: "3 relationships soft-deprecated (server migration)" },
  { id: "kf_009", timestamp: "2026-03-20T09:00:00Z", type: "upload", summary: "Document upload: Quarterly Audit Report Q1 2026" },
  { id: "kf_010", timestamp: "2026-03-28T15:00:00Z", type: "schema", summary: "Schema proposal: canonicalize 'deployed_to' to 'RUNS_ON'" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single keyframe dot on the timeline */
function KeyframeDot({
  keyframe,
  position,
}: {
  keyframe: TimelineKeyframe;
  position: number;
}) {
  const color = KEYFRAME_COLORS[keyframe.type];
  const size = KEYFRAME_SIZES[keyframe.type];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full cursor-pointer hover:scale-150 transition-transform z-10"
          style={{
            left: `${position * 100}%`,
            width: size,
            height: size,
            backgroundColor: color,
            marginLeft: -(size / 2),
            boxShadow: `0 0 4px ${color}60`,
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs font-medium">{KEYFRAME_LABELS[keyframe.type]}</span>
          </div>
          <p className="text-xs text-muted-foreground">{keyframe.summary}</p>
          <p className="text-[10px] text-muted-foreground">{formatTimestamp(keyframe.timestamp)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Export dialog */
function ExportDialog({
  open,
  onOpenChange,
  isDiffMode,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDiffMode: boolean;
  onExport?: (type: "point_in_time" | "diff", format: "markdown" | "clipboard") => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleExport = (type: "point_in_time" | "diff", format: "markdown" | "clipboard") => {
    onExport?.(type, format);
    if (format === "clipboard") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    if (format === "markdown") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Export Temporal Report</DialogTitle>
          <DialogDescription>
            Generate a compliance report for the current graph state.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Point-in-time report */}
          <div className="rounded-lg border border-border p-4 space-y-2">
            <h4 className="text-sm font-medium text-foreground">Point-in-Time Report</h4>
            <p className="text-xs text-muted-foreground">
              All entities, relationships, and their statuses at the selected timestamp.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => handleExport("point_in_time", "markdown")}
              >
                <Download className="h-3.5 w-3.5" />
                Download .md
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => handleExport("point_in_time", "clipboard")}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Diff report (only in diff mode) */}
          {isDiffMode && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <h4 className="text-sm font-medium text-foreground">Diff Report</h4>
              <p className="text-xs text-muted-foreground">
                All changes between the two pinned timestamps.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleExport("diff", "markdown")}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download .md
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleExport("diff", "clipboard")}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Temporal Rewind scrubber for the bottom of graph visualizers.
 *
 * Renders a full-width horizontal timeline bar (40px height) with:
 * - A draggable thumb for scrubbing through time
 * - Colored keyframe markers for significant events
 * - Diff mode with a second thumb for comparing two points in time
 * - Export functionality for compliance reports
 */
export function TemporalRewind({
  startDate: propStartDate,
  endDate: propEndDate,
  currentTimestamp: propCurrentTimestamp,
  keyframes: propKeyframes,
  onTimestampChange,
  isDiffMode: propIsDiffMode = false,
  diffTimestamp: propDiffTimestamp,
  onDiffModeChange,
  onDiffTimestampChange,
  diffStats,
  onExport,
  className,
}: TemporalRewindProps) {
  // Use placeholder data when empty
  const startDate = propStartDate || "2026-02-01T00:00:00Z";
  const endDate = propEndDate || "2026-04-03T23:59:59Z";
  const keyframes = propKeyframes.length > 0 ? propKeyframes : PLACEHOLDER_KEYFRAMES;
  const currentTimestamp = propCurrentTimestamp || endDate;

  const [isDiffMode, setIsDiffMode] = useState(propIsDiffMode);
  const [exportOpen, setExportOpen] = useState(false);
  const [isDragging, setIsDragging] = useState<"primary" | "diff" | null>(null);
  const [hoveredKeyframe, setHoveredKeyframe] = useState<string | null>(null);

  // Track positions for the two thumbs
  const [primaryPosition, setPrimaryPosition] = useState(
    timestampToPosition(currentTimestamp, startDate, endDate),
  );
  const [diffPosition, setDiffPosition] = useState(
    propDiffTimestamp
      ? timestampToPosition(propDiffTimestamp, startDate, endDate)
      : 0.3,
  );

  const trackRef = useRef<HTMLDivElement>(null);

  // Sync with external props
  useEffect(() => {
    if (propCurrentTimestamp) {
      setPrimaryPosition(timestampToPosition(propCurrentTimestamp, startDate, endDate));
    }
  }, [propCurrentTimestamp, startDate, endDate]);

  useEffect(() => {
    setIsDiffMode(propIsDiffMode);
  }, [propIsDiffMode]);

  // Calculate position from mouse event
  const getPositionFromEvent = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      return Math.max(0, Math.min(1, x / rect.width));
    },
    [],
  );

  // Mouse event handlers for dragging
  const handleMouseDown = useCallback(
    (thumb: "primary" | "diff") => (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(thumb);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const pos = getPositionFromEvent(e.clientX);
      if (isDragging === "primary") {
        setPrimaryPosition(pos);
        const ts = positionToTimestamp(pos, startDate, endDate);
        onTimestampChange?.(ts);
      } else if (isDragging === "diff") {
        setDiffPosition(pos);
        const ts = positionToTimestamp(pos, startDate, endDate);
        onDiffTimestampChange?.(ts);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, startDate, endDate, getPositionFromEvent, onTimestampChange, onDiffTimestampChange]);

  // Click on track to jump thumb
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;
      const pos = getPositionFromEvent(e.clientX);
      setPrimaryPosition(pos);
      const ts = positionToTimestamp(pos, startDate, endDate);
      onTimestampChange?.(ts);
    },
    [isDragging, getPositionFromEvent, startDate, endDate, onTimestampChange],
  );

  // Toggle diff mode
  const handleDiffToggle = useCallback(() => {
    const next = !isDiffMode;
    setIsDiffMode(next);
    onDiffModeChange?.(next);
    if (next && diffPosition === primaryPosition) {
      // Place diff thumb at 30% by default
      setDiffPosition(Math.max(0, primaryPosition - 0.3));
    }
  }, [isDiffMode, onDiffModeChange, diffPosition, primaryPosition]);

  // Compute the fill region
  const fillLeft = isDiffMode ? Math.min(primaryPosition, diffPosition) : 0;
  const fillRight = isDiffMode ? Math.max(primaryPosition, diffPosition) : primaryPosition;

  // Compute keyframe positions
  const keyframePositions = useMemo(
    () =>
      keyframes.map((kf) => ({
        ...kf,
        position: timestampToPosition(kf.timestamp, startDate, endDate),
      })),
    [keyframes, startDate, endDate],
  );

  return (
    <div
      className={cn(
        "w-full h-10 flex items-center gap-3 px-4 bg-[#0B1014]/90 backdrop-blur-sm border-t border-[#243645]",
        className,
      )}
      data-testid="temporal-rewind"
    >
      {/* Start date label */}
      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 w-[70px]">
        {formatDate(startDate)}
      </span>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative flex-1 h-full flex items-center cursor-pointer"
        onClick={handleTrackClick}
      >
        {/* Background track */}
        <div className="absolute left-0 right-0 h-[2px] bg-[#243645] rounded-full" />

        {/* Filled portion */}
        <div
          className="absolute h-[2px] rounded-full"
          style={{
            left: `${fillLeft * 100}%`,
            width: `${(fillRight - fillLeft) * 100}%`,
            background: isDiffMode
              ? "linear-gradient(90deg, #3B82F6, #8B5CF6)"
              : "linear-gradient(90deg, #07A288 0%, #5BBE4E 45%, #B8E52B 100%)",
          }}
        />

        {/* Keyframe markers */}
        {keyframePositions.map((kf) => (
          <KeyframeDot key={kf.id} keyframe={kf} position={kf.position} />
        ))}

        {/* Diff thumb */}
        {isDiffMode && (
          <div
            className="absolute top-1/2 -translate-y-1/2 z-20"
            style={{ left: `${diffPosition * 100}%`, marginLeft: -8 }}
            onMouseDown={handleMouseDown("diff")}
          >
            <div
              className={cn(
                "w-4 h-4 rounded-full border-2 cursor-grab active:cursor-grabbing transition-shadow",
                isDragging === "diff" && "shadow-[0_0_8px_rgba(139,92,246,0.6)]",
              )}
              style={{
                backgroundColor: "#E7EEF6",
                borderColor: "#8B5CF6",
              }}
            />
          </div>
        )}

        {/* Primary thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 z-20"
          style={{ left: `${primaryPosition * 100}%`, marginLeft: -8 }}
          onMouseDown={handleMouseDown("primary")}
        >
          <div
            className={cn(
              "w-4 h-4 rounded-full border-2 cursor-grab active:cursor-grabbing transition-shadow",
              isDragging === "primary" && "shadow-[0_0_8px_rgba(7,162,136,0.6)]",
            )}
            style={{
              backgroundColor: "#E7EEF6",
              borderColor: "#07A288",
            }}
          />
        </div>
      </div>

      {/* End date label */}
      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 w-[70px] text-right">
        {formatDate(endDate)}
      </span>

      {/* Diff legend (when active) */}
      {isDiffMode && diffStats && (
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          <span className="text-[#5BBE4E]">
            +{diffStats.addedEntities}e, +{diffStats.addedEdges}r
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-[#E63946]">
            -{diffStats.removedEntities}e, -{diffStats.removedEdges}r
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0",
                isDiffMode && "bg-[#8B5CF6]/20 text-[#8B5CF6] hover:bg-[#8B5CF6]/30",
              )}
              onClick={handleDiffToggle}
            >
              <GitCompare className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isDiffMode ? "Exit Compare Mode" : "Compare Two Points"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExportOpen(true)}
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Export Report</TooltipContent>
        </Tooltip>
      </div>

      {/* Export dialog */}
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        isDiffMode={isDiffMode}
        onExport={onExport}
      />
    </div>
  );
}

export { KEYFRAME_COLORS, KEYFRAME_LABELS, PLACEHOLDER_KEYFRAMES };
