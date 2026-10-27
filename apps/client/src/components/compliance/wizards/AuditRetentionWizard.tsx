import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ComplianceWizardDialog,
  type WizardStep,
} from "../ComplianceWizardDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  BookOpen,
  Database,
  Calendar,
  Info,
  Clock,
  Shield,
  BarChart3,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ════════════════════════════════════════════════════════════════════════════════
// AU.2.042 — Audit Log Retention Wizard
// Guides users through understanding and configuring audit log retention
// to meet CMMC's minimum 1-year (365-day) requirement.
// ════════════════════════════════════════════════════════════════════════════════

interface ComplianceSettings {
  id: string;
  auditLogRetentionDays: number;
  dataRetentionDays: number;
  [key: string]: unknown;
}

interface AuditRetentionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

// Retention tier options
const RETENTION_TIERS = [
  {
    days: 90,
    label: "90 days",
    description: "3 months - minimal retention",
    compliant: false,
  },
  {
    days: 180,
    label: "180 days",
    description: "6 months - short retention",
    compliant: false,
  },
  {
    days: 365,
    label: "365 days",
    description: "1 year - CMMC minimum",
    compliant: true,
    recommended: false,
  },
  {
    days: 730,
    label: "730 days",
    description: "2 years - recommended",
    compliant: true,
    recommended: true,
  },
  {
    days: 1825,
    label: "5 years",
    description: "5 years - high assurance",
    compliant: true,
  },
  {
    days: -1,
    label: "Unlimited",
    description: "Keep logs indefinitely",
    compliant: true,
  },
];

// Map slider positions to day values
const SLIDER_POSITIONS = [90, 180, 365, 730, 1825, 3650];
const SLIDER_LABELS = ["90d", "180d", "1yr", "2yr", "5yr", "10yr"];

function daysToSliderValue(days: number): number {
  if (days <= 0) return 100; // unlimited
  if (days <= 90) return 0;
  if (days <= 180) return 20;
  if (days <= 365) return 40;
  if (days <= 730) return 60;
  if (days <= 1825) return 80;
  return 100;
}

function sliderValueToDays(value: number): number {
  if (value <= 10) return 90;
  if (value <= 30) return 180;
  if (value <= 50) return 365;
  if (value <= 70) return 730;
  if (value <= 90) return 1825;
  return 3650; // 10 years = effectively unlimited
}

