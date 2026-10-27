import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ENTITY_COLORS } from "./GraphNode";

interface GraphLegendProps {
  entityTypes: string[];
}

export function GraphLegend({ entityTypes }: GraphLegendProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (entityTypes.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
      <div className="bg-[#0B1014]/85 backdrop-blur-xl border border-[#243645] rounded-lg shadow-2xl overflow-hidden">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-[#111A21]/60 transition-colors"
        >
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
            Legend
          </span>
          {collapsed ? (
            <ChevronUp className="h-3 w-3 text-gray-500 ml-auto" />
          ) : (
            <ChevronDown className="h-3 w-3 text-gray-500 ml-auto" />
          )}
        </button>

        {!collapsed && (
          <div className="px-3 pb-2.5 pt-1 flex flex-wrap gap-x-3 gap-y-1.5 max-w-[360px]">
            {entityTypes.map((type) => {
              const color = ENTITY_COLORS[type] || ENTITY_COLORS.Other;
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}60`,
                    }}
                  />
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">
                    {type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
