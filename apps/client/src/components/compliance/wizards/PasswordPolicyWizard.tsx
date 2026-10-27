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
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Shield,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Info,
  KeyRound,
  History,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Types ---

interface ComplianceSettings {
  id: string;
  organizationId: string;
  minPasswordLength: number;
  requireMfa: boolean;
  mfaEnforcedRoles: string[];
  [key: string]: any;
}

// --- Strength helpers ---

function getStrengthLabel(length: number): {
  label: string;
  color: string;
  description: string;
} {
  if (length < 8)
    return {
      label: "Very Weak",
      color: "text-red-500",
      description: "Cracked in seconds by automated tools",
    };
  if (length < 10)
    return {
      label: "Weak",
      color: "text-orange-500",
      description: "Cracked in minutes to hours",
    };
  if (length < 12)
    return {
      label: "Moderate",
      color: "text-yellow-500",
      description: "Cracked in days to weeks",
    };
  if (length < 14)
    return {
      label: "Strong",
      color: "text-emerald-400",
      description: "Cracked in years to decades",
    };
  if (length < 16)
    return {
      label: "Very Strong",
      color: "text-emerald-400",
      description: "Cracked in centuries",
    };
  return {
    label: "Excellent",
    color: "text-primary",
    description: "Practically uncrackable with current technology",
  };
}

function getStrengthPercent(length: number): number {
  if (length <= 8) return 15;
  if (length <= 10) return 35;
  if (length <= 12) return 55;
  if (length <= 14) return 75;
  if (length <= 16) return 90;
  return 100;
}

// --- Constants ---

const STEPS = [
  "Password Security 101",
  "Set Password Policy",
  "Apply Policy",
  "Additional Measures",
];

// --- Component ---

