import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Loader2,
    ShieldCheck,
    Shield,
    Lock,
    Users,
    Activity,
    FileText,
    Download,
    CheckCircle2,
    AlertCircle,
    Clock,
    BarChart3,
    ClipboardCheck,
    Database,
    Settings,
    Play,
    RefreshCw,
    Zap,
    ChevronDown,
    ExternalLink,
    ChevronRight,
    Lightbulb,
    AlertTriangle,
    ArrowRight,
    BookOpen,
    Target,
    Wrench,
    CircleCheck,
    CircleDot,
    Info,
    Search,
    Plus,
    Upload,
    FileCheck,
    PenLine,
    Camera,
    XCircle,
    Eye,
    Sparkles,
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
    LeastPrivilegeWizard,
    CuiFlowWizard,
    SeparationOfDutiesWizard,
    MfaEnforcementWizard,
    AuditRetentionWizard,
    AuditReviewWizard,
    ConfigBaselineWizard,
    LeastFunctionalityWizard,
    PasswordPolicyWizard,
    IncidentResponseWizard,
    EventDetectionWizard,
    BoundaryMonitoringWizard,
    VulnerabilityManagementWizard,
    MalwareProtectionWizard,
    SecurityMonitoringWizard,
} from "@/components/compliance/wizards";

// Map of control IDs to their dedicated compliance wizard components
const CONTROL_WIZARD_MAP: Record<string, React.ComponentType<{ open?: boolean; onOpenChange?: (open: boolean) => void; onComplete?: () => void }>> = {
    "AC.2.007": LeastPrivilegeWizard,
    "AC.2.016": CuiFlowWizard,
    "AC.3.017": SeparationOfDutiesWizard,
    "AC.3.021": MfaEnforcementWizard,
    "AU.2.042": AuditRetentionWizard,
    "AU.3.045": AuditReviewWizard,
    "CM.2.061": ConfigBaselineWizard,
    "CM.2.064": LeastFunctionalityWizard,
    "IA.2.078": PasswordPolicyWizard,
    "IA.2.081": MfaEnforcementWizard,
    "IR.2.092": IncidentResponseWizard,
    "IR.2.093": EventDetectionWizard,
    "SC.1.175": BoundaryMonitoringWizard,
    "SI.1.210": VulnerabilityManagementWizard,
    "SI.1.211": MalwareProtectionWizard,
    "SI.2.214": SecurityMonitoringWizard,
};

// Control IDs that have dedicated compliance wizards
const WIZARD_CONTROL_IDS = new Set(Object.keys(CONTROL_WIZARD_MAP));

// --- Types ---

interface ComplianceOverview {
    encryption: {
        atRest: boolean;
        inTransit: boolean;
        keyRotation: boolean;
    };
    policyCoveragePercent: number;
    rbac: {
        totalRoles: number;
        assignedUsers: number;
        activePermissions: number;
    };
    auditLog: {
        events24h: number;
        events7d: number;
        events30d: number;
    };
}

interface EvidenceItem {
    type: "opa_policy" | "db_record" | "config" | "audit_log";
    label: string;
    detail: string;
    verified: boolean;
    verifiedAt: string | null;
}

interface OpaIntegration {
    policyPackage: string;
    lastEvaluation: string | null;
    sampleResult: { allow: boolean; reason: string } | null;
}

interface LiveCheck {
    verified: boolean;
    checkedAt: string | null;
    detail: string;
}

interface RequiredAction {
    action: string;
    configPath?: string;
    automated: boolean;
}

interface ControlGuidance {
    learnMore: string;
    whyItMatters: string;
    requiredActions: RequiredAction[];
}

interface ComplianceControl {
    id: string;
    controlId: string;
    controlName: string;
    category: string;
    framework: string;
    status: "implemented" | "partial" | "planned" | "not_applicable";
    evidenceLink: string | null;
    notes: string;
    evidence: EvidenceItem[];
    liveCheck: LiveCheck;
    opaIntegration: OpaIntegration | null;
    guidance?: ControlGuidance;
}

interface ControlsResponse {
    framework: string;
    summary: {
        total: number;
        implemented: number;
        partial: number;
        planned: number;
        notApplicable: number;
        complianceScore: number;
    };
    controls: ComplianceControl[];
}

interface VerifyResult {
    controlId: string;
    verified: boolean;
    evidence: EvidenceItem[];
    opaResult?: { allow: boolean; reason: string };
    timestamp: string;
}

interface OpaStatus {
    healthy: boolean;
    latencyMs: number;
    circuitBreakerOpen: boolean;
    opaUrl: string;
    policies: Array<{ id: string; package: string }>;
    policyPackages: string[];
    dataKeys: string[];
    error?: string;
}

interface OpaEvalResult {
    policyPath: string;
    input: Record<string, any>;
    result: any;
    timestamp: string;
}

interface ComplianceReport {
    id: string;
    framework: string;
    generatedAt: string;
    dateRange: { start: string; end: string };
    format: string;
    data: Record<string, any>;
    period?: { start: string; end: string };
    summary?: Record<string, any>;
    sections?: Record<string, any>[];
}

interface AutoConfigActionResult {
    action: string;
    result: "done" | "skipped" | "failed";
    detail: string;
}

interface AutoConfigControlResult {
    controlId: string;
    controlName: string;
    status: "configured" | "skipped" | "manual_required" | "failed";
    actions: AutoConfigActionResult[];
}

interface AutoConfigResult {
    framework: string;
    configured: number;
    skipped: number;
    failed: number;
    manualRequired: number;
    results: AutoConfigControlResult[];
}

// --- Auto-Collected Evidence Types ---

interface AutoCollectedEvidenceItem {
    type: "audit_log_sample" | "config_check" | "database_query" | "opa_evaluation" | "system_check";
    title: string;
    description: string;
    passed: boolean;
    data: any;
    sampleSize?: number;
    totalRecords?: number;
}

interface AutoCollectedEvidence {
    controlId: string;
    summary: string;
    items: AutoCollectedEvidenceItem[];
    collectedAt?: string;
}

interface ManualEvidence {
    id?: string;
    type: "attestation" | "document" | "screenshot";
    title: string;
    description: string;
    fileName?: string;
    createdAt: string;
    addedBy?: string;
}

const FRAMEWORKS = [
    { id: "iso27001", label: "ISO 27001", color: "#07A288", description: "Information Security Management" },
    { id: "soc2", label: "SOC 2", color: "#5BBE4E", description: "Trust Service Criteria" },
    { id: "dpdp", label: "DPDP Act", color: "#B8E52B", description: "Digital Personal Data Protection" },
    { id: "cmmc", label: "CMMC", color: "#4A90D9", description: "Cybersecurity Maturity Model" },
    { id: "hipaa", label: "HIPAA", color: "#E74C3C", description: "Health Insurance Portability" },
    { id: "gdpr", label: "GDPR", color: "#3498DB", description: "EU Data Protection" },
    { id: "pci_dss", label: "PCI DSS", color: "#F39C12", description: "Payment Card Industry" },
    { id: "nist_csf", label: "NIST CSF", color: "#9B59B6", description: "Cybersecurity Framework" },
    { id: "fedramp", label: "FedRAMP", color: "#1ABC9C", description: "Federal Cloud Security" },
    { id: "ccpa", label: "CCPA/CPRA", color: "#E67E22", description: "California Consumer Privacy" },
    { id: "sox", label: "SOX", color: "#2C3E50", description: "Financial IT Controls" },
    { id: "cis", label: "CIS Controls", color: "#27AE60", description: "Internet Security Baseline" },
    { id: "csa_star", label: "CSA STAR", color: "#8E44AD", description: "Cloud Security Alliance" },
    { id: "iso42001", label: "ISO 42001", color: "#FF6B6B", description: "AI Management System" },
];

const STATUS_CONFIG: Record<
    string,
    { label: string; variant: "default" | "secondary" | "outline" | "destructive"; colorClass: string }
> = {
    implemented: { label: "Implemented", variant: "default", colorClass: "text-emerald-400" },
    partial: { label: "Partial", variant: "secondary", colorClass: "text-amber-400" },
    planned: { label: "Planned", variant: "outline", colorClass: "text-muted-foreground" },
    not_applicable: { label: "N/A", variant: "outline", colorClass: "text-muted-foreground" },
};

const EVIDENCE_ICONS: Record<EvidenceItem["type"], typeof Shield> = {
    opa_policy: Shield,
    db_record: Database,
    config: Settings,
    audit_log: FileText,
};

const EVIDENCE_COLORS: Record<EvidenceItem["type"], string> = {
    opa_policy: "text-primary",
    db_record: "text-blue-400",
    config: "text-purple-400",
    audit_log: "text-amber-400",
};

const AUTO_EVIDENCE_ICONS: Record<AutoCollectedEvidenceItem["type"], typeof Shield> = {
    audit_log_sample: FileText,
    config_check: Settings,
    database_query: Database,
    opa_evaluation: Shield,
    system_check: Activity,
};

const AUTO_EVIDENCE_COLORS: Record<AutoCollectedEvidenceItem["type"], string> = {
    audit_log_sample: "text-amber-400",
    config_check: "text-purple-400",
    database_query: "text-blue-400",
    opa_evaluation: "text-primary",
    system_check: "text-cyan-400",
};

const MANUAL_EVIDENCE_ICONS: Record<ManualEvidence["type"], typeof Shield> = {
    attestation: PenLine,
    document: FileCheck,
    screenshot: Camera,
};

// In-app routes that should navigate instead of showing a dialog
const IN_APP_ROUTES = new Set([
    "/app/roles",
    "/app/teams",
    "/app/claws",
    "/app/claw-policies",
    "/app/telephony",
    "/app/compliance",
    "/app/compliance-settings",
    "/app/settings",
    "/app/claw-fleet",
    "/app/copilot",
]);

