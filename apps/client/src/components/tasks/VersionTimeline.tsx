import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";

interface Version {
  id: string;
  version: number;
  status: string;
  changeNotes: string | null;
  createdAt: string;
  publishedAt: string | null;
}

interface VersionTimelineProps {
  versions: Version[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const statusColors: Record<string, string> = {
  draft: "bg-yellow-500",
  published: "bg-green-500",
  archived: "bg-gray-500",
};

export function VersionTimeline({ versions, selectedId, onSelect }: VersionTimelineProps) {
  return (
    <div className="space-y-0">
      {versions.map((v, i) => (
        <div
          key={v.id}
          className={`relative flex items-start gap-3 p-3 rounded-md cursor-pointer transition-colors
            ${selectedId === v.id ? "bg-accent" : "hover:bg-accent/50"}`}
          onClick={() => onSelect(v.id)}
        >
          {/* Timeline line */}
          {i < versions.length - 1 && (
            <div className="absolute left-[23px] top-[40px] w-0.5 h-[calc(100%-16px)] bg-border" />
          )}

          {/* Dot */}
          <div className={`relative z-10 mt-1 h-3 w-3 rounded-full ${statusColors[v.status] || "bg-gray-400"}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">v{v.version}</span>
              <Badge variant={v.status === "published" ? "default" : "outline"} className="text-xs">
                {v.status}
              </Badge>
            </div>
            {v.changeNotes && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{v.changeNotes}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(v.createdAt).toLocaleDateString()}
            </p>
          </div>

          <GitBranch className="h-4 w-4 text-muted-foreground mt-1" />
        </div>
      ))}
    </div>
  );
}
