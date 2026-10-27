import { useState, useEffect, useRef } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Loader2,
    Plus,
    Trash2,
    ShieldCheck,
    Users,
    AlertTriangle,
    Mail,
    Phone,
    Clock,
    Key,
    Lock,
    FileText,
    Send,
    Calendar,
    GraduationCap,
    Globe,
    X,
    Database,
    Settings2,
    BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Type definitions ──

interface Framework {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    progress: number;
    recommended: boolean;
    relevanceGuide: {
        relevantIf: string;
        notRelevantIf: string;
    };
}

interface ComplianceSettings {
    boardOversight: {
        enabled: boolean;
        emails: string[];
        frequency: "weekly" | "monthly" | "quarterly";
    };
    incidentResponse: {
        primaryContact: { name: string; email: string; phone: string };
        secondaryContact: { name: string; email: string; phone: string };
        escalationEmail: string;
        slackWebhookUrl: string;
    };
    dataRetention: {
        auditLogRetentionDays: number;
        dataRetentionDays: number;
        dataResidencyRegion: string;
    };
    authSecurity: {
        minPasswordLength: number;
        requireMfa: boolean;
        mfaEnforcedRoles: string[];
        sessionTimeoutMinutes: number;
        apiKeyExpiryDays: number;
    };
    dpoGovernance: {
        dpoName: string;
        dpoEmail: string;
        trainingProvider: string;
        lastTrainingDate: string;
        trainingFrequencyMonths: number;
    };
}

interface ScheduledReport {
    id: string;
    type: "board_oversight" | "audit_summary" | "compliance_status";
    recipients: string[];
    frequency: "weekly" | "monthly" | "quarterly";
    nextSendDate: string;
    frameworkIds: string[];
}

// ── Helper components ──

function TagInput({
    tags,
    onAdd,
    onRemove,
    placeholder,
}: {
    tags: string[];
    onAdd: (tag: string) => void;
    onRemove: (tag: string) => void;
    placeholder?: string;
}) {
    const [input, setInput] = useState("");

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === "Enter" || e.key === ",") && input.trim()) {
            e.preventDefault();
            const value = input.trim().replace(/,$/g, "");
            if (value && !tags.includes(value)) {
                onAdd(value);
            }
            setInput("");
        }
        if (e.key === "Backspace" && !input && tags.length > 0) {
            onRemove(tags[tags.length - 1]);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 min-h-[40px]">
            {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button
                        type="button"
                        onClick={() => onRemove(tag)}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </Badge>
            ))}
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tags.length === 0 ? placeholder : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
        </div>
    );
}

// ── Main component ──

// Map highlight keys to the tab they belong in
const HIGHLIGHT_TAB_MAP: Record<string, string> = {
    mfa: "auth-security",
    "password-policy": "auth-security",
    "retention-slider": "data-retention",
    escalation: "incident-response",
    "ir-contacts": "incident-response",
};

