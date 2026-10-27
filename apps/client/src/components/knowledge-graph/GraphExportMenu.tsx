import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface GraphExportMenuProps {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  knowledgeBaseId: string;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function GraphExportMenu({
  entities,
  relationships,
  knowledgeBaseId,
}: GraphExportMenuProps) {
  const handleExportJSON = () => {
    const data = {
      knowledgeBaseId,
      exportedAt: new Date().toISOString(),
      entities: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.label,
        properties: e.properties,
        sourceKnowledgeBaseId: e.sourceKnowledgeBaseId,
      })),
      relationships: relationships.map((r) => ({
        id: r.id,
        type: r.type,
        sourceEntityId: r.sourceEntityId,
        targetEntityId: r.targetEntityId,
        properties: r.properties,
        sourceKnowledgeBaseId: r.sourceKnowledgeBaseId,
      })),
    };
    downloadFile(
      JSON.stringify(data, null, 2),
      `knowledge-graph-${knowledgeBaseId}.json`,
      "application/json"
    );
  };

  const handleExportCSV = () => {
    // Entities CSV
    const entityHeaders = ["id", "name", "type", "properties", "sourceKnowledgeBaseId"];
    const entityRows = entities.map((e) => [
      escapeCsvValue(e.id),
      escapeCsvValue(e.name),
      escapeCsvValue(e.label),
      escapeCsvValue(JSON.stringify(e.properties || {})),
      escapeCsvValue(e.sourceKnowledgeBaseId || ""),
    ]);
    const entitiesCsv = [entityHeaders.join(","), ...entityRows.map((r) => r.join(","))].join(
      "\n"
    );
    downloadFile(
      entitiesCsv,
      `entities-${knowledgeBaseId}.csv`,
      "text/csv"
    );

    // Relationships CSV
    const relHeaders = [
      "id",
      "type",
      "sourceEntityId",
      "targetEntityId",
      "properties",
      "sourceKnowledgeBaseId",
    ];
    const relRows = relationships.map((r) => [
      escapeCsvValue(r.id),
      escapeCsvValue(r.type),
      escapeCsvValue(r.sourceEntityId),
      escapeCsvValue(r.targetEntityId),
      escapeCsvValue(JSON.stringify(r.properties || {})),
      escapeCsvValue(r.sourceKnowledgeBaseId || ""),
    ]);
    const relsCsv = [relHeaders.join(","), ...relRows.map((r) => r.join(","))].join("\n");
    downloadFile(
      relsCsv,
      `relationships-${knowledgeBaseId}.csv`,
      "text/csv"
    );
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 bg-[#0B1014]/90 backdrop-blur-xl border border-[#243645] hover:border-[#07A288]/50 hover:bg-[#111A21]"
            >
              <Download className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">Export graph</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="bg-[#0B1014] border-[#243645] min-w-[180px]"
      >
        <DropdownMenuItem
          onClick={handleExportJSON}
          className="text-gray-300 hover:text-gray-100 focus:text-gray-100 focus:bg-[#111A21] cursor-pointer gap-2"
        >
          <FileJson className="h-4 w-4 text-[#07A288]" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleExportCSV}
          className="text-gray-300 hover:text-gray-100 focus:text-gray-100 focus:bg-[#111A21] cursor-pointer gap-2"
        >
          <FileSpreadsheet className="h-4 w-4 text-[#5BBE4E]" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
