/**
 * Right-click context menu for 3D Knowledge Graph nodes.
 * Appears as a floating panel at the cursor position with actions
 * for focusing, expanding, inspecting, hiding, and copying node data.
 */

import { Crosshair, Network, Info, EyeOff, Copy } from "lucide-react";
import { useCallback } from "react";
import type { Node3D } from "./types";

export interface ContextMenuProps {
  node: Node3D | null;
  position: { x: number; y: number };
  onClose: () => void;
  onFocus: (node: Node3D) => void;
  onHide: (nodeId: string) => void;
  onShowDetails: (node: Node3D) => void;
  onExpandDepth: (node: Node3D) => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function MenuItem({ icon, label, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      className="hover:bg-[#243645] px-3 py-1.5 text-xs text-gray-300 flex items-center gap-2 cursor-pointer w-full text-left rounded-sm transition-colors"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export function NodeContextMenu({
  node,
  position,
  onClose,
  onFocus,
  onHide,
  onShowDetails,
  onExpandDepth,
}: ContextMenuProps): JSX.Element | null {
  if (!node) return null;

  const handleFocus = useCallback(() => {
    onFocus(node);
    onClose();
  }, [node, onFocus, onClose]);

  const handleExpand = useCallback(() => {
    onExpandDepth(node);
    onClose();
  }, [node, onExpandDepth, onClose]);

  const handleDetails = useCallback(() => {
    onShowDetails(node);
    onClose();
  }, [node, onShowDetails, onClose]);

  const handleHide = useCallback(() => {
    onHide(node.id);
    onClose();
  }, [node, onHide, onClose]);

  const handleCopyName = useCallback(() => {
    navigator.clipboard.writeText(node.entity.name).catch(() => {
      // Clipboard write failed silently
    });
    onClose();
  }, [node, onClose]);

  return (
    <>
      {/* Invisible backdrop to catch clicks outside the menu */}
      <div
        className="fixed inset-0 z-[999]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Context menu panel */}
      <div
        className="fixed z-[1000] bg-[#111A21]/95 backdrop-blur-md border border-[#243645] rounded-lg shadow-xl py-1 min-w-[180px]"
        style={{ left: position.x, top: position.y }}
      >
        <MenuItem
          icon={<Crosshair className="w-3.5 h-3.5 text-gray-400" />}
          label={`Focus on ${node.entity.name}`}
          onClick={handleFocus}
        />
        <MenuItem
          icon={<Network className="w-3.5 h-3.5 text-gray-400" />}
          label="Expand connections"
          onClick={handleExpand}
        />
        <MenuItem
          icon={<Info className="w-3.5 h-3.5 text-gray-400" />}
          label="Show details"
          onClick={handleDetails}
        />
        <MenuItem
          icon={<EyeOff className="w-3.5 h-3.5 text-gray-400" />}
          label="Hide node"
          onClick={handleHide}
        />

        {/* Separator */}
        <div className="my-1 border-t border-[#243645]" />

        <MenuItem
          icon={<Copy className="w-3.5 h-3.5 text-gray-400" />}
          label="Copy name"
          onClick={handleCopyName}
        />
      </div>
    </>
  );
}
