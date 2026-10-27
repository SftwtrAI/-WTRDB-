import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hash, ArrowRight, Network, FileText, Sparkles } from "lucide-react";
import { ENTITY_COLORS } from "./GraphNode";

interface GraphEntity {
  id: string;
  label: string;
  name: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
  sourceChunkIndex: number;
}

interface GraphRelationship {
  id: string;
  type: string;
  sourceEntityId: string;
  targetEntityId: string;
  properties: Record<string, string>;
  sourceKnowledgeBaseId: string;
}

interface GraphEntityModalProps {
  entity: GraphEntity | null;
  relationships: GraphRelationship[];
  allEntities: GraphEntity[];
  isOpen: boolean;
  onClose: () => void;
  onNavigateToEntity: (entityId: string) => void;
  onAskAbout?: (entityName: string) => void;
}

export function GraphEntityModal({
  entity,
  relationships,
  allEntities,
  isOpen,
  onClose,
  onNavigateToEntity,
  onAskAbout,
}: GraphEntityModalProps) {
  if (!entity) return null;

  const color = ENTITY_COLORS[entity.label] || ENTITY_COLORS.Other;
  const properties = Object.entries(entity.properties || {});

  // Find connected relationships and entities
  const connectedRelationships = relationships.filter(
    (r) => r.sourceEntityId === entity.id || r.targetEntityId === entity.id
  );

  const entityMap = new Map(allEntities.map((e) => [e.id, e]));

  const connectedEntities = connectedRelationships.map((rel) => {
    const isSource = rel.sourceEntityId === entity.id;
    const connectedId = isSource ? rel.targetEntityId : rel.sourceEntityId;
    const connectedEntity = entityMap.get(connectedId);
    return {
      relationship: rel,
      entity: connectedEntity,
      direction: isSource ? ("outgoing" as const) : ("incoming" as const),
    };
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#0B1014] border-[#243645] text-gray-100 max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              className="text-[10px] uppercase tracking-wider border"
              style={{
                backgroundColor: `${color}20`,
                borderColor: `${color}60`,
                color: color,
              }}
            >
              {entity.label}
            </Badge>
          </div>
          <DialogTitle className="text-xl font-bold text-gray-100 leading-tight">
            {entity.name}
          </DialogTitle>
          {onAskAbout && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-2 border-[#07A288]/30 text-[#07A288] hover:bg-[#07A288]/10 hover:border-[#07A288]/50 hover:text-[#07A288]"
              onClick={() => {
                onAskAbout(entity.name);
                onClose();
              }}
              data-testid="modal-ask-about"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask about {entity.name}
            </Button>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Properties table */}
          {properties.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Hash className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Properties
                </span>
              </div>
              <div className="bg-[#111A21] rounded-lg border border-[#243645]/60 overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {properties.map(([key, value], idx) => (
                      <tr
                        key={key}
                        className={
                          idx < properties.length - 1
                            ? "border-b border-[#243645]/40"
                            : ""
                        }
                      >
                        <td className="px-3 py-2 text-[11px] text-gray-500 font-medium uppercase tracking-wider whitespace-nowrap align-top w-1/3">
                          {key}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-300 break-words">
                          {String(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Connected entities */}
          {connectedEntities.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Network className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Connected Entities ({connectedEntities.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {connectedEntities.map(({ relationship, entity: connEntity, direction }) => {
                  if (!connEntity) return null;
                  const connColor =
                    ENTITY_COLORS[connEntity.label] || ENTITY_COLORS.Other;
                  return (
                    <div
                      key={relationship.id}
                      className="flex items-center gap-2 bg-[#111A21] rounded-lg px-3 py-2 border border-[#243645]/60 group hover:border-[#07A288]/40 transition-colors"
                    >
                      {/* Direction indicator */}
                      <ArrowRight
                        className="h-3 w-3 text-gray-600 flex-shrink-0"
                        style={{
                          transform:
                            direction === "incoming" ? "rotate(180deg)" : "none",
                        }}
                      />

                      {/* Relationship type */}
                      <Badge
                        variant="outline"
                        className="text-[9px] border-[#07A288]/40 text-[#07A288] flex-shrink-0"
                      >
                        {relationship.type}
                      </Badge>

                      {/* Connected entity */}
                      <button
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                        onClick={() => onNavigateToEntity(connEntity.id)}
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: connColor }}
                        />
                        <span className="text-sm text-gray-300 truncate font-medium group-hover:text-[#07A288] transition-colors">
                          {connEntity.name}
                        </span>
                        <span
                          className="text-[10px] flex-shrink-0"
                          style={{ color: `${connColor}99` }}
                        >
                          {connEntity.label}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source reference */}
          {entity.sourceKnowledgeBaseId && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </span>
              </div>
              <div className="bg-[#111A21] rounded-lg px-3 py-2 border border-[#243645]/60">
                <p className="text-xs text-gray-400 font-mono truncate">
                  KB: {entity.sourceKnowledgeBaseId}
                </p>
                {entity.sourceChunkIndex !== undefined && (
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    Chunk index: {entity.sourceChunkIndex}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Entity ID */}
          <div className="pt-2 border-t border-[#243645]/60">
            <p className="text-[10px] text-gray-600">
              ID: <span className="font-mono">{entity.id}</span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
