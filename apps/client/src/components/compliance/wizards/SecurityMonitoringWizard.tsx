import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Bell,
  ArrowRight,
  ArrowLeft,
  Activity,
  Eye,
  BarChart3,
  Mail,
  ExternalLink,
  Info,
  Calendar,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──

interface AutoCollectedEvidence {
  controlId: string;
  summary: string;
  items: Array<{
    type: string;
    title: string;
    description: string;
    passed: boolean;
    data: Record<string, unknown>;
  }>;
  collectedAt?: string;
}

interface EventCountItem {
  type: string;
  title: string;
  description: string;
  passed: boolean;
  data: {
    totalEvents?: number;
    eventTypes?: string[];
    recentEvents?: Array<Record<string, unknown>>;
    daysCovered?: number;
    [key: string]: unknown;
  };
}

// ── Constants ──

const CONTROL_ID = "SI.2.214";
const FRAMEWORK = "cmmc";
const TOTAL_STEPS = 4;

// ── Component ──

export function SecurityMonitoringWizard({
  open,
  onOpenChange,
  onComplete,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onComplete?: () => void;
} = {}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // ── Fetch auto-collected evidence (event counts) ──

  const {
    data: autoEvidence,
    isLoading: isLoadingEvidence,
    refetch: refetchEvidence,
  } = useQuery<AutoCollectedEvidence>({
    queryKey: [`/api/compliance/evidence/${FRAMEWORK}/${CONTROL_ID}/auto-collect`],
    enabled: step === 2,
  });

  const evidenceItems: EventCountItem[] = (autoEvidence?.items ?? []) as EventCountItem[];

  // ── Submit review schedule attestation ──

  const submitScheduleMutation = useMutation({
    mutationFn: async (schedule: string) => {
      const res = await apiRequest(
        "POST",
        `/api/compliance/evidence/${FRAMEWORK}/${CONTROL_ID}`,
        {
          evidenceType: "attestation",
          title: `Security Alert Review Schedule — ${schedule}`,
          description: `Configured ${schedule} security alert review cadence for monitoring compliance.`,
          evidenceData: {
            attestationType: "review_schedule",
            reviewCadence: schedule,
            configuredAt: new Date().toISOString(),
          },
        },
      );
      return res.json();
    },
    onSuccess: (_data, schedule) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/compliance/evidence/${FRAMEWORK}/${CONTROL_ID}`],
      });
      toast({
        title: "Review schedule configured",
        description: `${schedule} security alert review schedule has been recorded.`,
      });
      setStep(4);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ── Derived state ──

  const passedItems = evidenceItems.filter((item) => item.passed);
  const failedItems = evidenceItems.filter((item) => !item.passed);

  // Calculate total event volume from evidence data
  const totalEventVolume = evidenceItems.reduce((sum, item) => {
    const count = typeof item.data?.totalEvents === "number" ? item.data.totalEvents : 0;
    return sum + count;
  }, 0);

  // ── Navigation ──

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  // ── Render ──

  const content = (
    <Card className="border-border/60">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Bell className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Security Monitoring</CardTitle>
              <CardDescription className="text-xs">
                {CONTROL_ID} — Monitor system security alerts and take action
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            Step {step} of {TOTAL_STEPS}
          </Badge>
        </div>
        {/* Progress bar */}
        <div className="mt-3 flex gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Step 1: Education ── */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Security Monitoring
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The platform continuously monitors all agent activity, policy violations, and
              access events. But monitoring only works if someone reviews the alerts. CMMC
              requires that security alerts are monitored and acted upon.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="border-border/40 bg-card/50">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    <h4 className="text-xs font-medium">What We Monitor</h4>
                  </div>
                  <ul className="space-y-1 text-[11px] text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-emerald-400 shrink-0" />
                      OPA policy violations (blocked actions)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-emerald-400 shrink-0" />
                      Failed authentication attempts
                    </li>
                    <li className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-emerald-400 shrink-0" />
                      Agent lifecycle events (start, stop, error)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-emerald-400 shrink-0" />
                      RBAC permission changes
                    </li>
                    <li className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-emerald-400 shrink-0" />
                      Tool execution events
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-border/40 bg-card/50">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-amber-400" />
                    <h4 className="text-xs font-medium">Why Review Matters</h4>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    The average undetected breach persists for over 200 days. Regular alert
                    review is the difference between a contained incident and a catastrophic
                    breach. Someone must own this responsibility.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Alert className="border-primary/30 bg-primary/5">
              <Bell className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                Monitoring is automatic. The next steps will verify event volume and help you
                set up a regular review cadence.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ── Step 2: Current Monitoring Activity ── */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Current Monitoring Activity
            </h3>
            <p className="text-sm text-muted-foreground">
              Fetching the last 7 days of security event data from the platform.
            </p>

            {isLoadingEvidence ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Collecting event data...</p>
              </div>
            ) : autoEvidence ? (
              <div className="space-y-3">
                {/* Summary */}
                <div className="rounded-lg border border-border/40 bg-card/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium">Event Summary</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchEvidence()}
                      className="h-7 text-xs"
                    >
                      Refresh
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{autoEvidence.summary}</p>

                  {totalEventVolume > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        <Activity className="h-3 w-3 mr-1" />
                        {totalEventVolume.toLocaleString()} total events
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Evidence items */}
                {evidenceItems.length > 0 && (
                  <div className="space-y-2">
                    {evidenceItems.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 rounded-lg border p-3 ${
                          item.passed
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : "border-amber-500/20 bg-amber-500/5"
                        }`}
                      >
                        {item.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Status summary */}
                <div className="flex items-center gap-2">
                  {failedItems.length === 0 ? (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      All monitoring checks passed
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {passedItems.length} passed, {failedItems.length} need attention
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <AlertDescription className="text-sm">
                  Unable to collect monitoring data. Ensure the compliance evidence collector
                  is configured and the server is running.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── Step 3: Configure Alert Review ── */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Configure Alert Review Schedule
            </h3>
            <p className="text-sm text-muted-foreground">
              Set up a regular review cadence for security events. CMMC requires that alerts
              are reviewed and acted upon, not just collected.
            </p>

            <div className="space-y-2">
              {[
                {
                  schedule: "Daily",
                  description: "Review security alerts every business day. Best for organizations with high event volume or CUI handling.",
                  recommended: false,
                  color: "border-emerald-500/20 bg-emerald-500/5",
                },
                {
                  schedule: "Weekly",
                  description: "Review security alerts weekly. Recommended for most organizations. Balances thoroughness with operational overhead.",
                  recommended: true,
                  color: "border-primary/20 bg-primary/5",
                },
                {
                  schedule: "Bi-weekly",
                  description: "Review security alerts every two weeks. Acceptable for low-volume environments with strong automated controls.",
                  recommended: false,
                  color: "border-border/40 bg-card/50",
                },
              ].map((option) => (
                <div
                  key={option.schedule}
                  className={`rounded-lg border p-3 ${option.color}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">{option.schedule}</h4>
                      {option.recommended && (
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={option.recommended ? "default" : "outline"}
                      onClick={() => submitScheduleMutation.mutate(option.schedule)}
                      disabled={submitScheduleMutation.isPending}
                      className="h-7 text-xs"
                    >
                      {submitScheduleMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Select"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                </div>
              ))}
            </div>

            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                Selecting a schedule records an attestation. Assign a specific team member to
                own the review and document actions taken on each review date.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ── Step 4: Escalation Thresholds ── */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Escalation Thresholds
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure escalation contacts and thresholds for critical security events. When
              thresholds are breached, the platform can notify your incident response team.
            </p>

            <Card className="border-border/40 bg-card/50">
              <CardContent className="pt-4 pb-3 px-4 space-y-3">
                <h4 className="text-sm font-medium">Recommended Escalation Thresholds</h4>
                <div className="space-y-2">
                  {[
                    {
                      trigger: "5+ policy violations from a single agent in 1 hour",
                      reason: "Possible agent compromise or misconfiguration",
                      severity: "Critical",
                      color: "text-red-400",
                    },
                    {
                      trigger: "10+ failed auth attempts for a user in 15 minutes",
                      reason: "Possible brute force attack",
                      severity: "High",
                      color: "text-orange-400",
                    },
                    {
                      trigger: "Restricted data access outside business hours",
                      reason: "Possible insider threat",
                      severity: "High",
                      color: "text-orange-400",
                    },
                    {
                      trigger: "New admin role assignment",
                      reason: "Privilege escalation should always be reviewed",
                      severity: "Medium",
                      color: "text-yellow-400",
                    },
                  ].map((threshold, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/40 bg-muted/20 p-2.5"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-[10px] ${threshold.color}`}>
                          {threshold.severity}
                        </Badge>
                        <p className="text-xs font-medium">{threshold.trigger}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground pl-0.5">
                        {threshold.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Alert className="border-primary/30 bg-primary/5">
              <Mail className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                Configure your escalation email in Compliance Settings so critical events reach
                your incident response team immediately.
              </AlertDescription>
            </Alert>

            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                window.location.assign(
                  "/app/compliance-settings?tab=incident-response&highlight=escalation",
                )
              }
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Go to Compliance Settings — Incident Response
            </Button>

            <Alert className="border-emerald-500/30 bg-emerald-500/5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <AlertDescription className="text-sm">
                Security monitoring wizard complete. Monitoring is active, review schedule is
                configured. Remember to follow through on the review cadence you selected.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={step === 1}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <button
                key={i}
                onClick={() => setStep(i + 1)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i + 1 === step ? "bg-primary" : "bg-muted hover:bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={goNext}
            disabled={step === TOTAL_STEPS}
          >
            Next
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (open !== undefined) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}
