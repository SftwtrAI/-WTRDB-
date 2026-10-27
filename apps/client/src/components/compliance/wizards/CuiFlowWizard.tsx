import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
    ComplianceWizardDialog,
    LearnBox,
    ActionBox,
    type WizardStep,
} from "@/components/compliance/ComplianceWizardDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Lightbulb,
    ShieldCheck,
    FileText,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    Globe,
    Lock,
    Shield,
    Eye,
    Database,
    Network,
    Loader2,
    Bot,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ════════════════════════════════════════════════════════════════════════════════
// CuiFlowWizard — AC.2.016
//
// 4-step wizard guiding the user through classifying their claw agents and
// configuring network policies to control the flow of CUI.
// ════════════════════════════════════════════════════════════════════════════════

interface CuiFlowWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
}

// ── Types ──

interface ClawAgent {
    id: string;
    name: string;
    description: string | null;
    status: string;
    policyId: string | null;
    classification?: string;
    sandboxImage?: string;
}

type ClassificationLevel = "public" | "internal" | "confidential" | "restricted";

const CLASSIFICATION_CONFIG: Record<
    ClassificationLevel,
    { label: string; color: string; bgColor: string; description: string; icon: typeof Globe }
> = {
    public: {
        label: "Public",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        description: "No restrictions on data flow",
        icon: Globe,
    },
    internal: {
        label: "Internal",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
        description: "Org-only access",
        icon: Eye,
    },
    confidential: {
        label: "Confidential",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        description: "Need-to-know basis",
        icon: Lock,
    },
    restricted: {
        label: "Restricted",
        color: "text-red-400",
        bgColor: "bg-red-500/10",
        description: "CUI / regulated data - strictest controls",
        icon: Shield,
    },
};

// ── Component ──

