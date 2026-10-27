import { useEffect, useRef, useState } from "react";
import { ExecutionEventItem } from "./ExecutionEventItem";
import { Loader2 } from "lucide-react";
import { AuthStorage } from "@/lib/auth-storage";

interface ExecutionStreamProps {
  executionId: string;
  isLive: boolean;
}

export function ExecutionStream({ executionId, isLive }: ExecutionStreamProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const headers: Record<string, string> = {};
    const authHeader = AuthStorage.getAuthHeader();
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    if (!isLive) {
      // Fetch events via REST for completed executions
      fetch(`/api/tasks/executions/${executionId}/events`, {
        credentials: "include",
        headers,
      })
        .then((r) => r.json())
        .then((data) => setEvents(data.events || []))
        .catch(console.error);
      return;
    }

    // Live SSE — EventSource doesn't support custom headers,
    // so pass the token as a query param
    const token = AuthStorage.getToken() || "";
    const streamUrl = token
      ? `/api/tasks/executions/${executionId}/stream?token=${encodeURIComponent(token)}`
      : `/api/tasks/executions/${executionId}/stream`;

    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;
    setConnected(true);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.eventType === "stream_end") {
          es.close();
          setConnected(false);
          return;
        }
        setEvents((prev) => [...prev, event]);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [executionId, isLive]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">Execution Log</span>
        {connected && (
          <div className="flex items-center gap-1 text-xs text-green-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Live
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {isLive ? "Waiting for events..." : "No events recorded"}
          </div>
        ) : (
          events.map((event, i) => (
            <ExecutionEventItem key={event.id || i} event={event} />
          ))
        )}
      </div>
    </div>
  );
}
