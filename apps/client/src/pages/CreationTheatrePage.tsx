import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  X,
  Play,
  Pause,
  FastForward,
  Clock,
  Turtle,
  Link,
  FileText,
  AlertTriangle,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TheatreEntity {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  createdAt: number;
  mentionCount: number;
  properties: Record<string, string>;
  sourceChunkIndex: number;
}

interface TheatreEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  progress: number;
  opacity: number;
  createdAt: number;
  isDeprecated: boolean;
  isTemporal: boolean;
}

interface CommentaryEntry {
  id: string;
  timestamp: number;
  type: "chunk" | "entity" | "relationship" | "schema" | "event" | "deprecation" | "rejection";
  text: string;
  relatedEntityIds?: string[];
}

interface ChunkData {
  index: number;
  text: string;
  entityHighlights: Array<{
    start: number;
    end: number;
    entityId: string;
    entityType: string;
    entityName: string;
  }>;
}

// ---------------------------------------------------------------------------
// Entity color mapping
// ---------------------------------------------------------------------------

const ENTITY_TYPE_COLORS: Record<string, string> = {
  Person: "hsl(var(--primary))",
  Technology: "hsl(var(--secondary))",
  Infrastructure: "hsl(var(--chart-3))",
  Process: "hsl(var(--chart-4))",
  Service: "hsl(var(--chart-5))",
  Policy: "hsl(var(--muted-foreground))",
  Document: "hsl(170 92% 33%)",
  Organization: "hsl(113 44% 53%)",
  Event: "hsl(75 80% 53%)",
  Default: "hsl(var(--muted-foreground))",
};

function getEntityColor(type: string): string {
  return ENTITY_TYPE_COLORS[type] ?? ENTITY_TYPE_COLORS.Default;
}

// ---------------------------------------------------------------------------
// Placeholder data generator
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Real event → Theatre data converter
// ---------------------------------------------------------------------------

interface RawExtractionEvent {
  id?: string;
  knowledgeBaseId: string;
  userId: string;
  eventType: string;
  chunkIndex?: number;
  entityName?: string;
  entityLabel?: string;
  relationshipType?: string;
  sourceEntity?: string;
  targetEntity?: string;
  eventName?: string;
  eventIntent?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Convert raw kg_extraction_event records (from /events/replay) into the
 * shape that Theatre playback expects: { entities, edges, chunks, commentary }.
 * Time is rebased so the first event is at t=0 and subsequent events are
 * offset in milliseconds.
 */
function convertEventsToTheatreData(rawEvents: RawExtractionEvent[]): {
  entities: Omit<TheatreEntity, "scale" | "opacity">[];
  edges: Omit<TheatreEdge, "progress">[];
  chunks: ChunkData[];
  commentary: CommentaryEntry[];
} {
  if (rawEvents.length === 0) {
    return { entities: [], edges: [], chunks: [], commentary: [] };
  }

  const baseTime = new Date(rawEvents[0].timestamp).getTime();
  const offsetOf = (ts: string) => Math.max(0, new Date(ts).getTime() - baseTime);

  // Stable position generator: hash entity name to (x, y)
  const hashStr = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  };
  const positionFor = (name: string): { x: number; y: number } => {
    const h = hashStr(name);
    return {
      x: 100 + (h % 700),
      y: 80 + ((h >>> 8) % 400),
    };
  };

  const entities: Omit<TheatreEntity, "scale" | "opacity">[] = [];
  const entityByName = new Map<string, string>(); // name → id
  const edges: Omit<TheatreEdge, "progress">[] = [];
  const commentary: CommentaryEntry[] = [];
  const chunkOrder: number[] = [];
  let entityIdCounter = 0;
  let edgeIdCounter = 0;
  let commentaryIdCounter = 0;

