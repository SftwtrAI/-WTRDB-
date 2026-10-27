import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  Loader2,
  BrainCircuit,
  Globe,
  Key,
  Copy,
  RefreshCw,
  Clock,
  Shield,
  Send,
  Code,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EndpointStatus = "active" | "expired" | "rate_limited";

interface BrainEndpoint {
  id: string;
  name: string;
  url: string;
  sourceGraph: string;
  sourceGraphId: string;
  status: EndpointStatus;
  queryCount24h: number;
  createdAt: string;
  expiresAt: string;
  apiKey: string;
  rateLimit: number;
  allowNLQueries: boolean;
  ipWhitelist: string[];
  exposedEntityTypes: string[];
  exposedRelationshipTypes: string[];
  avgLatencyMs: number;
  errorRate: number;
}

interface QueryResult {
  status: number;
  data: unknown;
  latency: number;
}

// ---------------------------------------------------------------------------
// Placeholder Data
// ---------------------------------------------------------------------------

const PLACEHOLDER_ENDPOINTS: BrainEndpoint[] = [
  {
    id: "ep_001",
    name: "IT Infrastructure API",
    url: "https://brain.wtrdb.io/v1/it-infra",
    sourceGraph: "IT Engineer Docs",
    sourceGraphId: "kb_001",
    status: "active",
    queryCount24h: 1247,
    createdAt: "2026-03-15T10:00:00Z",
    expiresAt: "2026-06-15T10:00:00Z",
    apiKey: "wt_brain_sk_7f3a2b1c9d8e4f5a6b7c8d9e0f1a2b3c",
    rateLimit: 100,
    allowNLQueries: true,
    ipWhitelist: ["10.0.0.0/8", "192.168.1.0/24"],
    exposedEntityTypes: ["Service", "Infrastructure", "Config", "Application"],
    exposedRelationshipTypes: ["DEPENDS_ON", "RUNS_ON", "CONNECTS_TO", "BACKED_UP_BY"],
    avgLatencyMs: 45,
    errorRate: 0.8,
  },
  {
    id: "ep_002",
    name: "CRM Knowledge API",
    url: "https://brain.wtrdb.io/v1/crm-knowledge",
    sourceGraph: "CRM Export",
    sourceGraphId: "kb_006",
    status: "active",
    queryCount24h: 532,
    createdAt: "2026-03-20T14:00:00Z",
    expiresAt: "2026-09-20T14:00:00Z",
    apiKey: "wt_brain_sk_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
    rateLimit: 50,
    allowNLQueries: true,
    ipWhitelist: [],
    exposedEntityTypes: ["Contact", "Company", "Deal", "Product"],
    exposedRelationshipTypes: ["WORKS_AT", "PURCHASED", "INTERESTED_IN", "MANAGES"],
    avgLatencyMs: 38,
    errorRate: 0.3,
  },
  {
    id: "ep_003",
    name: "Security Compliance API",
    url: "https://brain.wtrdb.io/v1/security-compliance",
    sourceGraph: "Security Handbook",
    sourceGraphId: "kb_003",
    status: "expired",
    queryCount24h: 0,
    createdAt: "2026-01-10T09:00:00Z",
    expiresAt: "2026-03-10T09:00:00Z",
    apiKey: "wt_brain_sk_expired_key_placeholder_here",
    rateLimit: 30,
    allowNLQueries: false,
    ipWhitelist: ["10.0.0.0/8"],
    exposedEntityTypes: ["Policy", "Control", "Vulnerability", "Compliance"],
    exposedRelationshipTypes: ["GOVERNS", "MITIGATES", "REQUIRES", "AUDITS"],
    avgLatencyMs: 0,
    errorRate: 0,
  },
  {
    id: "ep_004",
    name: "Federated IT API",
    url: "https://brain.wtrdb.io/v1/fed-it",
    sourceGraph: "IT Infrastructure Fed",
    sourceGraphId: "fed_001",
    status: "rate_limited",
    queryCount24h: 5000,
    createdAt: "2026-03-25T11:00:00Z",
    expiresAt: "2026-06-25T11:00:00Z",
    apiKey: "wt_brain_sk_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
    rateLimit: 200,
    allowNLQueries: true,
    ipWhitelist: [],
    exposedEntityTypes: ["Service", "Infrastructure", "Config", "Application", "Policy", "Integration"],
    exposedRelationshipTypes: ["DEPENDS_ON", "RUNS_ON", "CONNECTS_TO", "BACKED_UP_BY", "GOVERNS", "AUTHENTICATES"],
    avgLatencyMs: 72,
    errorRate: 4.2,
  },
];

