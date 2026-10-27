import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Play,
  Loader2,
  FlaskConical,
  Eye,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Target,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvalMetricScore {
  name: string;
  score: number;
}

interface EvalSubMetric {
  name: string;
  score: number;
}

interface EvalMetricDetail {
  axis: string;
  score: number;
  subMetrics: EvalSubMetric[];
  failures: string[];
}

interface EvalRun {
  id: string;
  name: string;
  targetGraph: string;
  targetGraphId: string;
  suite: string;
  overallScore: number;
  status: "running" | "complete" | "failed";
  date: string;
  metrics: EvalMetricScore[];
}

// ---------------------------------------------------------------------------
// Placeholder Data
// ---------------------------------------------------------------------------

const EVAL_COLORS = [
  "hsl(var(--primary))",
  "hsl(113, 44%, 53%)",
  "hsl(75, 80%, 53%)",
  "hsl(220, 80%, 60%)",
  "hsl(340, 70%, 55%)",
];

const AXES = [
  "Extraction Quality",
  "Alignment Accuracy",
  "Freshness",
  "Coverage",
  "Retrieval Performance",
];

const PLACEHOLDER_RUNS: EvalRun[] = [
  {
    id: "run_001",
    name: "IT Docs Full Eval",
    targetGraph: "IT Engineer Docs",
    targetGraphId: "kb_001",
    suite: "Standard v2",
    overallScore: 82,
    status: "complete",
    date: new Date(Date.now() - 2 * 3600000).toISOString(),
    metrics: [
      { name: "Extraction Quality", score: 85 },
      { name: "Alignment Accuracy", score: 78 },
      { name: "Freshness", score: 90 },
      { name: "Coverage", score: 72 },
      { name: "Retrieval Performance", score: 85 },
    ],
  },
  {
    id: "run_002",
    name: "Security Handbook Eval",
    targetGraph: "Security Handbook",
    targetGraphId: "kb_003",
    suite: "Standard v2",
    overallScore: 71,
    status: "complete",
    date: new Date(Date.now() - 24 * 3600000).toISOString(),
    metrics: [
      { name: "Extraction Quality", score: 75 },
      { name: "Alignment Accuracy", score: 68 },
      { name: "Freshness", score: 62 },
      { name: "Coverage", score: 80 },
      { name: "Retrieval Performance", score: 70 },
    ],
  },
  {
    id: "run_003",
    name: "CRM Export Eval",
    targetGraph: "CRM Export",
    targetGraphId: "kb_006",
    suite: "CRM Suite",
    overallScore: 88,
    status: "complete",
    date: new Date(Date.now() - 48 * 3600000).toISOString(),
    metrics: [
      { name: "Extraction Quality", score: 92 },
      { name: "Alignment Accuracy", score: 85 },
      { name: "Freshness", score: 95 },
      { name: "Coverage", score: 78 },
      { name: "Retrieval Performance", score: 90 },
    ],
  },
  {
    id: "run_004",
    name: "Federation Combined Eval",
    targetGraph: "IT Infrastructure Fed",
    targetGraphId: "fed_001",
    suite: "Standard v2",
    overallScore: 0,
    status: "running",
    date: new Date(Date.now() - 600000).toISOString(),
    metrics: [
      { name: "Extraction Quality", score: 0 },
      { name: "Alignment Accuracy", score: 0 },
      { name: "Freshness", score: 0 },
      { name: "Coverage", score: 0 },
      { name: "Retrieval Performance", score: 0 },
    ],
  },
  {
    id: "run_005",
    name: "Compliance Docs Eval",
    targetGraph: "Compliance Docs",
    targetGraphId: "kb_004",
    suite: "Standard v2",
    overallScore: 45,
    status: "failed",
    date: new Date(Date.now() - 72 * 3600000).toISOString(),
    metrics: [
      { name: "Extraction Quality", score: 55 },
      { name: "Alignment Accuracy", score: 40 },
      { name: "Freshness", score: 30 },
      { name: "Coverage", score: 50 },
      { name: "Retrieval Performance", score: 50 },
    ],
  },
];