  for (const ev of rawEvents) {
    const t = offsetOf(ev.timestamp);

    if (ev.eventType === "chunk_start" && typeof ev.chunkIndex === "number") {
      if (!chunkOrder.includes(ev.chunkIndex)) {
        chunkOrder.push(ev.chunkIndex);
      }
      const totalChunks =
        (ev.details && typeof ev.details["totalChunks"] === "number"
          ? (ev.details["totalChunks"] as number)
          : undefined) ?? chunkOrder.length;
      commentary.push({
        id: `c${commentaryIdCounter++}`,
        timestamp: t,
        type: "chunk",
        text: `Processing chunk ${ev.chunkIndex + 1}${totalChunks ? `/${totalChunks}` : ""}`,
      });
    } else if (ev.eventType === "entity_discovered" && ev.entityName) {
      const name = ev.entityName;
      const type = ev.entityLabel || "Other";
      if (!entityByName.has(name)) {
        const id = `e${entityIdCounter++}`;
        entityByName.set(name, id);
        const pos = positionFor(name);
        entities.push({
          id,
          name,
          type,
          x: pos.x,
          y: pos.y,
          createdAt: t,
          mentionCount: 1,
          properties: {},
          sourceChunkIndex: ev.chunkIndex ?? 0,
        });
      } else {
        // Increment mention count on existing entity
        const existingId = entityByName.get(name)!;
        const existing = entities.find((e) => e.id === existingId);
        if (existing) existing.mentionCount += 1;
      }
      commentary.push({
        id: `c${commentaryIdCounter++}`,
        timestamp: t,
        type: "entity",
        text: `Discovered entity: ${name} (${type})`,
        relatedEntityIds: [entityByName.get(name)!],
      });
    } else if (
      ev.eventType === "relationship_extracted" &&
      ev.sourceEntity &&
      ev.targetEntity
    ) {
      const srcId = entityByName.get(ev.sourceEntity);
      const tgtId = entityByName.get(ev.targetEntity);
      if (srcId && tgtId) {
        edges.push({
          id: `r${edgeIdCounter++}`,
          sourceId: srcId,
          targetId: tgtId,
          label: ev.relationshipType || "RELATED_TO",
          opacity: 1,
          createdAt: t,
          isDeprecated: false,
          isTemporal: false,
        });
        commentary.push({
          id: `c${commentaryIdCounter++}`,
          timestamp: t,
          type: "relationship",
          text: `${ev.sourceEntity} -> ${ev.relationshipType || "RELATED"} -> ${ev.targetEntity}`,
          relatedEntityIds: [srcId, tgtId],
        });
      }
    } else if (ev.eventType === "event_detected" && ev.eventName) {
      commentary.push({
        id: `c${commentaryIdCounter++}`,
        timestamp: t,
        type: "event",
        text: `Event detected: ${ev.eventName}`,
      });
    } else if (ev.eventType === "schema_proposal") {
      const proposalType = (ev.details?.["proposalType"] as string) || "type";
      const proposedLabel = (ev.details?.["proposedLabel"] as string) || "?";
      commentary.push({
        id: `c${commentaryIdCounter++}`,
        timestamp: t,
        type: "schema",
        text: `Schema proposal: new ${proposalType} "${proposedLabel}"`,
      });
    } else if (ev.eventType === "deprecation" && ev.sourceEntity && ev.targetEntity) {
      const srcId = entityByName.get(ev.sourceEntity);
      const tgtId = entityByName.get(ev.targetEntity);
      // Find the matching edge and mark deprecated
      const matching = edges.find(
        (e) =>
          e.sourceId === srcId &&
          e.targetId === tgtId &&
          e.label === (ev.relationshipType || ""),
      );
      if (matching) {
        matching.isDeprecated = true;
        matching.opacity = 0.35;
      }
      commentary.push({
        id: `c${commentaryIdCounter++}`,
        timestamp: t,
        type: "deprecation",
        text: `Deprecation: ${ev.sourceEntity} -> ${ev.targetEntity}`,
        relatedEntityIds: srcId && tgtId ? [srcId, tgtId] : undefined,
      });
    }
    // adjudication_result, extraction_complete, extraction_error: not visualized for now
  }

  // Build minimal chunk records (we don't have the actual document text, only indices)
  const chunks: ChunkData[] = chunkOrder.sort((a, b) => a - b).map((idx) => ({
    index: idx,
    text: `Chunk ${idx + 1} — processed`,
    entityHighlights: [],
  }));

  return { entities, edges, chunks, commentary };
}

