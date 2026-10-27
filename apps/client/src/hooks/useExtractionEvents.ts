/**
 * useExtractionEvents — Subscribe to real-time knowledge graph extraction events.
 *
 * Filters the global WebSocket stream by knowledgeBaseId and exposes:
 *  - events: append-only list of all events received (ordered)
 *  - latestEvent: the most recent event (or null)
 *  - isConnected: whether the underlying WebSocket is open
 *  - reset(): clear local event list (for re-runs)
 *
 * On mount, it also calls the /events/replay endpoint to fetch any events
 * that occurred before this hook subscribed (e.g., page refresh mid-extraction).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { kgWsClient, type ExtractionEventPayload, type WsMessage } from "@/lib/wsClient";
import { apiRequest } from "@/lib/queryClient";

interface UseExtractionEventsOptions {
  /** Knowledge base ID to filter events for. If null, no events are returned. */
  knowledgeBaseId: string | null | undefined;
  /** Whether to replay buffered events on mount. Default: true. */
  replayOnMount?: boolean;
  /** Whether the hook is active. Set to false to pause receiving events. Default: true. */
  enabled?: boolean;
}

interface UseExtractionEventsResult {
  events: ExtractionEventPayload[];
  latestEvent: ExtractionEventPayload | null;
  isConnected: boolean;
  reset: () => void;
}

export function useExtractionEvents({
  knowledgeBaseId,
  replayOnMount = true,
  enabled = true,
}: UseExtractionEventsOptions): UseExtractionEventsResult {
  const [events, setEvents] = useState<ExtractionEventPayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const replayDoneRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setEvents([]);
    seenIdsRef.current = new Set();
    replayDoneRef.current = null;
  }, []);

  // Fetch buffered events on mount (or when KB ID changes)
  useEffect(() => {
    if (!enabled || !knowledgeBaseId || !replayOnMount) return;
    if (replayDoneRef.current === knowledgeBaseId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/knowledge-graph/${knowledgeBaseId}/events/replay`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const buffered: ExtractionEventPayload[] = Array.isArray(data.events)
          ? data.events
          : [];

        if (cancelled) return;

        // Filter for the requested KB and dedupe
        const filtered = buffered.filter(
          (e) => e.knowledgeBaseId === knowledgeBaseId,
        );
        const dedupedNew: ExtractionEventPayload[] = [];
        for (const ev of filtered) {
          const key = ev.id || `${ev.timestamp}-${ev.eventType}-${ev.entityName ?? ""}`;
          if (!seenIdsRef.current.has(key)) {
            seenIdsRef.current.add(key);
            dedupedNew.push(ev);
          }
        }

        if (dedupedNew.length > 0) {
          setEvents((prev) => [...prev, ...dedupedNew]);
        }
        replayDoneRef.current = knowledgeBaseId;
      } catch {
        // Replay endpoint may not exist on older deployments — ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [knowledgeBaseId, enabled, replayOnMount]);

  // Subscribe to live events
  useEffect(() => {
    if (!enabled || !knowledgeBaseId) {
      setIsConnected(false);
      return;
    }

    const handleMessage = (msg: WsMessage) => {
      if (msg.type === "kg_ws_connected") {
        setIsConnected(true);
        return;
      }
      if (msg.type !== "kg_extraction_event") return;
      const ev = msg.payload;
      if (ev.knowledgeBaseId !== knowledgeBaseId) return;

      const key = ev.id || `${ev.timestamp}-${ev.eventType}-${ev.entityName ?? ""}`;
      if (seenIdsRef.current.has(key)) return;
      seenIdsRef.current.add(key);

      setEvents((prev) => [...prev, ev]);
    };

    const unsub = kgWsClient.subscribe(handleMessage);
    setIsConnected(kgWsClient.isConnected());

    // Periodically check connection state (cheap)
    const interval = setInterval(() => {
      setIsConnected(kgWsClient.isConnected());
    }, 2000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [knowledgeBaseId, enabled]);

  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  return { events, latestEvent, isConnected, reset };
}
