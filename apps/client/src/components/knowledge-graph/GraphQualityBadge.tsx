import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Star, StarHalf } from "lucide-react";

export interface GraphQualityBadgeProps {
  /** Quality score from 1 to 5 */
  score: number;
  /** Total entity count (optional, shown in tooltip) */
  entityCount?: number;
  /** Total relationship count (optional, shown in tooltip) */
  relationshipCount?: number;
  /** Number of distinct entity types (optional, shown in tooltip) */
  typeCount?: number;
  className?: string;
}

/**
 * Displays a quality badge (1-5 stars) for a knowledge graph.
 * Wrapped in a tooltip explaining the scoring methodology.
 */
export default function GraphQualityBadge({
  score,
  entityCount,
  relationshipCount,
  typeCount,
  className,
}: GraphQualityBadgeProps) {
  const clampedScore = Math.max(1, Math.min(5, score));
  const fullStars = Math.floor(clampedScore);
  const hasHalf = clampedScore - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  const qualityLabel =
    clampedScore >= 4
      ? "Excellent"
      : clampedScore >= 3
        ? "Good"
        : clampedScore >= 2
          ? "Fair"
          : "Basic";

  const qualityColor =
    clampedScore >= 4
      ? "text-[#07A288]"
      : clampedScore >= 3
        ? "text-[#5BBE4E]"
        : clampedScore >= 2
          ? "text-[#F59E0B]"
          : "text-[#EC4899]";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`cursor-default gap-1.5 border-[#243645] ${className ?? ""}`}
          data-testid="graph-quality-badge"
        >
          <span className={`text-xs font-medium ${qualityColor}`}>
            {qualityLabel}
          </span>
          <span className="flex items-center gap-px">
            {Array.from({ length: fullStars }).map((_, i) => (
              <Star
                key={`full-${i}`}
                className={`h-3 w-3 fill-current ${qualityColor}`}
              />
            ))}
            {hasHalf && (
              <StarHalf
                key="half"
                className={`h-3 w-3 fill-current ${qualityColor}`}
              />
            )}
            {Array.from({ length: emptyStars }).map((_, i) => (
              <Star
                key={`empty-${i}`}
                className="h-3 w-3 text-[#243645]"
              />
            ))}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-[260px] space-y-1 text-left"
        data-testid="graph-quality-tooltip"
      >
        <p className="text-sm">
          Graph quality is based on entity count, relationship density, and type
          diversity.
        </p>

        {/* Contextual stats */}
        {(entityCount !== undefined ||
          relationshipCount !== undefined ||
          typeCount !== undefined) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {entityCount !== undefined && (
              <span>{entityCount} entities</span>
            )}
            {relationshipCount !== undefined && (
              <span>{relationshipCount} relationships</span>
            )}
            {typeCount !== undefined && <span>{typeCount} types</span>}
          </div>
        )}

        {/* Conditional tip */}
        {clampedScore < 3 && (
          <p className="text-xs text-[#F59E0B]">
            Tip: Longer, more detailed documents produce richer graphs.
          </p>
        )}
        {clampedScore >= 4 && (
          <p className="text-xs text-[#07A288]">
            Excellent graph richness.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
