"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  KeyRound,
} from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════════
// MFA Setup Dialog — TOTP-based Multi-Factor Authentication
// CMMC IA.2.081: Multi-factor authentication for local and network access
// ════════════════════════════════════════════════════════════════════════════════

type Step = "intro" | "setup" | "verify" | "backup" | "done";

interface MfaSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when MFA is successfully enabled */
  onMfaEnabled?: () => void;
}

export function MfaSetupDialog({
  open,
  onOpenChange,
  onMfaEnabled,
}: MfaSetupDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup data from server
  const [secret, setSecret] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Verification input
  const [verifyCode, setVerifyCode] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  const reset = useCallback(() => {
    setStep("intro");
    setLoading(false);
    setError(null);
    setSecret("");
    setQrCodeUri("");
    setBackupCodes([]);
    setVerifyCode("");
    setCopiedSecret(false);
    setCopiedBackup(false);
  }, []);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) {
        reset();
      }
      onOpenChange(open);
    },
    [onOpenChange, reset],
  );

  // Step 1 -> 2: Initiate MFA setup
  const handleInitSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/setup");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to initiate MFA setup");
      }
      const data = await res.json();
      setSecret(data.secret);
      setQrCodeUri(data.qrCodeUri);
      setBackupCodes(data.backupCodes);
      setStep("setup");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2 -> 3: Verify the TOTP token
  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/verify-setup", {
        token: verifyCode,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Verification failed");
      }
      setStep("backup");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: "secret" | "backup") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "secret") {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } else {
        setCopiedBackup(true);
        setTimeout(() => setCopiedBackup(false), 2000);
      }
      toast({
        title: "Copied to clipboard",
        description:
          type === "secret"
            ? "Secret key copied"
            : "Backup codes copied",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please select and copy manually",
        variant: "destructive",
      });
    }
  };

  const handleDone = () => {
    onMfaEnabled?.();
    handleClose(false);
    toast({
      title: "MFA Enabled",
      description:
        "Multi-factor authentication is now active on your account.",
    });
  };

  // Handle Enter key in verify input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && verifyCode.length === 6 && !loading) {
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        {/* ── Intro Step ─────────────────────────────────────── */}
        {step === "intro" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Enable Multi-Factor Authentication
              </DialogTitle>
              <DialogDescription>
                Add an extra layer of security to your account. You will need an
                authenticator app like Google Authenticator, Authy, or 1Password
                to generate verification codes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 text-sm text-muted-foreground">
              <p>
                Multi-factor authentication (MFA) protects your account even if
                your password is compromised. This is required for CMMC
                compliance (IA.2.081).
              </p>
              <div className="rounded-md border border-border bg-card p-3 space-y-2">
                <p className="font-medium text-foreground">What you will need:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>An authenticator app on your phone</li>
                  <li>Access to your account for the next few minutes</li>
                </ul>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleInitSetup} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Get Started
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Setup Step (QR + Secret) ───────────────────────── */}
        {step === "setup" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                Scan QR Code
              </DialogTitle>
              <DialogDescription>
                Open your authenticator app and scan this QR code, or manually
                enter the secret key below.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* QR Code URI display */}
              <div className="rounded-md border border-border bg-card p-4 space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Authenticator URI (scan with your app)
                </Label>
                <div className="break-all text-xs font-mono bg-background p-2 rounded border border-border select-all">
                  {qrCodeUri}
                </div>
              </div>

              {/* Manual secret entry */}
              <div className="rounded-md border border-border bg-card p-4 space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Secret Key (manual entry)
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-background p-2 rounded border border-border tracking-widest select-all">
                    {secret}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(secret, "secret")}
                  >
                    {copiedSecret ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Verification input */}
              <div className="space-y-2">
                <Label htmlFor="mfa-verify-code">
                  Enter the 6-digit code from your authenticator app
                </Label>
                <Input
                  id="mfa-verify-code"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setVerifyCode(val);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("intro");
                  setError(null);
                }}
              >
                Back
              </Button>
              <Button
                onClick={handleVerify}
                disabled={loading || verifyCode.length !== 6}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify and Enable
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Backup Codes Step ──────────────────────────────── */}
        {step === "backup" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-500" />
                Save Your Backup Codes
              </DialogTitle>
              <DialogDescription>
                Store these backup codes in a safe place. Each code can only be
                used once. If you lose access to your authenticator app, you can
                use a backup code to sign in.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-200">
                  These codes will not be shown again. Save them now before
                  continuing.
                </p>
              </div>

              <div className="rounded-md border border-border bg-card p-4">
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, i) => (
                    <code
                      key={i}
                      className="text-sm font-mono bg-background p-2 rounded border border-border text-center select-all"
                    >
                      {code}
                    </code>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  copyToClipboard(backupCodes.join("\n"), "backup")
                }
              >
                {copiedBackup ? (
                  <Check className="mr-2 h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                Copy All Backup Codes
              </Button>
            </div>

            <DialogFooter>
              <Button onClick={handleDone}>
                I have saved my backup codes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MFA Disable Dialog — for disabling MFA with TOTP verification
// ═══════════════════════════════════════════════════════════════════════════════

interface MfaDisableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMfaDisabled?: () => void;
}

export function MfaDisableDialog({
  open,
  onOpenChange,
  onMfaDisabled,
}: MfaDisableDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disableCode, setDisableCode] = useState("");

  const handleClose = (open: boolean) => {
    if (!open) {
      setDisableCode("");
      setError(null);
      setLoading(false);
    }
    onOpenChange(open);
  };

  const handleDisable = async () => {
    if (disableCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/mfa/disable", {
        token: disableCode,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to disable MFA");
      }

      onMfaDisabled?.();
      handleClose(false);
      toast({
        title: "MFA Disabled",
        description:
          "Multi-factor authentication has been removed from your account.",
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && disableCode.length === 6 && !loading) {
      handleDisable();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" />
            Disable Multi-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            Enter your current authenticator code to confirm disabling MFA.
            This will reduce the security of your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">
              Disabling MFA may put your account at risk and could violate your
              organization's compliance requirements.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mfa-disable-code">Verification Code</Label>
            <Input
              id="mfa-disable-code"
              placeholder="000000"
              value={disableCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setDisableCode(val);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              maxLength={6}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              autoComplete="one-time-code"
              inputMode="numeric"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDisable}
            disabled={loading || disableCode.length !== 6}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Disable MFA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
