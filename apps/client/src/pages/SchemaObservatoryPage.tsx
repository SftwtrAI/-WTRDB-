import { useState, useMemo, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ArrowLeft,
  Loader2,
  Search,
  Plus,
  Check,
  X,
  GitMerge,
  Clock,
  ChevronDown,
  ChevronUp,
  Telescope,
  CircleDot,
  Diamond,
  ArrowRight,
  Sparkles,
  History,
  Eye,
  FileText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityType {
  id: string;
  name: string;
  category: "entity" | "relationship";
  instanceCount: number;
  color: string;
  firstDiscovered: string;
  exampleEntities: string[];
  sourceDocuments: string[];
}

interface SchemaProposal {
  id: string;
  proposedLabel: string;
  suggestedMapping: string;
  confidence: number;
  exampleInstances: { text: string; sourceDoc: string }[];
  status: "pending" | "accepted" | "merged" | "dismissed";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

interface CanonicalMapping {
  surfaceForm: string;
  canonicalType: string;
  frequency: number;
}

// ---------------------------------------------------------------------------
// Placeholder Data
// ---------------------------------------------------------------------------

const PLACEHOLDER_ENTITY_TYPES: EntityType[] = [
  {
    id: "et_001",
    name: "Person",
    category: "entity",
    instanceCount: 42,
    color: "hsl(170, 92%, 33%)",
    firstDiscovered: "2026-03-15T08:00:00Z",
    exampleEntities: ["Alice Chen", "Bob Martinez", "Carol Singh", "Dave Kim", "Eve Park"],
    sourceDocuments: ["infrastructure.pdf", "admin_export.csv", "org_chart.xlsx"],
  },
  {
    id: "et_002",
    name: "Infrastructure",
    category: "entity",
    instanceCount: 28,
    color: "hsl(213, 44%, 53%)",
    firstDiscovered: "2026-03-15T08:05:00Z",
    exampleEntities: ["dc01", "VPN Gateway", "Load Balancer", "DNS Server", "Firewall"],
    sourceDocuments: ["infrastructure.pdf", "network_diagram.pdf"],
  },
  {
    id: "et_003",
    name: "Technology",
    category: "entity",
    instanceCount: 19,
    color: "hsl(75, 80%, 53%)",
    firstDiscovered: "2026-03-15T08:10:00Z",
    exampleEntities: ["Active Directory", "OAuth 2.0", "LDAP", "Kubernetes", "PostgreSQL"],
    sourceDocuments: ["infrastructure.pdf", "tech_stack.md"],
  },
  {
    id: "et_004",
    name: "Service",
    category: "entity",
    instanceCount: 15,
    color: "hsl(113, 44%, 53%)",
    firstDiscovered: "2026-03-16T10:00:00Z",
    exampleEntities: ["Google Workspace", "LDAP Sync", "SSO Gateway", "Email Service"],
    sourceDocuments: ["admin_export.csv", "service_catalog.pdf"],
  },
  {
    id: "et_005",
    name: "Policy",
    category: "entity",
    instanceCount: 11,
    color: "hsl(340, 65%, 55%)",
    firstDiscovered: "2026-03-18T14:00:00Z",
    exampleEntities: ["Password Policy", "MFA Policy", "Data Retention", "Access Control"],
    sourceDocuments: ["security_handbook.pdf", "compliance_docs.pdf"],
  },
  {
    id: "et_006",
    name: "MANAGES",
    category: "relationship",
    instanceCount: 34,
    color: "hsl(35, 80%, 55%)",
    firstDiscovered: "2026-03-15T08:02:00Z",
    exampleEntities: ["Alice Chen -> security-team@", "Bob -> dev-team@"],
    sourceDocuments: ["infrastructure.pdf", "admin_export.csv"],
  },
  {
    id: "et_007",
    name: "RUNS_ON",
    category: "relationship",
    instanceCount: 22,
    color: "hsl(200, 60%, 50%)",
    firstDiscovered: "2026-03-15T08:08:00Z",
    exampleEntities: ["AD Service -> dc01", "PostgreSQL -> db-server-01"],
    sourceDocuments: ["infrastructure.pdf"],
  },
  {
    id: "et_008",
    name: "DEPENDS_ON",
    category: "relationship",
    instanceCount: 18,
    color: "hsl(280, 50%, 55%)",
    firstDiscovered: "2026-03-16T11:00:00Z",
    exampleEntities: ["SSO -> LDAP", "Email -> DNS"],
    sourceDocuments: ["infrastructure.pdf", "service_catalog.pdf"],
  },
];

const PLACEHOLDER_PROPOSALS: SchemaProposal[] = [
  {
    id: "prop_001",
    proposedLabel: "deployed_to",
    suggestedMapping: "RUNS_ON",
    confidence: 0.87,
    exampleInstances: [
      { text: "Kubernetes is deployed_to cloud-region-1", sourceDoc: "infrastructure.pdf" },
      { text: "API Gateway deployed_to edge-cluster", sourceDoc: "deployment_guide.md" },
      { text: "Redis deployed_to cache-server-02", sourceDoc: "infrastructure.pdf" },
    ],
    status: "pending",
    createdAt: "2026-04-01T14:30:00Z",
  },
  {
    id: "prop_002",
    proposedLabel: "authenticates_via",
    suggestedMapping: "DEPENDS_ON",
    confidence: 0.62,
    exampleInstances: [
      { text: "Users authenticates_via SSO Gateway", sourceDoc: "auth_flow.md" },
      { text: "API service authenticates_via OAuth 2.0", sourceDoc: "api_spec.yaml" },
    ],
    status: "pending",
    createdAt: "2026-04-01T15:10:00Z",
  },
  {
    id: "prop_003",
    proposedLabel: "DataCenter",
    suggestedMapping: "Infrastructure",
    confidence: 0.91,
    exampleInstances: [
      { text: "cloud-region-1 (DataCenter)", sourceDoc: "infrastructure.pdf" },
      { text: "us-east-1 DataCenter", sourceDoc: "deployment_guide.md" },
      { text: "eu-west-1 DataCenter", sourceDoc: "compliance_docs.pdf" },
    ],
    status: "pending",
    createdAt: "2026-04-02T09:00:00Z",
  },
  {
    id: "prop_004",
    proposedLabel: "installed_on",
    suggestedMapping: "RUNS_ON",
    confidence: 0.94,
    exampleInstances: [
      { text: "Agent installed_on workstation-42", sourceDoc: "it_inventory.csv" },
      { text: "Antivirus installed_on all endpoints", sourceDoc: "security_handbook.pdf" },
    ],
    status: "accepted",
    createdAt: "2026-03-28T11:00:00Z",
    resolvedAt: "2026-03-28T11:30:00Z",
    resolvedBy: "admin@wtrdb.io",
  },
  {
    id: "prop_005",
    proposedLabel: "monitors",
    suggestedMapping: "",
    confidence: 0.45,
    exampleInstances: [
      { text: "Nagios monitors dc01", sourceDoc: "monitoring.md" },
      { text: "Prometheus monitors Kubernetes cluster", sourceDoc: "infrastructure.pdf" },
    ],
    status: "dismissed",
    createdAt: "2026-03-25T16:00:00Z",
    resolvedAt: "2026-03-26T09:00:00Z",
    resolvedBy: "admin@wtrdb.io",
  },
];

const PLACEHOLDER_MAPPINGS: CanonicalMapping[] = [
  { surfaceForm: "installed_on", canonicalType: "RUNS_ON", frequency: 47 },
  { surfaceForm: "deployed_to", canonicalType: "RUNS_ON", frequency: 32 },
  { surfaceForm: "runs_on", canonicalType: "RUNS_ON", frequency: 28 },
  { surfaceForm: "running_on", canonicalType: "RUNS_ON", frequency: 15 },
  { surfaceForm: "hosted_on", canonicalType: "RUNS_ON", frequency: 8 },
  { surfaceForm: "manages", canonicalType: "MANAGES", frequency: 34 },
  { surfaceForm: "oversees", canonicalType: "MANAGES", frequency: 12 },
  { surfaceForm: "is_responsible_for", canonicalType: "MANAGES", frequency: 7 },
  { surfaceForm: "depends_on", canonicalType: "DEPENDS_ON", frequency: 18 },
  { surfaceForm: "requires", canonicalType: "DEPENDS_ON", frequency: 14 },
  { surfaceForm: "needs", canonicalType: "DEPENDS_ON", frequency: 6 },
  { surfaceForm: "authenticates_via", canonicalType: "DEPENDS_ON", frequency: 4 },
];

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useSchemaTypes(graphId: string) {
  return useQuery<EntityType[]>({
    queryKey: ["/api/knowledge-graph", graphId, "schema", "types"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/knowledge-graph/${graphId}/schema/types`);
        if (res.ok) {
          const data = await res.json();
          return data.types ?? data;
        }
      } catch {}
      return PLACEHOLDER_ENTITY_TYPES;
    },
    enabled: !!graphId,
  });
}

function useSchemaProposals(graphId: string) {
  return useQuery<SchemaProposal[]>({
    queryKey: ["/api/knowledge-graph", graphId, "schema", "proposals"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/knowledge-graph/${graphId}/schema/proposals`);
        if (res.ok) {
          const data = await res.json();
          return data.proposals ?? data;
        }
      } catch {}
      return PLACEHOLDER_PROPOSALS;
    },
    enabled: !!graphId,
  });
}

