import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Plus,
  Layers,
  Server,
  LayoutTemplate,
  MoreVertical,
  CheckCircle,
  XCircle,
  Upload,
  Trash2,
  Eye,
  Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──

interface ClawContext {
  id: string;
  name: string;
  version: string;
  description: string | null;
  tags: string[];
  manifest: any;
  mcpServerRefs: string[];
  workflowRefs: string[];
  skillRefs: string[];
  extendsContextId: string | null;
  dataClassification: string;
  opaBundleRef: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface AgentMcpDefinition {
  id: string;
  name: string;
  version: string;
  description: string | null;
  tags: string[];
  topology: "shared" | "sidecar";
  transport: string;
  port: number | null;
  manifest: any;
  toolNames: string[];
  isPublished: boolean;
  healthStatus: string;
  createdAt: string;
  health?: {
    instances: Array<{
      instanceId: string;
      status: string;
      endpoint: string | null;
      activeConnections: number;
      totalCallsServed: number;
    }>;
  };
}

interface ClawTemplate {
  id: string;
  name: string;
  version: string;
  description: string | null;
  tags: string[];
  modelProvider: string;
  modelId: string;
  contextRefs: string[];
  soulMd: string | null;
  policyTemplateRef: string | null;
  dataClassification: string;
  isPublished: boolean;
  createdAt: string;
}

const HEALTH_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  healthy: { label: "Healthy", variant: "default" },
  degraded: { label: "Degraded", variant: "outline" },
  error: { label: "Error", variant: "destructive" },
  unknown: { label: "Unknown", variant: "secondary" },
  starting: { label: "Starting", variant: "outline" },
  stopped: { label: "Stopped", variant: "secondary" },
  no_instance: { label: "No Instance", variant: "secondary" },
};

