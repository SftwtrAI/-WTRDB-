import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Network, Bot, Search, Clock } from "lucide-react";

interface GraphActivityFeedProps {
  knowledgeBaseId: string;
}

interface ActivityItem {
  id: string;
  icon: "graph" | "agent" | "query";
  text: string;
  timestamp: string;
  relativeTime: string;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const ICON_MAP = {
  graph: Network,
  agent: Bot,
  query: Search,
};

const ICON_COLOR_MAP = {
  graph: "text-[#07A288]",
  agent: "text-[#5BBE4E]",
  query: "text-[#B8E52B]",
};

export function GraphActivityFeed({ knowledgeBaseId }: GraphActivityFeedProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Mock activity items (UI-only, no real backend endpoint yet)
  const activityItems: ActivityItem[] = useMemo(() => {
    const now = new Date();
    return [
      {
        id: `${knowledgeBaseId}-gen`,
        icon: "graph" as const,
        text: "Graph generated",
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        relativeTime: formatRelativeTime(new Date(now.getTime() - 2 * 60 * 60 * 1000)),
      },
      {
        id: `${knowledgeBaseId}-agent`,
        icon: "agent" as const,
        text: "Connected to agent — Sales Assistant",
        timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        relativeTime: formatRelativeTime(new Date(now.getTime() - 5 * 60 * 60 * 1000)),
      },
      {
        id: `${knowledgeBaseId}-q1`,
        icon: "query" as const,
        text: "Query: 'What organizations are mentioned?'",
        timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
        relativeTime: formatRelativeTime(new Date(now.getTime() - 8 * 60 * 60 * 1000)),
      },
      {
        id: `${knowledgeBaseId}-q2`,
        icon: "query" as const,
        text: "Query: 'Who are the key people?'",
        timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        relativeTime: formatRelativeTime(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      },
      {
        id: `${knowledgeBaseId}-q3`,
        icon: "query" as const,
        text: "Query: 'Relationship between entities'",
        timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        relativeTime: formatRelativeTime(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
      },
    ];
  }, [knowledgeBaseId]);

  return (
    <Card
      className="border-[#243645] bg-[#111A21] overflow-hidden"
      data-testid="graph-activity-feed"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-[#1a2730]/50 transition-colors">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-gray-300 flex-1 text-left">
            Recent Activity
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1 duration-200">
          <div className="px-3 pb-3 space-y-1" data-testid="activity-items">
            {activityItems.map((item) => {
              const IconComponent = ICON_MAP[item.icon];
              const iconColor = ICON_COLOR_MAP[item.icon];

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-[#0B1014]/50 transition-colors"
                  data-testid={`activity-item-${item.id}`}
                >
                  <IconComponent className={`h-3 w-3 flex-shrink-0 ${iconColor}`} />
                  <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                    {item.text}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                    {item.relativeTime}
                  </span>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