function generatePlaceholderData() {
  const entities: Omit<TheatreEntity, "scale" | "opacity">[] = [
    { id: "e1", name: "Alice Chen", type: "Person", x: 300, y: 200, createdAt: 1000, mentionCount: 3, properties: { role: "Security Lead", email: "alice@corp.com" }, sourceChunkIndex: 0 },
    { id: "e2", name: "Active Directory", type: "Technology", x: 500, y: 180, createdAt: 2500, mentionCount: 5, properties: { version: "2019", vendor: "Microsoft" }, sourceChunkIndex: 0 },
    { id: "e3", name: "dc01", type: "Infrastructure", x: 650, y: 300, createdAt: 4000, mentionCount: 2, properties: { ip: "10.0.1.5", os: "Windows Server 2019" }, sourceChunkIndex: 1 },
    { id: "e4", name: "VPN Gateway", type: "Infrastructure", x: 200, y: 350, createdAt: 6000, mentionCount: 1, properties: { type: "IPSec", model: "Cisco ASA" }, sourceChunkIndex: 1 },
    { id: "e5", name: "Security Team", type: "Organization", x: 400, y: 380, createdAt: 8000, mentionCount: 4, properties: { size: "12 members" }, sourceChunkIndex: 2 },
    { id: "e6", name: "Backup Policy", type: "Policy", x: 550, y: 420, createdAt: 10000, mentionCount: 2, properties: { frequency: "Daily", retention: "30 days" }, sourceChunkIndex: 2 },
    { id: "e7", name: "Bob Martinez", type: "Person", x: 150, y: 250, createdAt: 12000, mentionCount: 2, properties: { role: "IT Admin" }, sourceChunkIndex: 3 },
    { id: "e8", name: "Firewall Rules", type: "Policy", x: 350, y: 120, createdAt: 14000, mentionCount: 1, properties: { ruleCount: "47" }, sourceChunkIndex: 3 },
    { id: "e9", name: "Incident #2847", type: "Event", x: 480, y: 480, createdAt: 16000, mentionCount: 1, properties: { severity: "High", date: "2026-01-10" }, sourceChunkIndex: 4 },
    { id: "e10", name: "LDAP Service", type: "Service", x: 600, y: 150, createdAt: 18000, mentionCount: 2, properties: { port: "389", protocol: "LDAP" }, sourceChunkIndex: 4 },
  ];

  const edges: Omit<TheatreEdge, "progress">[] = [
    { id: "r1", sourceId: "e1", targetId: "e5", label: "MANAGES", opacity: 1, createdAt: 9000, isDeprecated: false, isTemporal: false },
    { id: "r2", sourceId: "e1", targetId: "e2", label: "ADMINISTERS", opacity: 1, createdAt: 3000, isDeprecated: false, isTemporal: false },
    { id: "r3", sourceId: "e2", targetId: "e3", label: "RUNS_ON", opacity: 1, createdAt: 5000, isDeprecated: false, isTemporal: false },
    { id: "r4", sourceId: "e3", targetId: "e4", label: "CONNECTS_TO", opacity: 1, createdAt: 7000, isDeprecated: false, isTemporal: false },
    { id: "r5", sourceId: "e5", targetId: "e6", label: "ENFORCES", opacity: 1, createdAt: 11000, isDeprecated: false, isTemporal: false },
    { id: "r6", sourceId: "e7", targetId: "e3", label: "MAINTAINS", opacity: 1, createdAt: 13000, isDeprecated: false, isTemporal: false },
    { id: "r7", sourceId: "e7", targetId: "e8", label: "CONFIGURES", opacity: 1, createdAt: 15000, isDeprecated: false, isTemporal: false },
    { id: "r8", sourceId: "e9", targetId: "e3", label: "AFFECTED", opacity: 1, createdAt: 17000, isDeprecated: false, isTemporal: true },
    { id: "r9", sourceId: "e2", targetId: "e10", label: "PROVIDES", opacity: 1, createdAt: 19000, isDeprecated: false, isTemporal: false },
    { id: "r10", sourceId: "e1", targetId: "e6", label: "AUTHORED", opacity: 0.35, createdAt: 10500, isDeprecated: true, isTemporal: false },
  ];

  const chunks: ChunkData[] = [
    {
      index: 0,
      text: "Alice Chen is the Security Lead responsible for managing the Active Directory infrastructure. She oversees all authentication policies and ensures compliance with security standards across the organization.",
      entityHighlights: [
        { start: 0, end: 9, entityId: "e1", entityType: "Person", entityName: "Alice Chen" },
        { start: 68, end: 84, entityId: "e2", entityType: "Technology", entityName: "Active Directory" },
      ],
    },
    {
      index: 1,
      text: "The primary domain controller dc01 runs Active Directory services and connects to the VPN Gateway for remote access. It handles all LDAP queries from client machines on the 10.0.1.x subnet.",
      entityHighlights: [
        { start: 31, end: 35, entityId: "e3", entityType: "Infrastructure", entityName: "dc01" },
        { start: 81, end: 92, entityId: "e4", entityType: "Infrastructure", entityName: "VPN Gateway" },
      ],
    },
    {
      index: 2,
      text: "The Security Team, a 12-member group led by Alice Chen, enforces the Backup Policy requiring daily snapshots with 30-day retention. All critical infrastructure components must comply with this schedule.",
      entityHighlights: [
        { start: 4, end: 17, entityId: "e5", entityType: "Organization", entityName: "Security Team" },
        { start: 69, end: 82, entityId: "e6", entityType: "Policy", entityName: "Backup Policy" },
      ],
    },
    {
      index: 3,
      text: "Bob Martinez serves as the IT Administrator responsible for maintaining dc01 and configuring the Firewall Rules. He reports to Alice Chen and handles day-to-day infrastructure operations.",
      entityHighlights: [
        { start: 0, end: 12, entityId: "e7", entityType: "Person", entityName: "Bob Martinez" },
        { start: 90, end: 104, entityId: "e8", entityType: "Policy", entityName: "Firewall Rules" },
      ],
    },
    {
      index: 4,
      text: "Incident #2847, a high-severity event from January 2026, affected dc01 when an unauthorized LDAP bind was detected on the LDAP Service. The security team responded within 15 minutes.",
      entityHighlights: [
        { start: 0, end: 14, entityId: "e9", entityType: "Event", entityName: "Incident #2847" },
        { start: 120, end: 132, entityId: "e10", entityType: "Service", entityName: "LDAP Service" },
      ],
    },
  ];

  const commentary: CommentaryEntry[] = [
    { id: "c1", timestamp: 500, type: "chunk", text: "Processing chunk 1/5 - Authentication infrastructure overview" },
    { id: "c2", timestamp: 1000, type: "entity", text: "Discovered entity: Alice Chen (Person)", relatedEntityIds: ["e1"] },
    { id: "c3", timestamp: 2500, type: "entity", text: "Discovered entity: Active Directory (Technology)", relatedEntityIds: ["e2"] },
    { id: "c4", timestamp: 3000, type: "relationship", text: "Alice Chen -> ADMINISTERS -> Active Directory", relatedEntityIds: ["e1", "e2"] },
    { id: "c5", timestamp: 3500, type: "chunk", text: "Processing chunk 2/5 - Domain controller setup" },
    { id: "c6", timestamp: 4000, type: "entity", text: "Discovered entity: dc01 (Infrastructure)", relatedEntityIds: ["e3"] },
    { id: "c7", timestamp: 5000, type: "relationship", text: "Active Directory -> RUNS_ON -> dc01", relatedEntityIds: ["e2", "e3"] },
    { id: "c8", timestamp: 6000, type: "entity", text: "Discovered entity: VPN Gateway (Infrastructure)", relatedEntityIds: ["e4"] },
    { id: "c9", timestamp: 7000, type: "relationship", text: "dc01 -> CONNECTS_TO -> VPN Gateway", relatedEntityIds: ["e3", "e4"] },
    { id: "c10", timestamp: 7500, type: "chunk", text: "Processing chunk 3/5 - Security policies" },
    { id: "c11", timestamp: 8000, type: "entity", text: "Discovered entity: Security Team (Organization)", relatedEntityIds: ["e5"] },
    { id: "c12", timestamp: 9000, type: "relationship", text: "Alice Chen -> MANAGES -> Security Team", relatedEntityIds: ["e1", "e5"] },
    { id: "c13", timestamp: 10000, type: "entity", text: "Discovered entity: Backup Policy (Policy)", relatedEntityIds: ["e6"] },
    { id: "c14", timestamp: 10500, type: "deprecation", text: "Soft deprecation: Alice Chen -> AUTHORED -> Backup Policy (superseded)", relatedEntityIds: ["e1", "e6"] },
    { id: "c15", timestamp: 11000, type: "relationship", text: "Security Team -> ENFORCES -> Backup Policy", relatedEntityIds: ["e5", "e6"] },
    { id: "c16", timestamp: 11500, type: "chunk", text: "Processing chunk 4/5 - IT administration" },
    { id: "c17", timestamp: 12000, type: "entity", text: "Discovered entity: Bob Martinez (Person)", relatedEntityIds: ["e7"] },
    { id: "c18", timestamp: 13000, type: "relationship", text: "Bob Martinez -> MAINTAINS -> dc01", relatedEntityIds: ["e7", "e3"] },
    { id: "c19", timestamp: 14000, type: "entity", text: "Discovered entity: Firewall Rules (Policy)", relatedEntityIds: ["e8"] },
    { id: "c20", timestamp: 15000, type: "relationship", text: "Bob Martinez -> CONFIGURES -> Firewall Rules", relatedEntityIds: ["e7", "e8"] },
    { id: "c21", timestamp: 15500, type: "chunk", text: "Processing chunk 5/5 - Incident reports" },
    { id: "c22", timestamp: 16000, type: "entity", text: "Discovered entity: Incident #2847 (Event)", relatedEntityIds: ["e9"] },
    { id: "c23", timestamp: 17000, type: "event", text: "Temporal event detected: Incident #2847 affected dc01 (Jan 2026)", relatedEntityIds: ["e9", "e3"] },
    { id: "c24", timestamp: 18000, type: "entity", text: "Discovered entity: LDAP Service (Service)", relatedEntityIds: ["e10"] },
    { id: "c25", timestamp: 19000, type: "relationship", text: "Active Directory -> PROVIDES -> LDAP Service", relatedEntityIds: ["e2", "e10"] },
    { id: "c26", timestamp: 20000, type: "schema", text: "Schema proposal: AFFECTED -> maps to canonical: IMPACTED_BY (89% confidence)" },
  ];

  return { entities, edges, chunks, commentary };
}