// Check if a configPath (which may include query params) matches an in-app route
function isInAppRoute(configPath: string): boolean {
    const basePath = configPath.split("?")[0];
    return IN_APP_ROUTES.has(basePath);
}

// --- Animated Counter ---

function AnimatedCounter({ value, duration = 800 }: { value: number; duration?: number }) {
    const [display, setDisplay] = useState(0);
    const ref = useRef<number | null>(null);

    useEffect(() => {
        const start = display;
        const diff = value - start;
        if (diff === 0) return;
        const startTime = performance.now();

        function animate(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + diff * eased));
            if (progress < 1) {
                ref.current = requestAnimationFrame(animate);
            }
        }
        ref.current = requestAnimationFrame(animate);
        return () => {
            if (ref.current) cancelAnimationFrame(ref.current);
        };
    }, [value, duration]);

    return <span className="tabular-nums">{display}</span>;
}

// --- Circular Progress ---

function CircularProgress({ value, size = 120, strokeWidth = 10, color }: { value: number; size?: number; strokeWidth?: number; color?: string }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    const defaultColor = value >= 80 ? "#07A288" : value >= 50 ? "#F59E0B" : "#EF4444";
    const fillColor = color || defaultColor;

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/30"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={fillColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums" style={{ color: fillColor }}>
                    {value}%
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</span>
            </div>
        </div>
    );
}

// --- Status Icon ---

function StatusIcon({ status }: { status: string }) {
    if (status === "implemented") {
        return (
            <div className="relative flex items-center justify-center w-8 h-8">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: "3s" }} />
                <div className="relative rounded-full bg-emerald-500/20 p-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
            </div>
        );
    }
    if (status === "partial") {
        return (
            <div className="relative flex items-center justify-center w-8 h-8">
                <div className="absolute inset-0 rounded-full bg-amber-500/15 animate-pulse" style={{ animationDuration: "2s" }} />
                <div className="relative rounded-full bg-amber-500/20 p-1.5">
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-center justify-center w-8 h-8">
            <div className="rounded-full bg-muted/40 p-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
        </div>
    );
}

// --- Configuration Helper Dialog ---

