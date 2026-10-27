import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTooltipProps {
  content: string;
  className?: string;
}

export function InfoTooltip({ content, className }: InfoTooltipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center ml-1.5 text-muted-foreground hover:text-primary transition-colors rounded-full hover:bg-primary/10 p-0.5 ${className || ""}`}
          data-testid="button-info-tooltip"
          aria-label="More information"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={8}
        className="max-w-[280px] z-[100] bg-popover text-popover-foreground border shadow-lg"
        avoidCollisions={true}
        collisionPadding={16}
      >
        <p className="text-sm leading-relaxed break-words whitespace-normal">
          {content}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