export default function ComplianceSettingsPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("frameworks");
    const [highlightKey, setHighlightKey] = useState<string | null>(null);
    const [isNewReportOpen, setIsNewReportOpen] = useState(false);

    // Refs for highlight-scrolling targets
    const mfaRef = useRef<HTMLDivElement>(null);
    const passwordPolicyRef = useRef<HTMLDivElement>(null);
    const retentionSliderRef = useRef<HTMLDivElement>(null);
    const escalationRef = useRef<HTMLDivElement>(null);
    const irContactsRef = useRef<HTMLDivElement>(null);

    const highlightRefMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
        mfa: mfaRef,
        "password-policy": passwordPolicyRef,
        "retention-slider": retentionSliderRef,
        escalation: escalationRef,
        "ir-contacts": irContactsRef,
    };

    // Read URL params on mount and switch tab / highlight section
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get("tab");
        const highlight = params.get("highlight");

        if (highlight && HIGHLIGHT_TAB_MAP[highlight]) {
            setActiveTab(HIGHLIGHT_TAB_MAP[highlight]);
            setHighlightKey(highlight);
        } else if (tab) {
            setActiveTab(tab);
        }
    }, []);

    // When highlightKey is set and tab content renders, scroll & highlight
    useEffect(() => {
        if (!highlightKey) return;
        const ref = highlightRefMap[highlightKey];
        if (!ref?.current) return;

        // Small delay to let the tab content render
        const scrollTimer = setTimeout(() => {
            ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            ref.current?.classList.add("ring-2", "ring-primary", "animate-pulse", "rounded-lg");
        }, 150);

        // Remove highlight after 3s
        const clearTimer = setTimeout(() => {
            ref.current?.classList.remove("ring-2", "ring-primary", "animate-pulse", "rounded-lg");
            setHighlightKey(null);
        }, 3150);

        return () => {
            clearTimeout(scrollTimer);
            clearTimeout(clearTimer);
        };
    }, [highlightKey, activeTab]);
    const [newReport, setNewReport] = useState<{
        type: string;
        recipients: string[];
        frequency: string;
        frameworkIds: string[];
    }>({
        type: "",
        recipients: [],
        frequency: "monthly",
        frameworkIds: [],
    });

    // ── Queries ──

    const { data: settings, isLoading: settingsLoading } = useQuery<ComplianceSettings>({
        queryKey: ["/api/compliance/settings"],
    });

    const { data: frameworksResponse, isLoading: frameworksLoading } = useQuery<{ frameworks: Framework[]; enabledCount: number }>({
        queryKey: ["/api/compliance/settings/frameworks"],
    });
    const frameworks = frameworksResponse?.frameworks ?? [];

    const { data: scheduledReports, isLoading: reportsLoading } = useQuery<ScheduledReport[]>({
        queryKey: ["/api/compliance/scheduled-reports"],
    });

    // ── Mutations ──

    const updateSettingsMutation = useMutation({
        mutationFn: async (data: Partial<ComplianceSettings>) => {
            await apiRequest("PUT", "/api/compliance/settings", data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/compliance/settings"] });
            toast({ title: "Settings updated", description: "Compliance settings have been saved." });
        },
        onError: (error: any) => {
            toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
        },
    });

    const toggleFrameworkMutation = useMutation({
        mutationFn: async ({ frameworkId, enabled }: { frameworkId: string; enabled: boolean }) => {
            await apiRequest("POST", "/api/compliance/settings/frameworks/toggle", { frameworkId, enabled });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/compliance/settings/frameworks"] });
            toast({ title: "Framework updated", description: "Framework status has been changed." });
        },
        onError: (error: any) => {
            toast({ title: "Error toggling framework", description: error.message, variant: "destructive" });
        },
    });

    const createReportMutation = useMutation({
        mutationFn: async (data: typeof newReport) => {
            await apiRequest("POST", "/api/compliance/scheduled-reports", data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/compliance/scheduled-reports"] });
            setIsNewReportOpen(false);
            setNewReport({ type: "", recipients: [], frequency: "monthly", frameworkIds: [] });
            toast({ title: "Report scheduled", description: "The scheduled report has been created." });
        },
        onError: (error: any) => {
            toast({ title: "Error creating report", description: error.message, variant: "destructive" });
        },
    });

    const deleteReportMutation = useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/compliance/scheduled-reports/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/compliance/scheduled-reports"] });
            toast({ title: "Report deleted", description: "The scheduled report has been removed." });
        },
        onError: (error: any) => {
            toast({ title: "Error deleting report", description: error.message, variant: "destructive" });
        },
    });

    // ── Local state for edits (using settings as defaults) ──

    const [localSettings, setLocalSettings] = useState<ComplianceSettings | null>(null);

    // Sync local with server settings on load
    const s = localSettings ?? settings ?? null;

    const updateLocal = (patch: Partial<ComplianceSettings>) => {
        if (!s) return;
        const merged = { ...s, ...patch };
        setLocalSettings(merged);
    };

    const saveSettings = () => {
        if (!s) return;
        updateSettingsMutation.mutate(s);
    };

    // ── Loading state ──

    if (settingsLoading || frameworksLoading) {
        return (
            <div className="flex justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ── Render ──

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Compliance Settings</h1>
                <p className="text-muted-foreground">
                    Configure your organization's compliance posture, frameworks, and governance controls.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex-wrap h-auto gap-1">
                    <TabsTrigger value="frameworks">
                        <ShieldCheck className="mr-2 h-4 w-4" /> Frameworks
                    </TabsTrigger>
                    <TabsTrigger value="board-oversight">
                        <Users className="mr-2 h-4 w-4" /> Board Oversight
                    </TabsTrigger>
                    <TabsTrigger value="incident-response">
                        <AlertTriangle className="mr-2 h-4 w-4" /> Incident Response
                    </TabsTrigger>
                    <TabsTrigger value="data-retention">
                        <Database className="mr-2 h-4 w-4" /> Data & Retention
                    </TabsTrigger>
                    <TabsTrigger value="auth-security">
                        <Lock className="mr-2 h-4 w-4" /> Auth & Security
                    </TabsTrigger>
                    <TabsTrigger value="dpo-governance">
                        <GraduationCap className="mr-2 h-4 w-4" /> DPO & Governance
                    </TabsTrigger>
                    <TabsTrigger value="scheduled-reports">
                        <BarChart3 className="mr-2 h-4 w-4" /> Scheduled Reports
                    </TabsTrigger>
                </TabsList>

                {/* ══════════════════════════════════════════════════
                    Tab 1: Frameworks
                   ══════════════════════════════════════════════════ */}
                <TabsContent value="frameworks" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Compliance Frameworks</CardTitle>
                            <CardDescription>
                                Enable the frameworks relevant to your organization. Each framework adds specific controls to your compliance posture.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!frameworks?.length ? (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    No frameworks available.
                                </p>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {frameworks.map((fw) => (
                                        <div
                                            key={fw.id}
                                            className={`relative rounded-lg border p-4 transition-colors ${
                                                fw.enabled
                                                    ? "border-primary/50 bg-primary/5"
                                                    : "border-border bg-muted/20"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-sm">{fw.name}</h4>
                                                    {fw.recommended && (
                                                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                                            Recommended
                                                        </Badge>
                                                    )}
                                                </div>
                                                <Switch
                                                    checked={fw.enabled}
                                                    onCheckedChange={(checked) =>
                                                        toggleFrameworkMutation.mutate({
                                                            frameworkId: fw.id,
                                                            enabled: checked,
                                                        })
                                                    }
                                                    disabled={toggleFrameworkMutation.isPending}
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-3">
                                                {fw.description}
                                            </p>

                                            {fw.enabled && (
                                                <div className="mb-3">
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className="text-muted-foreground">Progress</span>
                                                        <span className="font-medium">{fw.progress}%</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-primary transition-all"
                                                            style={{ width: `${fw.progress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-1.5">
                                                <p className="text-[11px] text-emerald-500">
                                                    <span className="font-medium">Relevant if:</span>{" "}
                                                    {fw.relevanceGuide.relevantIf}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    <span className="font-medium">Not relevant if:</span>{" "}
                                                    {fw.relevanceGuide.notRelevantIf}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══════════════════════════════════════════════════
                    Tab 2: Board Oversight
                   ══════════════════════════════════════════════════ */}
                <TabsContent value="board-oversight" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Board Oversight Reports</CardTitle>
                            <CardDescription>
                                Configure automated compliance reports sent to board members and oversight personnel.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-sm font-medium">Enable Board Reports</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Automatically send compliance reports to board members
                                    </p>
                                </div>
                                <Switch
                                    checked={s?.boardOversight?.enabled ?? false}
                                    onCheckedChange={(checked) =>
                                        updateLocal({
                                            boardOversight: {
                                                ...(s?.boardOversight ?? { emails: [], frequency: "monthly" as const }),
                                                enabled: checked,
                                            },
                                        })
                                    }
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label>Board Member Emails</Label>
                                <TagInput
                                    tags={s?.boardOversight?.emails ?? []}
                                    onAdd={(email) =>
                                        updateLocal({
                                            boardOversight: {
                                                ...(s?.boardOversight ?? { enabled: false, frequency: "monthly" as const }),
                                                emails: [...(s?.boardOversight?.emails ?? []), email],
                                            },
                                        })
                                    }
                                    onRemove={(email) =>
                                        updateLocal({
                                            boardOversight: {
                                                ...(s?.boardOversight ?? { enabled: false, frequency: "monthly" as const }),
                                                emails: (s?.boardOversight?.emails ?? []).filter((e) => e !== email),
                                            },
                                        })
                                    }
                                    placeholder="Enter email and press Enter..."
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label>Report Frequency</Label>
                                <Select
                                    value={s?.boardOversight?.frequency ?? "monthly"}
                                    onValueChange={(value: "weekly" | "monthly" | "quarterly") =>
                                        updateLocal({
                                            boardOversight: {
                                                ...(s?.boardOversight ?? { enabled: false, emails: [] }),
                                                frequency: value,
                                            },
                                        })
                                    }
                                >
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="quarterly">Quarterly</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="rounded-lg border bg-muted/30 p-4">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    Report Preview
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    The board oversight report includes: overall compliance score, framework-by-framework
                                    progress, open findings and remediation status, incident summary for the period,
                                    upcoming audit deadlines, and risk heatmap. Reports are delivered as PDF attachments.
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <Button onClick={saveSettings} disabled={updateSettingsMutation.isPending}>
                                    {updateSettingsMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Save Changes
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        toast({
                                            title: "Test report queued",
                                            description: "A test board oversight report will be sent shortly.",
                                        })
                                    }
                                >
                                    <Send className="mr-2 h-4 w-4" /> Send Test Report
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══════════════════════════════════════════════════
                    Tab 3: Incident Response
                   ══════════════════════════════════════════════════ */}
                <TabsContent value="incident-response" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Incident Response Configuration</CardTitle>
                            <CardDescription>
                                Define contacts and escalation paths for security incidents.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* IR Contacts (Primary + Secondary) */}
                            <div ref={irContactsRef} className="space-y-6 transition-all duration-300 p-2 -m-2">
                            {/* Primary IR Contact */}
                            <div>
                                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-primary" />
                                    Primary IR Contact
                                </h4>
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="grid gap-2">
                                        <Label htmlFor="ir-primary-name">Name</Label>
                                        <Input
                                            id="ir-primary-name"
                                            value={s?.incidentResponse?.primaryContact?.name ?? ""}
                                            onChange={(e) =>
                                                updateLocal({
                                                    incidentResponse: {
                                                        ...(s?.incidentResponse ?? {
                                                            secondaryContact: { name: "", email: "", phone: "" },
                                                            escalationEmail: "",
                                                            slackWebhookUrl: "",
                                                        }),
                                                        primaryContact: {
                                                            ...(s?.incidentResponse?.primaryContact ?? { email: "", phone: "" }),
                                                            name: e.target.value,
                                                        },
                                                    },
                                                })
                                            }
                                            placeholder="Jane Doe"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="ir-primary-email">Email</Label>
                                        <Input
                                            id="ir-primary-email"
                                            type="email"
                                            value={s?.incidentResponse?.primaryContact?.email ?? ""}
                                            onChange={(e) =>
                                                updateLocal({
                                                    incidentResponse: {
                                                        ...(s?.incidentResponse ?? {
                                                            secondaryContact: { name: "", email: "", phone: "" },
                                                            escalationEmail: "",
                                                            slackWebhookUrl: "",
                                                        }),
                                                        primaryContact: {
                                                            ...(s?.incidentResponse?.primaryContact ?? { name: "", phone: "" }),
                                                            email: e.target.value,
                                                        },
                                                    },
                                                })
                                            }
                                            placeholder="jane@company.com"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="ir-primary-phone">Phone</Label>
                                        <Input
                                            id="ir-primary-phone"
                                            type="tel"
                                            value={s?.incidentResponse?.primaryContact?.phone ?? ""}
                                            onChange={(e) =>
                                                updateLocal({
                                                    incidentResponse: {
                                                        ...(s?.incidentResponse ?? {
                                                            secondaryContact: { name: "", email: "", phone: "" },
                                                            escalationEmail: "",
                                                            slackWebhookUrl: "",
                                                        }),
                                                        primaryContact: {
                                                            ...(s?.incidentResponse?.primaryContact ?? { name: "", email: "" }),
                                                            phone: e.target.value,
                                                        },
                                                    },
                                                })
                                            }
                                            placeholder="+1 555-0100"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Secondary IR Contact */}
                            <div>
                                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    Secondary IR Contact
                                </h4>
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="grid gap-2">
                                        <Label htmlFor="ir-secondary-name">Name</Label>
                                        <Input
                                            id="ir-secondary-name"
                                            value={s?.incidentResponse?.secondaryContact?.name ?? ""}
                                            onChange={(e) =>
                                                updateLocal({
                                                    incidentResponse: {
                                                        ...(s?.incidentResponse ?? {
                                                            primaryContact: { name: "", email: "", phone: "" },
                                                            escalationEmail: "",
                                                            slackWebhookUrl: "",
                                                        }),
                                                        secondaryContact: {
                                                            ...(s?.incidentResponse?.secondaryContact ?? { email: "", phone: "" }),
                                                            name: e.target.value,
                                                        },
                                                    },
                                                })
                                            }
                                            placeholder="John Smith"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="ir-secondary-email">Email</Label>
                                        <Input
                                            id="ir-secondary-email"
                                            type="email"
                                            value={s?.incidentResponse?.secondaryContact?.email ?? ""}
                                            onChange={(e) =>
                                                updateLocal({
                                                    incidentResponse: {
                                                        ...(s?.incidentResponse ?? {
                                                            primaryContact: { name: "", email: "", phone: "" },
                                                            escalationEmail: "",
                                                            slackWebhookUrl: "",
                                                        }),
                                                        secondaryContact: {
                                                            ...(s?.incidentResponse?.secondaryContact ?? { name: "", phone: "" }),
                                                            email: e.target.value,
                                                        },
                                                    },
                                                })
                                            }
                                            placeholder="john@company.com"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="ir-secondary-phone">Phone</Label>
                                        <Input
                                            id="ir-secondary-phone"
                                            type="tel"
                                            value={s?.incidentResponse?.secondaryContact?.phone ?? ""}
                                            onChange={(e) =>
                                                updateLocal({
                                                    incidentResponse: {
                                                        ...(s?.incidentResponse ?? {
                                                            primaryContact: { name: "", email: "", phone: "" },
                                                            escalationEmail: "",
                                                            slackWebhookUrl: "",
                                                        }),
                                                        secondaryContact: {
                                                            ...(s?.incidentResponse?.secondaryContact ?? { name: "", email: "" }),
                                                            phone: e.target.value,
                                                        },
                                                    },
                                                })
                                            }
                                            placeholder="+1 555-0200"
                                        />
                                    </div>
                                </div>
                            </div>
                            </div>{/* end irContactsRef wrapper */}

                            {/* Escalation & Slack */}
                            <div ref={escalationRef} className="grid gap-4 sm:grid-cols-2 transition-all duration-300 p-2 -m-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="escalation-email">
                                        <Mail className="inline h-3.5 w-3.5 mr-1" />
                                        Escalation Email
                                    </Label>
                                    <Input
                                        id="escalation-email"
                                        type="email"
                                        value={s?.incidentResponse?.escalationEmail ?? ""}
                                        onChange={(e) =>
                                            updateLocal({
                                                incidentResponse: {
                                                    ...(s?.incidentResponse ?? {
                                                        primaryContact: { name: "", email: "", phone: "" },
                                                        secondaryContact: { name: "", email: "", phone: "" },
                                                        slackWebhookUrl: "",
                                                    }),
                                                    escalationEmail: e.target.value,
                                                },
                                            })
                                        }
                                        placeholder="security-escalation@company.com"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="slack-webhook">Slack Webhook URL</Label>
                                    <Input
                                        id="slack-webhook"
                                        value={s?.incidentResponse?.slackWebhookUrl ?? ""}
                                        onChange={(e) =>
                                            updateLocal({
                                                incidentResponse: {
                                                    ...(s?.incidentResponse ?? {
                                                        primaryContact: { name: "", email: "", phone: "" },
                                                        secondaryContact: { name: "", email: "", phone: "" },
                                                        escalationEmail: "",
                                                    }),
                                                    slackWebhookUrl: e.target.value,
                                                },
                                            })
                                        }
                                        placeholder="https://hooks.slack.com/services/..."
                                        className="font-mono text-xs"
                                    />
                                </div>
                            </div>

                            {/* IR Plan Upload Placeholder */}
                            <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                                <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                                <p className="text-sm font-medium text-muted-foreground">
                                    IR Plan Document
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Upload your incident response plan (PDF, DOCX). Coming soon.
                                </p>
                                <Button variant="outline" size="sm" className="mt-3" disabled>
                                    Upload Document
                                </Button>
                            </div>

                            <Button onClick={saveSettings} disabled={updateSettingsMutation.isPending}>
                                {updateSettingsMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Save Changes
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══════════════════════════════════════════════════
                    Tab 4: Data & Retention
                   ══════════════════════════════════════════════════ */}
                <TabsContent value="data-retention" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Data & Retention Policies</CardTitle>
                            <CardDescription>
                                Configure how long data and audit logs are retained.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Audit Log Retention */}
                            <div ref={retentionSliderRef} className="space-y-3 transition-all duration-300 p-2 -m-2">
                                <div className="flex items-center justify-between">
                                    <Label>Audit Log Retention</Label>
                                    <span className="text-sm font-medium tabular-nums">
                                        {(s?.dataRetention?.auditLogRetentionDays ?? 365) >= 3650
                                            ? "Unlimited"
                                            : `${s?.dataRetention?.auditLogRetentionDays ?? 365} days`}
                                    </span>
                                </div>
                                <Slider
                                    value={[s?.dataRetention?.auditLogRetentionDays ?? 365]}
                                    min={90}
                                    max={3650}
                                    step={30}
                                    onValueChange={([value]) =>
                                        updateLocal({
                                            dataRetention: {
                                                ...(s?.dataRetention ?? { dataRetentionDays: 365, dataResidencyRegion: "us-east-1" }),
                                                auditLogRetentionDays: value,
                                            },
                                        })
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Minimum 90 days. Values at 3650+ are treated as unlimited retention.
                                </p>
                            </div>

                            {/* Data Retention */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Data Retention</Label>
                                    <span className="text-sm font-medium tabular-nums">
                                        {(s?.dataRetention?.dataRetentionDays ?? 365) >= 3650
                                            ? "Unlimited"
                                            : `${s?.dataRetention?.dataRetentionDays ?? 365} days`}
                                    </span>
                                </div>
                                <Slider
                                    value={[s?.dataRetention?.dataRetentionDays ?? 365]}
                                    min={90}
                                    max={3650}
                                    step={30}
                                    onValueChange={([value]) =>
                                        updateLocal({
                                            dataRetention: {
                                                ...(s?.dataRetention ?? { auditLogRetentionDays: 365, dataResidencyRegion: "us-east-1" }),
                                                dataRetentionDays: value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {/* CMMC Warning */}
                            {(s?.dataRetention?.dataRetentionDays ?? 365) < 365 && (
                                <div className="flex items-start gap-3 rounded-lg border border-yellow-600/30 bg-yellow-900/10 p-3">
                                    <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-yellow-500">
                                            Retention below CMMC requirement
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            CMMC requires a minimum of 365 days data retention. Your current setting of{" "}
                                            {s?.dataRetention?.dataRetentionDays} days does not meet this requirement.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Data Residency */}
                            <div className="grid gap-2">
                                <Label className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                    Data Residency Region
                                </Label>
                                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                                    <span className="text-sm font-mono">
                                        {s?.dataRetention?.dataResidencyRegion ?? "us-east-1"}
                                    </span>
                                    <Badge variant="outline" className="text-xs">Read-only</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Data residency region is set at the organization level and cannot be changed here.
                                </p>
                            </div>

                            <Button onClick={saveSettings} disabled={updateSettingsMutation.isPending}>
                                {updateSettingsMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Save Changes
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══════════════════════════════════════════════════
                    Tab 5: Authentication & Security
                   ══════════════════════════════════════════════════ */}
                <TabsContent value="auth-security" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Authentication & Security</CardTitle>
                            <CardDescription>
                                Manage password policies, MFA requirements, and session configuration.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Password Length */}
                            <div ref={passwordPolicyRef} className="space-y-3 transition-all duration-300 p-2 -m-2">
                                <div className="flex items-center justify-between">
                                    <Label>Minimum Password Length</Label>
                                    <span className="text-sm font-medium tabular-nums">
                                        {s?.authSecurity?.minPasswordLength ?? 12} characters
                                    </span>
                                </div>
                                <Slider
                                    value={[s?.authSecurity?.minPasswordLength ?? 12]}
                                    min={8}
                                    max={32}
                                    step={1}
                                    onValueChange={([value]) =>
                                        updateLocal({
                                            authSecurity: {
                                                ...(s?.authSecurity ?? {
                                                    requireMfa: false,
                                                    mfaEnforcedRoles: [],
                                                    sessionTimeoutMinutes: 30,
                                                    apiKeyExpiryDays: 90,
                                                }),
                                                minPasswordLength: value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {/* Require MFA */}
                            <div ref={mfaRef} className="space-y-6 transition-all duration-300 p-2 -m-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-sm font-medium">Require MFA</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Enforce multi-factor authentication across the organization
                                    </p>
                                </div>
                                <Switch
                                    checked={s?.authSecurity?.requireMfa ?? false}
                                    onCheckedChange={(checked) =>
                                        updateLocal({
                                            authSecurity: {
                                                ...(s?.authSecurity ?? {
                                                    minPasswordLength: 12,
                                                    mfaEnforcedRoles: [],
                                                    sessionTimeoutMinutes: 30,
                                                    apiKeyExpiryDays: 90,
                                                }),
                                                requireMfa: checked,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {/* MFA Enforced Roles */}
                            {s?.authSecurity?.requireMfa && (
                                <div className="grid gap-2">
                                    <Label>MFA Enforced Roles</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {["Owner", "Admin", "Team Member", "Viewer"].map((role) => {
                                            const isSelected = (s?.authSecurity?.mfaEnforcedRoles ?? []).includes(role);
                                            return (
                                                <button
                                                    key={role}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = s?.authSecurity?.mfaEnforcedRoles ?? [];
                                                        const next = isSelected
                                                            ? current.filter((r) => r !== role)
                                                            : [...current, role];
                                                        updateLocal({
                                                            authSecurity: {
                                                                ...(s?.authSecurity ?? {
                                                                    minPasswordLength: 12,
                                                                    requireMfa: true,
                                                                    sessionTimeoutMinutes: 30,
                                                                    apiKeyExpiryDays: 90,
                                                                }),
                                                                mfaEnforcedRoles: next,
                                                            },
                                                        });
                                                    }}
                                                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                                                        isSelected
                                                            ? "border-primary bg-primary/10 text-foreground"
                                                            : "border-border hover:bg-muted/50 text-muted-foreground"
                                                    }`}
                                                >
                                                    {role}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Select which roles must have MFA enabled.
                                    </p>
                                </div>
                            )}
                            </div>{/* end mfaRef wrapper */}

                            {/* Session Timeout */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        Session Timeout
                                    </Label>
                                    <span className="text-sm font-medium tabular-nums">
                                        {s?.authSecurity?.sessionTimeoutMinutes ?? 30} minutes
                                    </span>
                                </div>
                                <Slider
                                    value={[s?.authSecurity?.sessionTimeoutMinutes ?? 30]}
                                    min={5}
                                    max={480}
                                    step={5}
                                    onValueChange={([value]) =>
                                        updateLocal({
                                            authSecurity: {
                                                ...(s?.authSecurity ?? {
                                                    minPasswordLength: 12,
                                                    requireMfa: false,
                                                    mfaEnforcedRoles: [],
                                                    apiKeyExpiryDays: 90,
                                                }),
                                                sessionTimeoutMinutes: value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {/* API Key Expiry */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-2">
                                        <Key className="h-4 w-4 text-muted-foreground" />
                                        API Key Expiry
                                    </Label>
                                    <span className="text-sm font-medium tabular-nums">
                                        {s?.authSecurity?.apiKeyExpiryDays ?? 90} days
                                    </span>
                                </div>
                                <Slider
                                    value={[s?.authSecurity?.apiKeyExpiryDays ?? 90]}
                                    min={7}
                                    max={365}
                                    step={7}
                                    onValueChange={([value]) =>
                                        updateLocal({
                                            authSecurity: {
                                                ...(s?.authSecurity ?? {
                                                    minPasswordLength: 12,
                                                    requireMfa: false,
                                                    mfaEnforcedRoles: [],
                                                    sessionTimeoutMinutes: 30,
                                                }),
                                                apiKeyExpiryDays: value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            <Button onClick={saveSettings} disabled={updateSettingsMutation.isPending}>
                                {updateSettingsMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Save Changes
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══════════════════════════════════════════════════
                    Tab 6: DPO & Governance
                   ══════════════════════════════════════════════════ */}
                <TabsContent value="dpo-governance" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>DPO & Governance</CardTitle>
                            <CardDescription>
                                Data Protection Officer details and security training configuration.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* DPO Info */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="dpo-name">DPO Name</Label>
                                    <Input
                                        id="dpo-name"
                                        value={s?.dpoGovernance?.dpoName ?? ""}
                                        onChange={(e) =>
                                            updateLocal({
                                                dpoGovernance: {
                                                    ...(s?.dpoGovernance ?? {
                                                        dpoEmail: "",
                                                        trainingProvider: "",
                                                        lastTrainingDate: "",
                                                        trainingFrequencyMonths: 12,
                                                    }),
                                                    dpoName: e.target.value,
                                                },
                                            })
                                        }
                                        placeholder="Data Protection Officer name"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="dpo-email">DPO Email</Label>
                                    <Input
                                        id="dpo-email"
                                        type="email"
                                        value={s?.dpoGovernance?.dpoEmail ?? ""}
                                        onChange={(e) =>
                                            updateLocal({
                                                dpoGovernance: {
                                                    ...(s?.dpoGovernance ?? {
                                                        dpoName: "",
                                                        trainingProvider: "",
                                                        lastTrainingDate: "",
                                                        trainingFrequencyMonths: 12,
                                                    }),
                                                    dpoEmail: e.target.value,
                                                },
                                            })
                                        }
                                        placeholder="dpo@company.com"
                                    />
                                </div>
                            </div>

                            {/* Training Config */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="training-provider">Security Training Provider</Label>
                                    <Input
                                        id="training-provider"
                                        value={s?.dpoGovernance?.trainingProvider ?? ""}
                                        onChange={(e) =>
                                            updateLocal({
                                                dpoGovernance: {
                                                    ...(s?.dpoGovernance ?? {
                                                        dpoName: "",
                                                        dpoEmail: "",
                                                        lastTrainingDate: "",
                                                        trainingFrequencyMonths: 12,
                                                    }),
                                                    trainingProvider: e.target.value,
                                                },
                                            })
                                        }
                                        placeholder="e.g. KnowBe4, Proofpoint"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="last-training-date">
                                        <Calendar className="inline h-3.5 w-3.5 mr-1" />
                                        Last Training Date
                                    </Label>
                                    <Input
                                        id="last-training-date"
                                        type="date"
                                        value={s?.dpoGovernance?.lastTrainingDate ?? ""}
                                        onChange={(e) =>
                                            updateLocal({
                                                dpoGovernance: {
                                                    ...(s?.dpoGovernance ?? {
                                                        dpoName: "",
                                                        dpoEmail: "",
                                                        trainingProvider: "",
                                                        trainingFrequencyMonths: 12,
                                                    }),
                                                    lastTrainingDate: e.target.value,
                                                },
                                            })
                                        }
                                    />
                                </div>
                            </div>

                            {/* Training Frequency */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label>Training Frequency</Label>
                                    <span className="text-sm font-medium tabular-nums">
                                        Every {s?.dpoGovernance?.trainingFrequencyMonths ?? 12} months
                                    </span>
                                </div>
                                <Slider
                                    value={[s?.dpoGovernance?.trainingFrequencyMonths ?? 12]}
                                    min={1}
                                    max={24}
                                    step={1}
                                    onValueChange={([value]) =>
                                        updateLocal({
                                            dpoGovernance: {
                                                ...(s?.dpoGovernance ?? {
                                                    dpoName: "",
                                                    dpoEmail: "",
                                                    trainingProvider: "",
                                                    lastTrainingDate: "",
                                                }),
                                                trainingFrequencyMonths: value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {/* Training Completion Placeholder */}
                            <div className="rounded-lg border bg-muted/30 p-4">
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                                    Training Completion Tracking
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                    Training completion tracking will show per-team-member completion status,
                                    overdue training alerts, and training certificate uploads. This feature is coming soon.
                                </p>
                            </div>

                            <Button onClick={saveSettings} disabled={updateSettingsMutation.isPending}>
                                {updateSettingsMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                Save Changes
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══════════════════════════════════════════════════
                    Tab 7: Scheduled Reports
                   ══════════════════════════════════════════════════ */}
                <TabsContent value="scheduled-reports" className="space-y-4">
                    <div className="flex justify-end">
                        <Button onClick={() => setIsNewReportOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" /> New Report
                        </Button>
                    </div>

                    {/* New Report Dialog */}
                    <Dialog open={isNewReportOpen} onOpenChange={setIsNewReportOpen}>
                        <DialogContent className="sm:max-w-[550px]">
                            <DialogHeader>
                                <DialogTitle>Schedule New Report</DialogTitle>
                                <DialogDescription>
                                    Create a new scheduled compliance report.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label>Report Type</Label>
                                    <Select
                                        value={newReport.type}
                                        onValueChange={(value) => setNewReport({ ...newReport, type: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select report type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="board_oversight">Board Oversight</SelectItem>
                                            <SelectItem value="audit_summary">Audit Summary</SelectItem>
                                            <SelectItem value="compliance_status">Compliance Status</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Recipients</Label>
                                    <TagInput
                                        tags={newReport.recipients}
                                        onAdd={(email) =>
                                            setNewReport({
                                                ...newReport,
                                                recipients: [...newReport.recipients, email],
                                            })
                                        }
                                        onRemove={(email) =>
                                            setNewReport({
                                                ...newReport,
                                                recipients: newReport.recipients.filter((r) => r !== email),
                                            })
                                        }
                                        placeholder="Enter email and press Enter..."
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label>Frequency</Label>
                                    <Select
                                        value={newReport.frequency}
                                        onValueChange={(value) =>
                                            setNewReport({ ...newReport, frequency: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                            <SelectItem value="quarterly">Quarterly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Frameworks</Label>
                                    <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto">
                                        {(frameworks ?? []).map((fw) => {
                                            const isSelected = newReport.frameworkIds.includes(fw.id);
                                            return (
                                                <button
                                                    key={fw.id}
                                                    type="button"
                                                    onClick={() => {
                                                        const next = isSelected
                                                            ? newReport.frameworkIds.filter((id) => id !== fw.id)
                                                            : [...newReport.frameworkIds, fw.id];
                                                        setNewReport({ ...newReport, frameworkIds: next });
                                                    }}
                                                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                                                        isSelected
                                                            ? "border-primary bg-primary/10 text-foreground"
                                                            : "border-border hover:bg-muted/50 text-muted-foreground"
                                                    }`}
                                                >
                                                    {fw.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsNewReportOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (!newReport.type || newReport.recipients.length === 0) {
                                            toast({
                                                title: "Missing fields",
                                                description: "Please select a report type and add at least one recipient.",
                                                variant: "destructive",
                                            });
                                            return;
                                        }
                                        createReportMutation.mutate(newReport);
                                    }}
                                    disabled={createReportMutation.isPending}
                                >
                                    {createReportMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Create Report
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Reports Table */}
                    {reportsLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : !scheduledReports?.length ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                <h3 className="text-lg font-semibold">No scheduled reports</h3>
                                <p className="text-muted-foreground mt-2 max-w-sm">
                                    Create a scheduled report to automatically send compliance summaries to stakeholders.
                                </p>
                                <Button onClick={() => setIsNewReportOpen(true)} className="mt-6">
                                    <Plus className="mr-2 h-4 w-4" /> Schedule your first report
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle>Scheduled Reports</CardTitle>
                                <CardDescription>
                                    Automated compliance reports sent to stakeholders.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Recipients</TableHead>
                                            <TableHead>Frequency</TableHead>
                                            <TableHead>Next Send</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {scheduledReports.map((report) => (
                                            <TableRow key={report.id}>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-xs capitalize">
                                                        {report.type.replace(/_/g, " ")}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                        {report.recipients.slice(0, 2).map((r) => (
                                                            <span key={r} className="text-xs text-muted-foreground">
                                                                {r}
                                                            </span>
                                                        ))}
                                                        {report.recipients.length > 2 && (
                                                            <span className="text-xs text-muted-foreground">
                                                                +{report.recipients.length - 2} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm capitalize">
                                                    {report.frequency}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(report.nextSendDate).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => {
                                                            if (confirm("Delete this scheduled report?")) {
                                                                deleteReportMutation.mutate(report.id);
                                                            }
                                                        }}
                                                        disabled={deleteReportMutation.isPending}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