const PLACEHOLDER_USAGE_DATA = [
  { hour: "00:00", requests: 45 },
  { hour: "04:00", requests: 12 },
  { hour: "08:00", requests: 120 },
  { hour: "12:00", requests: 210 },
  { hour: "16:00", requests: 185 },
  { hour: "20:00", requests: 95 },
  { hour: "23:59", requests: 60 },
];

const PLACEHOLDER_TOP_ENTITIES = [
  { entity: "dc01", queries: 342 },
  { entity: "Okta SSO", queries: 215 },
  { entity: "VPN Gateway", queries: 189 },
  { entity: "Salesforce CRM", queries: 156 },
  { entity: "DNS Service", queries: 134 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: EndpointStatus) {
  switch (status) {
    case "active":
      return (
        <Badge className="gap-1 text-xs bg-primary/15 text-primary border-primary/30">
          <CheckCircle2 className="h-3 w-3" />
          Active
        </Badge>
      );
    case "expired":
      return (
        <Badge className="gap-1 text-xs bg-muted text-muted-foreground border-border">
          <Clock className="h-3 w-3" />
          Expired
        </Badge>
      );
    case "rate_limited":
      return (
        <Badge className="gap-1 text-xs bg-amber-500/15 text-amber-500 border-amber-500/30">
          <AlertTriangle className="h-3 w-3" />
          Rate Limited
        </Badge>
      );
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Mini Bar Chart SVG
// ---------------------------------------------------------------------------

function MiniBarChart({
  data,
  width = 280,
  height = 120,
  barColor = "hsl(var(--primary))",
}: {
  data: Array<{ label: string; value: number }>;
  width?: number;
  height?: number;
  barColor?: string;
}) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barWidth = (width - 40) / data.length - 4;
  const chartHeight = height - 30;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * chartHeight;
        const x = 40 + i * (barWidth + 4);
        const y = chartHeight - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} rx={2} fill={barColor} opacity={0.8} />
            <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>
              {d.label}
            </text>
            <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Usage Line Chart SVG
// ---------------------------------------------------------------------------

function UsageLineChart({
  data,
  width = 400,
  height = 140,
}: {
  data: Array<{ hour: string; requests: number }>;
  width?: number;
  height?: number;
}) {
  const padding = { top: 10, right: 10, bottom: 25, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map((d) => d.requests), 1);

  const xScale = (i: number) => padding.left + (i / (data.length - 1 || 1)) * chartW;
  const yScale = (v: number) => padding.top + chartH - (v / maxVal) * chartH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(d.requests)}`)
    .join(" ");

  const areaPath = `${linePath} L ${xScale(data.length - 1)} ${padding.top + chartH} L ${padding.left} ${padding.top + chartH} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const val = Math.round(maxVal * frac);
        const y = yScale(val);
        return (
          <g key={frac}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.3} />
            <text x={padding.left - 6} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={9}>
              {val}
            </text>
          </g>
        );
      })}

      {/* Area */}
      <defs>
        <linearGradient id="usageGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#usageGrad)" />
      <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />

      {/* Points */}
      {data.map((d, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(d.requests)} r={3} fill="hsl(var(--primary))" />
      ))}

      {/* X labels */}
      {data.map((d, i) => (
        <text key={i} x={xScale(i)} y={height - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>
          {d.hour}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Endpoint Card
// ---------------------------------------------------------------------------

function EndpointCard({
  endpoint,
  onClick,
}: {
  endpoint: BrainEndpoint;
  onClick: () => void;
}) {
  return (
    <Card
      className="group relative overflow-hidden border border-border hover:border-primary/40 transition-all duration-200 cursor-pointer bg-card"
      onClick={onClick}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-secondary to-lime opacity-60 group-hover:opacity-100 transition-opacity" />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-sm font-semibold text-foreground truncate">{endpoint.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{endpoint.url}</p>
          </div>
          {statusBadge(endpoint.status)}
        </div>

        {/* Source graph */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          <span>Source: <span className="text-primary">{endpoint.sourceGraph}</span></span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Queries (24h)</p>
            <p className="text-lg font-bold text-foreground">{endpoint.queryCount24h.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Latency</p>
            <p className="text-lg font-bold text-foreground">{endpoint.avgLatencyMs}ms</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Created {formatDate(endpoint.createdAt)}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Expires {formatDate(endpoint.expiresAt)}
            <ChevronRight className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Endpoint Detail Sheet
// ---------------------------------------------------------------------------

function EndpointDetailSheet({
  endpoint,
  open,
  onOpenChange,
}: {
  endpoint: BrainEndpoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [testMode, setTestMode] = useState<string>("entity_search");
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<QueryResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  if (!endpoint) return null;

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(endpoint.apiKey);
    } catch {
      // Fallback for non-HTTPS
    }
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleTestSend = () => {
    setTestLoading(true);
    setTimeout(() => {
      setTestResult({
        status: 200,
        data: {
          results: [
            {
              entity: testInput || "dc01",
              type: "Infrastructure",
              properties: { ip: "10.0.1.5", os: "Windows Server 2022" },
              relationships: [
                { type: "DEPENDS_ON", target: "DNS Service" },
                { type: "BACKED_UP_BY", target: "Backup Server B2" },
              ],
            },
          ],
          meta: {
            queryTime: "23ms",
            resultCount: 1,
            graphVersion: "2026-04-02T18:30:00Z",
          },
        },
        latency: 23,
      });
      setTestLoading(false);
    }, 800);
  };

  const maskedKey = endpoint.apiKey.slice(0, 14) + "..." + endpoint.apiKey.slice(-8);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            {endpoint.name}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {endpoint.url}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Tabs defaultValue="config">
            <TabsList className="w-full">
              <TabsTrigger value="config" className="flex-1 gap-1">
                <Shield className="h-3.5 w-3.5" />
                Config
              </TabsTrigger>
              <TabsTrigger value="test" className="flex-1 gap-1">
                <Code className="h-3.5 w-3.5" />
                Test Console
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex-1 gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                Analytics
              </TabsTrigger>
            </TabsList>

            {/* Configuration Tab */}
            <TabsContent value="config" className="mt-4 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Status</span>
                {statusBadge(endpoint.status)}
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label className="text-xs">API Key</Label>
                <div className="flex items-center gap-2">
                  <Input value={maskedKey} readOnly className="font-mono text-xs" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={handleCopyKey}>
                        {copiedKey ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copiedKey ? "Copied!" : "Copy API Key"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="shrink-0">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Regenerate Key</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Rate Limit */}
              <div className="space-y-2">
                <Label className="text-xs">Rate Limit (requests/minute)</Label>
                <Input type="number" value={endpoint.rateLimit} className="max-w-[200px]" readOnly />
              </div>

              {/* NL Queries Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Natural Language Queries</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Allow consumers to send free-text questions</p>
                </div>
                <Switch checked={endpoint.allowNLQueries} />
              </div>

              {/* Exposed Entity Types */}
              <div className="space-y-2">
                <Label className="text-xs">Exposed Entity Types</Label>
                <div className="flex flex-wrap gap-2">
                  {endpoint.exposedEntityTypes.map((type) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <Checkbox checked={true} />
                      <span className="text-xs text-foreground">{type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exposed Relationship Types */}
              <div className="space-y-2">
                <Label className="text-xs">Exposed Relationship Types</Label>
                <div className="flex flex-wrap gap-2">
                  {endpoint.exposedRelationshipTypes.map((type) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <Checkbox checked={true} />
                      <span className="text-xs text-foreground">{type}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* IP Whitelist */}
              <div className="space-y-2">
                <Label className="text-xs">IP Whitelist</Label>
                {endpoint.ipWhitelist.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {endpoint.ipWhitelist.map((ip) => (
                      <Badge key={ip} variant="outline" className="text-xs font-mono">{ip}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No IP restrictions (all IPs allowed)</p>
                )}
              </div>

              {/* Expiry Date */}
              <div className="space-y-2">
                <Label className="text-xs">Expiry Date</Label>
                <Input type="date" value={endpoint.expiresAt.split("T")[0]} className="max-w-[200px]" readOnly />
              </div>
            </TabsContent>

            {/* Test Console Tab */}
            <TabsContent value="test" className="mt-4 space-y-4">
              <div className="space-y-3">
                <Label className="text-xs">Query Mode</Label>
                <Select value={testMode} onValueChange={setTestMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entity_search">Entity Search</SelectItem>
                    <SelectItem value="traversal">Relationship Traversal</SelectItem>
                    <SelectItem value="nl_query">Natural Language Query</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  {testMode === "entity_search"
                    ? "Entity Name or Type"
                    : testMode === "traversal"
                      ? "Start Entity"
                      : "Question"}
                </Label>
                <Input
                  placeholder={
                    testMode === "entity_search"
                      ? "e.g., dc01"
                      : testMode === "traversal"
                        ? "e.g., DNS Service"
                        : "e.g., What depends on the VPN gateway?"
                  }
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                />
              </div>

              {testMode === "traversal" && (
                <div className="space-y-2">
                  <Label className="text-xs">Relationship Type (optional)</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Any relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      {endpoint.exposedRelationshipTypes.map((rt) => (
                        <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleTestSend} disabled={testLoading} className="gap-2">
                {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>

              {testResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${testResult.status === 200 ? "bg-primary/15 text-primary border-primary/30" : "bg-destructive/15 text-destructive border-destructive/30"}`}>
                      {testResult.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{testResult.latency}ms</span>
                  </div>
                  <div className="bg-muted/30 border border-border rounded-lg p-4 overflow-x-auto">
                    <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="mt-4 space-y-5">
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Request Volume (24h)</h4>
                <Card className="p-4">
                  <UsageLineChart data={PLACEHOLDER_USAGE_DATA} />
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Top Queried Entities</h4>
                <Card className="p-4">
                  <MiniBarChart
                    data={PLACEHOLDER_TOP_ENTITIES.map((e) => ({
                      label: e.entity.length > 10 ? e.entity.slice(0, 10) + ".." : e.entity,
                      value: e.queries,
                    }))}
                  />
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Average Latency</h4>
                <Card className="p-4 flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{endpoint.avgLatencyMs}ms</p>
                    <p className="text-xs text-muted-foreground">Average response time</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          endpoint.avgLatencyMs < 50
                            ? "bg-primary"
                            : endpoint.avgLatencyMs < 100
                              ? "bg-amber-500"
                              : "bg-destructive"
                        }`}
                        style={{ width: `${Math.min(endpoint.avgLatencyMs / 200 * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Error Rate</h4>
                <Card className="p-4 flex items-center gap-4">
                  <Badge
                    className={`text-sm px-3 py-1 ${
                      endpoint.errorRate < 1
                        ? "bg-primary/15 text-primary border-primary/30"
                        : endpoint.errorRate < 5
                          ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                          : "bg-destructive/15 text-destructive border-destructive/30"
                    }`}
                  >
                    {endpoint.errorRate}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {endpoint.errorRate < 1 ? "Healthy" : endpoint.errorRate < 5 ? "Elevated" : "Critical"}
                  </span>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BrainEndpointsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedEndpoint, setSelectedEndpoint] = useState<BrainEndpoint | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: endpoints = PLACEHOLDER_ENDPOINTS, isLoading } = useQuery<BrainEndpoint[]>({
    queryKey: ["/api/brain-endpoints"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/brain-endpoints");
        return await res.json();
      } catch {
        return PLACEHOLDER_ENDPOINTS;
      }
    },
  });

  const filteredEndpoints = useMemo(() => {
    return endpoints.filter((ep) => {
      if (statusFilter !== "all" && ep.status !== statusFilter) return false;
      if (
        searchQuery &&
        !ep.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !ep.sourceGraph.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !ep.url.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [endpoints, searchQuery, statusFilter]);

  const handleOpenDetail = useCallback((ep: BrainEndpoint) => {
    setSelectedEndpoint(ep);
    setDetailOpen(true);
  }, []);

  if (isLoading) {
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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Brain Endpoints</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Publish and manage API endpoints that expose your knowledge graphs to external systems.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Endpoint
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <Card className="p-12 text-center">
          <BrainCircuit className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No Brain endpoints yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Create an API endpoint to expose your knowledge graph data to external systems, chatbots,
            and applications.
          </p>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Endpoint
          </Button>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search endpoints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="rate_limited">Rate Limited</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Total Endpoints</p>
              <p className="text-xl font-bold text-foreground">{endpoints.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl font-bold text-primary">
                {endpoints.filter((e) => e.status === "active").length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Total Queries (24h)</p>
              <p className="text-xl font-bold text-foreground">
                {endpoints.reduce((sum, e) => sum + e.queryCount24h, 0).toLocaleString()}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Avg Latency</p>
              <p className="text-xl font-bold text-foreground">
                {Math.round(
                  endpoints.filter((e) => e.status === "active").reduce((sum, e) => sum + e.avgLatencyMs, 0) /
                    (endpoints.filter((e) => e.status === "active").length || 1),
                )}ms
              </p>
            </Card>
          </div>

          {/* Endpoint card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredEndpoints.map((endpoint) => (
              <EndpointCard key={endpoint.id} endpoint={endpoint} onClick={() => handleOpenDetail(endpoint)} />
            ))}
          </div>

          {filteredEndpoints.length === 0 && searchQuery && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No endpoints matching "{searchQuery}"
            </div>
          )}
        </>
      )}

      <EndpointDetailSheet endpoint={selectedEndpoint} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
