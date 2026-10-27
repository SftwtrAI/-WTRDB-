import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Square, Copy, Download, Clock, Eye, Code } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ExecutionStatusBadge } from "@/components/tasks/ExecutionStatusBadge";
import { ExecutionStream } from "@/components/tasks/ExecutionStream";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function TaskExecutionDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [elapsed, setElapsed] = useState(0);
  const [showRaw, setShowRaw] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/tasks/executions/${params.id}`],
    refetchInterval: (query) => {
      const status = query.state.data?.execution?.status;
      return ["queued", "starting", "running"].includes(status) ? 3000 : false;
    },
  });

  const execution = data?.execution;
  const isLive = ["queued", "starting", "running", "completing"].includes(execution?.status);

  // Elapsed time counter
  useEffect(() => {
    if (!execution?.startedAt || !isLive) return;
    const start = new Date(execution.startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [execution?.startedAt, isLive]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tasks/executions/${params.id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/executions/${params.id}`] });
    },
  });

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!execution) {
    return <div className="p-6 text-center text-muted-foreground">Execution not found</div>;
  }

  const duration = execution.completedAt && execution.startedAt
    ? Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)
    : elapsed;

  return (
    <div className="p-6 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app/tasks/executions")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">Execution {execution.id.slice(0, 8)}</h1>
            <ExecutionStatusBadge status={execution.status} />
            {duration > 0 && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isLive && (
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              <Square className="h-4 w-4 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Main content — split view */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Left: Event Stream */}
        <Card className="flex flex-col min-h-0">
          <CardContent className="flex-1 p-0 min-h-0">
            <ExecutionStream executionId={params.id!} isLive={isLive} />
          </CardContent>
        </Card>

        {/* Right: Output */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-2 flex-none">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Output</CardTitle>
              {execution.rawOutput && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRaw((v) => !v)}
                    title={showRaw ? "Show rendered" : "Show raw markdown"}
                  >
                    {showRaw ? <Eye className="h-4 w-4" /> : <Code className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(execution.rawOutput)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const blob = new Blob([execution.rawOutput], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `execution-${execution.id.slice(0, 8)}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0">
            {execution.rawOutput ? (
              showRaw ? (
                <pre className="text-sm whitespace-pre-wrap font-mono">{execution.rawOutput}</pre>
              ) : (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {execution.rawOutput}
                  </ReactMarkdown>
                </div>
              )
            ) : execution.status === "failed" ? (
              <div className="text-red-400 text-sm">
                <p className="font-medium">Error:</p>
                <p>{execution.errorMessage || "Unknown error"}</p>
              </div>
            ) : isLive ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Output will appear here as the task runs...
              </div>
            ) : (
              <div className="text-muted-foreground text-sm text-center py-8">
                No output available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer: Metadata */}
      <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground border-t pt-3">
        <span>Triggered by: {execution.triggeredBy}</span>
        <span>Created: {new Date(execution.createdAt).toLocaleString()}</span>
        {execution.metadata && (
          <>
            {(execution.metadata as any).provider && <span>Provider: {(execution.metadata as any).provider}</span>}
            {(execution.metadata as any).model && <span>Model: {(execution.metadata as any).model}</span>}
          </>
        )}
      </div>
    </div>
  );
}
