/**
 * Singleton WebSocket client for knowledge graph extraction events.
 *
 * One connection per browser tab, shared across all hooks/components that
 * need real-time extraction events. Auto-reconnects with exponential backoff.
 *
 * Wire format from the server:
 *   { type: "kg_extraction_event", payload: ExtractionEvent }
 *   { type: "kg_ws_connected", payload: { connectionId, userId } }
 *   { type: "error", payload: { message } }
 */

import { AuthStorage } from "./auth-storage";

export interface ExtractionEventPayload {
  id?: string;
  knowledgeBaseId: string;
  userId: string;
  eventType:
    | "chunk_start"
    | "entity_discovered"
    | "relationship_extracted"
    | "event_detected"
    | "schema_proposal"
    | "deprecation"
    | "adjudication_result"
    | "extraction_complete"
    | "extraction_error";
  chunkIndex?: number;
  entityName?: string;
  entityLabel?: string;
  relationshipType?: string;
  sourceEntity?: string;
  targetEntity?: string;
  eventName?: string;
  eventIntent?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export type WsMessage =
  | { type: "kg_extraction_event"; payload: ExtractionEventPayload }
  | { type: "kg_ws_connected"; payload: { connectionId: string; userId: string } }
  | { type: "error"; payload: { message: string } };

type Listener = (msg: WsMessage) => void;

class KgWsClient {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;
  private connecting = false;

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to incoming messages. Returns an unsubscribe function.
   * Lazily opens the connection on first subscriber.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.ws && !this.connecting) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.close();
      }
    };
  }

  private connect(): void {
    if (this.connecting) return;
    this.connecting = true;
    this.explicitlyClosed = false;

    const token = AuthStorage.getToken();
    if (!token) {
      console.warn("[KG WS] No auth token, cannot connect");
      this.connecting = false;
      return;
    }

    // Build the WS URL based on the current page protocol/host
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/kg-events?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.error("[KG WS] Failed to construct WebSocket:", err);
      this.connecting = false;
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("[KG WS] Connected");
      this.reconnectAttempts = 0;
      this.connecting = false;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        this.listeners.forEach((l) => {
          try {
            l(msg);
          } catch (err) {
            console.error("[KG WS] Listener error:", err);
          }
        });
      } catch (err) {
        console.error("[KG WS] Failed to parse message:", err);
      }
    };

    this.ws.onerror = (err) => {
      console.warn("[KG WS] Error:", err);
    };

    this.ws.onclose = () => {
      console.log("[KG WS] Closed");
      this.ws = null;
      this.connecting = false;
      if (!this.explicitlyClosed && this.listeners.size > 0) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    console.log(`[KG WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  close(): void {
    this.explicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
  }
}

export const kgWsClient = new KgWsClient();
