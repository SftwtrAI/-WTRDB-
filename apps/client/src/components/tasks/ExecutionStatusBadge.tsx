import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Queued", variant: "secondary" },
  starting: { label: "Starting", variant: "outline" },
  running: { label: "Running", variant: "default" },
  completing: { label: "Completing", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function ExecutionStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, variant: "outline" as const };

  return (
    <Badge variant={config.variant} className={
      status === "running" ? "animate-pulse bg-green-600" :
      status === "completed" ? "bg-green-700" :
      ""
    }>
      {status === "running" && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-white" />}
      {config.label}
    </Badge>
  );
}