export function AuditRetentionWizard({
  open,
  onOpenChange,
  onComplete,
}: AuditRetentionWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [retentionDays, setRetentionDays] = useState(365);
  const [sliderValue, setSliderValue] = useState(40);

  // Fetch current settings
  const { data: settings, isLoading: settingsLoading } =
    useQuery<ComplianceSettings>({
      queryKey: ["/api/compliance/settings"],
      enabled: open,
    });

  // Fetch verification data (oldest audit event)
  const { data: auditEvidence, isLoading: evidenceLoading } = useQuery<{
    autoCollected: boolean;
    evidence: Array<{
      type: string;
      label: string;
      detail: string;
      verified: boolean;
    }>;
  }>({
    queryKey: ["/api/compliance/evidence/cmmc/AU.2.042/auto-collect"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/compliance/evidence/cmmc/AU.2.042/auto-collect",
      );
      return res.json();
    },
    enabled: open,
  });

  // Initialize from server settings
  useEffect(() => {
    if (settings) {
      const days = settings.auditLogRetentionDays ?? 365;
      setRetentionDays(days);
      setSliderValue(daysToSliderValue(days));
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await apiRequest("PUT", "/api/compliance/settings", {
        auditLogRetentionDays: days,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/compliance/settings"],
      });
      toast({
        title: "Retention policy saved",
        description: `Audit log retention set to ${retentionDays >= 3650 ? "unlimited" : retentionDays + " days"}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSliderChange = (value: number[]) => {
    const v = value[0];
    setSliderValue(v);
    setRetentionDays(sliderValueToDays(v));
  };

  const handleSelectTier = (days: number) => {
    if (days === -1) {
      setRetentionDays(3650);
      setSliderValue(100);
    } else {
      setRetentionDays(days);
      setSliderValue(daysToSliderValue(days));
    }
  };

  const handleSave = () => {
    saveMutation.mutate(retentionDays);
  };

  const isCompliant = retentionDays >= 365;
  const currentSettingDays = settings?.auditLogRetentionDays ?? 365;
  const isCurrentCompliant = currentSettingDays >= 365;

  // ── Step 1: Understanding Log Retention ───────────────────────────────────

  const step1Content = (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">
                Why Retain Audit Logs?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Audit logs are your organization's security memory. They
                record every action taken in the system — who did what,
                when, and from where. Without adequate retention, critical
                evidence is permanently lost.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <Shield className="h-6 w-6 text-blue-400 mb-2" />
            <h4 className="text-xs font-semibold">
              Incident Investigation
            </h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              Investigate security breaches by tracing actions back weeks
              or months. The average breach goes undetected for 200+ days.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <BarChart3 className="h-6 w-6 text-emerald-400 mb-2" />
            <h4 className="text-xs font-semibold">
              Compliance Evidence
            </h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              Auditors require log evidence spanning the full audit period.
              Short retention creates compliance gaps.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <Clock className="h-6 w-6 text-amber-400 mb-2" />
            <h4 className="text-xs font-semibold">
              CMMC Requirement
            </h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              CMMC requires a minimum of 1 year (365 days) retention for
              all audit records.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/80">
          <strong>Important:</strong> Once audit logs are deleted after the
          retention period expires, they cannot be recovered. Set retention
          longer than you think you need — storage is cheap compared to
          losing evidence during an investigation.
        </p>
      </div>
    </div>
  );

  // ── Step 2: Current Configuration ─────────────────────────────────────────

  const step2Content = (
    <div className="space-y-4">
      {settingsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Current setting display */}
          <Card
            className={
              isCurrentCompliant
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-red-500/40 bg-red-500/5"
            }
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isCurrentCompliant ? (
                    <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-8 w-8 text-red-400 shrink-0" />
                  )}
                  <div>
                    <h4
                      className={`text-sm font-semibold ${isCurrentCompliant ? "text-emerald-400" : "text-red-400"}`}
                    >
                      Current Retention:{" "}
                      {currentSettingDays >= 3650
                        ? "Unlimited"
                        : `${currentSettingDays} days`}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isCurrentCompliant
                        ? "Meets CMMC minimum requirement of 365 days."
                        : `Below CMMC minimum of 365 days. ${365 - currentSettingDays} more days needed.`}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    isCurrentCompliant
                      ? "border-emerald-500/40 text-emerald-400"
                      : "border-red-500/40 text-red-400"
                  }
                >
                  {isCurrentCompliant ? "Compliant" : "Non-Compliant"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Retention tier options */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              Retention Period Options
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RETENTION_TIERS.map((tier) => {
                const effectiveDays = tier.days === -1 ? 3650 : tier.days;
                const isSelected = retentionDays === effectiveDays;
                return (
                  <button
                    key={tier.days}
                    onClick={() => handleSelectTier(tier.days)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : tier.compliant
                          ? "border-border/50 hover:border-primary/30"
                          : "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        {tier.label}
                      </span>
                      {!tier.compliant && (
                        <AlertTriangle className="h-3 w-3 text-red-400" />
                      )}
                      {tier.recommended && (
                        <Badge
                          variant="outline"
                          className="text-[8px] px-1 border-amber-500/30 text-amber-400"
                        >
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {tier.description}
                    </p>
                    {!tier.compliant && (
                      <p className="text-[9px] text-red-400 mt-0.5">
                        Non-compliant with CMMC
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ── Step 3: Set Retention ─────────────────────────────────────────────────

  const step3Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Use the slider or select a preset to configure your audit log
        retention period.
      </p>

      <Card>
        <CardContent className="pt-5 space-y-6">
          {/* Visual slider */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Retention Period
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-mono">
                  {retentionDays >= 3650
                    ? "Unlimited"
                    : retentionDays}
                </span>
                {retentionDays < 3650 && (
                  <span className="text-sm text-muted-foreground">
                    days
                  </span>
                )}
              </div>
            </div>

            <Slider
              value={[sliderValue]}
              onValueChange={handleSliderChange}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />

            {/* Slider labels */}
            <div className="flex justify-between text-[9px] text-muted-foreground px-1">
              {SLIDER_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            {/* Compliance indicator */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${isCompliant ? "bg-emerald-400" : "bg-red-400"}`}
                />
                <span
                  className={`text-xs font-medium ${isCompliant ? "text-emerald-400" : "text-red-400"}`}
                >
                  {isCompliant
                    ? "CMMC Compliant"
                    : "Below CMMC Minimum (365 days)"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {retentionDays >= 365
                  ? `${Math.round(retentionDays / 365 * 10) / 10} years`
                  : `${365 - retentionDays} days short`}
              </span>
            </div>
          </div>

          {/* Human-readable summary */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs">
                  Audit logs will be retained for{" "}
                  <strong>
                    {retentionDays >= 3650
                      ? "unlimited time"
                      : `${retentionDays} days (${Math.round(retentionDays / 30)} months)`}
                  </strong>
                  .
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {retentionDays >= 3650
                    ? "Logs will never be automatically deleted."
                    : `Logs older than ${retentionDays} days will be eligible for cleanup.`}
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Retention Policy
          </Button>
        </CardContent>
      </Card>

      {!isCompliant && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200/80">
            <strong>Warning:</strong> A retention period below 365 days does
            not meet CMMC AU.2.042 requirements. Increase to at least 365
            days for compliance.
          </p>
        </div>
      )}
    </div>
  );

  // ── Step 4: Verify ────────────────────────────────────────────────────────

  const step4Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Verification that audit logs are being retained according to your
        configuration.
      </p>

      {evidenceLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Evidence items */}
          {auditEvidence?.evidence && auditEvidence.evidence.length > 0 ? (
            <div className="space-y-2">
              {auditEvidence.evidence.map((ev, i) => (
                <Card
                  key={i}
                  className={
                    ev.verified
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-amber-500/30 bg-amber-500/5"
                  }
                >
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start gap-2">
                      {ev.verified ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold">
                            {ev.label}
                          </h4>
                          <Badge
                            variant="outline"
                            className="text-[8px]"
                          >
                            {ev.type}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {ev.detail}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-border/50">
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <Info className="h-6 w-6 text-muted-foreground shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold">
                    No evidence collected yet
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Evidence will be auto-collected when the compliance
                    verification runs. Use the "Verify" button on the
                    compliance page to trigger collection.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Retention summary */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <h4 className="text-xs font-semibold mb-3 flex items-center gap-2">
                <Database className="h-3.5 w-3.5" />
                Retention Configuration Summary
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Configured retention:
                  </span>
                  <span className="font-medium">
                    {(settings?.auditLogRetentionDays ?? retentionDays) >= 3650
                      ? "Unlimited"
                      : `${settings?.auditLogRetentionDays ?? retentionDays} days`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    CMMC minimum:
                  </span>
                  <span className="font-medium">365 days</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Status:
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      (settings?.auditLogRetentionDays ?? retentionDays) >= 365
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-red-500/40 text-red-400"
                    }
                  >
                    {(settings?.auditLogRetentionDays ?? retentionDays) >= 365
                      ? "Compliant"
                      : "Non-Compliant"}
                  </Badge>
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
      id: "understand",
      title: "Understanding Log Retention",
      description: "Why audit logs must be retained",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      content: step1Content,
    },
    {
      id: "current",
      title: "Current Configuration",
      description: "Review your current retention settings",
      icon: <Database className="h-5 w-5 text-primary" />,
      content: step2Content,
    },
    {
      id: "set-retention",
      title: "Set Retention",
      description: "Configure the retention period",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      content: step3Content,
    },
    {
      id: "verify",
      title: "Verify",
      description: "Confirm retention is working",
      icon: <CheckCircle2 className="h-5 w-5 text-primary" />,
      content: step4Content,
    },
  ];

  return (
    <ComplianceWizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Audit Log Retention"
      description="Configure how long audit logs are retained for compliance and investigation."
      controlId="AU.2.042"
      steps={steps}
      onComplete={onComplete}
    />
  );
}
