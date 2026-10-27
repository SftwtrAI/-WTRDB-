import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Freshness score between 0 and 1 */
type FreshnessScore = number;

export interface FreshnessBadgeProps {
  /** Freshness score from 0 (stale) to 1 (fresh) */
  score: FreshnessScore;
  /** Number of entities below the freshness threshold (optional, for tooltip) */
  entitiesBelowThreshold?: number;
  /** Additional CSS classes */
  className?: string;
}

export interface FreshnessBarProps {
  /** Freshness score from 0 (stale) to 1 (fresh) */
  score: FreshnessScore;
  /** Whether to show the percentage label */
  showLabel?: boolean;
  /** Bar height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

export interface FreshnessAlertProps {
  /** Freshness score from 0 (stale) to 1 (fresh) */
  score: FreshnessScore;
  /** Callback fired when the Refresh button is clicked */
  onRefresh?: () => void;
  /** Whether a refresh operation is in progress */
  isRefreshing?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the CSS color class based on freshness thresholds.
 * - Green (primary) when score > 0.7
 * - Amber when score 0.4 - 0.7
 * - Red (destructive) when score < 0.4
 */
function freshnessColorClass(score: FreshnessScore): string {
  if (score > 0.7) return "text-primary";
  if (score >= 0.4) return "text-amber-500";
  return "text-destructive";
}

/**
 * Returns the hex color for the freshness indicator circle.
 */
function freshnessHex(score: FreshnessScore): string {
  if (score > 0.7) return "#07A288";
  if (score >= 0.4) return "#D4A017";
  return "#E63946";
}

/**
 * Returns a background color class for the freshness bar fill.
 */
function freshnessBgClass(score: FreshnessScore): string {
  if (score > 0.7) return "bg-primary";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-destructive";
}

/**
 * Returns a human-readable label for the freshness tier.
 */
function freshnessLabel(score: FreshnessScore): string {
  if (score > 0.7) return "Fresh";
  if (score >= 0.4) return "Aging";
  return "Stale";
}

// ---------------------------------------------------------------------------
// FreshnessBadge
// ---------------------------------------------------------------------------

/**
 * A 12px circular indicator showing the freshness state of a knowledge graph.
 * Green when score > 0.7, amber when 0.4-0.7, red when < 0.4.
 * Includes a tooltip with the exact score.
 */
export function FreshnessBadge({
  score,
  entitiesBelowThreshold,
  className,
}: FreshnessBadgeProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const color = freshnessHex(clamped);
  const label = freshnessLabel(clamped);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-block w-3 h-3 rounded-full shrink-0 cursor-default",
            className,
          )}
          style={{ backgroundColor: color }}
          data-testid="freshness-badge"
          aria-label={`Freshness: ${label}`}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px] text-left">
        <p className="text-sm">
          <span className="font-medium">Graph Freshness:</span>{" "}
          <span className={freshnessColorClass(clamped)}>
            {clamped.toFixed(2)}
          </span>
        </p>
        {entitiesBelowThreshold !== undefined && entitiesBelowThreshold > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {entitiesBelowThreshold} entit{entitiesBelowThreshold === 1 ? "y" : "ies"} below freshness threshold.
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          Status: {label}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// FreshnessBar
// ---------------------------------------------------------------------------

/**
 * Horizontal progress bar whose fill color reflects the freshness tier.
 * The gradient transitions from red (stale) through amber to green (fresh).
 */
export function FreshnessBar({
  score,
  showLabel = true,
  height = 6,
  className,
}: FreshnessBarProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const pct = Math.round(clamped * 100);

  return (
    <div className={cn("w-full", className)} data-testid="freshness-bar">
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Freshness</span>
          <span className={cn("text-xs font-semibold", freshnessColorClass(clamped))}>
            {pct}%
          </span>
        </div>
      )}
      <div
        className="w-full rounded-full bg-[#243645] overflow-hidden"
        style={{ height }}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            freshnessBgClass(clamped),
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FreshnessAlert
// ---------------------------------------------------------------------------

/**
 * Amber warning banner displayed when a knowledge graph's freshness score
 * drops below 0.4. Includes a Refresh button to trigger re-processing.
 *
 * Renders nothing when the score is at or above 0.4.
 */
export function FreshnessAlert({
  score,
  onRefresh,
  isRefreshing = false,
  className,
}: FreshnessAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const clamped = Math.max(0, Math.min(1, score));

  // Only show the alert when freshness is below 0.4
  if (clamped >= 0.4 || dismissed) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3",
        className,
      )}
      role="alert"
      data-testid="freshness-alert"
    >
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-200">
          Some knowledge in this graph may be outdated. Consider re-processing recent documents.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-amber-500/60 hover:text-amber-400 hover:bg-transparent"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility exports for other components
// ---------------------------------------------------------------------------

export {
  freshnessColorClass,
  freshnessHex,
  freshnessBgClass,
  freshnessLabel,
};
