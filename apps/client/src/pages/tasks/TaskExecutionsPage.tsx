import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, ListChecks } from "lucide-react";
import { ExecutionStatusBadge } from "@/components/tasks/ExecutionStatusBadge";

export default function TaskExecutionsPage() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tasks/executions"],
  });

  const executions = data?.executions || [];
  const filtered = executions.filter((e: any) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (search && !e.id.includes(search) && !e.templateId.includes(search)) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="h-6 w-6" />
          Executions
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor and review all task executions
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No executions found</h3>
          <p className="text-sm mt-1">Run a template to see executions here</p>
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {filtered.map((exec: any) => (
            <div
              key={exec.id}
              className="flex items-center justify-between p-4 hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => navigate(`/app/tasks/executions/${exec.id}`)}
            >
              <div className="flex items-center gap-4">
                <ExecutionStatusBadge status={exec.status} />
                <div>
                  <div className="font-mono text-sm">{exec.id.slice(0, 12)}</div>
                  <div className="text-xs text-muted-foreground">
                    Template: {exec.templateId.slice(0, 8)} | {exec.triggeredBy}
                  </div>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{new Date(exec.createdAt).toLocaleString()}</div>
                {exec.completedAt && (
                  <div>
                    Duration: {Math.round((new Date(exec.completedAt).getTime() - new Date(exec.startedAt || exec.createdAt).getTime()) / 1000)}s
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