function useCanonicalMappings(graphId: string) {
  return useQuery<CanonicalMapping[]>({
    queryKey: ["/api/knowledge-graph", graphId, "schema", "mappings"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/knowledge-graph/${graphId}/schema/mappings`);
        if (res.ok) {
          const data = await res.json();
          return data.mappings ?? data;
        }
      } catch {}
      return PLACEHOLDER_MAPPINGS;
    },
    enabled: !!graphId,
  });
}

function useResolveProposal() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      graphId: string;
      proposalId: string;
      action: "accept" | "merge" | "dismiss";
      mergeTarget?: string;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/knowledge-graph/${data.graphId}/schema/proposals/${data.proposalId}/resolve`,
        { action: data.action, mergeTarget: data.mergeTarget },
      );
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/knowledge-graph", variables.graphId, "schema"],
      });
      toast({
        title: "Proposal resolved",
        description: `The schema proposal has been ${variables.action === "accept" ? "accepted" : variables.action === "merge" ? "merged" : "dismissed"}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resolve proposal",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function confidenceColor(score: number): string {
  if (score >= 0.85) return "text-primary";
  if (score >= 0.5) return "text-amber-500";
  return "text-destructive";
}

function confidenceBg(score: number): string {
  if (score >= 0.85) return "bg-primary/15 text-primary border-primary/30";
  if (score >= 0.5) return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

// ---------------------------------------------------------------------------
// Active Schema Panel
// ---------------------------------------------------------------------------

function ActiveSchemaPanel({
  types,
  isLoading,
}: {
  types: EntityType[];
  isLoading: boolean;
}) {
  const [selectedType, setSelectedType] = useState<EntityType | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const entityTypes = types.filter((t) => t.category === "entity");
  const relationshipTypes = types.filter((t) => t.category === "relationship");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Active Schema</h3>
        <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Type
        </Button>
      </div>

      {/* Entity Types */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entity Types</p>
        <div className="space-y-2">
          {entityTypes.map((type) => (
            <Card
              key={type.id}
              className={`p-3 cursor-pointer transition-all border hover:border-primary/40 ${
                selectedType?.id === type.id ? "border-primary/60 bg-primary/5" : "border-border"
              }`}
              onClick={() => setSelectedType(selectedType?.id === type.id ? null : type)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: type.color }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">{type.name}</span>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {type.instanceCount}
                </Badge>
              </div>

              {selectedType?.id === type.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <div className="text-xs text-muted-foreground">
                    <Clock className="inline h-3 w-3 mr-1" />
                    First discovered: {formatDate(type.firstDiscovered)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Eye className="inline h-3 w-3 mr-1" />
                    Examples: {type.exampleEntities.slice(0, 4).join(", ")}
                    {type.exampleEntities.length > 4 && ` +${type.exampleEntities.length - 4} more`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <FileText className="inline h-3 w-3 mr-1" />
                    Sources: {type.sourceDocuments.join(", ")}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Relationship Types */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Relationship Types</p>
        <div className="space-y-2">
          {relationshipTypes.map((type) => (
            <Card
              key={type.id}
              className={`p-3 cursor-pointer transition-all border hover:border-primary/40 ${
                selectedType?.id === type.id ? "border-primary/60 bg-primary/5" : "border-border"
              }`}
              onClick={() => setSelectedType(selectedType?.id === type.id ? null : type)}
            >
              <div className="flex items-center gap-3">
                <Diamond
                  className="h-3 w-3 shrink-0"
                  style={{ color: type.color }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground font-mono">{type.name}</span>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {type.instanceCount}
                </Badge>
              </div>

              {selectedType?.id === type.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <div className="text-xs text-muted-foreground">
                    <Clock className="inline h-3 w-3 mr-1" />
                    First discovered: {formatDate(type.firstDiscovered)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Eye className="inline h-3 w-3 mr-1" />
                    Examples: {type.exampleEntities.slice(0, 3).join(", ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <FileText className="inline h-3 w-3 mr-1" />
                    Sources: {type.sourceDocuments.join(", ")}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Add Custom Type Dialog */}
      <AddTypeDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </div>
  );
}

function AddTypeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"entity" | "relationship">("entity");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Custom Type</DialogTitle>
          <DialogDescription>
            Define a new entity or relationship type for the schema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type-name">Type Name</Label>
            <Input
              id="type-name"
              placeholder="e.g., Department"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as "entity" | "relationship")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entity">Entity Type</SelectItem>
                <SelectItem value="relationship">Relationship Type</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type-desc">Description (optional)</Label>
            <Input
              id="type-desc"
              placeholder="Describe this type..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={() => onOpenChange(false)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Proposal Stream Panel
// ---------------------------------------------------------------------------

function ProposalStreamPanel({
  proposals,
  isLoading,
  graphId,
  entityTypes,
}: {
  proposals: SchemaProposal[];
  isLoading: boolean;
  graphId: string;
  entityTypes: EntityType[];
}) {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [mergeDropdownId, setMergeDropdownId] = useState<string | null>(null);
  const resolveProposal = useResolveProposal();

  const pending = proposals.filter((p) => p.status === "pending");
  const history = proposals.filter((p) => p.status !== "pending");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Proposal Stream</h3>
        <Badge variant="outline" className="text-xs">
          {pending.length} pending
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "history")}>
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1 gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1">
            <History className="h-3.5 w-3.5" />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-3">
          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="space-y-3 pr-3">
              {pending.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No pending proposals. The schema is up to date.
                </div>
              ) : (
                pending.map((proposal) => (
                  <Card key={proposal.id} className="p-4 border border-border">
                    <div className="space-y-3">
                      {/* Proposed label */}
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-foreground font-mono">
                          {proposal.proposedLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">{timeAgo(proposal.createdAt)}</span>
                      </div>

                      {/* Suggestion */}
                      {proposal.suggestedMapping && (
                        <div className="flex items-center gap-2 text-xs">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="text-muted-foreground">
                            Maps to existing type:{" "}
                            <span className="font-semibold text-foreground">{proposal.suggestedMapping}</span>
                          </span>
                          <Badge className={`text-xs ${confidenceBg(proposal.confidence)}`}>
                            {Math.round(proposal.confidence * 100)}%
                          </Badge>
                        </div>
                      )}

                      {/* Example instances */}
                      <div className="space-y-1">
                        {proposal.exampleInstances.slice(0, 3).map((ex, i) => (
                          <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-foreground/60 shrink-0">{i + 1}.</span>
                            <span className="flex-1">
                              "{ex.text}" <span className="text-foreground/40">({ex.sourceDoc})</span>
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="text-xs h-7"
                          disabled={resolveProposal.isPending}
                          onClick={() =>
                            resolveProposal.mutate({
                              graphId,
                              proposalId: proposal.id,
                              action: "accept",
                            })
                          }
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Accept
                        </Button>
                        <div className="relative">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                            onClick={() =>
                              setMergeDropdownId(
                                mergeDropdownId === proposal.id ? null : proposal.id,
                              )
                            }
                          >
                            <GitMerge className="h-3 w-3 mr-1" />
                            Merge
                            {mergeDropdownId === proposal.id ? (
                              <ChevronUp className="h-3 w-3 ml-1" />
                            ) : (
                              <ChevronDown className="h-3 w-3 ml-1" />
                            )}
                          </Button>
                          {mergeDropdownId === proposal.id && (
                            <Card className="absolute top-8 left-0 z-10 w-48 p-1 shadow-lg">
                              {entityTypes.map((et) => (
                                <button
                                  key={et.id}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent rounded-sm transition-colors"
                                  onClick={() => {
                                    resolveProposal.mutate({
                                      graphId,
                                      proposalId: proposal.id,
                                      action: "merge",
                                      mergeTarget: et.name,
                                    });
                                    setMergeDropdownId(null);
                                  }}
                                >
                                  {et.name}
                                </button>
                              ))}
                            </Card>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 text-muted-foreground"
                          disabled={resolveProposal.isPending}
                          onClick={() =>
                            resolveProposal.mutate({
                              graphId,
                              proposalId: proposal.id,
                              action: "dismiss",
                            })
                          }
                        >
                          <X className="h-3 w-3 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="space-y-3 pr-3">
              {history.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No history yet.
                </div>
              ) : (
                history.map((proposal) => (
                  <Card key={proposal.id} className="p-4 border border-border opacity-80">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground font-mono">
                          {proposal.proposedLabel}
                        </span>
                        <Badge
                          className={`text-xs ${
                            proposal.status === "accepted"
                              ? "bg-primary/15 text-primary border-primary/30"
                              : proposal.status === "merged"
                                ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {proposal.status}
                        </Badge>
                      </div>
                      {proposal.suggestedMapping && (
                        <p className="text-xs text-muted-foreground">
                          Mapped to: {proposal.suggestedMapping}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {proposal.resolvedBy && `By ${proposal.resolvedBy} -- `}
                        {proposal.resolvedAt && formatDate(proposal.resolvedAt)}
                      </p>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canonicalization Map Panel
// ---------------------------------------------------------------------------

function CanonicalizationMapPanel({
  mappings,
  isLoading,
}: {
  mappings: CanonicalMapping[];
  isLoading: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery) return mappings;
    const q = searchQuery.toLowerCase();
    return mappings.filter(
      (m) =>
        m.surfaceForm.toLowerCase().includes(q) ||
        m.canonicalType.toLowerCase().includes(q),
    );
  }, [mappings, searchQuery]);

  // Group by canonical type
  const grouped = useMemo(() => {
    const groups: Record<string, { canonicalType: string; surfaceForms: { form: string; frequency: number }[] }> = {};
    for (const m of filtered) {
      if (!groups[m.canonicalType]) {
        groups[m.canonicalType] = { canonicalType: m.canonicalType, surfaceForms: [] };
      }
      groups[m.canonicalType].surfaceForms.push({ form: m.surfaceForm, frequency: m.frequency });
    }
    // Sort by total frequency
    return Object.values(groups).sort(
      (a, b) =>
        b.surfaceForms.reduce((s, f) => s + f.frequency, 0) -
        a.surfaceForms.reduce((s, f) => s + f.frequency, 0),
    );
  }, [filtered]);

  const maxFrequency = useMemo(
    () => Math.max(...mappings.map((m) => m.frequency), 1),
    [mappings],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Canonicalization Map</h3>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search surface forms or types..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-8 text-sm"
        />
      </div>

      <ScrollArea className="h-[calc(100vh-340px)]">
        <div className="space-y-4 pr-3">
          {grouped.map((group) => (
            <Card key={group.canonicalType} className="p-4 border border-border">
              {/* Canonical type header */}
              <div className="flex items-center gap-2 mb-3">
                <CircleDot className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground font-mono">
                  {group.canonicalType}
                </span>
                <Badge variant="outline" className="text-xs ml-auto">
                  {group.surfaceForms.length} form{group.surfaceForms.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Surface forms */}
              <div className="space-y-2">
                {group.surfaceForms
                  .sort((a, b) => b.frequency - a.frequency)
                  .map((sf) => (
                    <div key={sf.form} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono min-w-0 flex-1 truncate">
                        {sf.form}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      {/* Frequency bar */}
                      <div className="w-20 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(sf.frequency / maxFrequency) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground font-mono w-6 text-right">
                            {sf.frequency}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          ))}

          {grouped.length === 0 && searchQuery && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No mappings matching "{searchQuery}"
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SchemaObservatoryPage() {
  const [, params] = useRoute("/app/knowledge-graph/:id/schema");
  const [, setLocation] = useLocation();
  const graphId = params?.id ?? "";

  // Mobile panel selection
  const [mobilePanel, setMobilePanel] = useState<"schema" | "proposals" | "map">("schema");

  const { data: types = [], isLoading: typesLoading } = useSchemaTypes(graphId);
  const { data: proposals = [], isLoading: proposalsLoading } = useSchemaProposals(graphId);
  const { data: mappings = [], isLoading: mappingsLoading } = useCanonicalMappings(graphId);

  if (!graphId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation(`/app/knowledge-graph/${graphId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Knowledge Graph
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Telescope className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Schema Observatory</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Review schema proposals, manage entity and relationship types, and edit canonicalization mappings.
          </p>
        </div>

        {/* Summary stats */}
        <div className="hidden md:flex items-center gap-3">
          <Badge variant="outline" className="gap-1">
            <CircleDot className="h-3 w-3" />
            {types.filter((t) => t.category === "entity").length} entity types
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Diamond className="h-3 w-3" />
            {types.filter((t) => t.category === "relationship").length} relationship types
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {proposals.filter((p) => p.status === "pending").length} pending proposals
          </Badge>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden">
        <Tabs value={mobilePanel} onValueChange={(v) => setMobilePanel(v as typeof mobilePanel)}>
          <TabsList className="w-full">
            <TabsTrigger value="schema" className="flex-1">Schema</TabsTrigger>
            <TabsTrigger value="proposals" className="flex-1">Proposals</TabsTrigger>
            <TabsTrigger value="map" className="flex-1">Map</TabsTrigger>
          </TabsList>

          <TabsContent value="schema" className="mt-4">
            <ActiveSchemaPanel types={types} isLoading={typesLoading} />
          </TabsContent>
          <TabsContent value="proposals" className="mt-4">
            <ProposalStreamPanel
              proposals={proposals}
              isLoading={proposalsLoading}
              graphId={graphId}
              entityTypes={types}
            />
          </TabsContent>
          <TabsContent value="map" className="mt-4">
            <CanonicalizationMapPanel mappings={mappings} isLoading={mappingsLoading} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop three-panel layout */}
      <div className="hidden md:grid grid-cols-3 gap-6">
        <Card className="p-5 border border-border">
          <ActiveSchemaPanel types={types} isLoading={typesLoading} />
        </Card>

        <Card className="p-5 border border-border">
          <ProposalStreamPanel
            proposals={proposals}
            isLoading={proposalsLoading}
            graphId={graphId}
            entityTypes={types}
          />
        </Card>

        <Card className="p-5 border border-border">
          <CanonicalizationMapPanel mappings={mappings} isLoading={mappingsLoading} />
        </Card>
      </div>
    </div>
  );
}
