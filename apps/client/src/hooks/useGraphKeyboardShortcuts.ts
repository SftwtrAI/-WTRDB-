import { useEffect } from "react";

export function useGraphKeyboardShortcuts(handlers: {
  onSearch: () => void;
  onEscape: () => void;
  onLayoutForce: () => void;
  onLayoutRadial: () => void;
  onLayoutHierarchical: () => void;
  onLayoutCluster?: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHideSelected?: () => void;
  onToggleQuery?: () => void;
  onSearchArrowUp?: () => void;
  onSearchArrowDown?: () => void;
  isSearchActive?: boolean;
  isContextMenuOpen?: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // When search input is focused, allow arrow keys for result cycling
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        if (handlers.isSearchActive) {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            handlers.onSearchArrowUp?.();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            handlers.onSearchArrowDown?.();
            return;
          }
        }
        // Still allow Escape to work from input fields
        if (e.key === "Escape") {
          handlers.onEscape();
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        handlers.onSearch();
      }
      if (e.key === "Escape") {
        handlers.onEscape();
      }
      if (e.key === "1") handlers.onLayoutForce();
      if (e.key === "2") handlers.onLayoutRadial();
      if (e.key === "3") handlers.onLayoutHierarchical();
      if (e.key === "4" || e.key === "c" || e.key === "C") {
        handlers.onLayoutCluster?.();
      }
      if (e.key === "f" || e.key === "F") handlers.onFitView();
      if (e.key === "+" || e.key === "=") handlers.onZoomIn();
      if (e.key === "-") handlers.onZoomOut();
      if (e.key === "h" || e.key === "H") {
        handlers.onHideSelected?.();
      }
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        handlers.onToggleQuery?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}
