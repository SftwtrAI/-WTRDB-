import { useQuery } from "@tanstack/react-query";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConcurrencyStatus {
    used: number;
    total: number;
}

export function ConcurrencyIndicator() {
    const { data } = useQuery<ConcurrencyStatus>({
        queryKey: ["/api/concurrency"],
        refetchInterval: 10_000,
    });

    if (!data) return null;

    const { used, total } = data;
    const atCapacity = used >= total;
    const hasAvailable = used < total;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
                    <span className="text-muted-foreground">Sessions:</span>
                    <div className="flex items-center gap-1">
                        {/* Dots representing slots */}
                        {Array.from({ length: Math.min(total, 10) }).map((_, i) => {
                            const isUsed = i < used;
                            return (
                                <span
                                    key={i}
                                    className={`inline-block h-2 w-2 rounded-full ${
                                        isUsed
                                            ? atCapacity
                                                ? "bg-red-500"
                                                : "bg-green-500"
                                            : "bg-muted-foreground/30"
                                    }`}
                                />
                            );
                        })}
                        {total > 10 && (
                            <span className="text-xs text-muted-foreground ml-0.5">...</span>
                        )}
                    </div>
                    <span className={`tabular-nums ${atCapacity ? "text-red-500" : hasAvailable ? "text-green-500" : "text-muted-foreground"}`}>
                        {used}/{total}
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <p>
                    {used} active session{used !== 1 ? "s" : ""} of {total} total.
                    {atCapacity
                        ? " At capacity - new sessions will queue."
                        : ` ${total - used} slot${total - used !== 1 ? "s" : ""} available.`}
                </p>
            </TooltipContent>
        </Tooltip>
    );
}
