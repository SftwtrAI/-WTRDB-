import { Card } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  subtitle?: string;
  testId?: string;
  gradientClassName?: string;
  iconClassName?: string;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  subtitle,
  testId,
  gradientClassName,
  iconClassName,
}: MetricCardProps) {
  return (
    <Card
      className={cn("p-6", gradientClassName)}
      data-testid={
        testId || `card-metric-${title.toLowerCase().replace(/\s+/g, "-")}`
      }
    >
      <div className="flex items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Icon className={cn("h-5 w-5 text-muted-foreground", iconClassName)} />
      </div>
      <div className="flex flex-col gap-1">
        <div
          className="text-3xl font-bold tabular-nums"
          data-testid="text-metric-value"
        >
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1 text-xs">
            {trend.direction === "up" ? (
              <TrendingUp className="h-3 w-3 text-success" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
            <span
              className={
                trend.direction === "up" ? "text-success" : "text-destructive"
              }
            >
              {trend.value}%
            </span>
            <span className="text-muted-foreground">vs last month</span>
          </div>
        )}
      </div>
    </Card>
  );
}
