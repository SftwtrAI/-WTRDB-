import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ComplianceWizardDialog,
  type WizardStep,
} from "../ComplianceWizardDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertTriangle,
  CheckCircle2,
  Loader2,
  BookOpen,
  CalendarClock,
  Mail,
  Users,
  Info,
  Plus,
  Trash2,
  FileText,
  ExternalLink,
  Eye,
  Clock,
  Shield,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

// ════════════════════════════════════════════════════════════════════════════════
// AU.3.045 — Audit Review Wizard
// Guides users through setting up regular audit log review schedules,
// designating reviewers, and configuring automated audit summary reports.
// ════════════════════════════════════════════════════════════════════════════════

interface ScheduledReport {
  id: string;
  reportType: string;
  recipientEmails: string[];
  frequency: string;
  frameworks: string[];
  nextSendAt: string;
  isActive: boolean;
  createdAt: string;
}

interface AuditReviewWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const FREQUENCY_OPTIONS = [
  {
    value: "daily",
    label: "Daily",
    description: "For high-security environments",
  },
  {
    value: "weekly",
    label: "Weekly",
    description: "Recommended for CMMC compliance",
    recommended: true,
  },
  {
    value: "monthly",
    label: "Monthly",
    description: "Minimum acceptable frequency",
  },
  {
    value: "quarterly",
    label: "Quarterly",
    description: "For low-risk environments only",
  },
];

