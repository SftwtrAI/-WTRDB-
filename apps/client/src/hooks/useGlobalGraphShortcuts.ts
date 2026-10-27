import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

interface GlobalGraphShortcutHandlers {
  /** Toggle Temporal Rewind scrubber (graph pages only) */
  onToggleTemporalRewind?: () => void;
  /** Toggle Ghost Graph overlay (graph pages only) */
  onToggleGhostGraph?: () => void;
  /** Open Provenance Thread for selected entity (graph pages only) */
  onOpenProvenance?: () => void;
  /** Whether an entity is currently selected (enables 'p' shortcut) */
  hasEntitySelected?: boolean;
}

/**
 * Global keyboard shortcuts for the Knowledge Graph system.
 *
 * Sequence shortcuts (work on any page):
 *   g → c : Navigate to Constellation
 *   g → p : Navigate to Graph Pulse
 *   g → m : Navigate to Merge Playground
 *   g → e : Navigate to Eval Harness
 *   g → b : Navigate to Brain Relay
 *   g → l : Navigate to Cartographer
 *
 * Graph visualizer shortcuts (only active when on a graph page):
 *   t : Toggle Temporal Rewind scrubber
 *   g : Toggle Ghost Graph overlay (only when not in sequence mode)
 *   p : Open Provenance Thread (when entity selected)
 */
export function useGlobalGraphShortcuts(handlers?: GlobalGraphShortcutHandlers) {
  const [location, setLocation] = useLocation();
  const pendingPrefix = useRef<string | null>(null);
  const prefixTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine if we're on a graph visualizer page
  const isGraphPage =
    location.startsWith("/app/knowledge-graph/") ||
    location.startsWith("/app/knowledge-graph-3d/") ||
    location.startsWith("/app/constellation") ||
    location.startsWith("/app/federations/");

  const clearPrefix = useCallback(() => {
    pendingPrefix.current = null;
    if (prefixTimeout.current) {
      clearTimeout(prefixTimeout.current);
      prefixTimeout.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs/textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      // Ignore if any modifier key is held (Ctrl, Alt, Meta)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Handle second key in g-sequence
      if (pendingPrefix.current === "g") {
        clearPrefix();

        switch (e.key) {
          case "c":
            e.preventDefault();
            setLocation("/app/constellation");
            return;
          case "p":
            e.preventDefault();
            setLocation("/app/graph-pulse");
            return;
          case "m":
            e.preventDefault();
            setLocation("/app/merge-playground");
            return;
          case "e":
            e.preventDefault();
            setLocation("/app/eval-harness");
            return;
          case "b":
            e.preventDefault();
            setLocation("/app/brain-endpoints");
            return;
          case "l":
            e.preventDefault();
            setLocation("/app/cartographer");
            return;
          default:
            // Unknown second key; fall through
            break;
        }
      }

      // Handle first key presses
      if (e.key === "g") {
        // On graph pages, 'g' without a follow-up toggles ghost graph.
        // We need to wait briefly to see if a second key follows (sequence shortcut).
        pendingPrefix.current = "g";
        prefixTimeout.current = setTimeout(() => {
          // No second key arrived within the timeout window.
          // If on a graph page, treat as ghost graph toggle.
          if (isGraphPage && handlers?.onToggleGhostGraph) {
            handlers.onToggleGhostGraph();
          }
          pendingPrefix.current = null;
        }, 500);
        return;
      }

      // Graph-page-only shortcuts (single key, no prefix)
      if (isGraphPage) {
        if (e.key === "t") {
          e.preventDefault();
          handlers?.onToggleTemporalRewind?.();
          return;
        }

        if (e.key === "p" && handlers?.hasEntitySelected) {
          e.preventDefault();
          handlers?.onOpenProvenance?.();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearPrefix();
    };
  }, [location, isGraphPage, handlers, setLocation, clearPrefix]);
}