// ---------------------------------------------------------------------------
// Dashboard Strip
// ---------------------------------------------------------------------------

function DashboardStrip({
  documentName,
  currentChunk,
  totalChunks,
  entityCount,
  relationshipCount,
  elapsedTime,
  discoveredTypes,
  onClose,
}: {
  documentName: string;
  currentChunk: number;
  totalChunks: number;
  entityCount: number;
  relationshipCount: number;
  elapsedTime: number;
  discoveredTypes: string[];
  onClose: () => void;
}) {
  const minutes = Math.floor(elapsedTime / 60);
  const seconds = Math.floor(elapsedTime % 60);
  const progress = totalChunks > 0 ? (currentChunk / totalChunks) * 100 : 0;

  return (
    <div
      className="flex items-center gap-4 px-4 h-12 border-b border-border shrink-0"
      style={{ background: "rgba(11, 16, 20, 0.9)" }}
    >
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs font-medium text-foreground truncate max-w-[180px]">
            {documentName}
          </span>
        </TooltipTrigger>
        <TooltipContent>{documentName}</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Chunk {currentChunk}/{totalChunks}
        </span>
        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #07A288 0%, #5BBE4E 45%, #B8E52B 100%)",
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-foreground">{entityCount}</span>
        <span className="text-xs text-muted-foreground">entities</span>
        <div className="flex items-center gap-0.5">
          {discoveredTypes.slice(0, 8).map((type) => (
            <div
              key={type}
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{ backgroundColor: getEntityColor(type) }}
              title={type}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-foreground">{relationshipCount}</span>
        <span className="text-xs text-muted-foreground">relationships</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span className="font-mono">
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage (SVG Graph Visualization)
// ---------------------------------------------------------------------------

function Stage({
  entities,
  edges,
  selectedEntityId,
  onEntityClick,
}: {
  entities: TheatreEntity[];
  edges: TheatreEdge[];
  selectedEntityId: string | null;
  onEntityClick: (id: string) => void;
}) {
  const entityMap = useMemo(() => {
    const map = new Map<string, TheatreEntity>();
    entities.forEach((e) => map.set(e.id, e));
    return map;
  }, [entities]);

  return (
    <div className="relative flex-1 overflow-hidden bg-background">
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 800 560"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="hsl(var(--muted-foreground))" opacity="0.5" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const source = entityMap.get(edge.sourceId);
          const target = entityMap.get(edge.targetId);
          if (!source || !target) return null;

          const mx = (source.x + target.x) / 2;
          const my = (source.y + target.y) / 2 - 20;
          const pathD = `M ${source.x} ${source.y} Q ${mx} ${my} ${target.x} ${target.y}`;
          const dashLength = 1000;
          const offset = dashLength * (1 - Math.min(edge.progress, 1));

          return (
            <g key={edge.id}>
              <path
                d={pathD}
                fill="none"
                stroke={
                  edge.isDeprecated
                    ? "hsl(var(--muted-foreground))"
                    : edge.isTemporal
                      ? "hsl(75 80% 53%)"
                      : "hsl(var(--muted-foreground))"
                }
                strokeWidth={edge.isDeprecated ? 1 : 1.5}
                strokeDasharray={
                  edge.isDeprecated
                    ? "4 3"
                    : edge.isTemporal
                      ? "6 2 2 2"
                      : `${dashLength}`
                }
                strokeDashoffset={edge.isDeprecated || edge.isTemporal ? 0 : offset}
                opacity={edge.opacity}
                markerEnd="url(#arrowhead)"
                className="transition-all duration-300"
              />
              {edge.progress >= 0.5 && (
                <text
                  x={mx}
                  y={my - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] font-mono transition-opacity duration-300"
                  opacity={Math.min((edge.progress - 0.5) * 4, edge.opacity)}
                >
                  {edge.label}
                </text>
              )}
              {edge.isTemporal && edge.progress >= 0.8 && (
                <text x={mx + 30} y={my - 2} textAnchor="middle" className="text-[11px]" opacity={0.7}>
                  &#9200;
                </text>
              )}
            </g>
          );
        })}

        {/* Entity Nodes */}
        {entities.map((entity) => {
          const isSelected = selectedEntityId === entity.id;
          const color = getEntityColor(entity.type);
          const r = 18 + Math.min(entity.mentionCount, 5) * 2;

          return (
            <g
              key={entity.id}
              transform={`translate(${entity.x}, ${entity.y}) scale(${entity.scale})`}
              className="cursor-pointer transition-transform duration-300"
              onClick={() => onEntityClick(entity.id)}
              opacity={entity.opacity}
            >
              {isSelected && (
                <circle r={r + 6} fill="none" stroke={color} strokeWidth={2} opacity={0.5} className="animate-pulse" />
              )}
              <circle r={r} fill="hsl(var(--card))" stroke={color} strokeWidth={isSelected ? 2.5 : 1.5} />
              <circle r={4} fill={color} opacity={0.8} />
              <text y={r + 14} textAnchor="middle" className="fill-foreground text-[10px] font-medium">
                {entity.name.length > 16 ? entity.name.slice(0, 14) + ".." : entity.name}
              </text>
              <text y={r + 25} textAnchor="middle" className="fill-muted-foreground text-[8px]">
                {entity.type}
              </text>
              {entity.mentionCount > 1 && (
                <g transform={`translate(${r - 4}, ${-r + 4})`}>
                  <circle r={7} fill={color} />
                  <text textAnchor="middle" dy="3" className="fill-background text-[8px] font-bold">
                    {entity.mentionCount}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source Text Sidebar
// ---------------------------------------------------------------------------

function SourceTextSidebar({
  chunks,
  currentChunkIndex,
  onEntityClick,
}: {
  chunks: ChunkData[];
  currentChunkIndex: number;
  onEntityClick: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const target = scrollRef.current.querySelector(`[data-chunk="${currentChunkIndex}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [currentChunkIndex]);

  return (
    <div className="w-80 border-l border-border flex flex-col shrink-0 bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Source Text</span>
        <div className="flex-1" />
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          Chunk {currentChunkIndex + 1}/{chunks.length}
        </Badge>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        {chunks.map((chunk, idx) => {
          const isCurrent = idx === currentChunkIndex;
          const isPast = idx < currentChunkIndex;

          const segments: React.ReactNode[] = [];
          let lastEnd = 0;
          const sortedHighlights = [...chunk.entityHighlights].sort((a, b) => a.start - b.start);

          sortedHighlights.forEach((hl, hlIdx) => {
            if (hl.start > lastEnd) {
              segments.push(<span key={`t-${idx}-${hlIdx}`}>{chunk.text.slice(lastEnd, hl.start)}</span>);
            }
            segments.push(
              <span
                key={`h-${idx}-${hlIdx}`}
                className="font-semibold cursor-pointer rounded px-0.5 transition-colors hover:opacity-80"
                style={{
                  backgroundColor: `${getEntityColor(hl.entityType)}20`,
                  borderBottom: `1px solid ${getEntityColor(hl.entityType)}40`,
                }}
                onClick={() => onEntityClick(hl.entityId)}
                title={`${hl.entityName} (${hl.entityType})`}
              >
                {chunk.text.slice(hl.start, hl.end)}
              </span>,
            );
            lastEnd = hl.end;
          });
          if (lastEnd < chunk.text.length) {
            segments.push(<span key={`t-${idx}-end`}>{chunk.text.slice(lastEnd)}</span>);
          }

          return (
            <div
              key={idx}
              data-chunk={idx}
              className={`mb-4 text-sm leading-relaxed transition-opacity duration-300 ${
                isCurrent ? "opacity-100" : isPast ? "opacity-40" : "opacity-20"
              }`}
            >
              <div className="text-[10px] text-muted-foreground mb-1 font-mono">Chunk {idx + 1}</div>
              <div className="text-foreground">{segments}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commentary Track
// ---------------------------------------------------------------------------

function CommentaryTrack({
  entries,
  onEntryClick,
}: {
  entries: CommentaryEntry[];
  onEntryClick: (entry: CommentaryEntry) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setAutoScroll(isAtBottom);
  }, []);

  function getIcon(type: CommentaryEntry["type"]): React.ReactNode {
    switch (type) {
      case "chunk": return <FileText className="h-3 w-3 text-muted-foreground shrink-0" />;
      case "entity": return <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />;
      case "relationship": return <Link className="h-3 w-3 text-muted-foreground shrink-0" />;
      case "schema": return <Zap className="h-3 w-3 text-amber-500 shrink-0" />;
      case "event": return <Clock className="h-3 w-3 text-amber-500 shrink-0" />;
      case "deprecation": return <AlertTriangle className="h-3 w-3 text-muted-foreground shrink-0" />;
      case "rejection": return <X className="h-3 w-3 text-destructive shrink-0" />;
      default: return null;
    }
  }

  function getTextColor(type: CommentaryEntry["type"]): string {
    switch (type) {
      case "chunk": return "text-muted-foreground";
      case "entity": return "text-foreground";
      case "relationship": return "text-foreground";
      case "deprecation": return "text-muted-foreground";
      case "schema": return "text-amber-500";
      case "event": return "text-amber-400";
      case "rejection": return "text-destructive";
      default: return "text-foreground";
    }
  }

  return (
    <div className="relative h-[120px] border-t border-border flex flex-col shrink-0" style={{ background: "rgba(11, 16, 20, 0.9)" }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs" onScroll={handleScroll}>
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-muted/20 rounded px-1 transition-colors"
            onClick={() => onEntryClick(entry)}
          >
            {getIcon(entry.type)}
            <span className={`${getTextColor(entry.type)} truncate`}>{entry.text}</span>
          </div>
        ))}
      </div>
      {!autoScroll && (
        <button
          className="absolute bottom-2 right-4 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full"
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }}
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playback Controls
// ---------------------------------------------------------------------------

function PlaybackControls({
  isPlaying,
  speed,
  onPlayPause,
  onSlowMo,
  onFastForward,
  onSpeedCycle,
  onExit,
  isSlowMo,
}: {
  isPlaying: boolean;
  speed: string;
  onPlayPause: () => void;
  onSlowMo: () => void;
  onFastForward: () => void;
  onSpeedCycle: () => void;
  onExit: () => void;
  isSlowMo: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-4 px-4 h-[52px] border-t border-border shrink-0" style={{ background: "#0B1014" }}>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={isSlowMo ? "default" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={onSlowMo}>
              <Turtle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Slow Motion</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full border border-border" onClick={onPlayPause}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onFastForward}>
              <FastForward className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fast Forward</TooltipContent>
        </Tooltip>

        <Badge variant="outline" className="text-xs cursor-pointer select-none" onClick={onSpeedCycle}>
          {speed}
        </Badge>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/50 hidden sm:inline">
          Extraction continues in background
        </span>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onExit}>
          Exit Theatre
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CreationTheatrePage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/app/knowledge-graph/:id/theatre");
  const kbId = params?.id ?? "";

  // Honor ?demo=1 to force placeholder data (useful for UI testing without a real extraction)
  const isDemoMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("demo") === "1";
  }, []);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isSlowMo, setIsSlowMo] = useState(false);
  const [speedMode, setSpeedMode] = useState<"1x" | "0.5x" | "Fast">("1x");
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // Fetch real extraction events from the replay endpoint
  const { data: replayData, isLoading: replayLoading } = useQuery<{
    events: RawExtractionEvent[];
  }>({
    queryKey: ["kg-events-replay", kbId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/knowledge-graph/${kbId}/events/replay`,
      );
      if (!res.ok) return { events: [] };
      const data = await res.json();
      return { events: Array.isArray(data.events) ? data.events : [] };
    },
    enabled: !!kbId && !isDemoMode,
    staleTime: 60_000,
  });

  // Convert events to theatre data, OR fall back to placeholder
  const placeholderData = useMemo(() => {
    if (isDemoMode) return generatePlaceholderData();
    if (!replayData || replayData.events.length === 0) {
      // No real events available — use placeholder so the UI still works
      return generatePlaceholderData();
    }
    return convertEventsToTheatreData(replayData.events);
  }, [isDemoMode, replayData]);

  // Total duration based on the latest event's offset (or placeholder default)
  const totalDuration = useMemo(() => {
    if (placeholderData.entities.length === 0 && placeholderData.commentary.length === 0) {
      return 22000;
    }
    const lastCommentary = placeholderData.commentary[placeholderData.commentary.length - 1];
    const lastEntity = placeholderData.entities[placeholderData.entities.length - 1];
    return Math.max(
      lastCommentary?.timestamp ?? 0,
      lastEntity?.createdAt ?? 0,
      5000,
    ) + 2000;
  }, [placeholderData]);

  const { data: kbInfo } = useQuery<{ name: string }>({
    queryKey: ["/api/knowledge-base", kbId, "theatre-info"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/knowledge-base/${kbId}`);
        if (res.ok) {
          const data = await res.json();
          return { name: data.name || data.filename || "Document" };
        }
      } catch {}
      return { name: "IT Engineer Docs.pdf" };
    },
    enabled: !!kbId,
  });

  const documentName = kbInfo?.name ?? "IT Engineer Docs.pdf";

  // Playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const interval = speedMode === "Fast" ? 50 : speedMode === "0.5x" ? 200 : 100;
    const increment = speedMode === "Fast" ? 500 : speedMode === "0.5x" ? 50 : 100;

    timerRef.current = window.setInterval(() => {
      setCurrentTime((t) => {
        const next = t + increment;
        if (next > totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return next;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speedMode, totalDuration]);

  // Compute visible state based on currentTime
  const visibleEntities: TheatreEntity[] = useMemo(() => {
    return placeholderData.entities
      .filter((e) => e.createdAt <= currentTime)
      .map((e) => {
        const age = currentTime - e.createdAt;
        const scaleProgress = Math.min(age / 300, 1);
        const scale = scaleProgress < 0.5
          ? scaleProgress * 2 * 1.1
          : 1.0 + (1.1 - 1.0) * (1 - (scaleProgress - 0.5) * 2);
        return { ...e, scale: Math.max(scale, 0), opacity: Math.min(age / 200, 1) };
      });
  }, [currentTime, placeholderData.entities]);

  const visibleEdges: TheatreEdge[] = useMemo(() => {
    return placeholderData.edges
      .filter((e) => e.createdAt <= currentTime)
      .map((e) => {
        const age = currentTime - e.createdAt;
        const progress = Math.min(age / 300, 1);
        return { ...e, progress };
      });
  }, [currentTime, placeholderData.edges]);

  const visibleCommentary = useMemo(() => {
    return placeholderData.commentary.filter((c) => c.timestamp <= currentTime);
  }, [currentTime, placeholderData.commentary]);

  const currentChunkIndex = useMemo(() => {
    const latestEntity = [...visibleEntities].sort((a, b) => b.createdAt - a.createdAt)[0];
    return latestEntity?.sourceChunkIndex ?? 0;
  }, [visibleEntities]);

  const discoveredTypes = useMemo(() => {
    return Array.from(new Set(visibleEntities.map((e) => e.type)));
  }, [visibleEntities]);

  const elapsedSeconds = currentTime / 1000;

  const handlePlayPause = useCallback(() => setIsPlaying((v) => !v), []);

  const handleSlowMo = useCallback(() => {
    setIsSlowMo((v) => {
      if (!v) setSpeedMode("0.5x");
      else setSpeedMode("1x");
      return !v;
    });
  }, []);

  const handleFastForward = useCallback(() => {
    setSpeedMode("Fast");
    setIsSlowMo(false);
    setIsPlaying(true);
  }, []);

  const handleSpeedCycle = useCallback(() => {
    setSpeedMode((s) => {
      if (s === "1x") return "0.5x";
      if (s === "0.5x") return "Fast";
      return "1x";
    });
    setIsSlowMo(false);
  }, []);

  const handleExit = useCallback(() => setLocation("/app/knowledge-base"), [setLocation]);

  const handleEntityClick = useCallback((id: string) => {
    setSelectedEntityId((prev) => (prev === id ? null : id));
  }, []);

  const handleCommentaryClick = useCallback((entry: CommentaryEntry) => {
    if (entry.relatedEntityIds && entry.relatedEntityIds.length > 0) {
      setSelectedEntityId(entry.relatedEntityIds[0]);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <DashboardStrip
        documentName={documentName}
        currentChunk={currentChunkIndex + 1}
        totalChunks={placeholderData.chunks.length}
        entityCount={visibleEntities.length}
        relationshipCount={visibleEdges.length}
        elapsedTime={elapsedSeconds}
        discoveredTypes={discoveredTypes}
        onClose={handleExit}
      />

      <div className="flex flex-1 overflow-hidden">
        <Stage
          entities={visibleEntities}
          edges={visibleEdges}
          selectedEntityId={selectedEntityId}
          onEntityClick={handleEntityClick}
        />
        <SourceTextSidebar
          chunks={placeholderData.chunks}
          currentChunkIndex={currentChunkIndex}
          onEntityClick={handleEntityClick}
        />
      </div>

      <CommentaryTrack entries={visibleCommentary} onEntryClick={handleCommentaryClick} />
      <PlaybackControls
        isPlaying={isPlaying}
        speed={speedMode}
        onPlayPause={handlePlayPause}
        onSlowMo={handleSlowMo}
        onFastForward={handleFastForward}
        onSpeedCycle={handleSpeedCycle}
        onExit={handleExit}
        isSlowMo={isSlowMo}
      />
    </div>
  );
}
