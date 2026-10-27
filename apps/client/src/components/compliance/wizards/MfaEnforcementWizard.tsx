import { useState, useEffect, useCallback } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  QrCode,
  Copy,
  Check,
  BookOpen,
  Lock,
  Users,
  Info,
  Smartphone,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ════════════════════════════════════════════════════════════════════════════════
// AC.3.021 — MFA Enforcement Wizard
// Guides users through configuring MFA policy for privileged roles,
// setting up their own authenticator, and verifying enrollment status.
// ════════════════════════════════════════════════════════════════════════════════

interface ComplianceSettings {
  id: string;
  requireMfa: boolean;
  mfaEnforcedRoles: string[];
  [key: string]: unknown;
}

interface MfaStatus {
  mfaEnabled: boolean;
  mfaRequired: boolean;
  backupCodesRemaining?: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
  mfaEnabled?: boolean;
}

interface MfaEnforcementWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const AVAILABLE_ROLES = [
  { value: "owner", label: "Owner", description: "Full access to all settings" },
  { value: "admin", label: "Admin", description: "Manage settings and users" },
  { value: "team_member", label: "Team Member", description: "Standard operations" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];

export function MfaEnforcementWizard({
  open,
  onOpenChange,
  onComplete,
}: MfaEnforcementWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // MFA policy state
  const [requireMfa, setRequireMfa] = useState(false);
  const [enforcedRoles, setEnforcedRoles] = useState<string[]>(["owner", "admin"]);

  // MFA setup state
  const [setupLoading, setSetupLoading] = useState(false);
  const [secret, setSecret] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [mfaSetupComplete, setMfaSetupComplete] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // Fetch current compliance settings
  const { data: settings, isLoading: settingsLoading } =
    useQuery<ComplianceSettings>({
      queryKey: ["/api/compliance/settings"],
      enabled: open,
    });

  // Fetch MFA status for current user
  const { data: mfaStatus, refetch: refetchMfaStatus } =
    useQuery<MfaStatus>({
      queryKey: ["/api/auth/mfa/status"],
      enabled: open,
    });

  // Fetch users to show enrollment status
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/rbac/users"],
    enabled: open,
  });

  // Initialize local state from server settings
  useEffect(() => {
    if (settings) {
      setRequireMfa(settings.requireMfa ?? false);
      setEnforcedRoles(
        settings.mfaEnforcedRoles?.length
          ? settings.mfaEnforcedRoles
          : ["owner", "admin"],
      );
    }
  }, [settings]);

  // Save MFA policy mutation
  const savePolicyMutation = useMutation({
    mutationFn: async (data: {
      requireMfa: boolean;
      mfaEnforcedRoles: string[];
    }) => {
      const res = await apiRequest("PUT", "/api/compliance/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/compliance/settings"],
      });
      toast({
        title: "MFA policy saved",
        description: `MFA is now ${requireMfa ? "required" : "optional"} for ${enforcedRoles.join(", ")} roles.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save MFA policy",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSavePolicy = () => {
    savePolicyMutation.mutate({
      requireMfa,
      mfaEnforcedRoles: enforcedRoles,
    });
  };

  const toggleRole = (role: string) => {
    setEnforcedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  // MFA setup flow
  const handleStartSetup = useCallback(async () => {
    setSetupLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/setup");
      const data = await res.json();
      setSecret(data.secret);
      setQrCodeUri(data.qrCodeUri);
      setBackupCodes(data.backupCodes || []);
    } catch (error: any) {
      toast({
        title: "MFA setup failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSetupLoading(false);
    }
  }, [toast]);

  const handleVerifySetup = useCallback(async () => {
    if (!verifyCode || verifyCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit code from your authenticator app.",
        variant: "destructive",
      });
      return;
    }

    setVerifyLoading(true);
    try {
      await apiRequest("POST", "/api/auth/mfa/verify-setup", {
        token: verifyCode,
      });
      setMfaSetupComplete(true);
      refetchMfaStatus();
      toast({
        title: "MFA enabled",
        description: "Multi-factor authentication is now active on your account.",
      });
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setVerifyLoading(false);
    }
  }, [verifyCode, toast, refetchMfaStatus]);

  const copyToClipboard = useCallback(
    (text: string, type: "secret" | "backup") => {
      navigator.clipboard.writeText(text);
      if (type === "secret") {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedBackup(true);
        setTimeout(() => setCopiedBackup(false), 2000);
      }
    },
    [],
  );

  // ── Step 1: Why MFA? ─────────────────────────────────────────────────────

  const step1Content = (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">
                What is Multi-Factor Authentication?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                MFA requires users to provide two or more verification
                factors to access an account. Even if a password is stolen,
                the attacker cannot log in without the second factor.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Lock className="h-8 w-8 text-primary mx-auto mb-2" />
            <h4 className="text-xs font-semibold">Something You Know</h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              Your password
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Smartphone className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
            <h4 className="text-xs font-semibold">Something You Have</h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              Authenticator app on your phone
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <ShieldCheck className="h-8 w-8 text-amber-400 mx-auto mb-2" />
            <h4 className="text-xs font-semibold">TOTP Codes</h4>
            <p className="text-[10px] text-muted-foreground mt-1">
              6-digit code that changes every 30 seconds
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-400" />
            How TOTP Works
          </h4>
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>
              You scan a QR code with an authenticator app (Google
              Authenticator, Authy, 1Password).
            </li>
            <li>
              The app generates a new 6-digit code every 30 seconds using a
              shared secret.
            </li>
            <li>
              When logging in, you enter your password plus the current
              6-digit code.
            </li>
            <li>
              The server independently calculates the expected code and
              verifies it matches.
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-200/80">
          <strong>MFA blocks 99.9% of automated attacks.</strong> Even with
          a leaked password, attackers cannot generate the time-based code
          without physical access to your authenticator device.
        </p>
      </div>
    </div>
  );

  // ── Step 2: Configure MFA Policy ──────────────────────────────────────────

  const step2Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure which roles must use MFA. CMMC AC.3.021 requires MFA for
        all privileged accounts (Owner and Admin at minimum).
      </p>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* MFA master toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold">
                Require MFA for Privileged Roles
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, users with selected roles must set up MFA
                before they can perform privileged actions.
              </p>
            </div>
            <Switch
              checked={requireMfa}
              onCheckedChange={setRequireMfa}
            />
          </div>

          {/* Role toggles */}
          {requireMfa && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <Label className="text-xs font-semibold text-muted-foreground">
                Enforce MFA for these roles:
              </Label>
              {AVAILABLE_ROLES.map((role) => (
                <div
                  key={role.value}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30"
                >
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {role.label}
                      {(role.value === "owner" ||
                        role.value === "admin") && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-amber-500/30 text-amber-400"
                        >
                          CMMC Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {role.description}
                    </p>
                  </div>
                  <Switch
                    checked={enforcedRoles.includes(role.value)}
                    onCheckedChange={() => toggleRole(role.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Compliance warning */}
          {requireMfa &&
            (!enforcedRoles.includes("owner") ||
              !enforcedRoles.includes("admin")) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">
                  CMMC AC.3.021 requires MFA for all privileged accounts.
                  Both Owner and Admin roles should be selected.
                </p>
              </div>
            )}

          <Button
            onClick={handleSavePolicy}
            disabled={savePolicyMutation.isPending}
            className="w-full"
          >
            {savePolicyMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Save MFA Policy
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // ── Step 3: Set Up Your MFA ───────────────────────────────────────────────

  const alreadyEnabled = mfaStatus?.mfaEnabled === true || mfaSetupComplete;

  const step3Content = (
    <div className="space-y-4">
      {alreadyEnabled ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-5 pb-5 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-400">
                MFA Already Enabled
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Your account already has MFA configured. You can proceed to
                the next step.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : !secret ? (
        <>
          <p className="text-sm text-muted-foreground">
            Set up MFA on your account. You will need an authenticator app
            on your phone (Google Authenticator, Authy, or 1Password).
          </p>
          <Button
            onClick={handleStartSetup}
            disabled={setupLoading}
            className="w-full"
          >
            {setupLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <QrCode className="h-4 w-4 mr-2" />
            )}
            Begin MFA Setup
          </Button>
        </>
      ) : (
        <>
          {/* QR Code / Secret */}
          <Card>
            <CardContent className="pt-5 space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                Scan QR Code
              </h4>
              <p className="text-xs text-muted-foreground">
                Open your authenticator app and scan this QR code, or
                manually enter the secret key below.
              </p>

              {/* QR code display - use otpauth URI in an img */}
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeUri)}`}
                  alt="MFA QR Code"
                  className="w-48 h-48"
                />
              </div>

              {/* Manual secret */}
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Manual entry key:
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono p-2 rounded bg-muted/50 border border-border/50 break-all">
                    {secret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(secret, "secret")
                    }
                  >
                    {copiedSecret ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Backup codes */}
              {backupCodes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <KeyRound className="h-3 w-3" />
                    Backup codes (save these securely):
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {backupCodes.map((code, i) => (
                      <code
                        key={i}
                        className="text-[10px] font-mono p-1.5 rounded bg-muted/50 border border-border/50 text-center"
                      >
                        {code}
                      </code>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() =>
                      copyToClipboard(
                        backupCodes.join("\n"),
                        "backup",
                      )
                    }
                  >
                    {copiedBackup ? (
                      <Check className="h-3 w-3 mr-1" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Copy All Backup Codes
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Verification */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <h4 className="text-sm font-semibold">
                Verify Your Authenticator
              </h4>
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code shown in your authenticator app to
                confirm setup.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  maxLength={6}
                  className="font-mono text-center text-lg tracking-widest w-40"
                />
                <Button
                  onClick={handleVerifySetup}
                  disabled={
                    verifyCode.length !== 6 || verifyLoading
                  }
                >
                  {verifyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-1" />
                  )}
                  Verify
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  // ── Step 4: MFA Enrollment Status ─────────────────────────────────────────

  const step4Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review the MFA enrollment status of all users. All users with
        enforced roles must have MFA enabled.
      </p>

      {settingsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Policy summary */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold">
                    Current MFA Policy
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    MFA is {settings?.requireMfa || requireMfa ? "required" : "not required"}{" "}
                    for{" "}
                    {(
                      settings?.mfaEnforcedRoles ?? enforcedRoles
                    ).join(", ")}{" "}
                    roles.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    settings?.requireMfa || requireMfa
                      ? "border-emerald-500/40 text-emerald-400"
                      : "border-amber-500/40 text-amber-400"
                  }
                >
                  {settings?.requireMfa || requireMfa
                    ? "Enforced"
                    : "Not Enforced"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* User enrollment table */}
          <Card>
            <CardContent className="pt-4">
              <h4 className="text-xs font-semibold mb-3 flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                User MFA Enrollment
              </h4>
              {!users || users.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No user data available.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">User</TableHead>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="text-xs">MFA Status</TableHead>
                      <TableHead className="text-xs">Compliant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const userRole = user.role ?? "team_member";
                      const isEnforced = (
                        settings?.mfaEnforcedRoles ?? enforcedRoles
                      ).includes(userRole);
                      const hasMfa = user.mfaEnabled === true;
                      const isCompliant = !isEnforced || hasMfa;

                      return (
                        <TableRow key={user.id}>
                          <TableCell className="text-xs">
                            <div>
                              <div className="font-medium">
                                {user.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {user.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant="outline"
                              className="text-[9px]"
                            >
                              {userRole}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {hasMfa ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-emerald-500/40 text-emerald-400"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                Enabled
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-red-500/40 text-red-400"
                              >
                                <XCircle className="h-2.5 w-2.5 mr-0.5" />
                                Not Set Up
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isCompliant ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <ShieldAlert className="h-4 w-4 text-red-400" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Non-compliant warning */}
          {users &&
            users.some(
              (u) =>
                (settings?.mfaEnforcedRoles ?? enforcedRoles).includes(
                  u.role ?? "team_member",
                ) && !u.mfaEnabled,
            ) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-200/80">
                  <strong>Non-compliant users detected.</strong> Some users
                  with enforced roles have not yet set up MFA. They should
                  be notified to complete MFA enrollment to satisfy
                  AC.3.021.
                </p>
              </div>
            )}
        </>
      )}
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: "why-mfa",
      title: "Why MFA?",
      description: "Understanding multi-factor authentication",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      content: step1Content,
    },
    {
      id: "configure-policy",
      title: "Configure MFA Policy",
      description: "Set which roles require MFA",
      icon: <Shield className="h-5 w-5 text-primary" />,
      content: step2Content,
    },
    {
      id: "setup-mfa",
      title: "Set Up Your MFA",
      description: "Configure your own authenticator",
      icon: <KeyRound className="h-5 w-5 text-primary" />,
      content: step3Content,
    },
    {
      id: "enrollment-status",
      title: "MFA Enrollment Status",
      description: "Review user MFA compliance",
      icon: <Users className="h-5 w-5 text-primary" />,
      content: step4Content,
    },
  ];

  return (
    <ComplianceWizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="MFA Enforcement"
      description="Configure multi-factor authentication for privileged accounts."
      controlId="AC.3.021"
      steps={steps}
      onComplete={onComplete}
    />
  );
}
