import { Brain, Wrench, AlertCircle, FileOutput, ArrowRight, Users } from "lucide-react";

interface ExecutionEventItemProps {
  event: {
    id: string;
    eventType: string;
    data: any;
    timestamp: string;
  };
}

const eventIcons: Record<string, React.ReactNode> = {
  thought: <Brain className="h-4 w-4 text-purple-400" />,
  tool_call: <Wrench className="h-4 w-4 text-blue-400" />,
  tool_result: <Wrench className="h-4 w-4 text-green-400" />,
  output_chunk: <FileOutput className="h-4 w-4 text-emerald-400" />,
  error: <AlertCircle className="h-4 w-4 text-red-400" />,
  status_change: <ArrowRight className="h-4 w-4 text-yellow-400" />,
  sub_agent_spawn: <Users className="h-4 w-4 text-indigo-400" />,
  sub_agent_result: <Users className="h-4 w-4 text-indigo-400" />,
};

export function ExecutionEventItem({ event }: ExecutionEventItemProps) {
  const icon = eventIcons[event.eventType] || <ArrowRight className="h-4 w-4 text-muted-foreground" />;
  const time = new Date(event.timestamp).toLocaleTimeString();

  const renderContent = () => {
    const data = event.data || {};

    switch (event.eventType) {
      case "status_change":
        return (
          <span className="text-yellow-300">
            Status: {data.from || "init"} → {data.to}
          </span>
        );

      case "thought":
        return <span className="text-purple-300 italic">{data.content || data.text || JSON.stringify(data)}</span>;

      case "tool_call":
        return (
          <span>
            <span className="text-blue-300 font-medium">{data.name || data.tool || "Tool"}</span>
            {data.input && <span className="text-muted-foreground ml-1">({typeof data.input === "string" ? data.input : "..."})</span>}
          </span>
        );

      case "tool_result":
        return (
          <span className="text-green-300">
            Result: {typeof data.result === "string" ? data.result.slice(0, 100) : JSON.stringify(data).slice(0, 100)}
            {(data.result?.length || 0) > 100 && "..."}
          </span>
        );

      case "output_chunk":
        return <span>{data.text || data.content || ""}</span>;

      case "error":
        return <span className="text-red-400">{data.message || JSON.stringify(data)}</span>;

      default:
        return <span className="text-muted-foreground">{JSON.stringify(data).slice(0, 150)}</span>;
    }
  };

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-accent/30 text-sm">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="break-words">{renderContent()}</span>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{time}</span>
    </div>
  );
}
