import { useQuery } from "@tanstack/react-query";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Coins } from "lucide-react";

interface CreditBalance {
    balance: number;
    limit: number;
}

export function CreditDisplay() {
    const { data } = useQuery<CreditBalance>({
        queryKey: ["/api/auth/me"],
        refetchInterval: 30_000,
    });

    if (!data) return null;

    const { balance, limit } = data;
    const percentage = limit > 0 ? (balance / limit) * 100 : 0;

    let colorClass = "text-green-500";
    if (percentage <= 10) {
        colorClass = "text-red-500";
    } else if (percentage <= 20) {
        colorClass = "text-yellow-500";
    }

    const formatted = balance >= 1000
        ? `${(balance / 1000).toFixed(balance >= 10000 ? 1 : 2)}k`
        : balance.toLocaleString();

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
                    <Coins className={`h-4 w-4 ${colorClass}`} />
                    <span className="text-muted-foreground">Credits:</span>
                    <span className={`tabular-nums ${colorClass}`}>
                        {formatted} cr
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <p>
                    {balance.toLocaleString()} of {limit.toLocaleString()} credits remaining ({percentage.toFixed(1)}%).
                    {percentage <= 10
                        ? " Low balance - consider upgrading."
                        : percentage <= 20
                        ? " Balance getting low."
                        : " Balance is healthy."}
                </p>
            </TooltipContent>
        </Tooltip>
    );
}