const PLACEHOLDER_DETAIL: EvalMetricDetail[] = [
  {
    axis: "Extraction Quality",
    score: 85,
    subMetrics: [
      { name: "Entity Precision", score: 88 },
      { name: "Entity Recall", score: 82 },
      { name: "Entity F1", score: 85 },
      { name: "Relationship Precision", score: 87 },
      { name: "Relationship Recall", score: 80 },
      { name: "Relationship F1", score: 83 },
    ],
    failures: [
      "Missed entity: 'Cisco ASA 5506' (expected Infrastructure type)",
      "Incorrect relationship: 'dc01 RUNS_ON VMware' should be 'dc01 HOSTED_BY VMware'",
    ],
  },
  {
    axis: "Alignment Accuracy",
    score: 78,
    subMetrics: [
      { name: "Name Match Accuracy", score: 85 },
      { name: "Type Match Accuracy", score: 80 },
      { name: "Embedding Similarity Correlation", score: 72 },
      { name: "Structural Match Precision", score: 75 },
    ],
    failures: [
      "False positive: 'DNS Server' aligned with 'DNS Record' (different entity types)",
      "Missed alignment: 'Active Directory' and 'AD' from different sources",
    ],
  },
  {
    axis: "Freshness",
    score: 90,
    subMetrics: [
      { name: "Entity Freshness Average", score: 92 },
      { name: "Relationship Freshness Average", score: 88 },
      { name: "Stale Entity Ratio", score: 90 },
    ],
    failures: [
      "12 entities have not been verified in >30 days",
    ],
  },
  {
    axis: "Coverage",
    score: 72,
    subMetrics: [
      { name: "Entity Type Coverage", score: 80 },
      { name: "Relationship Type Coverage", score: 65 },
      { name: "Domain Completeness", score: 70 },
    ],
    failures: [
      "Missing entity types: Router/Switch, Load Balancer",
      "No BACKED_UP_BY relationships found (expected for Infrastructure domain)",
      "Only 3 of 8 expected integration types documented",
    ],
  },
  {
    axis: "Retrieval Performance",
    score: 85,
    subMetrics: [
      { name: "Query Precision@5", score: 88 },
      { name: "Query Recall@10", score: 82 },
      { name: "Traversal Accuracy", score: 85 },
      { name: "NL Query Understanding", score: 84 },
    ],
    failures: [
      "NL query 'what depends on the VPN gateway?' returned only 2 of 5 expected results",
    ],
  },
];

