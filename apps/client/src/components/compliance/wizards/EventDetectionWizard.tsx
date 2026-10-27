import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Info,
  Radar,
  Activity,
  ShieldAlert,
  Wrench,
  FileBarChart,
  Database,
  Bell,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Types ---

interface AutoCollectResult {
  autoCollected: boolean;
  controlId: string;
  summary: string;
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn" | "info";
    details: string;
    data?: any;
  }>;
}

interface ScheduledReport {
  id: string;
  reportType: string;
  recipientEmails: string[];
  frequency: string;
  isActive: boolean;
  createdAt: string;
}

// --- Constants ---

const STEPS = [
  "How Detection Works",
  "Current Detection Coverage",
  "Configure Reporting",
  "Verify",
];

// --- Component ---

export default function EventDetectionWizard({
  open,
  onOpenChange,
  onComplete,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Report config state
  const [recipientEmail, setRecipientEmail] = useState("");
  const [frequency, setFrequency] = useState("weekly");

  // --- Fetch auto-collect data for detection coverage ---

  const { data: autoCollect, isLoading: autoCollectLoading } =
    useQuery<AutoCollectResult>({
      queryKey: ["compliance-evidence-auto", "cmmc", "IR.2.093"],
      queryFn: async () => {
        const res = await apiRequest(
          "GET",
          "/api/compliance/evidence/cmmc/IR.2.093/auto-collect",
        );
        return res.json();
      },
      enabled: step >= 1,
    });

  // --- Fetch existing scheduled reports ---

  const { data: reportsData, isLoading: reportsLoading } = useQuery<{
    reports: ScheduledReport[];
    count: number;
  }>({
    queryKey: ["compliance-scheduled-reports"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/compliance/scheduled-reports",
      );
      return res.json();
    },
    enabled: step >= 2,
  });

  const existingAuditReport = reportsData?.reports?.find(
    (r) => r.reportType === "audit_summary" && r.isActive,
  );

  // --- Create report mutation ---

  const createReportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/compliance/scheduled-reports",
        {
          reportType: "audit_summary",
          recipientEmails: [recipientEmail],
          frequency,
          frameworks: ["cmmc"],
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-scheduled-reports"],
      });
      toast({
        title: "Audit report scheduled",
        description: `A ${frequency} audit summary report will be sent to ${recipientEmail}.`,
      });
      setStep(3);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to schedule report",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // --- Navigation ---

  const canGoNext = step < STEPS.length - 1;
  const canGoBack = step > 0;

  const goNext = () => {
    if (step === 2) {
      // If a report already exists, just advance
      if (existingAuditReport) {
        setStep(3);
        return;
      }
      // Validate
      if (!recipientEmail) {
        toast({
          title: "Email required",
          description: "Please enter a recipient email for the audit report.",
          variant: "destructive",
        });
        return;
      }
      createReportMutation.mutate();
      return;
    }
    if (canGoNext) setStep(step + 1);
  };

  const goBack = () => {
    if (canGoBack) setStep(step - 1);
  };

  const handleClose = () => onOpenChange?.(false);

  const wrapInDialog = (node: React.ReactNode) =>
    open !== undefined ? (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {node}
        </DialogContent>
      </Dialog>
    ) : (
      <>{node}</>
    );

  return wrapInDialog(
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Radar className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            IR.2.093 — Event Detection & Reporting
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Detect and report security events consistent with incident response
          procedures.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                i === step
                  ? "bg-primary/15 text-primary"
                  : i < step
                    ? "text-emerald-400 hover:bg-emerald-400/10 cursor-pointer"
                    : "text-muted-foreground"
              }`}
            >
              {i < step ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <span className="w-4 h-4 rounded-full border text-[10px] flex items-center justify-center">
                  {i + 1}
                </span>
              )}
              {s}
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            )}
          </div>
        ))}
      </div>

      <Separator />

      {/* Step content */}
      <div className="min-h-[320px]">
        {step === 0 && <StepHow />}
        {step === 1 && (
          <StepCoverage
            autoCollect={autoCollect}
            isLoading={autoCollectLoading}
          />
        )}
        {step === 2 && (
          <StepReporting
            recipientEmail={recipientEmail}
            setRecipientEmail={setRecipientEmail}
            frequency={frequency}
            setFrequency={setFrequency}
            existingReport={existingAuditReport}
            isPending={createReportMutation.isPending}
          />
        )}
        {step === 3 && (
          <StepVerify
            autoCollect={autoCollect}
            existingReport={existingAuditReport}
            onComplete={onComplete}
          />
        )}
      </div>

      {/* Navigation */}
      <Separator />
      <div className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={goBack}
          disabled={!canGoBack || createReportMutation.isPending}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            size="sm"
            onClick={goNext}
            disabled={createReportMutation.isPending}
          >
            {step === 2 ? (
              existingAuditReport ? (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              ) : createReportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Schedule Report
                  <Bell className="h-4 w-4 ml-1" />
                </>
              )
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        ) : (
          <Button size="sm" onClick={() => { onComplete?.(); handleClose(); }}>
            Done
            <CheckCircle2 className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1: How Detection Works
// ────────────────────────────────────────────────────────────────────────────

function StepHow() {
  const eventTypes = [
    {
      icon: Activity,
      title: "Audit Events",
      description:
        "Every user action, role change, permission modification, and settings update is captured in the RBAC audit trail with full user attribution.",
      table: "rbac_audit_events",
    },
    {
      icon: ShieldAlert,
      title: "Policy Violations",
      description:
        "When a claw agent attempts an action blocked by its OPA policy (e.g., accessing a non-whitelisted URL, using a blocked tool), the violation is logged with the agent ID, rule violated, and timestamp.",
      table: "claw_audit_events",
    },
    {
      icon: Wrench,
      title: "Tool Denials",
      description:
        "Every tool invocation by a claw agent is logged, including denied requests. This captures unauthorized function calls, blocked MCP server interactions, and skill security score failures.",
      table: "claw_tool_events",
    },
    {
      icon: Database,
      title: "Data Access Events",
      description:
        "All data queries executed through the platform are logged in the query history with the requesting user, query text, and row counts returned.",
      table: "query_history",
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            Automatic Security Event Detection
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <p>
            The platform automatically captures all security-relevant events
            across 5 centralized audit tables. No additional configuration is
            needed for detection itself. This step helps you understand what is
            being captured and set up reporting so events are reviewed.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {eventTypes.map(({ icon: Icon, title, description, table }) => (
          <Card key={title} className="border-border/50 bg-card/50">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold">{title}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {description}
                </p>
                <Badge
                  variant="outline"
                  className="mt-2 text-[10px] border-muted-foreground/30"
                >
                  {table}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: Current Detection Coverage
// ────────────────────────────────────────────────────────────────────────────

function StepCoverage({
  autoCollect,
  isLoading,
}: {
  autoCollect?: AutoCollectResult;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Analyzing detection coverage...
        </p>
      </div>
    );
  }

  const checks = autoCollect?.checks ?? [];

  // Extract counts from check data where available
  const getCheckCount = (name: string): string => {
    const check = checks.find(
      (c) => c.name.toLowerCase().includes(name.toLowerCase()),
    );
    if (check?.data?.count !== undefined) return String(check.data.count);
    if (check?.data?.totalEvents !== undefined)
      return String(check.data.totalEvents);
    // Try to parse from details
    const match = check?.details?.match(/(\d[\d,]*)/);
    return match ? match[1] : "N/A";
  };

  const stats = [
    {
      label: "Audit Events",
      value: getCheckCount("audit"),
      icon: Activity,
      color: "text-blue-400",
    },
    {
      label: "Policy Violations",
      value: getCheckCount("violation"),
      icon: ShieldAlert,
      color: "text-orange-400",
    },
    {
      label: "Tool Events",
      value: getCheckCount("tool"),
      icon: Wrench,
      color: "text-purple-400",
    },
  ];

  return (
    <div className="space-y-4">
      {autoCollect?.summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-muted-foreground">
              {autoCollect.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border/50 bg-card/50">
            <CardContent className="py-4 px-4 flex flex-col items-center text-center gap-2">
              <Icon className={`h-6 w-6 ${color}`} />
              <span className="text-2xl font-bold tabular-nums">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
              <Badge
                variant="outline"
                className="text-[10px] border-muted-foreground/30"
              >
                Last 30 days
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Check results */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Detection Checks</h3>
        {checks.map((check, i) => (
          <Card key={i} className="border-border/50 bg-card/50">
            <CardContent className="py-2.5 px-4 flex items-center gap-3">
              {check.status === "pass" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : check.status === "warn" ? (
                <Info className="h-4 w-4 text-yellow-500 shrink-0" />
              ) : check.status === "fail" ? (
                <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <Info className="h-4 w-4 text-blue-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{check.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {check.details}
                </p>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${
                  check.status === "pass"
                    ? "border-emerald-500/40 text-emerald-400"
                    : check.status === "warn"
                      ? "border-yellow-500/40 text-yellow-500"
                      : check.status === "fail"
                        ? "border-red-500/40 text-red-400"
                        : "border-blue-500/40 text-blue-400"
                }`}
              >
                {check.status}
              </Badge>
            </CardContent>
          </Card>
        ))}

        {checks.length === 0 && (
          <Card className="border-dashed border-border/50">
            <CardContent className="py-8 flex flex-col items-center text-center">
              <Info className="h-6 w-6 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No auto-collect checks returned. The system may need more
                activity data to analyze.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: Configure Reporting
// ────────────────────────────────────────────────────────────────────────────

function StepReporting({
  recipientEmail,
  setRecipientEmail,
  frequency,
  setFrequency,
  existingReport,
  isPending,
}: {
  recipientEmail: string;
  setRecipientEmail: (v: string) => void;
  frequency: string;
  setFrequency: (v: string) => void;
  existingReport?: ScheduledReport;
  isPending: boolean;
}) {
  if (existingReport) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-400 font-medium">
            An audit summary report is already configured.
          </span>
        </div>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-4 px-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Report Type</span>
              <Badge variant="outline" className="text-xs">
                {existingReport.reportType}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Frequency</span>
              <span className="text-xs font-medium capitalize">
                {existingReport.frequency}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Recipients</span>
              <span className="text-xs font-medium">
                {existingReport.recipientEmails?.join(", ")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Created</span>
              <span className="text-xs font-medium">
                {new Date(existingReport.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Click Next to proceed to the verification step.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileBarChart className="h-4 w-4 text-primary" />
            Schedule Audit Summary Report
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <p>
            Set up a scheduled report that summarizes all security events,
            policy violations, and audit activity. This ensures events are
            regularly reviewed by your security team, satisfying CMMC reporting
            requirements.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="py-4 px-4 space-y-4">
          <div>
            <Label className="text-xs">Recipient Email</Label>
            <Input
              type="email"
              placeholder="security-team@company.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={isPending}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              The audit summary will be emailed to this address.
            </p>
          </div>

          <div>
            <Label className="text-xs">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency} disabled={isPending}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly (Recommended)</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              CMMC recommends at minimum weekly review of security events.
            </p>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-xs text-muted-foreground">Report Type</span>
            <Badge variant="outline" className="text-xs">
              audit_summary
            </Badge>
          </div>
        </CardContent>
      </Card>

      {isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating scheduled report...
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: Verify
// ────────────────────────────────────────────────────────────────────────────

function StepVerify({
  autoCollect,
  existingReport,
  onComplete,
}: {
  autoCollect?: AutoCollectResult;
  existingReport?: ScheduledReport;
  onComplete?: () => void;
}) {
  const detectionActive =
    autoCollect?.checks?.some((c) => c.status === "pass") ?? false;
  const reportingConfigured = !!existingReport;

  return (
    <div className="space-y-4">
      <Card
        className={`border ${
          detectionActive && reportingConfigured
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-yellow-500/30 bg-yellow-500/5"
        }`}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {detectionActive && reportingConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Info className="h-4 w-4 text-yellow-500" />
            )}
            Verification Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-sm text-muted-foreground">
              Event Detection
            </span>
            {detectionActive ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-emerald-400 font-medium">
                  Active
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-yellow-500 font-medium">
                  Limited Data
                </span>
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-sm text-muted-foreground">
              Scheduled Reporting
            </span>
            {reportingConfigured ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-emerald-400 font-medium">
                  Configured
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-yellow-500 font-medium">
                  Not Configured
                </span>
                <Info className="h-3.5 w-3.5 text-yellow-500" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {detectionActive && reportingConfigured ? (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-400">
              Event detection and reporting are both active. The platform is
              continuously capturing security events and your team will receive
              regular audit summaries. Control IR.2.093 requirements are
              satisfied.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {!detectionActive &&
                "Generate more platform activity (run claw agents, make role changes) to populate the audit tables. "}
              {!reportingConfigured &&
                "Go back to Step 3 to set up a scheduled audit report. "}
              You can return to this wizard to re-verify at any time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