export function AuditReviewWizard({
  open,
  onOpenChange,
  onComplete,
}: AuditReviewWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Form state
  const [frequency, setFrequency] = useState("weekly");
  const [emailInput, setEmailInput] = useState("");
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [reportCreated, setReportCreated] = useState(false);

  // Fetch existing scheduled reports
  const {
    data: reportsData,
    isLoading: reportsLoading,
  } = useQuery<{ reports: ScheduledReport[]; count: number }>({
    queryKey: ["/api/compliance/scheduled-reports"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/compliance/scheduled-reports",
      );
      return res.json();
    },
    enabled: open,
  });

  const existingReports = reportsData?.reports ?? [];
  const existingAuditReport = existingReports.find(
    (r) => r.reportType === "audit_summary",
  );

  // Create scheduled report mutation
  const createReportMutation = useMutation({
    mutationFn: async (data: {
      reportType: string;
      recipientEmails: string[];
      frequency: string;
      frameworks: string[];
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/compliance/scheduled-reports",
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/compliance/scheduled-reports"],
      });
      setReportCreated(true);
      toast({
        title: "Audit review schedule created",
        description: `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} audit summary reports will be sent to ${recipientEmails.length} recipient(s).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/compliance/scheduled-reports/${reportId}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/compliance/scheduled-reports"],
      });
      toast({
        title: "Report deleted",
        description: "Scheduled report has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Email management
  const addEmail = useCallback(() => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    if (recipientEmails.includes(email)) {
      toast({
        title: "Duplicate email",
        description: "This email is already in the list.",
        variant: "destructive",
      });
      return;
    }

    setRecipientEmails((prev) => [...prev, email]);
    setEmailInput("");
  }, [emailInput, recipientEmails, toast]);

  const removeEmail = (email: string) => {
    setRecipientEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleCreateReport = () => {
    if (recipientEmails.length === 0) {
      toast({
        title: "No recipients",
        description: "Add at least one email recipient.",
        variant: "destructive",
      });
      return;
    }

    createReportMutation.mutate({
      reportType: "audit_summary",
      recipientEmails,
      frequency,
      frameworks: ["cmmc"],
    });
  };

  // ── Step 1: Why Regular Review? ───────────────────────────────────────────

  const step1Content = (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">
                Why Review Audit Logs?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Generating audit logs without reviewing them provides zero
                security value. Logs only become useful when a human
                reviews them for anomalies, unauthorized activity, and
                policy violations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <Eye className="h-6 w-6 text-blue-400 mb-2" />
            <h4 className="text-xs font-semibold">Detect Anomalies</h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              Regular review catches unusual patterns: off-hours access,
              mass data exports, repeated failed logins, or privilege
              escalation attempts.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <Clock className="h-6 w-6 text-emerald-400 mb-2" />
            <h4 className="text-xs font-semibold">
              Recommended: Weekly Review
            </h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              CMMC recommends weekly review as the minimum cadence.
              Automated summary reports make this manageable even for small
              teams.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-400" />
            What Gets Reviewed?
          </h4>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>RBAC changes (role assignments, permission modifications)</li>
            <li>Failed authentication attempts and account lockouts</li>
            <li>Policy violations flagged by OPA</li>
            <li>Configuration changes to settings or policies</li>
            <li>Anomalous agent behavior and tool executions</li>
            <li>Data access patterns and query history</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/80">
          <strong>Without review, logs are just storage costs.</strong>{" "}
          Active monitoring turns logs into actionable intelligence that can
          detect breaches before they cause damage.
        </p>
      </div>
    </div>
  );

  // ── Step 2: Configure Review Schedule ─────────────────────────────────────

  const step2Content = (
    <div className="space-y-4">
      {existingAuditReport && !reportCreated ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-5 pb-5 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-400">
                Audit Review Already Scheduled
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                A {existingAuditReport.frequency} audit summary report is
                already configured, sending to{" "}
                {existingAuditReport.recipientEmails.join(", ")}. You can
                create an additional schedule or proceed.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Frequency selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Review Frequency
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFrequency(opt.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    frequency === opt.value
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {opt.label}
                    </span>
                    {opt.recommended && (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 border-amber-500/30 text-amber-400"
                      >
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Recipient emails */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Reviewer Email(s)
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Add email addresses that should receive the audit summary
              report.
            </p>
            <div className="flex items-center gap-2">
              <Input
                placeholder="security-team@company.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                className="text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addEmail}
                disabled={!emailInput.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Email list */}
            {recipientEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {recipientEmails.map((email) => (
                  <Badge
                    key={email}
                    variant="outline"
                    className="text-xs gap-1 pr-1"
                  >
                    <Mail className="h-2.5 w-2.5" />
                    {email}
                    <button
                      onClick={() => removeEmail(email)}
                      className="ml-0.5 hover:text-red-400"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={handleCreateReport}
            disabled={
              createReportMutation.isPending ||
              recipientEmails.length === 0
            }
            className="w-full"
          >
            {createReportMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CalendarClock className="h-4 w-4 mr-2" />
            )}
            Create Audit Review Schedule
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // ── Step 3: Designate Reviewer ────────────────────────────────────────────

  const step3Content = (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">
                Designate a Compliance Officer
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                A designated Compliance Officer is responsible for reviewing
                the weekly audit summary reports, investigating anomalies,
                and escalating security events. This role should have read
                access to the compliance dashboard but does not need admin
                privileges.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <h4 className="text-sm font-semibold">
            Compliance Officer Responsibilities
          </h4>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Review the weekly audit summary report within 1 business
                day of receipt.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Investigate any flagged anomalies (failed auth attempts,
                policy violations, off-hours access).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Escalate confirmed security events to the incident response
                team.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Document review activity for audit evidence (attestation).
              </span>
            </li>
          </ul>

          <Button
            variant="outline"
            className="w-full gap-2 mt-3"
            onClick={() => {
              onOpenChange(false);
              setLocation("/app/roles?highlight=compliance-officer");
            }}
          >
            <ExternalLink className="h-4 w-4" />
            Go to Roles & Access to Create/Assign Compliance Officer
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-200/80">
          <strong>Tip:</strong> The Compliance Officer does not need to be a
          dedicated full-time role. It can be assigned to any team member
          with security awareness. The key requirement is that someone is
          explicitly responsible for reviewing the reports.
        </p>
      </div>
    </div>
  );

  // ── Step 4: Verify ────────────────────────────────────────────────────────

  const step4Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review the configured audit review schedule and assigned reviewer.
      </p>

      {reportsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* All scheduled reports */}
          {existingReports.length > 0 ? (
            <Card>
              <CardContent className="pt-4">
                <h4 className="text-xs font-semibold mb-3 flex items-center gap-2">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Scheduled Reports ({existingReports.length})
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Frequency</TableHead>
                      <TableHead className="text-xs">Recipients</TableHead>
                      <TableHead className="text-xs">Next Send</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existingReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className="text-[9px]"
                          >
                            <FileText className="h-2.5 w-2.5 mr-0.5" />
                            {report.reportType.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs capitalize">
                          {report.frequency}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1">
                            {report.recipientEmails.map((email) => (
                              <Badge
                                key={email}
                                variant="outline"
                                className="text-[9px]"
                              >
                                {email}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(report.nextSendAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() =>
                              deleteReportMutation.mutate(report.id)
                            }
                            disabled={deleteReportMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-400">
                    No Audit Review Scheduled
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Go back to Step 2 to create an audit review schedule.
                    AU.3.045 requires regular review of audit logs.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Compliance check */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <h4 className="text-xs font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" />
                AU.3.045 Compliance Checklist
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  {existingReports.some(
                    (r) => r.reportType === "audit_summary",
                  ) ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <span>Audit summary report is scheduled</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {existingReports.some(
                    (r) =>
                      r.reportType === "audit_summary" &&
                      (r.frequency === "daily" ||
                        r.frequency === "weekly"),
                  ) ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                  <span>Review frequency is weekly or more often</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {existingReports.some(
                    (r) =>
                      r.reportType === "audit_summary" &&
                      r.recipientEmails.length > 0,
                  ) ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <span>At least one reviewer is designated</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: "why-review",
      title: "Why Regular Review?",
      description: "Understanding the need for audit log review",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      content: step1Content,
    },
    {
      id: "configure-schedule",
      title: "Configure Review Schedule",
      description: "Set up automated audit summary reports",
      icon: <CalendarClock className="h-5 w-5 text-primary" />,
      content: step2Content,
    },
    {
      id: "designate-reviewer",
      title: "Designate Reviewer",
      description: "Assign a compliance officer for review",
      icon: <Users className="h-5 w-5 text-primary" />,
      content: step3Content,
    },
    {
      id: "verify",
      title: "Verify",
      description: "Confirm review schedule is configured",
      icon: <CheckCircle2 className="h-5 w-5 text-primary" />,
      content: step4Content,
    },
  ];

  return (
    <ComplianceWizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Audit Log Review"
      description="Set up regular review of audit logs to detect unauthorized activity."
      controlId="AU.3.045"
      steps={steps}
      onComplete={onComplete}
    />
  );
}
