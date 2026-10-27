import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  Layers,
  GitMerge,
  AlertTriangle,
  Brain,
  Clock,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Provenance event type identifier */
export type ProvenanceEventType =
  | "origin"
  | "re_mention"
  | "schema_classification"
  | "alignment"
  | "conflict"
  | "learning_event"
  | "soft_deprecation"
  | "freshness_alert";

/** A single provenance event in the timeline */
export interface ProvenanceEvent {
  /** Unique identifier for the event */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type */
  type: ProvenanceEventType;
  /** Human-readable description */
  description: string;
  /** Additional metadata specific to the event type */
  metadata?: Record<string, string | number | boolean>;
  /** Source graph name (for federation / cross-graph events) */
  sourceGraph?: string;
  /** Source graph ID (for navigation) */
  sourceGraphId?: string;
}

/** A branch point in the timeline for federated entities */
export interface ProvenanceBranch {
  /** Branch point timestamp */
  timestamp: string;
  /** Federation name */
  federationName: string;
  /** Sub-timelines, keyed by source graph name */
  subTimelines: Record<string, ProvenanceEvent[]>;
}

export interface ProvenanceThreadProps {
  /** Ordered list of provenance events (oldest first) */
  events: ProvenanceEvent[];
  /** Federation branch data (optional, for merged entities) */
  branches?: ProvenanceBranch[];
  /** Entity or relationship name shown in the header */
  subjectName?: string;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const EVENT_COLORS: Record<ProvenanceEventType, string> = {
  origin: "#07A288",
  re_mention: "#5BBE4E",
  schema_classification: "#B8E52B",
  alignment: "#3B82F6",
  conflict: "#E63946",
  learning_event: "#8B5CF6",
  soft_deprecation: "#8FA2B5",
  freshness_alert: "#D4A017",
};

const EVENT_LABELS: Record<ProvenanceEventType, string> = {
  origin: "Origin",
  re_mention: "Re-mention",
  schema_classification: "Schema Classification",
  alignment: "Alignment",
  conflict: "Conflict",
  learning_event: "Learning Event",
  soft_deprecation: "Soft Deprecation",
  freshness_alert: "Freshness Alert",
};

function eventIcon(type: ProvenanceEventType) {
  switch (type) {
    case "origin":
      return <FileText className="h-3 w-3" />;
    case "re_mention":
      return <RefreshCw className="h-3 w-3" />;
    case "schema_classification":
      return <Layers className="h-3 w-3" />;
    case "alignment":
      return <GitMerge className="h-3 w-3" />;
    case "conflict":
      return <AlertTriangle className="h-3 w-3" />;
    case "learning_event":
      return <Brain className="h-3 w-3" />;
    case "soft_deprecation":
      return <Clock className="h-3 w-3" />;
    case "freshness_alert":
      return <AlertCircle className="h-3 w-3" />;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single event node in the provenance timeline */
function TimelineNode({
  event,
  isFirst,
  isLast,
}: {
  event: ProvenanceEvent;
  isFirst: boolean;
  isLast: boolean;
}) {
  const color = EVENT_COLORS[event.type];
  const label = EVENT_LABELS[event.type];

  return (
    <div className="flex gap-3 group" data-testid={`provenance-event-${event.id}`}>
      {/* Timestamp column */}
      <div className="w-[90px] shrink-0 text-right pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[11px] text-muted-foreground cursor-default leading-tight">
              {formatDate(event.timestamp)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">
            <span className="text-xs">{formatTimestamp(event.timestamp)}</span>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Timeline line + circle */}
      <div className="relative flex flex-col items-center w-5 shrink-0">
        {/* Vertical line above */}
        {!isFirst && (
          <div className="w-px flex-1 bg-[#243645]" />
        )}
        {isFirst && <div className="flex-1" />}

        {/* Colored circle */}
        <div
          className="w-3.5 h-3.5 rounded-full border-2 shrink-0 z-10 flex items-center justify-center"
          style={{
            borderColor: color,
            backgroundColor: `${color}30`,
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>

        {/* Vertical line below */}
        {!isLast && (
          <div className="w-px flex-1 bg-[#243645]" />
        )}
        {isLast && <div className="flex-1" />}
      </div>

      {/* Event card */}
      <div className="flex-1 pb-4 pt-0">
        <Card
          className="border border-[#243645] bg-[#111A21] hover:border-[#2d4455] transition-colors p-3"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span style={{ color }} className="shrink-0">
              {eventIcon(event.type)}
            </span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-5 border-[#243645]"
              style={{ color, borderColor: `${color}40` }}
            >
              {label}
            </Badge>
            {event.sourceGraph && (
              <span className="text-[10px] text-muted-foreground truncate">
                from {event.sourceGraph}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {event.description}
          </p>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(event.metadata).map(([key, value]) => (
                <span key={key} className="text-[10px] text-muted-foreground">
                  <span className="font-medium">{key}:</span> {String(value)}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Collapsible branch for federation sub-timelines */
function BranchSection({ branch }: { branch: ProvenanceBranch }) {
  const [expanded, setExpanded] = useState(false);
  const sourceNames = Object.keys(branch.subTimelines);

  return (
    <div className="relative" data-testid="provenance-branch">
      {/* Branch bar */}
      <div className="flex gap-3 mb-2">
        <div className="w-[90px] shrink-0 text-right pt-1">
          <span className="text-[11px] text-muted-foreground">
            {formatDate(branch.timestamp)}
          </span>
        </div>
        <div className="relative flex flex-col items-center w-5 shrink-0">
          <div className="w-px flex-1 bg-[#243645]" />
          <div className="w-4 h-4 rounded-sm bg-[#3B82F6] flex items-center justify-center shrink-0 z-10">
            <GitMerge className="h-2.5 w-2.5 text-white" />
          </div>
          <div className="w-px flex-1 bg-[#243645]" />
        </div>
        <div className="flex-1 pb-2 pt-0">
          <div className="flex items-center gap-2 rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-3 py-2">
            <span className="text-xs text-[#3B82F6] font-medium">
              Merged in federation: {branch.federationName}
            </span>
            <Badge variant="outline" className="text-[10px] border-[#3B82F6]/30 text-[#3B82F6]">
              {sourceNames.length} sources
            </Badge>
          </div>
        </div>
      </div>

      {/* Sub-timelines (collapsed by default) */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        {/* Preview: most recent event from each source */}
        {!expanded && (
          <div className="ml-[115px] space-y-1 mb-2">
            {sourceNames.map((name) => {
              const events = branch.subTimelines[name];
              const latest = events[events.length - 1];
              if (!latest) return null;
              return (
                <div key={name} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: EVENT_COLORS[latest.type] }}
                  />
                  <span className="font-medium">{name}:</span>
                  <span className="truncate">{latest.description}</span>
                </div>
              );
            })}
          </div>
        )}

        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="ml-[115px] h-6 text-[10px] text-muted-foreground hover:text-foreground gap-1 mb-2"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Collapse history
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Expand full history
              </>
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="ml-[115px] space-y-4">
            {sourceNames.map((name) => {
              const events = branch.subTimelines[name];
              return (
                <div key={name} className="border-l-2 border-[#243645] pl-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">{name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ({events.length} event{events.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                  <div className="space-y-0">
                    {events.map((event, idx) => (
                      <TimelineNode
                        key={event.id}
                        event={event}
                        isFirst={idx === 0}
                        isLast={idx === events.length - 1}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placeholder data (for demo / testing)
// ---------------------------------------------------------------------------

const PLACEHOLDER_EVENTS: ProvenanceEvent[] = [
  {
    id: "prov_001",
    timestamp: "2026-02-15T10:30:00Z",
    type: "origin",
    description: 'First extracted from "IT Infrastructure Guide v2.3", chunk 4. Entity identified as a production server.',
    metadata: { document: "IT Infrastructure Guide v2.3", chunk: 4, batch: "batch_0042" },
  },
  {
    id: "prov_002",
    timestamp: "2026-02-15T10:31:00Z",
    type: "schema_classification",
    description: 'Classified as entity type "Infrastructure". Relationship type "deployed_to" canonicalized to "RUNS_ON".',
    metadata: { entityType: "Infrastructure", canonicalization: "deployed_to -> RUNS_ON" },
  },
  {
    id: "prov_003",
    timestamp: "2026-02-20T14:12:00Z",
    type: "re_mention",
    description: 'Re-mentioned in "Quarterly Audit Report Q1 2026", chunk 12. Added property: last_audit_date = "2026-01-15".',
    metadata: { document: "Quarterly Audit Report Q1 2026", chunk: 12, newProperty: "last_audit_date" },
  },
  {
    id: "prov_004",
    timestamp: "2026-03-01T09:00:00Z",
    type: "learning_event",
    description: 'CLAW agent "InfraBot" observed that this server handles authentication traffic. Confidence: 0.89.',
    metadata: { agent: "InfraBot", confidence: 0.89, status: "approved" },
  },
  {
    id: "prov_005",
    timestamp: "2026-03-10T16:45:00Z",
    type: "alignment",
    description: 'Aligned with "auth-server-01" from Google Admin graph. Confidence: 0.94. Resolution tier: 1.',
    metadata: { alignedWith: "auth-server-01", sourceGraph: "Google Admin", confidence: 0.94, tier: 1 },
    sourceGraph: "Google Admin",
  },
  {
    id: "prov_006",
    timestamp: "2026-03-15T11:20:00Z",
    type: "conflict",
    description: 'Property conflict: "os_version" is "Ubuntu 22.04" in this graph but "Ubuntu 20.04" in Google Admin export. Resolved: this graph value accepted (more recent source).',
    metadata: { field: "os_version", resolution: "local_value_accepted" },
  },
  {
    id: "prov_007",
    timestamp: "2026-03-28T08:00:00Z",
    type: "freshness_alert",
    description: "Freshness score dropped to 0.35. Last source document update was 38 days ago. Recommended: re-process recent infrastructure documentation.",
    metadata: { freshnessScore: 0.35, daysSinceUpdate: 38 },
  },
  {
    id: "prov_008",
    timestamp: "2026-04-01T10:00:00Z",
    type: "soft_deprecation",
    description: 'Relationship "RUNS_ON -> dc01-rack-a7" soft-deprecated. Replacement: "RUNS_ON -> dc01-rack-b2" (server physically relocated).',
    metadata: { deprecatedEdge: "RUNS_ON -> dc01-rack-a7", replacement: "RUNS_ON -> dc01-rack-b2" },
  },
];

const PLACEHOLDER_BRANCHES: ProvenanceBranch[] = [
  {
    timestamp: "2026-03-10T16:45:00Z",
    federationName: "IT Infrastructure Federation",
    subTimelines: {
      "IT Engineer Docs": [
        {
          id: "branch_it_001",
          timestamp: "2026-02-15T10:30:00Z",
          type: "origin",
          description: 'Extracted from "IT Infrastructure Guide v2.3".',
        },
        {
          id: "branch_it_002",
          timestamp: "2026-02-20T14:12:00Z",
          type: "re_mention",
          description: 'Re-mentioned in "Quarterly Audit Report Q1 2026".',
        },
      ],
      "Google Admin Export": [
        {
          id: "branch_ga_001",
          timestamp: "2026-01-10T08:00:00Z",
          type: "origin",
          description: 'Auto-imported from Google Workspace admin console export.',
        },
        {
          id: "branch_ga_002",
          timestamp: "2026-03-05T12:00:00Z",
          type: "learning_event",
          description: 'CLAW agent "AdminSync" updated hostname metadata.',
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Vertical provenance timeline for an entity or relationship.
 *
 * Renders as a tab within entity/relationship detail panels across all
 * graph visualizers (2D, 3D, federation detail pages).
 *
 * Time flows bottom-to-top (oldest events at the bottom, newest at top).
 * Federation entities show branching sub-timelines that are collapsible.
 */
export function ProvenanceThread({
  events: propEvents,
  branches: propBranches,
  subjectName,
  className,
}: ProvenanceThreadProps) {
  // Use placeholder data when no events are provided
  const events = propEvents.length > 0 ? propEvents : PLACEHOLDER_EVENTS;
  const branches = propBranches ?? PLACEHOLDER_BRANCHES;

  // Sort events newest-first for bottom-to-top display (rendered top-to-bottom in DOM)
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [events],
  );

  // Group events by whether they occur before or after a branch point
  const branchTimestamps = useMemo(
    () => new Set(branches.map((b) => b.timestamp)),
    [branches],
  );

  return (
    <div className={cn("flex flex-col", className)} data-testid="provenance-thread">
      {/* Header */}
      {subjectName && (
        <div className="flex items-center gap-2 mb-4">
          <h4 className="text-sm font-semibold text-foreground">Provenance</h4>
          <span className="text-xs text-muted-foreground">for {subjectName}</span>
        </div>
      )}

      {/* Event count summary */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(
          events.reduce<Record<ProvenanceEventType, number>>((acc, e) => {
            acc[e.type] = (acc[e.type] || 0) + 1;
            return acc;
          }, {} as Record<ProvenanceEventType, number>),
        ).map(([type, count]) => (
          <Badge
            key={type}
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 gap-1 border-[#243645]"
            style={{ color: EVENT_COLORS[type as ProvenanceEventType] }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: EVENT_COLORS[type as ProvenanceEventType] }}
            />
            {count} {EVENT_LABELS[type as ProvenanceEventType]}
          </Badge>
        ))}
      </div>

      {/* Timeline (newest at top) */}
      <div className="space-y-0">
        {sortedEvents.map((event, idx) => {
          // Check if this event's timestamp matches a branch point
          const matchingBranch = branches.find((b) => b.timestamp === event.timestamp);

          return (
            <div key={event.id}>
              <TimelineNode
                event={event}
                isFirst={idx === 0}
                isLast={idx === sortedEvents.length - 1 && !matchingBranch}
              />
              {matchingBranch && (
                <BranchSection branch={matchingBranch} />
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="text-center py-8">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No provenance events recorded yet.</p>
        </div>
      )}
    </div>
  );
}

export { EVENT_COLORS, EVENT_LABELS, PLACEHOLDER_EVENTS, PLACEHOLDER_BRANCHES };
