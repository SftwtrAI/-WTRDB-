import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Loader2,
    Plus,
    Shield,
    ShieldCheck,
    Play,
    Check,
    X,
    Lock,
    Settings2,
    FileCode2,
    Pencil,
    Eye,
    Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Types ---

interface PolicyTemplate {
    id: string;
    name: string;
    description: string;
    type: "system" | "custom";
    networkMode: "whitelist" | "allow_all" | "deny_all";
    networkWhitelist: string[];
    allowedProviders: string[];
    allowedModels: string[];
    minSkillSecurityScore: "A" | "B" | "C" | "D" | "F";
    skillInstallApproval: boolean;
    maxWorkflowExecutionsPerDay: number;
    maxMcpCallsPerDay: number;
    maxCreditsPerCall: number;
    assignedClawsCount: number;
    lastModified: string;
}

interface TestResult {
    decision: "ALLOW" | "DENY";
    reason: string;
    matchedRules: string[];
    failedRules: string[];
}

interface ComplianceStatus {
    totalClaws: number;
    clawsWithPolicy: number;
    lastSyncAt: string;
}

const PROVIDERS = [
    { id: "openai", label: "OpenAI" },
    { id: "anthropic", label: "Anthropic" },
    { id: "google", label: "Google" },
    { id: "nvidia", label: "NVIDIA" },
    { id: "openrouter", label: "OpenRouter" },
];

const SECURITY_GRADES = ["A", "B", "C", "D", "F"] as const;

const NETWORK_MODES: Record<string, { label: string; description: string }> = {
    whitelist: { label: "Whitelist", description: "Only allow listed domains" },
    allow_all: { label: "Allow All", description: "No network restrictions" },
    deny_all: { label: "Deny All", description: "Block all network access" },
};

const DEFAULT_TEST_INPUT = JSON.stringify(
    {
        provider: "openai",
        model: "gpt-4o",
        skillName: "web-scraper",
        skillSecurityScore: "B",
        networkTarget: "api.example.com",
        creditsRequested: 50,
    },
    null,
    2,
);

type NetworkMode = "whitelist" | "allow_all" | "deny_all";
type SecurityGrade = "A" | "B" | "C" | "D" | "F";

interface PolicyFormData {
    name: string;
    description: string;
    networkMode: NetworkMode;
    networkWhitelist: string[];
    allowedProviders: string[];
    allowedModels: string[];
    minSkillSecurityScore: SecurityGrade;
    skillInstallApproval: boolean;
    maxWorkflowExecutionsPerDay: number;
    maxMcpCallsPerDay: number;
    maxCreditsPerCall: number;
}

function emptyPolicyForm(): PolicyFormData {
    return {
        name: "",
        description: "",
        networkMode: "whitelist",
        networkWhitelist: [],
        allowedProviders: [],
        allowedModels: [],
        minSkillSecurityScore: "B",
        skillInstallApproval: true,
        maxWorkflowExecutionsPerDay: 1000,
        maxMcpCallsPerDay: 5000,
        maxCreditsPerCall: 100,
    };
}

// --- Tag Input component ---