export function CuiFlowWizard({
    open,
    onOpenChange,
    onComplete,
}: CuiFlowWizardProps) {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [configured, setConfigured] = useState(false);

    // Local classification overrides (since PATCH may not support classification yet)
    const [localClassifications, setLocalClassifications] = useState<Record<string, ClassificationLevel>>({});

    // ── Queries ──

    const { data: clawsResponse, isLoading: clawsLoading } = useQuery<ClawAgent[] | { claws: ClawAgent[] }>({
        queryKey: ["/api/claws"],
        enabled: open,
    });

    const claws: ClawAgent[] = useMemo(() => {
        if (!clawsResponse) return [];
        // The API may return an array or { claws: [...] }
        if (Array.isArray(clawsResponse)) return clawsResponse;
        if ("claws" in clawsResponse) return clawsResponse.claws;
        return [];
    }, [clawsResponse]);

    // ── Computed ──

    const getClassification = useCallback(
        (claw: ClawAgent): ClassificationLevel | null => {
            return localClassifications[claw.id] ?? (claw.classification as ClassificationLevel) ?? null;
        },
        [localClassifications],
    );

    const unclassifiedCount = useMemo(
        () => claws.filter((c) => !getClassification(c)).length,
        [claws, getClassification],
    );

    const classificationSummary = useMemo(() => {
        const summary: Record<ClassificationLevel, number> = {
            public: 0,
            internal: 0,
            confidential: 0,
            restricted: 0,
        };
        claws.forEach((c) => {
            const cls = getClassification(c);
            if (cls && cls in summary) {
                summary[cls]++;
            }
        });
        return summary;
    }, [claws, getClassification]);

    // ── Handlers ──

    const handleSetClassification = useCallback(
        (clawId: string, level: ClassificationLevel) => {
            setLocalClassifications((prev) => ({ ...prev, [clawId]: level }));

            // Attempt to save to the server (best-effort)
            apiRequest("PATCH", `/api/claws/${clawId}`, {
                classification: level,
            }).catch(() => {
                // Silently fail -- the local state is the source of truth for the wizard
            });
        },
        [],
    );

    const handleGoToPolicies = useCallback(() => {
        setLocation("/app/claw-policies?highlight=network-mode");
        onOpenChange(false);
    }, [setLocation, onOpenChange]);

    // ── Steps ──

    const steps: WizardStep[] = [
        // Step 1: What is CUI?
        {
            id: "learn-cui",
            title: "What is CUI?",
            description: "Understand Controlled Unclassified Information",
            variant: "learn",
            icon: <Lightbulb className="h-3 w-3 text-amber-400" />,
            content: (
                <div className="space-y-4">
                    <LearnBox>
                        <p className="font-medium text-foreground mb-2">
                            Controlled Unclassified Information (CUI)
                        </p>
                        <p>
                            CUI is information that the government creates or possesses, or that an entity
                            creates or possesses on behalf of the government, that requires safeguarding.
                            It is not classified, but it still needs protection under federal regulations.
                        </p>
                    </LearnBox>

                    <div className="rounded-lg border p-4 space-y-3">
                        <h4 className="text-sm font-medium">Examples of CUI:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                            <li>Technical drawings and engineering data</li>
                            <li>Export-controlled information (ITAR/EAR)</li>
                            <li>Personally Identifiable Information (PII)</li>
                            <li>Financial and procurement data</li>
                            <li>Legal privilege information</li>
                            <li>Critical infrastructure security data</li>
                        </ul>
                    </div>

                    <ActionBox variant="info">
                        <p className="font-medium text-foreground mb-1">Why classification matters</p>
                        <p>
                            If your AI agents process CUI, they must be classified as{" "}
                            <strong>Confidential</strong> or <strong>Restricted</strong>. This triggers
                            stricter network policies and access controls, ensuring CUI only flows through
                            authorized channels.
                        </p>
                    </ActionBox>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {(Object.entries(CLASSIFICATION_CONFIG) as [ClassificationLevel, typeof CLASSIFICATION_CONFIG[ClassificationLevel]][]).map(
                            ([level, cfg]) => {
                                const Icon = cfg.icon;
                                return (
                                    <div key={level} className={`rounded-lg border p-3 space-y-1 ${cfg.bgColor}`}>
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <Icon className={`h-4 w-4 ${cfg.color}`} />
                                            {cfg.label}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{cfg.description}</p>
                                    </div>
                                );
                            },
                        )}
                    </div>
                </div>
            ),
        },

        // Step 2: Classify Your Agents
        {
            id: "classify-agents",
            title: "Classify Your Agents",
            description: "Set data classification for each claw agent",
            variant: "action",
            icon: <Database className="h-3 w-3 text-orange-400" />,
            content: (
                <div className="space-y-4">
                    {clawsLoading ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Loading agents...
                        </div>
                    ) : claws.length === 0 ? (
                        <ActionBox variant="info">
                            <p>
                                No claw agents found. Create agents first in the{" "}
                                <strong>Claw Fleet</strong>, then return here to classify them.
                            </p>
                        </ActionBox>
                    ) : (
                        <>
                            {unclassifiedCount > 0 && (
                                <ActionBox variant="warning">
                                    <p>
                                        <strong>{unclassifiedCount} agent{unclassifiedCount !== 1 ? "s" : ""}</strong>{" "}
                                        {unclassifiedCount !== 1 ? "have" : "has"} no classification set.
                                        Unclassified agents are highlighted below.
                                    </p>
                                </ActionBox>
                            )}

                            <div className="rounded-lg border overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-xs">Agent</TableHead>
                                            <TableHead className="text-xs">Status</TableHead>
                                            <TableHead className="text-xs">Classification</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {claws.map((claw) => {
                                            const cls = getClassification(claw);
                                            const isUnclassified = !cls;
                                            return (
                                                <TableRow
                                                    key={claw.id}
                                                    className={isUnclassified ? "bg-red-500/5" : ""}
                                                >
                                                    <TableCell className="text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                                                            <div className="min-w-0">
                                                                <p className="font-medium truncate">
                                                                    {claw.name}
                                                                </p>
                                                                {claw.description && (
                                                                    <p className="text-xs text-muted-foreground truncate">
                                                                        {claw.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px]"
                                                        >
                                                            {claw.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select
                                                            value={cls ?? ""}
                                                            onValueChange={(v) =>
                                                                handleSetClassification(
                                                                    claw.id,
                                                                    v as ClassificationLevel,
                                                                )
                                                            }
                                                        >
                                                            <SelectTrigger
                                                                className={`h-8 text-xs w-[150px] ${
                                                                    isUnclassified
                                                                        ? "border-red-500/50 text-red-400"
                                                                        : ""
                                                                }`}
                                                            >
                                                                <SelectValue
                                                                    placeholder={
                                                                        isUnclassified
                                                                            ? "Not classified"
                                                                            : undefined
                                                                    }
                                                                />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {(
                                                                    Object.entries(CLASSIFICATION_CONFIG) as [
                                                                        ClassificationLevel,
                                                                        typeof CLASSIFICATION_CONFIG[ClassificationLevel],
                                                                    ][]
                                                                ).map(([level, cfg]) => (
                                                                    <SelectItem key={level} value={level}>
                                                                        <span className="flex items-center gap-2">
                                                                            <span
                                                                                className={`h-2 w-2 rounded-full ${cfg.color.replace(
                                                                                    "text-",
                                                                                    "bg-",
                                                                                )}`}
                                                                            />
                                                                            {cfg.label}
                                                                        </span>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            <LearnBox>
                                <p>
                                    <strong>Tip:</strong> When in doubt, classify as <strong>Confidential</strong>.
                                    It is safer to over-classify and relax later than to under-classify
                                    and expose CUI.
                                </p>
                            </LearnBox>
                        </>
                    )}
                </div>
            ),
        },

        // Step 3: Network Policies
        {
            id: "network-policies",
            title: "Network Policies",
            description: "Configure OPA policies for CUI agents",
            variant: "action",
            icon: <Network className="h-3 w-3 text-orange-400" />,
            content: (
                <div className="space-y-4">
                    <LearnBox>
                        <p className="font-medium text-foreground mb-2">OPA Policy Templates</p>
                        <p>
                            Open Policy Agent (OPA) policies control what your claw agents can do at runtime.
                            For agents handling CUI, you should use the <strong>Restrictive</strong> template
                            to prevent unauthorized data flows.
                        </p>
                    </LearnBox>

                    <div className="space-y-3">
                        {/* Restrictive */}
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-emerald-400" />
                                    <span className="text-sm font-medium">Restrictive</span>
                                </div>
                                <Badge className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                    Recommended for CUI
                                </Badge>
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside ml-6">
                                <li>Blocks all outbound network access by default</li>
                                <li>Whitelisted domains only</li>
                                <li>Local AI models only</li>
                                <li>Explicit tool approval required</li>
                            </ul>
                        </div>

                        {/* Standard */}
                        <div className="rounded-lg border p-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-medium">Standard</span>
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside ml-6">
                                <li>Balanced security and functionality</li>
                                <li>Common integrations allowed</li>
                                <li>Suitable for internal-classified agents</li>
                            </ul>
                        </div>

                        {/* Permissive */}
                        <div className="rounded-lg border border-red-500/20 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-red-400" />
                                    <span className="text-sm font-medium">Permissive</span>
                                </div>
                                <Badge variant="destructive" className="text-[10px]">
                                    Not for CUI
                                </Badge>
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside ml-6">
                                <li>All outbound access allowed</li>
                                <li>Development and testing only</li>
                                <li>Never use for agents handling CUI</li>
                            </ul>
                        </div>
                    </div>

                    <Button
                        className="w-full gap-2"
                        variant="outline"
                        onClick={handleGoToPolicies}
                    >
                        <ArrowRight className="h-4 w-4" />
                        Go to Claw Policies
                    </Button>

                    <ActionBox variant="warning">
                        <p>
                            Any agent classified as <strong>Confidential</strong> or{" "}
                            <strong>Restricted</strong> should be assigned the Restrictive policy template.
                            Switch their network mode from "allow-all" to "whitelist" and add only authorized
                            destination domains.
                        </p>
                    </ActionBox>
                </div>
            ),
        },

        // Step 4: Verify
        {
            id: "verify",
            title: "Verify",
            description: "Review classifications and mark as configured",
            variant: "action",
            icon: <CheckCircle2 className="h-3 w-3 text-emerald-400" />,
            content: (
                <div className="space-y-4">
                    <ActionBox variant="success">
                        <p className="font-medium text-foreground mb-1">CUI Flow Review Complete</p>
                        <p>
                            Review the summary below. Ensure all CUI-handling agents are properly
                            classified and assigned restrictive policies.
                        </p>
                    </ActionBox>

                    {/* Classification summary */}
                    <div className="rounded-lg border p-4 space-y-3">
                        <h4 className="text-sm font-medium">Classification Summary</h4>
                        <div className="space-y-2">
                            {(Object.entries(CLASSIFICATION_CONFIG) as [ClassificationLevel, typeof CLASSIFICATION_CONFIG[ClassificationLevel]][]).map(
                                ([level, cfg]) => {
                                    const count = classificationSummary[level];
                                    const Icon = cfg.icon;
                                    return (
                                        <div key={level} className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                                                {cfg.label}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {count} agent{count !== 1 ? "s" : ""}
                                            </span>
                                        </div>
                                    );
                                },
                            )}
                            {unclassifiedCount > 0 && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-2 text-red-400">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Unclassified
                                    </span>
                                    <span className="text-red-400 font-medium">
                                        {unclassifiedCount} agent{unclassifiedCount !== 1 ? "s" : ""}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Checklist */}
                    <div className="rounded-lg border p-4 space-y-2">
                        <h4 className="text-sm font-medium">Compliance Checklist</h4>
                        <div className="space-y-1.5">
                            {[
                                {
                                    label: "All agents have a classification level",
                                    done: unclassifiedCount === 0,
                                },
                                {
                                    label: "CUI agents use Restrictive policy",
                                    done: false, // Cannot verify without policy data
                                },
                                {
                                    label: "Network mode set to whitelist for CUI agents",
                                    done: false,
                                },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                    {item.done ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                    ) : (
                                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/50 shrink-0" />
                                    )}
                                    <span className={item.done ? "text-muted-foreground" : ""}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <LearnBox>
                        <p>
                            <strong>Next steps:</strong> Regularly review agent classifications
                            when new agents are created or when data handling requirements change.
                            Use the compliance dashboard to monitor CUI flow compliance.
                        </p>
                    </LearnBox>

                    {configured ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Marked as configured
                        </div>
                    ) : (
                        <Button
                            className="w-full gap-2"
                            onClick={() => setConfigured(true)}
                        >
                            <ShieldCheck className="h-4 w-4" />
                            Mark AC.2.016 as Configured
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <ComplianceWizardDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Control CUI Flow"
            description="CMMC AC.2.016 -- Classify agents and configure network policies for CUI protection"
            controlId="AC.2.016"
            steps={steps}
            onComplete={onComplete}
        />
    );
}