function ConfigurationHelperDialog({
    open,
    onOpenChange,
    action,
    onNavigate,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    action: RequiredAction | null;
    onNavigate: (path: string) => void;
}) {
    const [notes, setNotes] = useState("");
    const [documented, setDocumented] = useState(false);

    if (!action) return null;

    const isInApp = action.configPath && isInAppRoute(action.configPath);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-primary" />
                        Configuration Guide
                    </DialogTitle>
                    <DialogDescription>
                        Follow the guidance below to implement this compliance action.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Action Description */}
                    <div className="rounded-lg border bg-muted/20 p-4">
                        <p className="text-sm font-medium">{action.action}</p>
                        {action.automated && (
                            <div className="flex items-center gap-1.5 mt-2">
                                <Zap className="h-3 w-3 text-primary" />
                                <span className="text-xs text-primary">This action can be verified automatically by the system</span>
                            </div>
                        )}
                    </div>

                    {/* Navigation or Documentation */}
                    {isInApp ? (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                This action can be configured directly in the application.
                            </p>
                            <Button
                                className="w-full gap-2"
                                onClick={() => {
                                    onNavigate(action.configPath!);
                                    onOpenChange(false);
                                }}
                            >
                                <ArrowRight className="h-4 w-4" />
                                Go to {action.configPath?.replace("/app/", "").replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                This is a procedural or organizational action. Document your implementation below:
                            </p>
                            <div className="grid gap-2">
                                <Label className="text-xs">Implementation Notes</Label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Describe what you've done to address this requirement..."
                                    className="h-24 text-sm resize-none"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="documented"
                                    checked={documented}
                                    onChange={(e) => setDocumented(e.target.checked)}
                                    className="h-4 w-4 rounded border-border"
                                />
                                <Label htmlFor="documented" className="text-sm cursor-pointer">
                                    I have implemented this action or created a plan for implementation
                                </Label>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    {!isInApp && (
                        <Button
                            disabled={!documented}
                            onClick={() => {
                                onOpenChange(false);
                                setNotes("");
                                setDocumented(false);
                            }}
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Mark as Addressed
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Framework Progress Card ---

function FrameworkProgressCard({
    framework,
    summary,
    isActive,
    isLoading,
    isAutoConfiguring,
    onClick,
    onStartConfig,
    onAutoConfig,
}: {
    framework: typeof FRAMEWORKS[number];
    summary: ControlsResponse["summary"] | null;
    isActive: boolean;
    isLoading: boolean;
    isAutoConfiguring: boolean;
    onClick: () => void;
    onStartConfig: () => void;
    onAutoConfig: () => void;
}) {
    const score = summary?.complianceScore ?? 0;
    const implemented = summary?.implemented ?? 0;
    const total = summary?.total ?? 0;

    return (
        <Card
            className={`cursor-pointer transition-all duration-200 border-border/50 bg-card/50 hover:border-border ${
                isActive ? "ring-1 ring-primary border-primary/50" : ""
            }`}
            onClick={onClick}
        >
            <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="text-sm font-semibold">{framework.label}</h3>
                        <p className="text-[10px] text-muted-foreground">{framework.description}</p>
                    </div>
                    {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                        <div className="text-right">
                            <span className="text-2xl font-bold tabular-nums" style={{ color: framework.color }}>
                                {score}%
                            </span>
                        </div>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden mb-2">
                    <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${score}%`, backgroundColor: framework.color }}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                        {implemented} / {total} controls
                    </span>
                    <div className="flex items-center gap-1">
                        {!isLoading && score < 100 && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] gap-1 px-2"
                                disabled={isAutoConfiguring}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAutoConfig();
                                }}
                            >
                                {isAutoConfiguring ? (
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                ) : (
                                    <Zap className="h-2.5 w-2.5" />
                                )}
                                One-Click
                            </Button>
                        )}
                        {!isLoading && score < 100 && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] gap-1 px-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStartConfig();
                                }}
                            >
                                <Target className="h-2.5 w-2.5" />
                                Start
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Evidence Status Badge ---

function EvidenceStatusBadge({ passed }: { passed: boolean | null }) {
    if (passed === true) {
        return (
            <Badge variant="outline" className="text-[9px] h-4 gap-0.5 border-emerald-500/40 text-emerald-400 shrink-0">
                <CheckCircle2 className="h-2 w-2" />
                Passed
            </Badge>
        );
    }
    if (passed === false) {
        return (
            <Badge variant="outline" className="text-[9px] h-4 gap-0.5 border-red-500/40 text-red-400 shrink-0">
                <XCircle className="h-2 w-2" />
                Failed
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className="text-[9px] h-4 gap-0.5 border-amber-500/40 text-amber-400 shrink-0">
            <AlertCircle className="h-2 w-2" />
            Needs Review
        </Badge>
    );
}

// --- Auto-Collected Evidence Item Renderer ---

function AutoEvidenceItemCard({ item }: { item: AutoCollectedEvidenceItem }) {
    const Icon = AUTO_EVIDENCE_ICONS[item.type] || Settings;
    const iconColor = AUTO_EVIDENCE_COLORS[item.type] || "text-muted-foreground";

    return (
        <div className={`rounded-lg border p-3 space-y-2 ${
            item.passed ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"
        }`}>
            <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full border bg-card ${
                    item.passed ? "border-emerald-500/40" : "border-red-500/40"
                }`}>
                    <Icon className={`h-3 w-3 ${iconColor}`} />
                </div>
                <span className="text-xs font-semibold flex-1">{item.title}</span>
                <EvidenceStatusBadge passed={item.passed} />
            </div>
            <p className="text-xs text-muted-foreground">{item.description}</p>

            {/* Type-specific rendering */}
            {item.type === "audit_log_sample" && item.data?.sample && (
                <div className="space-y-1.5">
                    <div className="rounded border bg-background/60 overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="text-[10px] h-7 px-2">Timestamp</TableHead>
                                    <TableHead className="text-[10px] h-7 px-2">User</TableHead>
                                    <TableHead className="text-[10px] h-7 px-2">Action</TableHead>
                                    <TableHead className="text-[10px] h-7 px-2">Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(item.data.sample as any[]).slice(0, 5).map((entry: any, idx: number) => (
                                    <TableRow key={idx} className="hover:bg-muted/20">
                                        <TableCell className="text-[10px] py-1.5 px-2 font-mono whitespace-nowrap">
                                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "-"}
                                        </TableCell>
                                        <TableCell className="text-[10px] py-1.5 px-2">
                                            {entry.user || entry.userId || entry.actor || "-"}
                                        </TableCell>
                                        <TableCell className="text-[10px] py-1.5 px-2">
                                            <Badge variant="outline" className="text-[9px] h-4">
                                                {entry.action || entry.eventType || entry.type || "-"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-[10px] py-1.5 px-2 max-w-[200px] truncate">
                                            {entry.details || entry.description || entry.resource || "-"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {item.totalRecords && item.totalRecords > 5 && (
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                                Showing {Math.min(5, item.sampleSize || 5)} of {item.totalRecords} records
                            </span>
                            <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1 px-1.5 text-primary">
                                <Eye className="h-2.5 w-2.5" />
                                View all in Audit Log
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {item.type === "config_check" && item.data && (
                <div className="space-y-1.5">
                    {Object.entries(item.data).map(([key, value]: [string, any]) => {
                        if (key === "checks" && Array.isArray(value)) {
                            return value.map((check: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 text-xs rounded border bg-background/60 px-2.5 py-1.5">
                                    {check.passed !== false ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                    ) : (
                                        <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                    )}
                                    <span className="text-muted-foreground">{check.name || check.label}:</span>
                                    <span className="font-mono font-medium">{String(check.value ?? check.current ?? "-")}</span>
                                    {check.expected && (
                                        <span className="text-muted-foreground/60 ml-auto text-[10px]">
                                            expected: {String(check.expected)}
                                        </span>
                                    )}
                                </div>
                            ));
                        }
                        if (typeof value === "object") return null;
                        return (
                            <div key={key} className="flex items-center gap-2 text-xs rounded border bg-background/60 px-2.5 py-1.5">
                                {item.passed ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                )}
                                <span className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}:</span>
                                <span className="font-mono font-medium">{String(value)}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {item.type === "database_query" && item.data && (
                <div className="space-y-2">
                    {(() => {
                        const total = item.data.total ?? item.totalRecords ?? 0;
                        const passing = item.data.withUserId ?? item.data.passing ?? item.data.compliant ?? total;
                        const pct = total > 0 ? Math.round((passing / total) * 100) : 0;
                        return (
                            <>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className={pct === 100 ? "text-emerald-400 font-medium" : pct >= 80 ? "text-amber-400 font-medium" : "text-red-400 font-medium"}>
                                        {passing} of {total} records meet criteria ({pct}%)
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            pct === 100 ? "bg-emerald-400" : pct >= 80 ? "bg-amber-400" : "bg-red-400"
                                        }`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                {item.data.sample && Array.isArray(item.data.sample) && item.data.sample.length > 0 && (
                                    <div className="rounded border bg-background/60 overflow-hidden">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    {Object.keys(item.data.sample[0]).slice(0, 4).map((col) => (
                                                        <TableHead key={col} className="text-[10px] h-7 px-2">
                                                            {col.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
                                                        </TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {item.data.sample.slice(0, 5).map((row: any, idx: number) => (
                                                    <TableRow key={idx} className="hover:bg-muted/20">
                                                        {Object.keys(item.data.sample[0]).slice(0, 4).map((col) => (
                                                            <TableCell key={col} className="text-[10px] py-1.5 px-2 max-w-[180px] truncate font-mono">
                                                                {typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col] ?? "-")}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            )}

            {item.type === "opa_evaluation" && item.data && (
                <div className="space-y-1.5">
                    <div className={`flex items-center gap-2 text-xs rounded border px-2.5 py-1.5 ${
                        item.data.allow || item.data.result?.allow
                            ? "bg-emerald-500/10 border-emerald-500/30"
                            : "bg-red-500/10 border-red-500/30"
                    }`}>
                        {item.data.allow || item.data.result?.allow ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        <span className="font-medium">
                            Policy evaluation: {item.data.allow || item.data.result?.allow ? "ALLOW" : "DENY"}
                        </span>
                    </div>
                    {(item.data.reason || item.data.result?.reason) && (
                        <p className="text-[10px] text-muted-foreground px-1">
                            Reason: {item.data.reason || item.data.result?.reason}
                        </p>
                    )}
                    <pre className="rounded border bg-background/60 p-2 text-[10px] font-mono overflow-x-auto whitespace-pre max-h-32 overflow-y-auto">
{JSON.stringify(item.data, null, 2)}
                    </pre>
                </div>
            )}

            {item.type === "system_check" && item.data && (
                <div className="space-y-1.5">
                    {Object.entries(item.data).map(([key, value]: [string, any]) => {
                        if (typeof value === "object" && value !== null) return null;
                        const isBoolean = typeof value === "boolean";
                        return (
                            <div key={key} className="flex items-center gap-2 text-xs rounded border bg-background/60 px-2.5 py-1.5">
                                {isBoolean ? (
                                    value ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                    ) : (
                                        <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                    )
                                ) : (
                                    <Activity className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                )}
                                <span className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}:</span>
                                <span className="font-mono font-medium">{String(value)}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// --- Add Manual Evidence Dialog ---

function AddManualEvidenceDialog({
    open,
    onOpenChange,
    framework,
    controlId,
    onSubmit,
    isSubmitting,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    framework: string;
    controlId: string;
    onSubmit: (evidence: { type: string; title: string; description: string; fileName?: string }) => void;
    isSubmitting: boolean;
}) {
    const [evidenceType, setEvidenceType] = useState<string>("attestation");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [fileName, setFileName] = useState("");

    const handleSubmit = () => {
        onSubmit({
            type: evidenceType,
            title,
            description,
            fileName: evidenceType !== "attestation" ? fileName : undefined,
        });
    };

    const resetForm = () => {
        setEvidenceType("attestation");
        setTitle("");
        setDescription("");
        setFileName("");
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5 text-primary" />
                        Add Manual Evidence
                    </DialogTitle>
                    <DialogDescription>
                        Add manual evidence for control <span className="font-mono font-semibold text-foreground">{controlId}</span> in the {framework} framework.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid gap-2">
                        <Label className="text-xs">Evidence Type</Label>
                        <Select value={evidenceType} onValueChange={setEvidenceType}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="attestation" className="text-xs">
                                    <div className="flex items-center gap-2">
                                        <PenLine className="h-3 w-3" />
                                        Attestation
                                    </div>
                                </SelectItem>
                                <SelectItem value="document" className="text-xs">
                                    <div className="flex items-center gap-2">
                                        <FileCheck className="h-3 w-3" />
                                        Document
                                    </div>
                                </SelectItem>
                                <SelectItem value="screenshot" className="text-xs">
                                    <div className="flex items-center gap-2">
                                        <Camera className="h-3 w-3" />
                                        Screenshot
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label className="text-xs">Title</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Brief title for this evidence..."
                            className="h-8 text-xs"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label className="text-xs">
                            {evidenceType === "attestation" ? "Attestation Note" : "Description"}
                        </Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={
                                evidenceType === "attestation"
                                    ? "I confirm that this control has been implemented and verified..."
                                    : "Describe what this evidence demonstrates..."
                            }
                            className="h-24 text-xs resize-none"
                        />
                    </div>

                    {evidenceType !== "attestation" && (
                        <div className="grid gap-2">
                            <Label className="text-xs">File Name</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={fileName}
                                    onChange={(e) => setFileName(e.target.value)}
                                    placeholder={evidenceType === "screenshot" ? "screenshot-2026-03-30.png" : "policy-document.pdf"}
                                    className="h-8 text-xs flex-1"
                                />
                                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs shrink-0" disabled>
                                    <Upload className="h-3 w-3" />
                                    Upload
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                File upload coming soon. Enter the file name for reference.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!title.trim() || !description.trim() || isSubmitting}
                        className="gap-1.5"
                    >
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4" />
                        )}
                        Add Evidence
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Enhanced Control Card with Guidance ---

function GuidedControlCard({
    control,
    onVerify,
    isVerifying,
    verifyResult,
    onConfigure,
    onNavigate,
    onOpenWizard,
    initialOpen = false,
    initialAddEvidence = false,
}: {
    control: ComplianceControl;
    onVerify: () => void;
    isVerifying: boolean;
    verifyResult: VerifyResult | null;
    onConfigure: (action: RequiredAction) => void;
    onNavigate: (path: string) => void;
    onOpenWizard?: (controlId: string) => void;
    initialOpen?: boolean;
    initialAddEvidence?: boolean;
}) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(initialOpen);
    const statusCfg = STATUS_CONFIG[control.status] ?? STATUS_CONFIG.planned;
    const hasOpa = !!control.opaIntegration;
    const guidance = control.guidance;

    const displayEvidence = verifyResult?.evidence || control.evidence || [];

    // Auto-collected evidence state
    const [autoEvidence, setAutoEvidence] = useState<AutoCollectedEvidence | null>(null);
    const [isCollecting, setIsCollecting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Manual evidence state
    const [manualEvidence, setManualEvidence] = useState<ManualEvidence[]>([]);
    const [addEvidenceOpen, setAddEvidenceOpen] = useState(initialAddEvidence);
    const [isSubmittingEvidence, setIsSubmittingEvidence] = useState(false);

    // Collect evidence from auto-collect endpoint
    const handleCollectEvidence = async () => {
        setIsCollecting(true);
        try {
            const res = await apiRequest("GET", `/api/compliance/evidence/${control.framework}/${control.controlId}/auto-collect`);
            const data = await res.json() as AutoCollectedEvidence;
            data.collectedAt = new Date().toISOString();
            setAutoEvidence(data);
            toast({
                title: "Evidence Collected",
                description: data.summary || `${data.items?.length || 0} evidence items collected for ${control.controlId}.`,
            });
        } catch (error: any) {
            toast({
                title: "Evidence collection failed",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsCollecting(false);
        }
    };

    // Fetch user-uploaded evidence
    const fetchManualEvidence = async () => {
        try {
            const res = await apiRequest("GET", `/api/compliance/evidence/${control.framework}/${control.controlId}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setManualEvidence(data);
            }
        } catch {
            // Silently fail — manual evidence may not exist yet
        }
    };

    // Auto-fetch manual evidence when opened
    useEffect(() => {
        if (isOpen) {
            fetchManualEvidence();
        }
    }, [isOpen, control.controlId]);

    // Export evidence as JSON download
    const handleExportEvidence = async () => {
        setIsExporting(true);
        try {
            let evidenceData = autoEvidence;
            if (!evidenceData) {
                const res = await apiRequest("GET", `/api/compliance/evidence/${control.framework}/${control.controlId}/auto-collect`);
                evidenceData = await res.json() as AutoCollectedEvidence;
            }
            const exportPayload = {
                framework: control.framework,
                controlId: control.controlId,
                controlName: control.controlName,
                status: control.status,
                exportedAt: new Date().toISOString(),
                autoCollectedEvidence: evidenceData,
                manualEvidence: manualEvidence,
                verificationResult: verifyResult,
            };
            const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const date = new Date().toISOString().split("T")[0];
            a.href = url;
            a.download = `${control.framework}-${control.controlId}-evidence-${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast({ title: "Evidence exported", description: `Downloaded evidence package for ${control.controlId}.` });
        } catch (error: any) {
            toast({ title: "Export failed", description: error.message, variant: "destructive" });
        } finally {
            setIsExporting(false);
        }
    };

    // Submit manual evidence
    const handleSubmitManualEvidence = async (evidence: { type: string; title: string; description: string; fileName?: string }) => {
        setIsSubmittingEvidence(true);
        try {
            await apiRequest("POST", `/api/compliance/evidence/${control.framework}/${control.controlId}`, {
                type: evidence.type,
                title: evidence.title,
                description: evidence.description,
                fileName: evidence.fileName,
            });
            toast({ title: "Evidence added", description: `Manual evidence "${evidence.title}" has been recorded.` });
            setAddEvidenceOpen(false);
            fetchManualEvidence();
        } catch (error: any) {
            toast({ title: "Failed to add evidence", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmittingEvidence(false);
        }
    };

    // Combine evidence into a timeline sorted by date
    const buildTimeline = () => {
        const items: Array<{
            date: string;
            type: "auto" | "manual" | "verification";
            icon: typeof Shield;
            iconColor: string;
            title: string;
            detail: string;
            passed: boolean | null;
        }> = [];

        // Add auto-collected evidence items
        if (autoEvidence?.items) {
            for (const item of autoEvidence.items) {
                items.push({
                    date: autoEvidence.collectedAt || new Date().toISOString(),
                    type: "auto",
                    icon: AUTO_EVIDENCE_ICONS[item.type] || Settings,
                    iconColor: AUTO_EVIDENCE_COLORS[item.type] || "text-muted-foreground",
                    title: item.title,
                    detail: item.description,
                    passed: item.passed,
                });
            }
        }

        // Add manual evidence
        for (const item of manualEvidence) {
            items.push({
                date: item.createdAt,
                type: "manual",
                icon: MANUAL_EVIDENCE_ICONS[item.type as ManualEvidence["type"]] || FileText,
                iconColor: "text-indigo-400",
                title: item.title,
                detail: item.description,
                passed: null,
            });
        }

        // Add legacy evidence
        for (const ev of displayEvidence) {
            items.push({
                date: ev.verifiedAt || new Date().toISOString(),
                type: "verification",
                icon: EVIDENCE_ICONS[ev.type] || Settings,
                iconColor: EVIDENCE_COLORS[ev.type] || "text-muted-foreground",
                title: ev.label,
                detail: ev.detail,
                passed: ev.verified,
            });
        }

        // Sort by date descending
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return items;
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:border-border transition-colors">
                <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                    <div className="flex items-start gap-4 p-4">
                        {/* Status Icon */}
                        <StatusIcon status={control.status} />

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                    {control.controlId}
                                </span>
                                <h4 className="text-sm font-semibold truncate">{control.controlName}</h4>
                                <Badge variant={statusCfg.variant} className="gap-1 text-[10px] h-5">
                                    {statusCfg.label}
                                </Badge>
                                {hasOpa && (
                                    <Badge variant="outline" className="gap-1 text-[10px] h-5 border-primary/40 text-primary">
                                        <Shield className="h-2.5 w-2.5" />
                                        OPA
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{control.notes}</p>

                            {/* Live Status Indicator */}
                            {control.liveCheck && (
                                <div className="flex items-center gap-1.5 mt-2">
                                    <div className={`h-1.5 w-1.5 rounded-full ${
                                        control.liveCheck.verified ? "bg-emerald-400" : "bg-red-400"
                                    }`} />
                                    <span className="text-[10px] text-muted-foreground">
                                        {control.liveCheck.verified ? "Verified" : "Unverified"}
                                        {control.liveCheck.checkedAt && (
                                            <> at {new Date(control.liveCheck.checkedAt).toLocaleTimeString()}</>
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Compliance Wizard Button — prominent entry point for controls with dedicated wizards */}
                            {WIZARD_CONTROL_IDS.has(control.controlId) && onOpenWizard && (
                                <Button
                                    size="sm"
                                    className="h-7 text-xs gap-1 bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 text-primary-foreground shadow-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenWizard(control.controlId);
                                    }}
                                >
                                    <Sparkles className="h-3 w-3" />
                                    Compliance Wizard
                                </Button>
                            )}
                            {/* Configure Button — Opens wizard if available, otherwise navigates to configPath */}
                            {guidance && guidance.requiredActions.length > 0 && guidance.requiredActions[0].configPath && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // If this control has a wizard, open it instead of navigating
                                        if (WIZARD_CONTROL_IDS.has(control.controlId) && onOpenWizard) {
                                            onOpenWizard(control.controlId);
                                            return;
                                        }
                                        const firstAction = guidance.requiredActions[0];
                                        if (firstAction.configPath && isInAppRoute(firstAction.configPath)) {
                                            onNavigate(firstAction.configPath);
                                        } else {
                                            onConfigure(firstAction);
                                        }
                                    }}
                                >
                                    <Settings className="h-3 w-3" />
                                    Configure
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onVerify();
                                }}
                                disabled={isVerifying}
                            >
                                {isVerifying ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Zap className="h-3 w-3" />
                                )}
                                Verify
                            </Button>
                            <CollapsibleTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                    </div>

                    <AnimatePresence>
                        {isOpen && (
                            <CollapsibleContent forceMount>
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <Separator />
                                    <div className="p-4 space-y-4">
                                        {/* Verify Result Banner */}
                                        {verifyResult && (
                                            <div className={`rounded-lg border p-3 text-xs ${
                                                verifyResult.verified
                                                    ? "bg-emerald-500/10 border-emerald-500/30"
                                                    : "bg-red-500/10 border-red-500/30"
                                            }`}>
                                                <div className="flex items-center gap-2">
                                                    {verifyResult.verified ? (
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                                    ) : (
                                                        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                                                    )}
                                                    <span className="font-medium">
                                                        {verifyResult.verified ? "Verification Passed" : "Verification Incomplete"}
                                                    </span>
                                                    <span className="text-muted-foreground ml-auto">
                                                        {new Date(verifyResult.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Guidance Section — Learn More & Why It Matters */}
                                        {guidance && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {/* What is this? */}
                                                <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Lightbulb className="h-3.5 w-3.5 text-blue-400" />
                                                        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                                                            What is this?
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                                        {guidance.learnMore}
                                                    </p>
                                                </div>

                                                {/* Why it matters */}
                                                <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                                                            Why it matters
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                                        {guidance.whyItMatters}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Required Actions Checklist */}
                                        {guidance && guidance.requiredActions.length > 0 && (
                                            <div>
                                                <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                                    <ClipboardCheck className="h-3.5 w-3.5" />
                                                    Required Actions
                                                </h5>
                                                <div className="space-y-2">
                                                    {guidance.requiredActions.map((reqAction, idx) => {
                                                        const isActionVerified = control.status === "implemented" && reqAction.automated;
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                                                                    isActionVerified
                                                                        ? "bg-emerald-500/5 border-emerald-500/20"
                                                                        : "bg-card/80 border-border/50 hover:border-border"
                                                                }`}
                                                            >
                                                                {/* Checkbox / Status */}
                                                                <div className="mt-0.5 shrink-0">
                                                                    {isActionVerified ? (
                                                                        <CircleCheck className="h-4 w-4 text-emerald-400" />
                                                                    ) : reqAction.automated ? (
                                                                        <CircleDot className="h-4 w-4 text-amber-400" />
                                                                    ) : (
                                                                        <CircleDot className="h-4 w-4 text-muted-foreground/50" />
                                                                    )}
                                                                </div>

                                                                {/* Action Description */}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`text-xs ${isActionVerified ? "text-emerald-300" : ""}`}>
                                                                        {reqAction.action}
                                                                    </p>
                                                                    <div className="flex items-center gap-2 mt-1.5">
                                                                        {reqAction.automated && (
                                                                            <Badge
                                                                                variant="outline"
                                                                                className="text-[9px] h-4 gap-0.5 border-primary/30 text-primary"
                                                                            >
                                                                                <Zap className="h-2 w-2" />
                                                                                Auto-verified
                                                                            </Badge>
                                                                        )}
                                                                        {reqAction.configPath && (
                                                                            <Badge
                                                                                variant="outline"
                                                                                className="text-[9px] h-4 gap-0.5"
                                                                            >
                                                                                <ExternalLink className="h-2 w-2" />
                                                                                {reqAction.configPath}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Configure Button — opens wizard if available */}
                                                                {reqAction.configPath && !isActionVerified && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="h-6 text-[10px] gap-1 px-2 shrink-0"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (WIZARD_CONTROL_IDS.has(control.controlId) && onOpenWizard) {
                                                                                onOpenWizard(control.controlId);
                                                                                return;
                                                                            }
                                                                            if (isInAppRoute(reqAction.configPath!)) {
                                                                                onNavigate(reqAction.configPath!);
                                                                            } else {
                                                                                onConfigure(reqAction);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Settings className="h-2.5 w-2.5" />
                                                                        Configure
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Evidence Section — Enhanced */}
                                        <div className="space-y-4">
                                            {/* Evidence Header with Actions */}
                                            <div className="flex items-center justify-between">
                                                <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    Evidence
                                                    {autoEvidence && (
                                                        <Badge variant="outline" className="text-[9px] h-4 gap-0.5 border-primary/40 text-primary ml-1">
                                                            {autoEvidence.items?.length || 0} items
                                                        </Badge>
                                                    )}
                                                </h5>
                                                <div className="flex items-center gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-[10px] gap-1 px-2"
                                                        onClick={(e) => { e.stopPropagation(); handleCollectEvidence(); }}
                                                        disabled={isCollecting}
                                                    >
                                                        {isCollecting ? (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                        ) : (
                                                            <Search className="h-2.5 w-2.5" />
                                                        )}
                                                        Collect Evidence
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-[10px] gap-1 px-2"
                                                        onClick={(e) => { e.stopPropagation(); setAddEvidenceOpen(true); }}
                                                    >
                                                        <Plus className="h-2.5 w-2.5" />
                                                        Add Manual
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-[10px] gap-1 px-2"
                                                        onClick={(e) => { e.stopPropagation(); handleExportEvidence(); }}
                                                        disabled={isExporting}
                                                    >
                                                        {isExporting ? (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                        ) : (
                                                            <Download className="h-2.5 w-2.5" />
                                                        )}
                                                        Export
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Auto-Collected Evidence Summary */}
                                            {autoEvidence && (
                                                <div className="rounded-lg border bg-primary/5 border-primary/20 p-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Search className="h-3.5 w-3.5 text-primary" />
                                                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                                                            Auto-Collected Evidence
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground ml-auto">
                                                            {autoEvidence.collectedAt && new Date(autoEvidence.collectedAt).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mb-3">{autoEvidence.summary}</p>

                                                    {/* Evidence Items */}
                                                    <div className="space-y-2">
                                                        {autoEvidence.items?.map((item, idx) => (
                                                            <AutoEvidenceItemCard key={idx} item={item} />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Manual Evidence */}
                                            {manualEvidence.length > 0 && (
                                                <div className="rounded-lg border bg-indigo-500/5 border-indigo-500/20 p-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <PenLine className="h-3.5 w-3.5 text-indigo-400" />
                                                        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                                                            Manual Evidence
                                                        </span>
                                                        <Badge variant="outline" className="text-[9px] h-4 gap-0.5 border-indigo-500/40 text-indigo-400 ml-1">
                                                            {manualEvidence.length}
                                                        </Badge>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {manualEvidence.map((item, idx) => {
                                                            const Icon = MANUAL_EVIDENCE_ICONS[item.type] || FileText;
                                                            return (
                                                                <div key={idx} className="rounded-lg border bg-background/60 p-2.5 space-y-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <Icon className="h-3 w-3 text-indigo-400 shrink-0" />
                                                                        <span className="text-xs font-medium">{item.title}</span>
                                                                        <Badge variant="outline" className="text-[9px] h-4 capitalize">
                                                                            {item.type}
                                                                        </Badge>
                                                                        <span className="text-[10px] text-muted-foreground ml-auto">
                                                                            {new Date(item.createdAt).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-[10px] text-muted-foreground pl-5">{item.description}</p>
                                                                    {item.fileName && (
                                                                        <div className="flex items-center gap-1.5 pl-5">
                                                                            <FileCheck className="h-2.5 w-2.5 text-muted-foreground" />
                                                                            <span className="text-[10px] font-mono text-muted-foreground">{item.fileName}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Combined Evidence Timeline */}
                                            {(() => {
                                                const timeline = buildTimeline();
                                                if (timeline.length === 0 && !autoEvidence) {
                                                    return (
                                                        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
                                                            <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                                                            <p className="text-xs text-muted-foreground">
                                                                No evidence collected yet. Click "Collect Evidence" to auto-gather evidence from the system,
                                                                or "Add Manual" to record attestations and documents.
                                                            </p>
                                                        </div>
                                                    );
                                                }
                                                if (timeline.length === 0) return null;
                                                return (
                                                    <div>
                                                        <h6 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                                                            <Clock className="h-3 w-3" />
                                                            Evidence Timeline
                                                        </h6>
                                                        <div className="relative space-y-0">
                                                            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                                                            {timeline.map((entry, idx) => {
                                                                const Icon = entry.icon;
                                                                return (
                                                                    <div key={idx} className="relative flex items-start gap-3 py-2">
                                                                        <div className={`relative z-10 flex items-center justify-center w-[31px] h-[31px] rounded-full border bg-card ${
                                                                            entry.passed === true ? "border-emerald-500/40" :
                                                                            entry.passed === false ? "border-red-500/40" :
                                                                            "border-border"
                                                                        }`}>
                                                                            <Icon className={`h-3.5 w-3.5 ${entry.iconColor}`} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-xs font-medium">{entry.title}</span>
                                                                                <EvidenceStatusBadge passed={entry.passed} />
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className={`text-[9px] h-4 ${
                                                                                        entry.type === "auto" ? "border-primary/30 text-primary" :
                                                                                        entry.type === "manual" ? "border-indigo-500/30 text-indigo-400" :
                                                                                        "border-border text-muted-foreground"
                                                                                    }`}
                                                                                >
                                                                                    {entry.type === "auto" ? "Auto" : entry.type === "manual" ? "Manual" : "Verified"}
                                                                                </Badge>
                                                                            </div>
                                                                            <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>
                                                                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                                                                {new Date(entry.date).toLocaleString()}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Add Manual Evidence Dialog */}
                                        <AddManualEvidenceDialog
                                            open={addEvidenceOpen}
                                            onOpenChange={setAddEvidenceOpen}
                                            framework={control.framework}
                                            controlId={control.controlId}
                                            onSubmit={handleSubmitManualEvidence}
                                            isSubmitting={isSubmittingEvidence}
                                        />

                                        {/* OPA Integration Panel */}
                                        {control.opaIntegration && (
                                            <div>
                                                <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                                    <Shield className="h-3.5 w-3.5" />
                                                    OPA Policy Integration
                                                </h5>
                                                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <Shield className="h-3.5 w-3.5 text-primary" />
                                                        <span className="text-muted-foreground">Package:</span>
                                                        <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                                            {control.opaIntegration.policyPackage}
                                                        </code>
                                                    </div>
                                                    {control.opaIntegration.lastEvaluation && (
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                                            <span className="text-muted-foreground">Last Evaluation:</span>
                                                            <span>{new Date(control.opaIntegration.lastEvaluation).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    {(verifyResult?.opaResult || control.opaIntegration.sampleResult) && (
                                                        <div>
                                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Sample Evaluation Result</p>
                                                            <pre className="rounded border bg-background/60 p-2 text-[11px] font-mono overflow-x-auto whitespace-pre">
{JSON.stringify(verifyResult?.opaResult || control.opaIntegration.sampleResult, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </CollapsibleContent>
                        )}
                    </AnimatePresence>
                </Collapsible>
            </Card>
        </motion.div>
    );
}

// --- OPA Status Panel ---

function OpaStatusPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [evalPolicy, setEvalPolicy] = useState("");
    const [evalInput, setEvalInput] = useState('{\n  "org_id": "test",\n  "claw_id": "test",\n  "action": "read",\n  "resource": "data"\n}');

    const { data: opaStatus, isLoading: opaLoading, refetch: refetchOpa } = useQuery<OpaStatus>({
        queryKey: ["/api/compliance/opa-status"],
        refetchInterval: 30000,
    });

    const evalMutation = useMutation({
        mutationFn: async ({ policyPath, input }: { policyPath: string; input: Record<string, any> }) => {
            const res = await apiRequest("POST", "/api/compliance/opa-evaluate", { policyPath, input });
            return await res.json() as OpaEvalResult;
        },
    });

    const handleEvaluate = () => {
        if (!evalPolicy) return;
        try {
            const input = JSON.parse(evalInput);
            evalMutation.mutate({ policyPath: evalPolicy, input });
        } catch {
            // Invalid JSON
        }
    };

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card className="border-border/50 bg-card/50">
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Shield className="h-4 w-4 text-primary" />
                                <CardTitle className="text-sm">OPA Policy Engine</CardTitle>
                                {opaLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                ) : opaStatus?.healthy ? (
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
                                        <span className="text-[10px] text-muted-foreground">({opaStatus.latencyMs}ms)</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-2 w-2 rounded-full bg-red-400" />
                                        <span className="text-[10px] text-red-400 font-medium">Offline</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {opaStatus && (
                                    <span className="text-[10px] text-muted-foreground">
                                        {opaStatus.policyPackages.length} package{opaStatus.policyPackages.length !== 1 ? "s" : ""} loaded
                                    </span>
                                )}
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                            </div>
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>

                <AnimatePresence>
                    {isOpen && (
                        <CollapsibleContent forceMount>
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <Separator />
                                <CardContent className="pt-4 space-y-4">
                                    {opaStatus && (
                                        <>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p>
                                                    <p className={`text-sm font-semibold mt-1 ${opaStatus.healthy ? "text-emerald-400" : "text-red-400"}`}>
                                                        {opaStatus.healthy ? "Healthy" : "Unhealthy"}
                                                    </p>
                                                </div>
                                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Latency</p>
                                                    <p className="text-sm font-semibold mt-1 tabular-nums">{opaStatus.latencyMs}ms</p>
                                                </div>
                                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Circuit Breaker</p>
                                                    <p className={`text-sm font-semibold mt-1 ${opaStatus.circuitBreakerOpen ? "text-red-400" : "text-emerald-400"}`}>
                                                        {opaStatus.circuitBreakerOpen ? "Open" : "Closed"}
                                                    </p>
                                                </div>
                                                <div className="rounded-lg border bg-muted/20 p-2.5">
                                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Endpoint</p>
                                                    <p className="text-sm font-mono mt-1 truncate">{opaStatus.opaUrl}</p>
                                                </div>
                                            </div>

                                            {opaStatus.policyPackages.length > 0 && (
                                                <div>
                                                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                                        Loaded Policy Packages
                                                    </h5>
                                                    <div className="flex flex-wrap gap-2">
                                                        {opaStatus.policyPackages.map((pkg) => (
                                                            <Badge
                                                                key={pkg}
                                                                variant="outline"
                                                                className="font-mono text-[11px] gap-1 border-primary/30 text-primary"
                                                            >
                                                                <Shield className="h-2.5 w-2.5" />
                                                                {pkg}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {opaStatus.dataKeys.length > 0 && (
                                                <div>
                                                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                                        Data Namespaces
                                                    </h5>
                                                    <div className="flex flex-wrap gap-2">
                                                        {opaStatus.dataKeys.map((key) => (
                                                            <Badge key={key} variant="secondary" className="font-mono text-[11px]">
                                                                {key}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <Separator />

                                            <div>
                                                <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                                    Quick Policy Test
                                                </h5>
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div className="grid gap-1.5">
                                                            <Label className="text-xs">Policy Path</Label>
                                                            <Select value={evalPolicy} onValueChange={setEvalPolicy}>
                                                                <SelectTrigger className="h-8 text-xs font-mono">
                                                                    <SelectValue placeholder="Select policy..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {opaStatus.policyPackages.map((pkg) => (
                                                                        <SelectItem key={pkg} value={pkg.replace(/\./g, "/")} className="text-xs font-mono">
                                                                            {pkg}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="flex items-end">
                                                            <Button
                                                                size="sm"
                                                                className="h-8 gap-1"
                                                                onClick={handleEvaluate}
                                                                disabled={!evalPolicy || evalMutation.isPending}
                                                            >
                                                                {evalMutation.isPending ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    <Play className="h-3 w-3" />
                                                                )}
                                                                Evaluate
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="grid gap-1.5">
                                                        <Label className="text-xs">Input JSON</Label>
                                                        <Textarea
                                                            value={evalInput}
                                                            onChange={(e) => setEvalInput(e.target.value)}
                                                            className="font-mono text-xs h-24 resize-none"
                                                            placeholder='{"org_id": "test", ...}'
                                                        />
                                                    </div>
                                                    {evalMutation.data && (
                                                        <div>
                                                            <Label className="text-xs">Result</Label>
                                                            <pre className="rounded border bg-muted/30 p-3 text-xs font-mono overflow-x-auto whitespace-pre mt-1.5 max-h-48 overflow-y-auto">
{JSON.stringify(evalMutation.data.result, null, 2)}
                                                            </pre>
                                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                                Evaluated at {new Date(evalMutation.data.timestamp).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {evalMutation.isError && (
                                                        <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                                                            Evaluation failed: {(evalMutation.error as any)?.message || "Unknown error"}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {!opaStatus && !opaLoading && (
                                        <p className="text-xs text-muted-foreground">Unable to fetch OPA status.</p>
                                    )}

                                    {opaLoading && (
                                        <div className="flex justify-center py-4">
                                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        </div>
                                    )}
                                </CardContent>
                            </motion.div>
                        </CollapsibleContent>
                    )}
                </AnimatePresence>
            </Card>
        </Collapsible>
    );
}

// --- Main Page ---

export default function CompliancePage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [, setLocation] = useLocation();

    // URL param reading for deep-link navigation
    const urlParams = new URLSearchParams(window.location.search);
    const urlTab = urlParams.get("tab");
    const urlFramework = urlParams.get("framework");
    const urlControl = urlParams.get("control");
    const urlAction = urlParams.get("action");

    // Tab persistence via URL params (preferred) or hash (fallback)
    const getInitialTab = () => {
        if (urlTab === "controls" || urlTab === "reports") return urlTab;
        const hash = window.location.hash.replace("#", "");
        return hash === "controls" ? "controls" : "reports";
    };
    const [activeTab, setActiveTab] = useState(getInitialTab);
    const handleTabChange = (value: string) => {
        setActiveTab(value);
        window.location.hash = value;
    };

    // Report generation state
    const [selectedFramework, setSelectedFramework] = useState("iso27001");
    const [reportDateStart, setReportDateStart] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split("T")[0];
    });
    const [reportDateEnd, setReportDateEnd] = useState(() => {
        return new Date().toISOString().split("T")[0];
    });
    const [generatedReport, setGeneratedReport] = useState<ComplianceReport | null>(null);

    // Controls tab state — use URL framework param if present
    const getInitialControlsFramework = () => {
        if (urlFramework && FRAMEWORKS.some((f) => f.id === urlFramework)) return urlFramework;
        return "iso27001";
    };
    const [controlsFramework, setControlsFramework] = useState(getInitialControlsFramework);
    const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});
    const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());
    const [isVerifyingAll, setIsVerifyingAll] = useState(false);

    // Configuration helper dialog
    const [configDialogOpen, setConfigDialogOpen] = useState(false);
    const [configDialogAction, setConfigDialogAction] = useState<RequiredAction | null>(null);

    // Compliance wizard state — unified control for all 16 wizards
    const [activeWizardControlId, setActiveWizardControlId] = useState<string | null>(null);

    const handleOpenWizard = useCallback((controlId: string) => {
        if (WIZARD_CONTROL_IDS.has(controlId)) {
            setActiveWizardControlId(controlId);
        }
    }, []);

    // Auto-configure state
    const [autoConfigDialogOpen, setAutoConfigDialogOpen] = useState(false);
    const [autoConfigFramework, setAutoConfigFramework] = useState<string | null>(null);
    const [autoConfigConfirmOpen, setAutoConfigConfirmOpen] = useState(false);

    // --- Queries ---

    const { data: overview, isLoading: overviewLoading } = useQuery<ComplianceOverview>({
        queryKey: ["/api/compliance/status"],
    });

    // Fetch controls for all frameworks to show progress cards
    const frameworkQueries = FRAMEWORKS.map((fw) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useQuery<ControlsResponse>({
            queryKey: ["/api/compliance/controls", fw.id],
        });
    });

    const frameworkSummaries: Record<string, ControlsResponse["summary"] | null> = {};
    const frameworkLoading: Record<string, boolean> = {};
    const frameworkResponses: Record<string, ControlsResponse | undefined> = {};
    FRAMEWORKS.forEach((fw, idx) => {
        frameworkSummaries[fw.id] = frameworkQueries[idx].data?.summary ?? null;
        frameworkLoading[fw.id] = frameworkQueries[idx].isLoading;
        frameworkResponses[fw.id] = frameworkQueries[idx].data;
    });

    // Active framework controls
    const activeResponse = frameworkResponses[controlsFramework];

    const controls = activeResponse?.controls;
    const summary = activeResponse?.summary;
    const controlsLoading = frameworkLoading[controlsFramework];

    const { data: opaStatus } = useQuery<OpaStatus>({
        queryKey: ["/api/compliance/opa-status"],
        refetchInterval: 30000,
    });

    // --- Mutations ---

    const generateReportMutation = useMutation({
        mutationFn: async (params: {
            framework: string;
            dateRange: { start: string; end: string };
            format: string;
        }) => {
            const res = await apiRequest("POST", "/api/compliance/reports", {
                type: params.framework,
                period: params.dateRange,
                format: params.format,
            });
            const raw = await res.json();
            return {
                ...raw,
                dateRange: raw.dateRange || raw.period,
                data: raw.data || { summary: raw.summary, sections: raw.sections },
            } as ComplianceReport;
        },
        onSuccess: (data) => {
            setGeneratedReport(data);
            toast({ title: "Report generated", description: `${data.framework} compliance report is ready.` });
        },
        onError: (error: any) => {
            toast({
                title: "Error generating report",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleGenerateReport = () => {
        setGeneratedReport(null);
        generateReportMutation.mutate({
            framework: selectedFramework,
            dateRange: { start: reportDateStart, end: reportDateEnd },
            format: "json",
        });
    };

    // Auto-configure mutation
    const autoConfigMutation = useMutation({
        mutationFn: async (params: { framework: string }) => {
            const res = await apiRequest("POST", "/api/compliance/auto-configure", {
                framework: params.framework,
            });
            return await res.json() as AutoConfigResult;
        },
        onSuccess: (data) => {
            setAutoConfigDialogOpen(true);
            toast({
                title: "Auto-configuration complete",
                description: `${data.configured} configured, ${data.skipped} skipped, ${data.manualRequired} need manual action.`,
            });
            // Invalidate controls queries to refresh data
            queryClient.invalidateQueries({ queryKey: ["/api/compliance/controls"] });
            queryClient.invalidateQueries({ queryKey: ["/api/compliance/status"] });
        },
        onError: (error: any) => {
            toast({
                title: "Auto-configuration failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleAutoConfig = useCallback((frameworkId: string) => {
        setAutoConfigFramework(frameworkId);
        setAutoConfigConfirmOpen(true);
    }, []);

    const confirmAutoConfig = useCallback(() => {
        if (autoConfigFramework) {
            setAutoConfigConfirmOpen(false);
            autoConfigMutation.mutate({ framework: autoConfigFramework });
        }
    }, [autoConfigFramework, autoConfigMutation]);

    // Verify a single control
    const handleVerifyControl = useCallback(async (controlId: string, framework: string) => {
        setVerifyingIds((prev) => new Set(prev).add(controlId));
        try {
            const res = await apiRequest("POST", `/api/compliance/controls/${controlId}/verify`, {
                framework,
            });
            const result = await res.json() as VerifyResult;
            setVerifyResults((prev) => ({ ...prev, [controlId]: result }));
            toast({
                title: result.verified ? "Verification Passed" : "Verification Incomplete",
                description: `Control ${controlId}: ${result.verified ? "All checks passed" : "Some checks need attention"}`,
            });
        } catch (error: any) {
            toast({
                title: "Verification failed",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setVerifyingIds((prev) => {
                const next = new Set(prev);
                next.delete(controlId);
                return next;
            });
        }
    }, [toast]);

    // Verify all controls sequentially
    const handleVerifyAll = useCallback(async () => {
        if (!controls) return;
        setIsVerifyingAll(true);
        for (const ctrl of controls) {
            if (ctrl.status === "not_applicable") continue;
            await handleVerifyControl(ctrl.controlId, ctrl.framework);
        }
        setIsVerifyingAll(false);
        toast({
            title: "Verification Complete",
            description: `All ${controls.length} controls have been verified.`,
        });
    }, [controls, handleVerifyControl, toast]);

    // Group controls by category
    const controlsByCategory = controls?.reduce<Record<string, ComplianceControl[]>>((acc, ctrl) => {
        const cat = ctrl.category || "General";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(ctrl);
        return acc;
    }, {}) ?? {};

    // Deep-link scroll to target control from URL params
    const deepLinkDone = useRef(false);
    useEffect(() => {
        if (deepLinkDone.current || !urlControl || !controls || controlsLoading) return;
        deepLinkDone.current = true;
        // Small delay to let the controls tab render
        setTimeout(() => {
            const el = document.getElementById(`control-${urlControl}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                // Brief highlight effect
                el.classList.add("ring-2", "ring-primary", "rounded-lg");
                setTimeout(() => el.classList.remove("ring-2", "ring-primary", "rounded-lg"), 3000);
            }
        }, 300);
    }, [urlControl, controls, controlsLoading]);

    // Navigate to in-app route
    const handleNavigate = useCallback((path: string) => {
        setLocation(path);
    }, [setLocation]);

    // Open configuration helper dialog
    const handleConfigure = useCallback((action: RequiredAction) => {
        setConfigDialogAction(action);
        setConfigDialogOpen(true);
    }, []);

    // Scroll to first non-implemented control
    const scrollToFirstIncomplete = useCallback(() => {
        if (!controls) return;
        const first = controls.find((c) => c.status !== "implemented" && c.status !== "not_applicable");
        if (first) {
            // Switch to controls tab and set the framework
            handleTabChange("controls");
            // Use a small delay to let the tab render
            setTimeout(() => {
                const el = document.getElementById(`control-${first.controlId}`);
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 200);
        }
    }, [controls]);

    // --- Evidence Export ---
    const [isExporting, setIsExporting] = useState(false);

    const handleExportEvidence = useCallback(async () => {
        setIsExporting(true);
        try {
            const res = await apiRequest("GET", `/api/compliance/export/${controlsFramework}`);
            const data = await res.json();
            const dateStr = new Date().toISOString().split("T")[0];
            const filename = `compliance-${controlsFramework}-${dateStr}.json`;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            toast({
                title: "Evidence exported",
                description: `${FRAMEWORKS.find((f) => f.id === controlsFramework)?.label ?? controlsFramework} evidence package downloaded.`,
            });
        } catch (err: any) {
            toast({
                title: "Export failed",
                description: err.message ?? "Failed to export evidence package.",
                variant: "destructive",
            });
        } finally {
            setIsExporting(false);
        }
    }, [controlsFramework, toast]);

    // --- Render ---

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Compliance Dashboard</h1>
                <p className="text-muted-foreground">
                    Monitor security posture, generate compliance reports, and follow guided compliance journeys across 13 frameworks including ISO 27001, SOC 2, DPDP, HIPAA, GDPR, and more.
                </p>
            </div>

            {/* Security Posture Overview */}
            {overviewLoading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : overview ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Encryption Status */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <Lock className="h-4 w-4 text-primary" />
                                <CardDescription>Encryption</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>At Rest</span>
                                {overview.encryption?.atRest ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                )}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>In Transit</span>
                                {overview.encryption?.inTransit ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                )}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>Key Rotation</span>
                                {overview.encryption?.keyRotation ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Policy Coverage */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                <CardDescription>Policy Coverage</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold tabular-nums">
                                {overview.policyCoveragePercent ?? 0}%
                            </p>
                            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${overview.policyCoveragePercent ?? 0}%` }}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Claws with assigned policy templates
                            </p>
                        </CardContent>
                    </Card>

                    {/* RBAC Status */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary" />
                                <CardDescription>RBAC Status</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>Roles Defined</span>
                                <span className="font-mono font-medium">{overview.rbac?.totalRoles ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>Users Assigned</span>
                                <span className="font-mono font-medium">{overview.rbac?.assignedUsers ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>Active Permissions</span>
                                <span className="font-mono font-medium">{overview.rbac?.activePermissions ?? 0}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Audit Log Stats */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-primary" />
                                <CardDescription>Audit Events</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>Last 24h</span>
                                <span className="font-mono font-medium">
                                    {(overview.auditLog?.events24h ?? 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>Last 7 days</span>
                                <span className="font-mono font-medium">
                                    {(overview.auditLog?.events7d ?? 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span>Last 30 days</span>
                                <span className="font-mono font-medium">
                                    {(overview.auditLog?.events30d ?? 0).toLocaleString()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <ShieldCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-semibold">No compliance data available</h3>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                            Compliance status will appear here once your environment is configured.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Reports & Controls Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="reports" className="gap-1.5">
                        <FileText className="h-4 w-4" /> Generate Report
                    </TabsTrigger>
                    <TabsTrigger value="controls" className="gap-1.5">
                        <ClipboardCheck className="h-4 w-4" /> Compliance Journey
                    </TabsTrigger>
                </TabsList>

                {/* Reports Tab */}
                <TabsContent value="reports">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5" /> Generate Compliance Report
                            </CardTitle>
                            <CardDescription>
                                Generate a compliance report for a specific framework and date range.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                                    <div className="grid gap-2">
                                        <Label>Framework</Label>
                                        <Select
                                            value={selectedFramework}
                                            onValueChange={setSelectedFramework}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {FRAMEWORKS.map((fw) => (
                                                    <SelectItem key={fw.id} value={fw.id}>
                                                        {fw.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="report-start">Start Date</Label>
                                        <Input
                                            id="report-start"
                                            type="date"
                                            value={reportDateStart}
                                            onChange={(e) => setReportDateStart(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="report-end">End Date</Label>
                                        <Input
                                            id="report-end"
                                            type="date"
                                            value={reportDateEnd}
                                            onChange={(e) => setReportDateEnd(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Format</Label>
                                        <Select value="json" disabled>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="json">JSON</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleGenerateReport}
                                    disabled={generateReportMutation.isPending}
                                >
                                    {generateReportMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="mr-2 h-4 w-4" />
                                    )}
                                    Generate Report
                                </Button>

                                {generatedReport && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {FRAMEWORKS.find((fw) => fw.id === generatedReport.framework)?.label ??
                                                        generatedReport.framework}{" "}
                                                    Report
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Generated {new Date(generatedReport.generatedAt).toLocaleString()} | Range:{" "}
                                                    {generatedReport.dateRange?.start} to {generatedReport.dateRange?.end}
                                                </p>
                                            </div>
                                        </div>
                                        <ScrollArea className="h-[400px]">
                                            <pre className="rounded-lg border bg-muted/50 p-4 text-sm font-mono overflow-x-auto whitespace-pre">
                                                {JSON.stringify(generatedReport.data, null, 2)}
                                            </pre>
                                        </ScrollArea>
                                    </div>
                                )}

                                {generateReportMutation.isPending && (
                                    <div className="flex flex-col items-center py-8">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm text-muted-foreground mt-3">
                                            Generating compliance report...
                                        </p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Controls Compliance Journey Tab */}
                <TabsContent value="controls">
                    <div className="space-y-4">
                        {/* Compliance Journey Progress — Framework Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {FRAMEWORKS.map((fw) => (
                                <FrameworkProgressCard
                                    key={fw.id}
                                    framework={fw}
                                    summary={frameworkSummaries[fw.id]}
                                    isActive={controlsFramework === fw.id}
                                    isLoading={frameworkLoading[fw.id]}
                                    isAutoConfiguring={autoConfigMutation.isPending && autoConfigFramework === fw.id}
                                    onClick={() => {
                                        setControlsFramework(fw.id);
                                        setVerifyResults({});
                                    }}
                                    onStartConfig={() => {
                                        setControlsFramework(fw.id);
                                        setVerifyResults({});
                                        setTimeout(() => scrollToFirstIncomplete(), 300);
                                    }}
                                    onAutoConfig={() => handleAutoConfig(fw.id)}
                                />
                            ))}
                        </div>

                        {controlsLoading ? (
                            <div className="flex justify-center p-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : !controls?.length ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                    <ClipboardCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                    <h3 className="text-lg font-semibold">No controls found</h3>
                                    <p className="text-muted-foreground mt-2 max-w-sm">
                                        No compliance controls have been configured for{" "}
                                        {FRAMEWORKS.find((fw) => fw.id === controlsFramework)?.label ?? controlsFramework}.
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            <>
                                {/* Summary Header with Detailed Stats */}
                                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                                    <CardContent className="pt-6">
                                        <div className="flex flex-col md:flex-row items-center gap-6">
                                            {/* Circular Score */}
                                            <div className="shrink-0">
                                                <CircularProgress
                                                    value={summary?.complianceScore ?? 0}
                                                    color={FRAMEWORKS.find(f => f.id === controlsFramework)?.color}
                                                />
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="flex-1 w-full">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <BookOpen className="h-4 w-4 text-primary" />
                                                    <h3 className="text-sm font-semibold">
                                                        {FRAMEWORKS.find(f => f.id === controlsFramework)?.label} Compliance Journey
                                                    </h3>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-center">
                                                        <p className="text-2xl font-bold text-emerald-400">
                                                            <AnimatedCounter value={summary?.implemented ?? 0} />
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Implemented</p>
                                                    </div>
                                                    <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3 text-center">
                                                        <p className="text-2xl font-bold text-amber-400">
                                                            <AnimatedCounter value={summary?.partial ?? 0} />
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Partial</p>
                                                    </div>
                                                    <div className="rounded-lg border bg-muted/20 p-3 text-center">
                                                        <p className="text-2xl font-bold text-muted-foreground">
                                                            <AnimatedCounter value={summary?.planned ?? 0} />
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Planned</p>
                                                    </div>
                                                    <div className="rounded-lg border bg-muted/20 p-3 text-center">
                                                        <p className="text-2xl font-bold">
                                                            <AnimatedCounter value={summary?.total ?? 0} />
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex flex-col gap-2 shrink-0">
                                                <Button
                                                    size="sm"
                                                    className="gap-1.5 h-8"
                                                    onClick={handleVerifyAll}
                                                    disabled={isVerifyingAll}
                                                >
                                                    {isVerifyingAll ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <RefreshCw className="h-3 w-3" />
                                                    )}
                                                    Verify All
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="gap-1.5 h-8"
                                                    onClick={scrollToFirstIncomplete}
                                                >
                                                    <Target className="h-3 w-3" />
                                                    Next Action
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="gap-1.5 h-8"
                                                    onClick={handleExportEvidence}
                                                    disabled={isExporting}
                                                >
                                                    {isExporting ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Download className="h-3 w-3" />
                                                    )}
                                                    Export Evidence
                                                </Button>
                                                {/* OPA Status Indicator */}
                                                <div className="flex items-center gap-1.5 justify-center mt-1">
                                                    <div className={`h-2 w-2 rounded-full ${
                                                        opaStatus?.healthy ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                                                    }`} />
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {opaStatus?.healthy ? "OPA Connected" : "OPA Offline"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Verify All Progress */}
                                        {isVerifyingAll && (
                                            <div className="mt-4">
                                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                                                    <span>Verifying controls...</span>
                                                    <span className="tabular-nums">{Object.keys(verifyResults).length} / {controls.length}</span>
                                                </div>
                                                <Progress
                                                    value={(Object.keys(verifyResults).length / controls.length) * 100}
                                                    className="h-1.5"
                                                />
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* OPA Status Panel */}
                                <OpaStatusPanel />

                                {/* How to use guidance */}
                                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                                    <div className="flex items-start gap-3">
                                        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-primary">Guided Compliance Journey</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Expand each control to see what it requires, why it matters, and the specific actions needed.
                                                Click "Configure" to navigate directly to the page where you can implement the control.
                                                Use "Verify" to check if a control is automatically validated by the system.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Control Cards by Category */}
                                {Object.entries(controlsByCategory).map(([category, categoryControls]) => {
                                    const implementedCount = categoryControls.filter(c => c.status === "implemented").length;
                                    const categoryProgress = categoryControls.length > 0
                                        ? Math.round((implementedCount / categoryControls.length) * 100)
                                        : 0;

                                    return (
                                        <div key={category} className="space-y-2">
                                            <div className="flex items-center gap-2 px-1">
                                                <ChevronRight className="h-3.5 w-3.5 text-primary" />
                                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                    {category}
                                                </h4>
                                                <div className="flex-1">
                                                    <div className="h-px bg-border/50 relative">
                                                        <div
                                                            className="absolute inset-y-0 left-0 bg-primary/30"
                                                            style={{ width: `${categoryProgress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                                    {implementedCount}/{categoryControls.length}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {categoryControls.map((ctrl) => (
                                                    <div key={ctrl.id} id={`control-${ctrl.controlId}`}>
                                                        <GuidedControlCard
                                                            control={ctrl}
                                                            onVerify={() => handleVerifyControl(ctrl.controlId, ctrl.framework)}
                                                            isVerifying={verifyingIds.has(ctrl.controlId)}
                                                            verifyResult={verifyResults[ctrl.controlId] || null}
                                                            onConfigure={handleConfigure}
                                                            onNavigate={handleNavigate}
                                                            onOpenWizard={handleOpenWizard}
                                                            initialOpen={urlControl === ctrl.controlId}
                                                            initialAddEvidence={urlControl === ctrl.controlId && urlAction === "add-evidence"}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Configuration Helper Dialog */}
            <ConfigurationHelperDialog
                open={configDialogOpen}
                onOpenChange={setConfigDialogOpen}
                action={configDialogAction}
                onNavigate={handleNavigate}
            />

            {/* Auto-Configure Confirmation Dialog */}
            <Dialog open={autoConfigConfirmOpen} onOpenChange={setAutoConfigConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            One-Click Compliance
                        </DialogTitle>
                        <DialogDescription>
                            This will auto-configure the foundational controls for{" "}
                            <span className="font-semibold text-foreground">
                                {FRAMEWORKS.find((f) => f.id === autoConfigFramework)?.label ?? autoConfigFramework}
                            </span>{" "}
                            framework. The system will:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span>Seed OPA policy templates (Standard, Restrictive, Permissive)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span>Create system RBAC roles (Owner, Admin, Team Member, Viewer)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span>Assign you as the Owner role</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span>Set up concurrency limits</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span>Create a default team</span>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Controls requiring manual documentation or external actions will be flagged for follow-up.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAutoConfigConfirmOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={confirmAutoConfig} className="gap-1.5">
                            <Zap className="h-4 w-4" />
                            Auto-Configure
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Auto-Configure Results Dialog */}
            <Dialog open={autoConfigDialogOpen} onOpenChange={setAutoConfigDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            Auto-Configuration Results
                        </DialogTitle>
                        <DialogDescription>
                            {FRAMEWORKS.find((f) => f.id === autoConfigMutation.data?.framework)?.label ?? "Framework"}{" "}
                            compliance auto-configuration is complete.
                        </DialogDescription>
                    </DialogHeader>

                    {autoConfigMutation.data && (
                        <div className="space-y-4">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-4 gap-3">
                                <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-center">
                                    <p className="text-2xl font-bold text-emerald-400">
                                        {autoConfigMutation.data.configured}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Configured</p>
                                </div>
                                <div className="rounded-lg border bg-muted/20 p-3 text-center">
                                    <p className="text-2xl font-bold text-muted-foreground">
                                        {autoConfigMutation.data.skipped}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Skipped</p>
                                </div>
                                <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3 text-center">
                                    <p className="text-2xl font-bold text-amber-400">
                                        {autoConfigMutation.data.manualRequired}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Manual</p>
                                </div>
                                <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-3 text-center">
                                    <p className="text-2xl font-bold text-red-400">
                                        {autoConfigMutation.data.failed}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Failed</p>
                                </div>
                            </div>

                            {/* Detailed Results */}
                            <ScrollArea className="h-[400px]">
                                <div className="space-y-2 pr-4">
                                    {autoConfigMutation.data.results.map((ctrl) => {
                                        const statusColors: Record<string, string> = {
                                            configured: "border-emerald-500/30 bg-emerald-500/5",
                                            skipped: "border-border/50 bg-muted/20",
                                            manual_required: "border-amber-500/30 bg-amber-500/5",
                                            failed: "border-red-500/30 bg-red-500/5",
                                        };
                                        const statusIcons: Record<string, typeof CheckCircle2> = {
                                            configured: CheckCircle2,
                                            skipped: Clock,
                                            manual_required: AlertTriangle,
                                            failed: AlertCircle,
                                        };
                                        const statusTextColors: Record<string, string> = {
                                            configured: "text-emerald-400",
                                            skipped: "text-muted-foreground",
                                            manual_required: "text-amber-400",
                                            failed: "text-red-400",
                                        };
                                        const StatusResultIcon = statusIcons[ctrl.status] || Clock;

                                        return (
                                            <div
                                                key={ctrl.controlId}
                                                className={`rounded-lg border p-3 ${statusColors[ctrl.status] || ""}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <StatusResultIcon className={`h-4 w-4 shrink-0 ${statusTextColors[ctrl.status] || ""}`} />
                                                    <span className="font-mono text-xs text-muted-foreground">
                                                        {ctrl.controlId}
                                                    </span>
                                                    <span className="text-sm font-medium truncate">
                                                        {ctrl.controlName}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className={`ml-auto text-[10px] ${statusTextColors[ctrl.status] || ""}`}
                                                    >
                                                        {ctrl.status.replace("_", " ")}
                                                    </Badge>
                                                </div>
                                                {ctrl.actions.length > 0 && (
                                                    <div className="mt-2 pl-6 space-y-1">
                                                        {ctrl.actions.map((act, idx) => (
                                                            <div key={idx} className="flex items-start gap-2 text-xs">
                                                                <span className={`shrink-0 ${
                                                                    act.result === "done" ? "text-emerald-400" :
                                                                    act.result === "failed" ? "text-red-400" :
                                                                    "text-muted-foreground"
                                                                }`}>
                                                                    {act.result === "done" ? "[OK]" :
                                                                     act.result === "failed" ? "[FAIL]" :
                                                                     "[SKIP]"}
                                                                </span>
                                                                <span className="text-muted-foreground">
                                                                    {act.action}
                                                                </span>
                                                                {act.detail && (
                                                                    <span className="text-muted-foreground/60 ml-auto text-right shrink-0 max-w-[200px] truncate">
                                                                        {act.detail}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAutoConfigDialogOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Unified Compliance Wizards — renders whichever wizard is active */}
            {activeWizardControlId && CONTROL_WIZARD_MAP[activeWizardControlId] && (() => {
                const WizardComponent = CONTROL_WIZARD_MAP[activeWizardControlId];
                return (
                    <WizardComponent
                        open={true}
                        onOpenChange={(isOpen) => {
                            if (!isOpen) setActiveWizardControlId(null);
                        }}
                        onComplete={() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/compliance/controls"] });
                            toast({
                                title: `${activeWizardControlId} configured`,
                                description: "Compliance wizard completed successfully.",
                            });
                        }}
                    />
                );
            })()}
        </div>
    );
}