const PLACEHOLDER_TREND_DATA = [
  { date: "Mar 15", "IT Engineer Docs": 68, "Security Handbook": 55, "CRM Export": 72 },
  { date: "Mar 22", "IT Engineer Docs": 72, "Security Handbook": 60, "CRM Export": 78 },
  { date: "Mar 29", "IT Engineer Docs": 75, "Security Handbook": 65, "CRM Export": 82 },
  { date: "Apr 5", "IT Engineer Docs": 79, "Security Handbook": 68, "CRM Export": 85 },
  { date: "Apr 12", "IT Engineer Docs": 82, "Security Handbook": 71, "CRM Export": 88 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-amber-500";
  return "text-destructive";
}

function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-primary/15 text-primary border-primary/30";
  if (score >= 60) return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function statusLabel(status: EvalRun["status"]) {
  switch (status) {
    case "complete":
      return <Badge className="text-xs bg-primary/15 text-primary border-primary/30">Complete</Badge>;
    case "running":
      return <Badge className="text-xs bg-amber-500/15 text-amber-500 border-amber-500/30">Running</Badge>;
    case "failed":
      return <Badge className="text-xs bg-destructive/15 text-destructive border-destructive/30">Failed</Badge>;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Radar Chart (SVG, 5 axes)
// ---------------------------------------------------------------------------

function RadarChart({
  datasets,
  size = 400,
}: {
  datasets: Array<{ label: string; color: string; values: number[] }>;
  size?: number;
}) {
  const center = size / 2;
  const radius = size * 0.35;
  const angleStep = (2 * Math.PI) / 5;
  const axisStartAngle = -Math.PI / 2;

  const toXY = (axisIndex: number, value: number) => {
    const angle = axisStartAngle + axisIndex * angleStep;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const rings = [20, 40, 60, 80, 100];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {rings.map((ringVal) => (
          <polygon
            key={ringVal}
            points={Array.from({ length: 5 }, (_, i) => {
              const p = toXY(i, ringVal);
              return `${p.x},${p.y}`;
            }).join(" ")}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
            opacity={0.4}
          />
        ))}

        {/* Ring labels */}
        {rings.map((ringVal) => {
          const p = toXY(0, ringVal);
          return (
            <text
              key={ringVal}
              x={p.x + 4}
              y={p.y - 2}
              className="fill-muted-foreground"
              fontSize={8}
            >
              {ringVal}
            </text>
          );
        })}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const end = toXY(i, 100);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
              opacity={0.3}
            />
          );
        })}

        {/* Data polygons */}
        {datasets.map((ds, dsIdx) => {
          const points = Array.from({ length: 5 }, (_, i) => {
            const p = toXY(i, ds.values[i] || 0);
            return `${p.x},${p.y}`;
          }).join(" ");

          return (
            <g key={dsIdx}>
              <polygon
                points={points}
                fill={ds.color}
                fillOpacity={0.1}
                stroke={ds.color}
                strokeWidth={2}
                strokeOpacity={0.8}
              />
              {Array.from({ length: 5 }, (_, i) => {
                const p = toXY(i, ds.values[i] || 0);
                return (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill={ds.color} />
                );
              })}
            </g>
          );
        })}

        {/* Axis labels */}
        {AXES.map((label, i) => {
          const labelRadius = radius + 30;
          const angle = axisStartAngle + i * angleStep;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={11}
              fontWeight={500}
            >
              {label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
        {datasets.map((ds, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ds.color }} />
            <span className="text-xs text-muted-foreground">{ds.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend Line Chart (SVG)
// ---------------------------------------------------------------------------

function TrendChart({
  data,
  width = 700,
  height = 200,
}: {
  data: Array<Record<string, string | number>>;
  width?: number;
  height?: number;
}) {
  const graphs = Object.keys(data[0] || {}).filter((k) => k !== "date");
  const padding = { top: 10, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = data.flatMap((d) => graphs.map((g) => Number(d[g])));
  const maxVal = Math.max(...allValues, 100);
  const minVal = Math.min(...allValues, 0);

  const xScale = (i: number) => padding.left + (i / (data.length - 1 || 1)) * chartW;
  const yScale = (v: number) =>
    padding.top + chartH - ((v - minVal) / (maxVal - minVal || 1)) * chartH;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line
            x1={padding.left}
            y1={yScale(v)}
            x2={width - padding.right}
            y2={yScale(v)}
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
            opacity={0.3}
          />
          <text
            x={padding.left - 8}
            y={yScale(v)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize={10}
          >
            {v}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {data.map((d, i) => (
        <text
          key={i}
          x={xScale(i)}
          y={height - 8}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={10}
        >
          {String(d.date)}
        </text>
      ))}

      {/* Lines */}
      {graphs.map((graph, gIdx) => {
        const path = data
          .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(Number(d[graph]))}`)
          .join(" ");
        const color = EVAL_COLORS[gIdx % EVAL_COLORS.length];

        return (
          <g key={graph}>
            <path d={path} fill="none" stroke={color} strokeWidth={2} />
            {data.map((d, i) => (
              <circle
                key={i}
                cx={xScale(i)}
                cy={yScale(Number(d[graph]))}
                r={3}
                fill={color}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Eval Detail View
// ---------------------------------------------------------------------------

function EvalDetailView({
  run,
  onBack,
}: {
  run: EvalRun;
  onBack: () => void;
}) {
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const { data: metricDetails = PLACEHOLDER_DETAIL } = useQuery<EvalMetricDetail[]>({
    queryKey: ["/api/eval-harness/runs", run.id, "detail"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/eval-harness/runs/${run.id}/detail`);
        return await res.json();
      } catch {
        return PLACEHOLDER_DETAIL;
      }
    },
  });

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Button>
      </div>

      {/* Run header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">{run.name}</h2>
            {statusLabel(run.status)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Target: {run.targetGraph} | Suite: {run.suite} | {formatDate(run.date)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Overall Score</p>
          <p className={`text-3xl font-bold ${scoreColor(run.overallScore)}`}>
            {run.overallScore}
          </p>
        </div>
      </div>

      {/* Mini radar for this run */}
      <Card className="p-6 flex justify-center">
        <RadarChart
          datasets={[
            {
              label: run.name,
              color: EVAL_COLORS[0],
              values: run.metrics.map((m) => m.score),
            },
          ]}
          size={300}
        />
      </Card>

      {/* Per-metric breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Per-Metric Breakdown</h3>
        {metricDetails.map((detail) => {
          const isExpanded = expandedMetric === detail.axis;
          return (
            <Card key={detail.axis} className="overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedMetric(isExpanded ? null : detail.axis)}
              >
                <div className="flex items-center gap-3">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">{detail.axis}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={`text-xs ${scoreBgColor(detail.score)}`}>{detail.score}</Badge>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4 border-t border-border pt-4 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
                  {/* Sub-metrics bars */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Sub-Metrics</p>
                    {detail.subMetrics.map((sm) => (
                      <div key={sm.name} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-foreground">{sm.name}</span>
                          <span className={`text-xs font-mono ${scoreColor(sm.score)}`}>
                            {sm.score}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              sm.score >= 80
                                ? "bg-primary"
                                : sm.score >= 60
                                  ? "bg-amber-500"
                                  : "bg-destructive"
                            }`}
                            style={{ width: `${sm.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Failures list */}
                  {detail.failures.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-destructive">Specific Failures</p>
                      {detail.failures.map((f, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-xs text-muted-foreground bg-destructive/5 rounded-md p-2"
                        >
                          <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EvalDashboardPage() {
  const [selectedRun, setSelectedRun] = useState<EvalRun | null>(null);

  const { data: runs = PLACEHOLDER_RUNS, isLoading } = useQuery<EvalRun[]>({
    queryKey: ["/api/eval-harness/runs"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/eval-harness/runs");
        return await res.json();
      } catch {
        return PLACEHOLDER_RUNS;
      }
    },
  });

  const completedRuns = useMemo(
    () => runs.filter((r) => r.status === "complete"),
    [runs],
  );

  const radarDatasets = useMemo(
    () =>
      completedRuns.slice(0, 5).map((run, idx) => ({
        label: run.targetGraph,
        color: EVAL_COLORS[idx % EVAL_COLORS.length],
        values: run.metrics.map((m) => m.score),
      })),
    [completedRuns],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedRun) {
    return (
      <EvalDetailView run={selectedRun} onBack={() => setSelectedRun(null)} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Eval Harness</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Run evaluation suites against knowledge graphs to measure extraction quality, alignment
            accuracy, freshness, coverage, and retrieval performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            New Eval Suite
          </Button>
          <Button>
            <Play className="h-4 w-4 mr-2" />
            New Eval Run
          </Button>
        </div>
      </div>

      {/* Hero Radar Chart */}
      {completedRuns.length > 0 && (
        <Card className="p-6 flex justify-center">
          <RadarChart datasets={radarDatasets} size={380} />
        </Card>
      )}

      {/* Empty state */}
      {completedRuns.length === 0 && (
        <Card className="p-12 text-center">
          <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No eval runs yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Create an evaluation suite and run it against a knowledge graph to see quality metrics
            visualized as a radar chart.
          </p>
          <Button>
            <Play className="h-4 w-4 mr-2" />
            Run Your First Evaluation
          </Button>
        </Card>
      )}

      {/* Recent Runs Table */}
      {runs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Runs</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run Name</TableHead>
                  <TableHead>Target Graph</TableHead>
                  <TableHead>Suite</TableHead>
                  <TableHead>Overall Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} className="cursor-pointer hover:bg-muted/30">
                    <TableCell className="font-medium">{run.name}</TableCell>
                    <TableCell>
                      <span className="text-sm text-primary">{run.targetGraph}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{run.suite}</Badge>
                    </TableCell>
                    <TableCell>
                      {run.status === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                      ) : (
                        <span className={`font-bold ${scoreColor(run.overallScore)}`}>
                          {run.overallScore}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{statusLabel(run.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(run.date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setSelectedRun(run)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View Detail</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Re-run</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Trend Lines */}
      {completedRuns.length > 1 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Quality Trends</h2>
          <Card className="p-6">
            <TrendChart data={PLACEHOLDER_TREND_DATA} />
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
              {Object.keys(PLACEHOLDER_TREND_DATA[0] || {})
                .filter((k) => k !== "date")
                .map((graph, idx) => (
                  <div key={graph} className="flex items-center gap-1.5">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: EVAL_COLORS[idx % EVAL_COLORS.length] }}
                    />
                    <span className="text-xs text-muted-foreground">{graph}</span>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
