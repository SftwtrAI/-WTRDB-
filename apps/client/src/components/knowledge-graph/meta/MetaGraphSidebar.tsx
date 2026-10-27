import { FileText, X } from "lucide-react";
import { Link } from "wouter";
import type { SimNode } from "./SpiderwebSimulation";
import { ENTITY_COLORS } from "./SpiderwebCanvas";

export interface MetaGraphSidebarProps {
  node: SimNode | null;
  documentTitles: Record<string, string>;
  onClose: () => void;
}

export function MetaGraphSidebar({ node, documentTitles, onClose }: MetaGraphSidebarProps) {
  if (!node) return null;

  const color = ENTITY_COLORS[node.label] || ENTITY_COLORS.Other;

  return (
    <aside
      className="pointer-events-auto fixed right-0 top-0 z-30 h-full w-80 border-l border-[#243645] bg-[#0B1014]/95 backdrop-blur-xl shadow-[0_0_40px_rgba(184,229,43,0.08)]"
      style={{
        animation: "meta-graph-sidebar-in 260ms ease-out",
      }}
    >
      <style>{`
        @keyframes meta-graph-sidebar-in {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[#243645] p-4">
        <div className="min-w-0 flex-1">
          <div
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{
              borderColor: `${color}60`,
              color: color,
              backgroundColor: `${color}14`,
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {node.label}
          </div>
          <h2 className="mt-2 break-words text-base font-semibold text-[#E7EEF6]" title={node.name}>
            {node.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[#8FA2B5] transition-colors hover:bg-[#111A21] hover:text-[#E7EEF6]"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Documents list */}
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8FA2B5]">
            Found in {node.documentIds.length} document
            {node.documentIds.length === 1 ? "" : "s"}
          </h3>
          {node.documentIds.length >= 3 && (
            <span className="rounded-full bg-[#B8E52B]/15 px-2 py-0.5 text-[10px] font-semibold text-[#B8E52B]">
              HUB
            </span>
          )}
        </div>

        <ul className="space-y-1.5">
          {node.documentIds.map((kbId) => {
            const title = documentTitles[kbId] || kbId;
            return (
              <li key={kbId}>
                <Link href={`/app/knowledge-graph/${kbId}`}>
                  <a className="group flex items-center gap-2 rounded-md border border-[#243645] bg-[#111A21] px-3 py-2 text-xs text-[#E7EEF6] transition-all hover:border-[#B8E52B]/50 hover:bg-[#111A21]/80 hover:shadow-[0_0_12px_rgba(184,229,43,0.15)]">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-[#8FA2B5] group-hover:text-[#B8E52B]" />
                    <span className="truncate" title={title}>
                      {title}
                    </span>
                  </a>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