function TagInput({
    value,
    onChange,
    placeholder,
}: {
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder: string;
}) {
    const [inputValue, setInputValue] = useState("");

    const addTag = () => {
        const tag = inputValue.trim();
        if (tag && !value.includes(tag)) {
            onChange([...value, tag]);
        }
        setInputValue("");
    };

    const removeTag = (tag: string) => {
        onChange(value.filter((t) => t !== tag));
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                        }
                    }}
                    placeholder={placeholder}
                    className="flex-1"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTag}
                    disabled={!inputValue.trim()}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((tag) => (
                        <Badge
                            key={tag}
                            variant="secondary"
                            className="gap-1 pr-1"
                        >
                            {tag}
                            <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="ml-1 rounded-sm hover:bg-muted p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Main Page ---

export default function ClawPoliciesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Dialog state
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [viewingPolicy, setViewingPolicy] = useState<PolicyTemplate | null>(null);
    const [editingPolicy, setEditingPolicy] = useState<PolicyTemplate | null>(null);

    // Form state
    const [form, setForm] = useState(emptyPolicyForm());

    // Test panel state
    const [testPolicyId, setTestPolicyId] = useState("");
    const [testInput, setTestInput] = useState(DEFAULT_TEST_INPUT);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    // Tab state (controlled for highlight navigation)
    const [activeTab, setActiveTab] = useState("templates");

    // Section refs for highlight scrolling
    const networkModeRef = useRef<HTMLDivElement>(null);
    const skillSecurityRef = useRef<HTMLDivElement>(null);
    const providerRestrictionsRef = useRef<HTMLDivElement>(null);

    // Highlight state
    const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

    const applyHighlight = useCallback((sectionId: string, ref: React.RefObject<HTMLDivElement | null>) => {
        setHighlightedSection(sectionId);
        // Wait a frame for the DOM to paint the highlight wrapper
        requestAnimationFrame(() => {
            ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        // Remove highlight after 3 seconds
        const timer = setTimeout(() => setHighlightedSection(null), 3000);
        return timer;
    }, []);

    // --- Queries ---

    const { data: policies, isLoading } = useQuery<PolicyTemplate[]>({
        queryKey: ["/api/claw-policies"],
    });

    const { data: complianceStatus } = useQuery<ComplianceStatus>({
        queryKey: ["/api/claw-policies/compliance-status"],
    });

    // --- URL highlight parameter handling ---

    const clearHighlightParam = useCallback(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("highlight");
        window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const highlight = params.get("highlight");
        if (!highlight) return;

        // Actions that don't need policies loaded
        if (highlight === "create-policy") {
            setForm(emptyPolicyForm());
            setIsCreateOpen(true);
            clearHighlightParam();
            return;
        }

        if (highlight === "test-policy") {
            setActiveTab("test");
            clearHighlightParam();
            return;
        }

        // Actions that need policies loaded — wait until they arrive
        const needsPolicy = ["network-mode", "skill-security", "provider-restrictions"].includes(highlight);
        if (needsPolicy && !policies) return; // will re-run when policies load

        if (needsPolicy && policies && policies.length > 0) {
            setActiveTab("templates");
            setViewingPolicy(policies[0]);

            const refMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
                "network-mode": networkModeRef,
                "skill-security": skillSecurityRef,
                "provider-restrictions": providerRestrictionsRef,
            };

            // Give the dialog time to render before scrolling
            const raf1 = requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const ref = refMap[highlight];
                    if (ref) applyHighlight(highlight, ref);
                });
            });

            clearHighlightParam();
            return () => cancelAnimationFrame(raf1);
        }

        // Unknown highlight param — just clear it
        if (!needsPolicy) {
            clearHighlightParam();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [policies]);

    // --- Mutations ---

    const createMutation = useMutation({
        mutationFn: async (data: PolicyFormData) => {
            await apiRequest("POST", "/api/claw-policies", data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/claw-policies"] });
            setIsCreateOpen(false);
            setForm(emptyPolicyForm());
            toast({ title: "Policy created", description: "The custom policy template has been created." });
        },
        onError: (error: any) => {
            toast({ title: "Error creating policy", description: error.message, variant: "destructive" });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<PolicyFormData> }) => {
            await apiRequest("PATCH", `/api/claw-policies/${id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/claw-policies"] });
            setEditingPolicy(null);
            setForm(emptyPolicyForm());
            toast({ title: "Policy updated", description: "The policy template has been updated." });
        },
        onError: (error: any) => {
            toast({ title: "Error updating policy", description: error.message, variant: "destructive" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/claw-policies/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/claw-policies"] });
            toast({ title: "Policy deleted", description: "The policy template has been removed." });
        },
        onError: (error: any) => {
            toast({ title: "Error deleting policy", description: error.message, variant: "destructive" });
        },
    });

    const testMutation = useMutation({
        mutationFn: async ({ id, input }: { id: string; input: string }) => {
            const res = await apiRequest("POST", `/api/claw-policies/${id}/test`, JSON.parse(input));
            return (await res.json()) as TestResult;
        },
        onSuccess: (data) => {
            setTestResult(data);
        },
        onError: (error: any) => {
            toast({ title: "Test failed", description: error.message, variant: "destructive" });
        },
    });

    // --- Handlers ---

    const handleCreate = () => {
        if (!form.name.trim()) return;
        createMutation.mutate(form);
    };

    const handleUpdate = () => {
        if (!editingPolicy) return;
        updateMutation.mutate({ id: editingPolicy.id, data: form });
    };

    const openEdit = (policy: PolicyTemplate) => {
        setEditingPolicy(policy);
        setForm({
            name: policy.name,
            description: policy.description,
            networkMode: policy.networkMode ?? "whitelist",
            networkWhitelist: [...policy.networkWhitelist],
            allowedProviders: [...policy.allowedProviders],
            allowedModels: [...policy.allowedModels],
            minSkillSecurityScore: policy.minSkillSecurityScore,
            skillInstallApproval: policy.skillInstallApproval,
            maxWorkflowExecutionsPerDay: policy.maxWorkflowExecutionsPerDay,
            maxMcpCallsPerDay: policy.maxMcpCallsPerDay,
            maxCreditsPerCall: policy.maxCreditsPerCall,
        });
    };

    const openCreate = () => {
        setForm(emptyPolicyForm());
        setIsCreateOpen(true);
    };

    const handleTest = () => {
        if (!testPolicyId) return;
        try {
            JSON.parse(testInput);
        } catch {
            toast({ title: "Invalid JSON", description: "Please enter valid JSON for the test input.", variant: "destructive" });
            return;
        }
        setTestResult(null);
        testMutation.mutate({ id: testPolicyId, input: testInput });
    };

    const toggleProvider = (providerId: string) => {
        setForm((prev) => {
            const has = prev.allowedProviders.includes(providerId);
            return {
                ...prev,
                allowedProviders: has
                    ? prev.allowedProviders.filter((p) => p !== providerId)
                    : [...prev.allowedProviders, providerId],
            };
        });
    };

    const coveragePercent = complianceStatus
        ? complianceStatus.totalClaws > 0
            ? Math.round((complianceStatus.clawsWithPolicy / complianceStatus.totalClaws) * 100)
            : 0
        : null;

    // --- Policy Form (shared for create/edit) ---

    const PolicyForm = ({ isEdit }: { isEdit: boolean }) => (
        <ScrollArea className="h-[500px] pr-4">
            <div className="grid gap-5 py-1">
                {/* Name & Description */}
                <div className="grid grid-cols-1 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="policy-name">Policy Name</Label>
                        <Input
                            id="policy-name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Production Strict Policy"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="policy-desc">Description</Label>
                        <Input
                            id="policy-desc"
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="Strict policy for production claws"
                        />
                    </div>
                </div>

                {/* Network Mode */}
                <div className="grid gap-2">
                    <Label>Network Mode</Label>
                    <Select
                        value={form.networkMode}
                        onValueChange={(v) => setForm({ ...form, networkMode: v as NetworkMode })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select network mode" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(NETWORK_MODES).map(([key, cfg]) => (
                                <SelectItem key={key} value={key}>
                                    {cfg.label} -- {cfg.description}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Network Whitelist (only when whitelist mode) */}
                {form.networkMode === "whitelist" && (
                    <div className="grid gap-2">
                        <Label>Network Whitelist</Label>
                        <TagInput
                            value={form.networkWhitelist}
                            onChange={(tags) => setForm({ ...form, networkWhitelist: tags })}
                            placeholder="api.openai.com"
                        />
                    </div>
                )}

                {/* Allowed Providers */}
                <div className="grid gap-2">
                    <Label>Allowed Providers</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {PROVIDERS.map((provider) => (
                            <label
                                key={provider.id}
                                className="flex items-center gap-2.5 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                            >
                                <Checkbox
                                    checked={form.allowedProviders.includes(provider.id)}
                                    onCheckedChange={() => toggleProvider(provider.id)}
                                />
                                <span className="text-sm">{provider.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Allowed Models */}
                <div className="grid gap-2">
                    <Label>Allowed Models</Label>
                    <TagInput
                        value={form.allowedModels}
                        onChange={(tags) => setForm({ ...form, allowedModels: tags })}
                        placeholder="gpt-4o"
                    />
                </div>

                {/* Min Skill Security Score */}
                <div className="grid gap-2">
                    <Label>Minimum Skill Security Score</Label>
                    <Select
                        value={form.minSkillSecurityScore}
                        onValueChange={(v) => setForm({ ...form, minSkillSecurityScore: v as SecurityGrade })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SECURITY_GRADES.map((grade) => (
                                <SelectItem key={grade} value={grade}>
                                    Grade {grade}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Skill Install Approval */}
                <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                        <Label className="text-sm font-medium">Skill Install Approval</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Require manual approval before installing new skills
                        </p>
                    </div>
                    <Switch
                        checked={form.skillInstallApproval}
                        onCheckedChange={(checked) => setForm({ ...form, skillInstallApproval: checked })}
                    />
                </div>

                {/* Rate Limits */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="max-wf">Max Workflow Executions / Day</Label>
                        <Input
                            id="max-wf"
                            type="number"
                            min={0}
                            value={form.maxWorkflowExecutionsPerDay}
                            onChange={(e) =>
                                setForm({ ...form, maxWorkflowExecutionsPerDay: parseInt(e.target.value) || 0 })
                            }
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="max-mcp">Max MCP Calls / Day</Label>
                        <Input
                            id="max-mcp"
                            type="number"
                            min={0}
                            value={form.maxMcpCallsPerDay}
                            onChange={(e) =>
                                setForm({ ...form, maxMcpCallsPerDay: parseInt(e.target.value) || 0 })
                            }
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="max-credits">Max Credits / Call</Label>
                        <Input
                            id="max-credits"
                            type="number"
                            min={0}
                            value={form.maxCreditsPerCall}
                            onChange={(e) =>
                                setForm({ ...form, maxCreditsPerCall: parseInt(e.target.value) || 0 })
                            }
                        />
                    </div>
                </div>
            </div>
        </ScrollArea>
    );

    // --- Policy Detail View (read-only) ---

    const highlightClass = (sectionId: string) =>
        highlightedSection === sectionId
            ? "ring-2 ring-primary rounded-lg p-1 transition-all duration-1000"
            : "rounded-lg p-1 transition-all duration-1000";

    const PolicyDetailView = ({ policy }: { policy: PolicyTemplate }) => {
        const netMode = NETWORK_MODES[policy.networkMode ?? "whitelist"];
        return (
            <ScrollArea className="h-[480px] pr-4">
                <div className="space-y-5">
                    <div>
                        <p className="text-sm text-muted-foreground">Description</p>
                        <p className="text-sm mt-1">{policy.description || "No description"}</p>
                    </div>

                    {/* Network Mode + Whitelist section */}
                    <div ref={networkModeRef} className={highlightClass("network-mode")}>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Network Mode</p>
                                <Badge variant="outline" className="mt-1">
                                    {netMode?.label ?? policy.networkMode ?? "whitelist"}
                                </Badge>
                            </div>
                            {/* Skill Security Score section */}
                            <div ref={skillSecurityRef} className={highlightClass("skill-security")}>
                                <p className="text-sm text-muted-foreground">Min Security Grade</p>
                                <Badge
                                    variant={policy.minSkillSecurityScore === "A" ? "default" : "secondary"}
                                    className="mt-1"
                                >
                                    {policy.minSkillSecurityScore}
                                </Badge>
                            </div>
                        </div>

                        {(policy.networkMode ?? "whitelist") === "whitelist" && (policy.networkWhitelist?.length ?? 0) > 0 && (
                            <div className="mt-4">
                                <p className="text-sm text-muted-foreground mb-1.5">Network Whitelist</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {policy.networkWhitelist?.map((domain) => (
                                        <Badge key={domain} variant="secondary">
                                            {domain}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Allowed Providers section */}
                    <div ref={providerRestrictionsRef} className={highlightClass("provider-restrictions")}>
                        <p className="text-sm text-muted-foreground mb-1.5">Allowed Providers</p>
                        <div className="flex flex-wrap gap-1.5">
                            {policy.allowedProviders?.length ?? 0 > 0 ? (
                                policy.allowedProviders?.map((p) => (
                                    <Badge key={p} variant="secondary">
                                        {PROVIDERS.find((pr) => pr.id === p)?.label ?? p}
                                    </Badge>
                                ))
                            ) : (
                                <span className="text-sm text-muted-foreground">None configured</span>
                            )}
                        </div>
                    </div>

                    {policy.allowedModels?.length > 0 && (
                        <div>
                            <p className="text-sm text-muted-foreground mb-1.5">Allowed Models</p>
                            <div className="flex flex-wrap gap-1.5">
                                {policy.allowedModels?.map((m) => (
                                    <Badge key={m} variant="secondary">
                                        {m}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Skill Install Approval</p>
                            <p className="text-sm mt-1 flex items-center gap-1.5">
                                {policy.skillInstallApproval ? (
                                    <>
                                        <Check className="h-4 w-4 text-green-500" /> Required
                                    </>
                                ) : (
                                    <>
                                        <X className="h-4 w-4 text-muted-foreground" /> Not required
                                    </>
                                )}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Assigned Claws</p>
                            <p className="text-sm mt-1 font-mono">{policy.assignedClawsCount ?? 0}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Max Workflows / Day</p>
                            <p className="text-sm mt-1 font-mono">{policy.maxWorkflowExecutionsPerDay.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Max MCP Calls / Day</p>
                            <p className="text-sm mt-1 font-mono">{policy.maxMcpCallsPerDay.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Max Credits / Call</p>
                            <p className="text-sm mt-1 font-mono">{policy.maxCreditsPerCall.toLocaleString()}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm text-muted-foreground">Last Modified</p>
                        <p className="text-sm mt-1">
                            {new Date(policy.lastModified || policy.updatedAt || Date.now()).toLocaleString()}
                        </p>
                    </div>
                </div>
            </ScrollArea>
        );
    };

    // --- Render ---

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Claw Policies</h1>
                    <p className="text-muted-foreground">
                        Define and manage OPA-based policy templates for your claw fleet.
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Create Policy
                </Button>
            </div>

            {/* Compliance status card */}
            {complianceStatus && (
                <Card>
                    <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            <div>
                                <p className="text-sm font-medium">Policy Coverage</p>
                                <p className="text-xs text-muted-foreground">
                                    {complianceStatus.clawsWithPolicy} of {complianceStatus.totalClaws} claws have policies assigned
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-2xl font-bold tabular-nums">
                                    {coveragePercent}%
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Last sync</p>
                                <p className="text-xs">
                                    {new Date(complianceStatus.lastSyncAt).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Main content tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="templates" className="gap-1.5">
                        <FileCode2 className="h-4 w-4" /> Templates
                    </TabsTrigger>
                    <TabsTrigger value="test" className="gap-1.5">
                        <Play className="h-4 w-4" /> Test Policy
                    </TabsTrigger>
                </TabsList>

                {/* Templates Tab */}
                <TabsContent value="templates">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : !policies?.length ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <h3 className="text-lg font-semibold">No policy templates</h3>
                                <p className="text-muted-foreground mt-2 max-w-sm">
                                    Create your first policy template to enforce governance rules on your claw fleet.
                                </p>
                                <Button onClick={openCreate} className="mt-6">
                                    <Plus className="mr-2 h-4 w-4" /> Create your first policy
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle>Policy Templates</CardTitle>
                                <CardDescription>
                                    System templates are read-only. Custom templates can be edited or deleted.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Network Mode</TableHead>
                                            <TableHead className="text-right">Providers</TableHead>
                                            <TableHead>Security Grade</TableHead>
                                            <TableHead className="text-right">Assigned Claws</TableHead>
                                            <TableHead>Last Modified</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {policies.map((policy) => (
                                            <TableRow key={policy.id}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        {policy.type === "system" ? (
                                                            <Lock className="h-4 w-4 text-muted-foreground" />
                                                        ) : (
                                                            <Settings2 className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                        <button
                                                            className="text-left hover:underline"
                                                            onClick={() => setViewingPolicy(policy)}
                                                        >
                                                            {policy.name}
                                                        </button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={policy.type === "system" ? "default" : "secondary"}>
                                                        {policy.type === "system" ? "System" : "Custom"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {NETWORK_MODES[policy.networkMode ?? "whitelist"]?.label ?? (policy.networkMode ?? "whitelist")}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm">
                                                    {policy.allowedProviders?.length ?? 0}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            policy.minSkillSecurityScore === "A"
                                                                ? "default"
                                                                : policy.minSkillSecurityScore === "F"
                                                                  ? "destructive"
                                                                  : "secondary"
                                                        }
                                                    >
                                                        {policy.minSkillSecurityScore}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm">
                                                    {policy.assignedClawsCount ?? 0}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(policy.lastModified || policy.updatedAt || Date.now()).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => setViewingPolicy(policy)}
                                                            title="View details"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        {policy.type === "custom" && (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => openEdit(policy)}
                                                                    title="Edit policy"
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => deleteMutation.mutate(policy.id)}
                                                                    title="Delete policy"
                                                                    className="text-destructive hover:text-destructive"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* Test Policy Tab */}
                <TabsContent value="test">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Play className="h-5 w-5" /> Test Policy
                            </CardTitle>
                            <CardDescription>
                                Simulate a request against a policy template to verify ALLOW/DENY behavior.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Test input */}
                                <div className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label>Policy Template</Label>
                                        <Select value={testPolicyId} onValueChange={setTestPolicyId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a policy to test" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {policies?.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Test Input (JSON)</Label>
                                        <Textarea
                                            value={testInput}
                                            onChange={(e) => setTestInput(e.target.value)}
                                            rows={12}
                                            className="font-mono text-sm"
                                            placeholder='{"provider": "openai", ...}'
                                        />
                                    </div>
                                    <Button
                                        onClick={handleTest}
                                        disabled={!testPolicyId || testMutation.isPending}
                                    >
                                        {testMutation.isPending ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Play className="mr-2 h-4 w-4" />
                                        )}
                                        Test
                                    </Button>
                                </div>

                                {/* Test result */}
                                <div>
                                    {testResult ? (
                                        <div className="space-y-4">
                                            <div
                                                className={`rounded-lg border p-4 ${
                                                    testResult.decision === "ALLOW"
                                                        ? "border-green-500/50 bg-green-500/10"
                                                        : "border-red-500/50 bg-red-500/10"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    {testResult.decision === "ALLOW" ? (
                                                        <Check className="h-5 w-5 text-green-500" />
                                                    ) : (
                                                        <X className="h-5 w-5 text-red-500" />
                                                    )}
                                                    <span
                                                        className={`text-lg font-bold ${
                                                            testResult.decision === "ALLOW"
                                                                ? "text-green-500"
                                                                : "text-red-500"
                                                        }`}
                                                    >
                                                        {testResult.decision}
                                                    </span>
                                                </div>
                                                <p className="text-sm">{testResult.reason}</p>
                                            </div>

                                            {testResult.matchedRules?.length > 0 && (
                                                <div>
                                                    <p className="text-sm font-medium text-green-500 mb-1.5">Matched Rules</p>
                                                    <div className="space-y-1">
                                                        {testResult.matchedRules?.map((rule, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-sm">
                                                                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                                                <span>{rule}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {testResult.failedRules?.length > 0 && (
                                                <div>
                                                    <p className="text-sm font-medium text-red-500 mb-1.5">Failed Rules</p>
                                                    <div className="space-y-1">
                                                        {testResult.failedRules?.map((rule, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-sm">
                                                                <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                                <span>{rule}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : testMutation.isPending ? (
                                        <div className="flex flex-col items-center justify-center h-full py-12">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                            <p className="text-sm text-muted-foreground mt-3">Evaluating policy...</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                                            <Shield className="h-10 w-10 text-muted-foreground/40 mb-3" />
                                            <p className="text-sm text-muted-foreground">
                                                Select a policy and provide test input, then click "Test" to see the result.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Create Policy Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-[650px]">
                    <DialogHeader>
                        <DialogTitle>Create Policy Template</DialogTitle>
                        <DialogDescription>
                            Define a custom policy template with network, provider, and rate limit rules.
                        </DialogDescription>
                    </DialogHeader>
                    <PolicyForm isEdit={false} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={createMutation.isPending || !form.name.trim()}>
                            {createMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Create Policy
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Policy Dialog */}
            <Dialog open={!!editingPolicy} onOpenChange={(open) => { if (!open) setEditingPolicy(null); }}>
                <DialogContent className="sm:max-w-[650px]">
                    <DialogHeader>
                        <DialogTitle>Edit Policy: {editingPolicy?.name}</DialogTitle>
                        <DialogDescription>
                            Modify the rules for this custom policy template.
                        </DialogDescription>
                    </DialogHeader>
                    <PolicyForm isEdit />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingPolicy(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdate} disabled={updateMutation.isPending || !form.name.trim()}>
                            {updateMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Policy Dialog (read-only detail) */}
            <Dialog open={!!viewingPolicy} onOpenChange={(open) => { if (!open) setViewingPolicy(null); }}>
                <DialogContent className="sm:max-w-[550px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {viewingPolicy?.type === "system" && (
                                <Lock className="h-4 w-4 text-muted-foreground" />
                            )}
                            {viewingPolicy?.name}
                        </DialogTitle>
                        <DialogDescription>
                            {viewingPolicy?.type === "system"
                                ? "System policy template (read-only)"
                                : "Custom policy template"}
                        </DialogDescription>
                    </DialogHeader>
                    {viewingPolicy && <PolicyDetailView policy={viewingPolicy} />}
                    <DialogFooter>
                        {viewingPolicy?.type === "custom" && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (viewingPolicy) {
                                        openEdit(viewingPolicy);
                                        setViewingPolicy(null);
                                    }
                                }}
                            >
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => setViewingPolicy(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
