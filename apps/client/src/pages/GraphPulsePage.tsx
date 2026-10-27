import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Diamond,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  Filter,
  ArrowDown,
  Bot,
  Zap,
  TrendingUp,
  BarChart3,
  Hash,
  ShieldCheck,
  Database,
  RadioTower,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventStatus = "pending" | "approved" | "rejected" | "auto_approved";

interface LearningEvent {
  id: string;
  agentId: string;
  agentName: string;
  agentStatus: "running" | "paused" | "stopped";
  contextType: "ticket" | "call" | "task";
  contextId: string;
  contextLabel: string;
  learnedEntities: Array<{
    name: string;
    type: string;
  }>;
  learnedRelationships: Array<{
    source: string;
    relationship: string;
    target: string;
  }>;
  evidenceText: string;
  confidence: number;
  status: EventStatus;
  approvedBy?: string;
  rejectedReason?: string;
  createdAt: string;
}

interface AgentBreakdown {
  agentId: string;
  agentName: string;
  eventCount: number;
}

interface EntityTypeRank {
  type: string;
  count: number;
}

interface AggregateStats {
  velocityPerHour: number[];
  agentBreakdown: AgentBreakdown[];
  topEntityTypes: EntityTypeRank[];
  approvalRate: number;
  totalEntities: number;
  totalRelationships: number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_EVENTS: LearningEvent[] = [
  {
    id: "evt_001",
    agentId: "claw_07",
    agentName: "NemoClaw-07",
    agentStatus: "running",
    contextType: "ticket",
    contextId: "TKT-4218",
    contextLabel: "Ticket #4218",
    learnedEntities: [
      { name: "DNS Service", type: "Service" },
      { name: "Google Workspace Sync", type: "Config" },
    ],
    learnedRelationships: [
      { source: "DNS Service", relationship: "DEPENDS_ON", target: "Google Workspace Sync" },
    ],
    evidenceText:
      "Restarting DNS on dc01 resolved sync failures 3 times in the past week",
    confidence: 0.85,
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_002",
    agentId: "claw_03",
    agentName: "AtlasClaw-03",
    agentStatus: "running",
    contextType: "call",
    contextId: "CALL-9912",
    contextLabel: "Call #9912",
    learnedEntities: [
      { name: "Okta SSO", type: "Service" },
      { name: "Salesforce CRM", type: "Application" },
    ],
    learnedRelationships: [
      { source: "Okta SSO", relationship: "AUTHENTICATES", target: "Salesforce CRM" },
    ],
    evidenceText:
      "Customer confirmed that all Salesforce logins route through Okta SSO since the Q3 migration.",
    confidence: 0.92,
    status: "auto_approved",
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_003",
    agentId: "claw_12",
    agentName: "SentinelClaw-12",
    agentStatus: "paused",
    contextType: "task",
    contextId: "TSK-331",
    contextLabel: "Task #331",
    learnedEntities: [
      { name: "Backup Server B2", type: "Infrastructure" },
    ],
    learnedRelationships: [
      { source: "dc01", relationship: "BACKED_UP_BY", target: "Backup Server B2" },
    ],
    evidenceText:
      "Nightly backup logs show dc01 data replicated to B2 storage bucket every 6 hours.",
    confidence: 0.67,
    status: "pending",
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_004",
    agentId: "claw_07",
    agentName: "NemoClaw-07",
    agentStatus: "running",
    contextType: "ticket",
    contextId: "TKT-4190",
    contextLabel: "Ticket #4190",
    learnedEntities: [
      { name: "VPN Gateway", type: "Infrastructure" },
      { name: "Firewall Rule Set v3", type: "Policy" },
    ],
    learnedRelationships: [
      { source: "VPN Gateway", relationship: "GOVERNED_BY", target: "Firewall Rule Set v3" },
    ],
    evidenceText:
      "The VPN gateway outage was caused by firewall rule set v3 blocking port 443 for remote workers.",
    confidence: 0.78,
    status: "approved",
    approvedBy: "admin@wtrdb.io",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_005",
    agentId: "claw_03",
    agentName: "AtlasClaw-03",
    agentStatus: "running",
    contextType: "call",
    contextId: "CALL-9905",
    contextLabel: "Call #9905",
    learnedEntities: [
      { name: "Slack Webhook", type: "Integration" },
    ],
    learnedRelationships: [
      { source: "Slack Webhook", relationship: "TRIGGERS", target: "PagerDuty Alert" },
    ],
    evidenceText:
      "Agent was told Slack webhooks trigger PagerDuty alerts for P1 incidents.",
    confidence: 0.41,
    status: "rejected",
    rejectedReason: "Low confidence - unverifiable claim from single source",
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: "evt_006",
    agentId: "claw_12",
    agentName: "SentinelClaw-12",
    agentStatus: "paused",
    contextType: "ticket",
    contextId: "TKT-4200",
    contextLabel: "Ticket #4200",
    learnedEntities: [
      { name: "Load Balancer LB-01", type: "Infrastructure" },
      { name: "Web Server Cluster", type: "Service" },
    ],
    learnedRelationships: [
      { source: "Load Balancer LB-01", relationship: "DISTRIBUTES_TO", target: "Web Server Cluster" },
    ],
    evidenceText:
      "LB-01 is the primary load balancer distributing traffic across the web server cluster, confirmed by network topology audit.",
    confidence: 0.91,
    status: "auto_approved",
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
];

const PLACEHOLDER_STATS: AggregateStats = {
  velocityPerHour: [3, 5, 2, 8, 12, 7, 4, 6, 9, 11, 5, 3, 7, 8, 6, 4, 10, 13, 8, 5, 4, 6, 7, 9],
  agentBreakdown: [
    { agentId: "claw_07", agentName: "NemoClaw-07", eventCount: 47 },
    { agentId: "claw_03", agentName: "AtlasClaw-03", eventCount: 35 },
    { agentId: "claw_12", agentName: "SentinelClaw-12", eventCount: 22 },
    { agentId: "claw_01", agentName: "PrimeClaw-01", eventCount: 14 },
  ],
  topEntityTypes: [
    { type: "Service", count: 89 },
    { type: "Infrastructure", count: 67 },
    { type: "Config", count: 45 },
    { type: "Application", count: 38 },
    { type: "Policy", count: 21 },
    { type: "Integration", count: 15 },
  ],
  approvalRate: 73,
  totalEntities: 412,
  totalRelationships: 687,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceColor(score: number): string {
  if (score >= 0.7) return "text-primary";
  if (score >= 0.4) return "text-amber-500";
  return "text-destructive";
}

function confidenceBarColor(score: number): string {
  if (score >= 0.7) return "bg-primary";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-destructive";
}

function statusBadge(status: EventStatus) {
  switch (status) {
    case "pending":
      return (
        <Badge className="gap-1 text-xs bg-amber-500/15 text-amber-500 border-amber-500/30">
          <Clock className="h-3 w-3" />
          Pending Review
        </Badge>
      );
    case "approved":
      return (
        <Badge className="gap-1 text-xs bg-primary/15 text-primary border-primary/30">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="gap-1 text-xs bg-destructive/15 text-destructive border-destructive/30">
          <XCircle className="h-3 w-3" />
          Rejected
        </Badge>
      );
    case "auto_approved":
      return (
        <Badge className="gap-1 text-xs bg-primary/15 text-primary border-primary/30">
          <CheckCircle2 className="h-3 w-3" />
          Auto-Approved
        </Badge>
      );
  }
}

function agentStatusColor(status: string): string {
  switch (status) {
    case "running":
      return "text-primary";
    case "paused":
      return "text-amber-500";
    case "stopped":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

function timeAgo(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Sparkline SVG component
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  width = 200,
  height = 40,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1 || 1);

  const points = data.map((v, i) => ({
    x: i * step,
    y: height - (v / max) * (height - 4) - 2,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <defs>
        <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Event Card
// ---------------------------------------------------------------------------

function EventCard({
  event,
  onApprove,
  onReject,
  isActioning,
}: {
  event: LearningEvent;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  isActioning: boolean;
}) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  return (
    <>
      <Card className="overflow-hidden border border-border hover:border-primary/30 transition-all duration-200 animate-in slide-in-from-top-2 fade-in">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20">
          <Diamond className={`h-3.5 w-3.5 ${agentStatusColor(event.agentStatus)}`} />
          <span className="text-sm font-semibold text-foreground">{event.agentName}</span>
          <span className="text-xs text-muted-foreground">{timeAgo(event.createdAt)}</span>
          <span className="text-xs text-muted-foreground">
            {event.contextLabel}
          </span>
          <div className="flex-1" />
          {statusBadge(event.status)}
        </div>

        <div className="p-4 space-y-3">
          {/* Learned entities and relationships */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Learned:</p>
            {event.learnedRelationships.map((rel, idx) => (
              <div key={idx} className="flex items-center gap-1.5 flex-wrap text-sm">
                <Badge variant="outline" className="text-xs font-mono">
                  {rel.source}
                </Badge>
                <span className="text-xs text-primary font-medium">
                  {"--[" + rel.relationship + "]-->"}
                </span>
                <Badge variant="outline" className="text-xs font-mono">
                  {rel.target}
                </Badge>
              </div>
            ))}
            {event.learnedEntities.length > 0 && event.learnedRelationships.length === 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {event.learnedEntities.map((ent, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {ent.name} <span className="text-muted-foreground ml-1">({ent.type})</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Evidence blockquote */}
          <blockquote className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic">
            "{event.evidenceText}"
          </blockquote>

          {/* Confidence bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20">Confidence:</span>
            <div className="flex-1 max-w-[200px]">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${confidenceBarColor(event.confidence)}`}
                  style={{ width: `${event.confidence * 100}%` }}
                />
              </div>
            </div>
            <span className={`text-xs font-mono font-semibold ${confidenceColor(event.confidence)}`}>
              {event.confidence.toFixed(2)}
            </span>
          </div>

          {/* Rejection reason */}
          {event.status === "rejected" && event.rejectedReason && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 rounded-md p-2">
              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{event.rejectedReason}</span>
            </div>
          )}

          {/* Approved by */}
          {event.status === "approved" && event.approvedBy && (
            <div className="text-xs text-muted-foreground">
              Approved by {event.approvedBy}
            </div>
          )}

          {/* Action buttons */}
          {event.status === "pending" && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="default"
                className="text-xs gap-1"
                onClick={() => onApprove(event.id)}
                disabled={isActioning}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                onClick={() => setRejectDialogOpen(true)}
                disabled={isActioning}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs gap-1 text-destructive hover:text-destructive"
                onClick={() => setRejectDialogOpen(true)}
                disabled={isActioning}
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reject Observation</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this learning event from {event.agentName}.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onReject(event.id, rejectReason);
                setRejectDialogOpen(false);
                setRejectReason("");
              }}
              disabled={!rejectReason.trim()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Aggregate Stats Panel
// ---------------------------------------------------------------------------

function StatsPanel({ stats }: { stats: AggregateStats }) {
  const maxAgentCount = Math.max(...stats.agentBreakdown.map((a) => a.eventCount), 1);

  return (
    <div className="space-y-5">
      {/* Learning Velocity */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Learning Velocity</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Events per hour (last 24h)</p>
        <Sparkline data={stats.velocityPerHour} width={280} height={48} />
        <p className="text-xs text-muted-foreground mt-2">
          Avg: {(stats.velocityPerHour.reduce((a, b) => a + b, 0) / stats.velocityPerHour.length).toFixed(1)} events/hr
        </p>
      </Card>

      {/* Per-Agent Breakdown */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Per-Agent Breakdown</h3>
        </div>
        <div className="space-y-2.5">
          {stats.agentBreakdown.map((agent) => (
            <div key={agent.agentId}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-foreground">{agent.agentName}</span>
                <span className="text-xs font-mono text-muted-foreground">{agent.eventCount}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(agent.eventCount / maxAgentCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top Entity Types */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Hash className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Top Entity Types</h3>
        </div>
        <div className="space-y-1.5">
          {stats.topEntityTypes.map((et, idx) => (
            <div key={et.type} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                <span className="text-xs text-foreground">{et.type}</span>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {et.count}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Approval Rate */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Approval Rate</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16">
            <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeDasharray={`${stats.approvalRate}, 100`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-foreground">{stats.approvalRate}%</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>Observations approved vs. rejected over time</p>
          </div>
        </div>
      </Card>

      {/* Experience Graph Size */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Experience Graph Size</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Entities</p>
            <p className="text-xl font-bold text-foreground">{stats.totalEntities.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Relationships</p>
            <p className="text-xl font-bold text-foreground">{stats.totalRelationships.toLocaleString()}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters Bar
// ---------------------------------------------------------------------------

interface Filters {
  agent: string;
  status: string;
  confidenceRange: [number, number];
  timeRange: string;
  contextType: string;
}

function FiltersBar({
  filters,
  onFiltersChange,
  agents,
}: {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  agents: AgentBreakdown[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search events..." className="pl-9" />
        </div>

        <Select
          value={filters.status}
          onValueChange={(v) => onFiltersChange({ ...filters, status: v })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="auto_approved">Auto-Approved</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.timeRange}
          onValueChange={(v) => onFiltersChange({ ...filters, timeRange: v })}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last Hour</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setExpanded(!expanded)}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {expanded && (
        <Card className="p-4 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Agent filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Agent</label>
              <Select
                value={filters.agent}
                onValueChange={(v) => onFiltersChange({ ...filters, agent: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.agentId} value={a.agentId}>
                      {a.agentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Context type filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Context Type</label>
              <Select
                value={filters.contextType}
                onValueChange={(v) => onFiltersChange({ ...filters, contextType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="ticket">Ticket</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Confidence range */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Confidence Range: {filters.confidenceRange[0].toFixed(1)} - {filters.confidenceRange[1].toFixed(1)}
              </label>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[filters.confidenceRange[0] * 100, filters.confidenceRange[1] * 100]}
                onValueChange={([lo, hi]) =>
                  onFiltersChange({ ...filters, confidenceRange: [lo / 100, hi / 100] })
                }
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GraphPulsePage() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>({
    agent: "all",
    status: "all",
    confidenceRange: [0, 1],
    timeRange: "all",
    contextType: "all",
  });

  // Fetch events from API (with placeholder fallback)
  const { data: events = PLACEHOLDER_EVENTS, isLoading: eventsLoading } = useQuery<LearningEvent[]>({
    queryKey: ["/api/graph-pulse/events", filters],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/graph-pulse/events");
        return await res.json();
      } catch {
        return PLACEHOLDER_EVENTS;
      }
    },
  });

  // Fetch aggregate stats (with placeholder fallback)
  const { data: stats = PLACEHOLDER_STATS } = useQuery<AggregateStats>({
    queryKey: ["/api/graph-pulse/stats"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/graph-pulse/stats");
        return await res.json();
      } catch {
        return PLACEHOLDER_STATS;
      }
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (eventId: string) => {
      try {
        await apiRequest("POST", `/api/graph-pulse/events/${eventId}/approve`);
      } catch {
        // Fallback: just update locally
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/graph-pulse/events"] });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ eventId, reason }: { eventId: string; reason: string }) => {
      try {
        await apiRequest("POST", `/api/graph-pulse/events/${eventId}/reject`, { reason });
      } catch {
        // Fallback: just update locally
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/graph-pulse/events"] });
    },
  });

  // Apply filters
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filters.agent !== "all" && e.agentId !== filters.agent) return false;
      if (filters.status !== "all" && e.status !== filters.status) return false;
      if (filters.contextType !== "all" && e.contextType !== filters.contextType) return false;
      if (e.confidence < filters.confidenceRange[0] || e.confidence > filters.confidenceRange[1])
        return false;

      if (filters.timeRange !== "all") {
        const now = new Date();
        const eventTime = new Date(e.createdAt);
        const diffMs = now.getTime() - eventTime.getTime();
        if (filters.timeRange === "1h" && diffMs > 3600000) return false;
        if (filters.timeRange === "today" && diffMs > 86400000) return false;
        if (filters.timeRange === "week" && diffMs > 604800000) return false;
      }

      return true;
    });
  }, [events, filters]);

  if (eventsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Graph Pulse</h1>
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time feed of agent learning events. Approve, edit, or reject observations before
            they commit to experience graphs.
          </p>
        </div>
      </div>

      {/* Filters */}
      <FiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        agents={stats.agentBreakdown}
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Event Feed (left, ~65%) */}
        <div className="space-y-4">
          {filteredEvents.length === 0 ? (
            <Card className="p-12 text-center">
              <RadioTower className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No learning events match the current filters.
              </p>
            </Card>
          ) : (
            filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id, reason) => rejectMutation.mutate({ eventId: id, reason })}
                isActioning={approveMutation.isPending || rejectMutation.isPending}
              />
            ))
          )}
        </div>

        {/* Stats Panel (right, ~35%) */}
        <div className="hidden lg:block">
          <StatsPanel stats={stats} />
        </div>
      </div>

      {/* Stats for mobile (shown below feed) */}
      <div className="lg:hidden">
        <StatsPanel stats={stats} />
      </div>
    </div>
  );
}
