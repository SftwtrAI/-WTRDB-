/**
 * GraphNodeContextMenu -- Right-click context menu for graph nodes.
 *
 * Rendered as a fixed-position overlay. Closed on click-outside or Escape.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  Focus,
  Expand,
  EyeOff,
  ExternalLink,
  Copy,
} from "lucide-react";

export interface ContextMenuPosition {
  x: number;
  y: number;
  nodeId: string;
  nodeName: string;
}

interface GraphNodeContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  onFocus?: (id: string) => void;
  onExpand?: (id: string) => void;
  onHide?: (id: string) => void;
  onOpenDetails?: (id: string) => void;
}

const menuItems = [
  { key: "focus", label: "Focus on Entity", icon: Focus },
  { key: "expand", label: "Expand Connections", icon: Expand },
  { key: "hide", label: "Hide Entity", icon: EyeOff },
  { key: "details", label: "Open Details", icon: ExternalLink },
  { key: "copy", label: "Copy Name", icon: Copy },
] as const;

type MenuItemKey = (typeof menuItems)[number]["key"];

export function GraphNodeContextMenu({
  position,
  onClose,
  onFocus,
  onExpand,
  onHide,
  onOpenDetails,
}: GraphNodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!position) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [position, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!position) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    // Use a microtask delay so the opening right-click doesn't immediately close
    const timerId = setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(timerId);
      window.removeEventListener("mousedown", handler);
    };
  }, [position, onClose]);

  const handleItemClick = useCallback(
    (key: MenuItemKey) => {
      if (!position) return;
      const { nodeId, nodeName } = position;
      switch (key) {
        case "focus":
          onFocus?.(nodeId);
          break;
        case "expand":
          onExpand?.(nodeId);
          break;
        case "hide":
          onHide?.(nodeId);
          break;
        case "details":
          onOpenDetails?.(nodeId);
          break;
        case "copy":
          navigator.clipboard.writeText(nodeName).catch(() => {});
          break;
      }
      onClose();
    },
    [position, onFocus, onExpand, onHide, onOpenDetails, onClose],
  );

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      data-testid="graph-node-context-menu"
      className="fixed z-[100] min-w-[180px] rounded-lg border border-[#243645] bg-[#111A21] shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="px-3 py-1.5 border-b border-[#243645]/60">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider truncate max-w-[200px]">
          {position.nodeName}
        </p>
      </div>
      {menuItems.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          data-testid={`context-menu-${key}`}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-[#1a2530] hover:text-gray-100 transition-colors"
          onClick={() => handleItemClick(key)}
        >
          <Icon className="h-3.5 w-3.5 text-gray-500" />
          {label}
        </button>
      ))}
    </div>
  );
}
