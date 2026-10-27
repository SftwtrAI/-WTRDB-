import { X, ArrowRight, Hash, Tag, FileText, Expand, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ENTITY_COLORS } from "./GraphNode";

interface EntityDetail {
  id: string;
  name: string;
  label: string;
  entityType: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId?: string;
}

interface EdgeDetail {
  id: string;
  type: string;
  sourceName: string;
  targetName: string;
  sourceType: string;
  targetType: string;
  properties?: Record<string, string>;
}

interface GraphSidebarProps {
  entity?: EntityDetail | null;
  edge?: EdgeDetail | null;
  onClose: () => void;
  onExpandToModal?: () => void;
  onAskAbout?: (entityName: string) => void;
}

export function GraphSidebar({ entity, edge, onClose, onExpandToModal, onAskAbout }: GraphSidebarProps) {
  const isOpen = !!(entity || edge);

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-30 transition-all duration-300 ease-in-out pointer-events-none"
      style={{
        width: isOpen ? 320 : 0,
        opacity: isOpen ? 1 : 0,
      }}
    >
      {isOpen && (
        <div className="pointer-events-auto h-full w-[320px] bg-[#0B1014]/95 backdrop-blur-xl border-l border-[#243645] shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#243645]">
            <h3 className="text-sm font-semibold text-gray-200">
              {entity ? "Entity Details" : "Relationship Details"}
            </h3>
            <div className="flex items-center gap-1">
              {entity && onExpandToModal && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 hover:bg-[#111A21]"
                  onClick={onExpandToModal}
                  title="Expand to full view"
                >
                  <Expand className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 hover:bg-[#111A21]"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {entity && <EntityPanel entity={entity} onAskAbout={onAskAbout} />}
            {edge && <EdgePanel edge={edge} />}
          </div>
        </div>
      )}
    </div>
  );
}

function EntityPanel({ entity, onAskAbout }: { entity: EntityDetail; onAskAbout?: (entityName: string) => void }) {
  const color = ENTITY_COLORS[entity.entityType] || ENTITY_COLORS.Other;
  const properties = Object.entries(entity.properties || {});

  return (
    <div className="space-y-5">
      {/* Type badge + name */}
      <div>
        <Badge
          className="mb-2 text-[10px] uppercase tracking-wider border"
          style={{
            backgroundColor: `${color}20`,
            borderColor: `${color}60`,
            color: color,
          }}
        >
          {entity.entityType}
        </Badge>
        <h2 className="text-lg font-bold text-gray-100 leading-tight">
          {entity.name || entity.label}
        </h2>
        {entity.name && entity.label !== entity.name && (
          <p className="text-xs text-gray-500 mt-0.5">{entity.label}</p>
        )}
      </div>

      {/* Accent divider */}
      <div className="h-px w-full" style={{ backgroundColor: `${color}30` }} />

      {/* Properties */}
      {properties.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Hash className="h-3 w-3 text-gray-500" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Properties
            </span>
          </div>
          <div className="space-y-2">
            {properties.map(([key, value]) => (
              <div
                key={key}
                className="bg-[#111A21] rounded-lg px-3 py-2 border border-[#243645]/60"
              >
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">
                  {key}
                </p>
                <p className="text-sm text-gray-300 break-words">
                  {String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ask about this entity */}
      {onAskAbout && entity.name && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 border-[#07A288]/30 text-[#07A288] hover:bg-[#07A288]/10 hover:border-[#07A288]/50 hover:text-[#07A288]"
          onClick={() => onAskAbout(entity.name)}
          data-testid="sidebar-ask-about"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask about this entity
        </Button>
      )}

      {/* Source reference */}
      {entity.sourceKnowledgeBaseId && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="h-3 w-3 text-gray-500" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Source Document
            </span>
          </div>
          <div className="bg-[#111A21] rounded-lg px-3 py-2 border border-[#243645]/60">
            <p className="text-xs text-gray-400 font-mono truncate">
              {entity.sourceKnowledgeBaseId}
            </p>
          </div>
        </div>
      )}

      {/* ID */}
      <div className="pt-2 border-t border-[#243645]/60">
        <p className="text-[10px] text-gray-600">
          ID: <span className="font-mono">{entity.id}</span>
        </p>
      </div>
    </div>
  );
}

function EdgePanel({ edge }: { edge: EdgeDetail }) {
  const sourceColor = ENTITY_COLORS[edge.sourceType] || ENTITY_COLORS.Other;
  const targetColor = ENTITY_COLORS[edge.targetType] || ENTITY_COLORS.Other;
  const properties = Object.entries(edge.properties || {});

  return (
    <div className="space-y-5">
      {/* Relationship type */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="h-3 w-3 text-gray-500" />
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
            Relationship Type
          </span>
        </div>
        <Badge
          className="text-xs border"
          style={{
            backgroundColor: "#07A28820",
            borderColor: "#07A28860",
            color: "#07A288",
          }}
        >
          {edge.type}
        </Badge>
      </div>

      {/* Source -> Target */}
      <div className="bg-[#111A21] rounded-xl p-4 border border-[#243645]/60">
        <div className="flex items-center gap-3">
          {/* Source entity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: sourceColor }}
              />
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: `${sourceColor}CC` }}
              >
                {edge.sourceType}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-200 truncate">
              {edge.sourceName}
            </p>
          </div>

          {/* Arrow */}
          <ArrowRight className="h-4 w-4 text-[#07A288] flex-shrink-0" />

          {/* Target entity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: targetColor }}
              />
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: `${targetColor}CC` }}
              >
                {edge.targetType}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-200 truncate">
              {edge.targetName}
            </p>
          </div>
        </div>
      </div>

      {/* Properties */}
      {properties.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Hash className="h-3 w-3 text-gray-500" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Properties
            </span>
          </div>
          <div className="space-y-2">
            {properties.map(([key, value]) => (
              <div
                key={key}
                className="bg-[#111A21] rounded-lg px-3 py-2 border border-[#243645]/60"
              >
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">
                  {key}
                </p>
                <p className="text-sm text-gray-300 break-words">
                  {String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ID */}
      <div className="pt-2 border-t border-[#243645]/60">
        <p className="text-[10px] text-gray-600">
          ID: <span className="font-mono">{edge.id}</span>
        </p>
      </div>
    </div>
  );
}