export default function PasswordPolicyWizard({
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
  const [minLength, setMinLength] = useState<number | null>(null);

  // --- Fetch current settings ---

  const { data: settings, isLoading } = useQuery<ComplianceSettings>({
    queryKey: ["compliance-settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/compliance/settings");
      return res.json();
    },
  });

  // Initialize slider from server
  const effectiveLength = minLength ?? settings?.minPasswordLength ?? 12;

  // --- Save mutation ---

  const saveMutation = useMutation({
    mutationFn: async (passwordLength: number) => {
      const res = await apiRequest("PUT", "/api/compliance/settings", {
        minPasswordLength: passwordLength,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-settings"] });
      toast({
        title: "Password policy updated",
        description: `Minimum password length set to ${effectiveLength} characters.`,
      });
      setStep(3);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update password policy",
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
      // Apply step: save to server
      saveMutation.mutate(effectiveLength);
      return;
    }
    if (canGoNext) setStep(step + 1);
  };

  const goBack = () => {
    if (canGoBack) setStep(step - 1);
  };

  // --- Loading state ---

  const handleClose = () => onOpenChange?.(false);

  if (isLoading) {
    const loadingContent = (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
    if (open !== undefined) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            {loadingContent}
          </DialogContent>
        </Dialog>
      );
    }
    return loadingContent;
  }

  const strength = getStrengthLabel(effectiveLength);
  const strengthPercent = getStrengthPercent(effectiveLength);

  const content = (
    <div className="space-y-6">
      {/* Header + progress */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            IA.2.078 — Password Complexity Policy
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure minimum password requirements for your organization.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
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
        {step === 0 && <StepLearn />}
        {step === 1 && (
          <StepConfigure
            length={effectiveLength}
            setLength={setMinLength}
            strength={strength}
            strengthPercent={strengthPercent}
            currentSaved={settings?.minPasswordLength ?? 12}
          />
        )}
        {step === 2 && (
          <StepApply
            length={effectiveLength}
            strength={strength}
            isPending={saveMutation.isPending}
          />
        )}
        {step === 3 && <StepAdditional onComplete={onComplete} />}
      </div>

      {/* Navigation buttons */}
      <Separator />
      <div className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={goBack}
          disabled={!canGoBack || saveMutation.isPending}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            size="sm"
            onClick={goNext}
            disabled={saveMutation.isPending}
          >
            {step === 2 ? (
              saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Apply Policy
                  <CheckCircle2 className="h-4 w-4 ml-1" />
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

// ────────────────────────────────────────────────────────────────────────────
// Step 1: Password Security 101
// ────────────────────────────────────────────────────────────────────────────

function StepLearn() {
  const crackTimes = [
    {
      length: 8,
      time: "Minutes",
      icon: AlertTriangle,
      color: "text-red-500 bg-red-500/10 border-red-500/30",
    },
    {
      length: 10,
      time: "Hours",
      icon: AlertTriangle,
      color: "text-orange-500 bg-orange-500/10 border-orange-500/30",
    },
    {
      length: 12,
      time: "Centuries",
      icon: Shield,
      color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    },
    {
      length: 16,
      time: "Uncrackable",
      icon: Lock,
      color: "text-primary bg-primary/10 border-primary/30",
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Why Password Length Matters
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Password length is the single most important factor in password
            security. Each additional character multiplies the number of possible
            combinations by approximately 95x (the number of printable ASCII
            characters).
          </p>
          <p>
            CMMC requires complex passwords. The NIST 800-63B guidelines
            recommend a minimum of 8 characters, but 12 or more characters are
            strongly recommended for any environment handling Controlled
            Unclassified Information (CUI).
          </p>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3">
          Time to Crack by Password Length
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {crackTimes.map(({ length, time, icon: Icon, color }) => (
            <Card key={length} className={`border ${color}`}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">{length} characters</div>
                  <div className="text-xs text-muted-foreground">
                    Cracked in: <span className="font-medium">{time}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="py-3 px-4 flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Modern attacks use GPU-accelerated brute force capable of billions of
            guesses per second. An 8-character password has roughly 6.6
            quadrillion combinations, which sounds like a lot, but falls in
            minutes. A 12-character password has 540 sextillion combinations,
            making it resistant to brute force for centuries.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: Set Password Policy
// ────────────────────────────────────────────────────────────────────────────

function StepConfigure({
  length,
  setLength,
  strength,
  strengthPercent,
  currentSaved,
}: {
  length: number;
  setLength: (v: number) => void;
  strength: { label: string; color: string; description: string };
  strengthPercent: number;
  currentSaved: number;
}) {
  const cmmcCompliant = length >= 12;

  return (
    <div className="space-y-5">
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Minimum Password Length
          </CardTitle>
          <CardDescription className="text-xs">
            Currently saved: {currentSaved} characters. Drag the slider to set a
            new minimum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Big number display */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-5xl font-bold tabular-nums">{length}</span>
            <span className="text-sm text-muted-foreground">characters</span>
          </div>

          {/* Slider */}
          <div className="px-2">
            <Slider
              min={8}
              max={32}
              step={1}
              value={[length]}
              onValueChange={([v]) => setLength(v)}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>8 (min)</span>
              <span>12 (recommended)</span>
              <span>32 (max)</span>
            </div>
          </div>

          {/* Strength indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Password Strength
              </span>
              <Badge
                variant="outline"
                className={`text-xs ${strength.color} border-current`}
              >
                {strength.label}
              </Badge>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${strengthPercent}%`,
                  background:
                    strengthPercent >= 75
                      ? "hsl(var(--primary))"
                      : strengthPercent >= 55
                        ? "hsl(48 96% 53%)"
                        : strengthPercent >= 35
                          ? "hsl(25 95% 53%)"
                          : "hsl(0 84% 60%)",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {strength.description}
            </p>
          </div>

          {/* CMMC compliance badge */}
          {cmmcCompliant ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-400">
                Meets CMMC requirement (12+ characters)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="text-xs text-yellow-500">
                Below CMMC recommendation. Set to 12 or higher for compliance.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: Apply Policy
// ────────────────────────────────────────────────────────────────────────────

function StepApply({
  length,
  strength,
  isPending,
}: {
  length: number;
  strength: { label: string; color: string; description: string };
  isPending: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Confirm Password Policy Change
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-sm text-muted-foreground">
              Minimum password length
            </span>
            <span className="text-sm font-semibold">{length} characters</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-sm text-muted-foreground">
              Strength rating
            </span>
            <Badge
              variant="outline"
              className={`text-xs ${strength.color} border-current`}
            >
              {strength.label}
            </Badge>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-sm text-muted-foreground">
              CMMC compliant
            </span>
            {length >= 12 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="py-3 px-4 flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Click <span className="font-medium text-foreground">Apply Policy</span> below
              to save this setting. The new minimum will apply to all future
              password changes. Existing passwords that do not meet the new
              requirement will still work but users will be prompted to update
              their password on next login.
            </p>
          </div>
        </CardContent>
      </Card>

      {isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving password policy...
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: Additional Measures
// ────────────────────────────────────────────────────────────────────────────

function StepAdditional({ onComplete }: { onComplete?: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-sm text-emerald-400 font-medium">
          Password policy has been applied successfully.
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Beyond minimum length, consider these additional password security
        measures. These are informational recommendations for your security
        posture.
      </p>

      <div className="grid gap-3">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-4 px-4 flex items-start gap-3">
            <History className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Password History</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Prevent users from reusing their last 5 passwords. This stops
                the common pattern of rotating between two or three known
                passwords. When a user changes their password, the system should
                reject any password that matches a recent entry in their
                password history.
              </p>
              <Badge
                variant="outline"
                className="mt-2 text-[10px] border-blue-500/40 text-blue-400"
              >
                Recommended
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-4 px-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Account Lockout</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Lock accounts after 5 consecutive failed login attempts for a
                cooldown period (e.g., 15 minutes). This mitigates brute-force
                attacks by rate-limiting authentication attempts. Combine with
                progressive delays: 1st failure = instant retry, 3rd = 5 second
                delay, 5th = 15 minute lockout.
              </p>
              <Badge
                variant="outline"
                className="mt-2 text-[10px] border-blue-500/40 text-blue-400"
              >
                Recommended
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-4 px-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Password Expiry</h4>
              <p className="text-xs text-muted-foreground mt-1">
                NIST 800-63B no longer recommends mandatory password rotation
                unless there is evidence of compromise. However, some
                organizations still require 90-day rotation for compliance. If
                you implement expiry, ensure it works alongside password history
                to prevent trivial rotations.
              </p>
              <Badge
                variant="outline"
                className="mt-2 text-[10px] border-muted-foreground/40 text-muted-foreground"
              >
                Optional
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