export default function ClawContextsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("contexts");

  // ── Create dialogs ──
  const [showCreateContext, setShowCreateContext] = useState(false);
  const [showCreateAgentMcp, setShowCreateAgentMcp] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);

  // ── Context form ──
  const [contextForm, setContextForm] = useState({
    name: "",
    version: "1.0.0",
    description: "",
    dataClassification: "internal",
    manifestJson: '{\n  "tools": {\n    "mcpServers": [],\n    "workflows": [],\n    "skills": []\n  },\n  "prompt": {\n    "system": "",\n    "fragments": []\n  },\n  "env": {}\n}',
  });

  // ── Agent-MCP form ──
  const [agentMcpForm, setAgentMcpForm] = useState({
    name: "",
    version: "1.0.0",
    description: "",
    topology: "shared" as "shared" | "sidecar",
    transport: "sse",
    port: "3100",
    toolNamesRaw: "",
    manifestJson: '{\n  "tools": [],\n  "resources": {}\n}',
  });

  // ── Template form ──
  const [templateForm, setTemplateForm] = useState({
    name: "",
    version: "1.0.0",
    description: "",
    modelProvider: "openai",
    modelId: "gpt-4o",
    contextRefsRaw: "",
    soulMd: "",
    dataClassification: "internal",
  });

  // ── Queries ──

  const { data: contextsData, isLoading: contextsLoading } = useQuery({
    queryKey: ["/api/contexts"],
    queryFn: () => apiRequest("GET", "/api/contexts").then((r) => r.json()),
  });

  const { data: agentMcpsData, isLoading: agentMcpsLoading } = useQuery({
    queryKey: ["/api/agent-mcps"],
    queryFn: () => apiRequest("GET", "/api/agent-mcps").then((r) => r.json()),
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["/api/claw-templates"],
    queryFn: () => apiRequest("GET", "/api/claw-templates").then((r) => r.json()),
  });

  // ── Mutations ──

  const createContext = useMutation({
    mutationFn: async () => {
      let manifest;
      try {
        manifest = JSON.parse(contextForm.manifestJson);
      } catch {
        throw new Error("Invalid JSON in manifest");
      }
      return apiRequest("POST", "/api/contexts", {
        name: contextForm.name,
        version: contextForm.version,
        description: contextForm.description || null,
        dataClassification: contextForm.dataClassification,
        manifest,
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contexts"] });
      setShowCreateContext(false);
      toast({ title: "Context created" });
    },
    onError: (e: Error) => toast({ title: "Failed to create context", description: e.message, variant: "destructive" }),
  });

  const publishContext = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/contexts/${id}/publish`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contexts"] });
      toast({ title: "Context published" });
    },
  });

  const deleteContext = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contexts/${id}`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contexts"] });
      toast({ title: "Context deleted" });
    },
  });

  const createAgentMcp = useMutation({
    mutationFn: async () => {
      let manifest;
      try {
        manifest = JSON.parse(agentMcpForm.manifestJson);
      } catch {
        throw new Error("Invalid JSON in manifest");
      }
      const toolNames = agentMcpForm.toolNamesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return apiRequest("POST", "/api/agent-mcps", {
        name: agentMcpForm.name,
        version: agentMcpForm.version,
        description: agentMcpForm.description || null,
        topology: agentMcpForm.topology,
        transport: agentMcpForm.transport,
        port: parseInt(agentMcpForm.port) || 3100,
        toolNames,
        manifest,
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-mcps"] });
      setShowCreateAgentMcp(false);
      toast({ title: "Agent-MCP created" });
    },
    onError: (e: Error) => toast({ title: "Failed to create agent-MCP", description: e.message, variant: "destructive" }),
  });

  const publishAgentMcp = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/agent-mcps/${id}/publish`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-mcps"] });
      toast({ title: "Agent-MCP published" });
    },
  });

  const deleteAgentMcp = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agent-mcps/${id}`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-mcps"] });
      toast({ title: "Agent-MCP deleted" });
    },
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      const contextRefs = templateForm.contextRefsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return apiRequest("POST", "/api/claw-templates", {
        name: templateForm.name,
        version: templateForm.version,
        description: templateForm.description || null,
        modelProvider: templateForm.modelProvider,
        modelId: templateForm.modelId,
        contextRefs,
        soulMd: templateForm.soulMd || null,
        dataClassification: templateForm.dataClassification,
      }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claw-templates"] });
      setShowCreateTemplate(false);
      toast({ title: "Template created" });
    },
    onError: (e: Error) => toast({ title: "Failed to create template", description: e.message, variant: "destructive" }),
  });

  const provisionFromTemplate = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/claw-templates/${id}/provision`, {}).then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/claws"] });
      toast({ title: "Claw provisioned", description: data.message });
    },
  });

  // ── Render ──

  const contexts = (contextsData?.contexts || []) as ClawContext[];
  const agentMcps = (agentMcpsData?.items || []) as AgentMcpDefinition[];
  const templates = (templatesData?.templates || []) as ClawTemplate[];

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Claw Contexts & Agent-MCPs</h1>
          <p className="text-muted-foreground">
            Composable fleet extension: context bundles, agent-MCP servers, and claw templates
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="contexts" className="gap-2">
            <Layers className="h-4 w-4" />
            Contexts ({contexts.length})
          </TabsTrigger>
          <TabsTrigger value="agent-mcps" className="gap-2">
            <Server className="h-4 w-4" />
            Agent-MCPs ({agentMcps.length})
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Templates ({templates.length})
          </TabsTrigger>
        </TabsList>

        {/* ── CONTEXTS TAB ── */}
        <TabsContent value="contexts" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateContext(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Context
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Claw Contexts</CardTitle>
              <CardDescription>
                Named, versioned tool bundles with inheritance for composable claw configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contextsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : contexts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No contexts yet. Create one to get started.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Tools</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contexts.map((ctx) => (
                      <TableRow key={ctx.id}>
                        <TableCell className="font-medium">{ctx.name}</TableCell>
                        <TableCell><Badge variant="outline">{ctx.version}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{ctx.dataClassification}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {ctx.mcpServerRefs?.length > 0 && <Badge variant="outline">{ctx.mcpServerRefs.length} MCP</Badge>}
                            {ctx.workflowRefs?.length > 0 && <Badge variant="outline">{ctx.workflowRefs.length} WF</Badge>}
                            {ctx.skillRefs?.length > 0 && <Badge variant="outline">{ctx.skillRefs.length} Skills</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {ctx.isPublished ? (
                            <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Published</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!ctx.isPublished && (
                                <DropdownMenuItem onClick={() => publishContext.mutate(ctx.id)}>
                                  <Upload className="h-4 w-4 mr-2" /> Publish
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => deleteContext.mutate(ctx.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AGENT-MCPs TAB ── */}
        <TabsContent value="agent-mcps" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateAgentMcp(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Agent-MCP
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Agent-MCP Definitions</CardTitle>
              <CardDescription>
                Automation agents served as MCP servers with shared or sidecar topology
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agentMcpsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : agentMcps.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No agent-MCPs yet. Create one to extend your fleet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Topology</TableHead>
                      <TableHead>Tools</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentMcps.map((agent) => {
                      const hc = HEALTH_CONFIG[agent.healthStatus] ?? HEALTH_CONFIG.unknown;
                      return (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">{agent.name}</TableCell>
                          <TableCell><Badge variant="outline">{agent.version}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={agent.topology === "shared" ? "default" : "secondary"}>
                              {agent.topology}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{agent.toolNames?.length || 0} tools</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={hc.variant}>{hc.label}</Badge>
                          </TableCell>
                          <TableCell>
                            {agent.isPublished ? (
                              <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Live</Badge>
                            ) : (
                              <Badge variant="secondary">Draft</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!agent.isPublished && (
                                  <DropdownMenuItem onClick={() => publishAgentMcp.mutate(agent.id)}>
                                    <Upload className="h-4 w-4 mr-2" /> Publish
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => deleteAgentMcp.mutate(agent.id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TEMPLATES TAB ── */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateTemplate(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Template
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Claw Templates</CardTitle>
              <CardDescription>
                Composable claw archetypes — one-click provisioning with contexts and agent-MCPs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : templates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No templates yet. Create one to standardize claw provisioning.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Contexts</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead className="w-[120px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((tmpl) => (
                      <TableRow key={tmpl.id}>
                        <TableCell className="font-medium">{tmpl.name}</TableCell>
                        <TableCell><Badge variant="outline">{tmpl.version}</Badge></TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {tmpl.modelProvider}/{tmpl.modelId}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tmpl.contextRefs?.length || 0} contexts</Badge>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{tmpl.dataClassification}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => provisionFromTemplate.mutate(tmpl.id)}
                              disabled={provisionFromTemplate.isPending}
                            >
                              {provisionFromTemplate.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Provision"
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── CREATE CONTEXT DIALOG ── */}
      <Dialog open={showCreateContext} onOpenChange={setShowCreateContext}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Claw Context</DialogTitle>
            <DialogDescription>
              Define a named, versioned tool bundle for composable claw configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="compliance-security"
                  value={contextForm.name}
                  onChange={(e) => setContextForm({ ...contextForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Version</Label>
                <Input
                  placeholder="1.0.0"
                  value={contextForm.version}
                  onChange={(e) => setContextForm({ ...contextForm, version: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Compliance and security tools for regulated workloads"
                value={contextForm.description}
                onChange={(e) => setContextForm({ ...contextForm, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Classification</Label>
              <Select value={contextForm.dataClassification} onValueChange={(v) => setContextForm({ ...contextForm, dataClassification: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Manifest (JSON)</Label>
              <Textarea
                rows={12}
                className="font-mono text-xs"
                value={contextForm.manifestJson}
                onChange={(e) => setContextForm({ ...contextForm, manifestJson: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateContext(false)}>Cancel</Button>
            <Button onClick={() => createContext.mutate()} disabled={createContext.isPending || !contextForm.name}>
              {createContext.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Context
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CREATE AGENT-MCP DIALOG ── */}
      <Dialog open={showCreateAgentMcp} onOpenChange={setShowCreateAgentMcp}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Agent-MCP</DialogTitle>
            <DialogDescription>
              Register an automation agent that serves as an MCP server
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="compliance-agent"
                  value={agentMcpForm.name}
                  onChange={(e) => setAgentMcpForm({ ...agentMcpForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Version</Label>
                <Input
                  placeholder="1.0.0"
                  value={agentMcpForm.version}
                  onChange={(e) => setAgentMcpForm({ ...agentMcpForm, version: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="SOC 2 and ISO 27001 compliance checking agent"
                value={agentMcpForm.description}
                onChange={(e) => setAgentMcpForm({ ...agentMcpForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Topology</Label>
                <Select value={agentMcpForm.topology} onValueChange={(v: "shared" | "sidecar") => setAgentMcpForm({ ...agentMcpForm, topology: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Shared</SelectItem>
                    <SelectItem value="sidecar">Sidecar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transport</Label>
                <Select value={agentMcpForm.transport} onValueChange={(v) => setAgentMcpForm({ ...agentMcpForm, transport: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sse">SSE</SelectItem>
                    <SelectItem value="stdio">Stdio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={agentMcpForm.port}
                  onChange={(e) => setAgentMcpForm({ ...agentMcpForm, port: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tool Names (comma-separated)</Label>
              <Input
                placeholder="check_compliance_status, run_control_test, generate_audit_evidence"
                value={agentMcpForm.toolNamesRaw}
                onChange={(e) => setAgentMcpForm({ ...agentMcpForm, toolNamesRaw: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Manifest (JSON)</Label>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                value={agentMcpForm.manifestJson}
                onChange={(e) => setAgentMcpForm({ ...agentMcpForm, manifestJson: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateAgentMcp(false)}>Cancel</Button>
            <Button onClick={() => createAgentMcp.mutate()} disabled={createAgentMcp.isPending || !agentMcpForm.name}>
              {createAgentMcp.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Agent-MCP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CREATE TEMPLATE DIALOG ── */}
      <Dialog open={showCreateTemplate} onOpenChange={setShowCreateTemplate}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Claw Template</DialogTitle>
            <DialogDescription>
              Define a composable claw archetype for one-click provisioning
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="compliance-auditor"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Version</Label>
                <Input
                  placeholder="1.0.0"
                  value={templateForm.version}
                  onChange={(e) => setTemplateForm({ ...templateForm, version: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Pre-configured claw for compliance audit work"
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Model Provider</Label>
                <Select value={templateForm.modelProvider} onValueChange={(v) => setTemplateForm({ ...templateForm, modelProvider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="nemotron">Nemotron</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model ID</Label>
                <Input
                  placeholder="gpt-4o"
                  value={templateForm.modelId}
                  onChange={(e) => setTemplateForm({ ...templateForm, modelId: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Context References (comma-separated name@version)</Label>
              <Input
                placeholder="compliance-security@1.2.0, base-enterprise@2.0.0"
                value={templateForm.contextRefsRaw}
                onChange={(e) => setTemplateForm({ ...templateForm, contextRefsRaw: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Classification</Label>
              <Select value={templateForm.dataClassification} onValueChange={(v) => setTemplateForm({ ...templateForm, dataClassification: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SOUL.md (system prompt)</Label>
              <Textarea
                rows={6}
                placeholder="You are a compliance auditor assistant..."
                value={templateForm.soulMd}
                onChange={(e) => setTemplateForm({ ...templateForm, soulMd: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTemplate(false)}>Cancel</Button>
            <Button onClick={() => createTemplate.mutate()} disabled={createTemplate.isPending || !templateForm.name || !templateForm.modelId}>
              {createTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
