import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Info,
  Globe,
  Shield,
  ShieldAlert,
  Network,
  Lock,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Types ---

interface PolicyTemplate {
  id: string;
  name: string;
  scope: string;
  description: string;
  bundle?: string;
}

interface OpaStatus {
  healthy: boolean;
  url: string;
  policies?: Array<{ id: string; raw: string }>;
  error?: string;
}

// --- Constants ---

const STEPS = [
  "Network Boundary Protection",
  "Current Network Policies",
  "Configure Whitelist",
  "Verify OPA Active",
];

// --- Helpers ---

function getNetworkModeFromBundle(bundle?: string): {
  mode: string;
  label: string;
  color: string;
} {
  if (!bundle) return { mode: "unknown", label: "Unknown", color: "text-muted-foreground" };
  if (bundle.includes("restrictive"))
    return { mode: "deny-all", label: "Deny All", color: "text-emerald-400" };
  if (bundle.includes("standard"))
    return { mode: "whitelist", label: "Whitelist", color: "text-blue-400" };
  if (bundle.includes("permissive"))
    return { mode: "allow-all", label: "Allow All", color: "text-orange-400" };
  return { mode: "custom", label: "Custom", color: "text-purple-400" };
}

// --- Component ---

export default function BoundaryMonitoringWizard({
  open,
  onOpenChange,
  onComplete,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onComplete?: () => void;
}) {
  useToast();
  const [step, setStep] = useState(0);

  // --- Fetch policy templates ---

  const { data: policies, isLoading: policiesLoading } = useQuery<
    PolicyTemplate[]
  >({
    queryKey: ["claw-policies"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/claw-policies");
      return res.json();
    },
    enabled: step >= 1,
  });

  // --- Fetch OPA status ---

  const {
    data: opaStatus,
    isLoading: opaLoading,
    refetch: refetchOpa,
  } = useQuery<OpaStatus>({
    queryKey: ["compliance-opa-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/compliance/opa-status");
      return res.json();
    },
    enabled: step >= 3,
    retry: 1,
  });

  // --- Navigation ---

  const canGoNext = step < STEPS.length - 1;
  const canGoBack = step > 0;

  const goNext = () => {
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
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            SC.1.175 — Boundary Communication Monitoring
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Monitor, control, and protect communications at external system
          boundaries.
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
        {step === 0 && <StepLearn />}
        {step === 1 && (
          <StepPolicies
            policies={policies ?? []}
            isLoading={policiesLoading}
          />
        )}
        {step === 2 && <StepWhitelist policies={policies ?? []} />}
        {step === 3 && (
          <StepVerify
            opaStatus={opaStatus}
            isLoading={opaLoading}
            onRefetch={() => refetchOpa()}
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
          disabled={!canGoBack}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={goNext}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
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
// Step 1: Network Boundary Protection
// ────────────────────────────────────────────────────────────────────────────

function StepLearn() {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            How Boundary Protection Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            The OPA (Open Policy Agent) policy engine controls what external
            services your AI agents can communicate with. Every outbound network
            request from a claw agent is evaluated against its assigned policy
            template before being allowed.
          </p>
          <p>
            By default, the <span className="font-medium text-foreground">Restrictive</span>{" "}
            template blocks all outbound network access. The{" "}
            <span className="font-medium text-foreground">Standard</span>{" "}
            template uses a whitelist (only specified domains are allowed). The{" "}
            <span className="font-medium text-foreground">Permissive</span>{" "}
            template allows all outbound access.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-400">
                Restrictive (Deny All)
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                No outbound network access. Agents can only use local AI models
                and local data. Best for agents handling highly sensitive or
                classified data.
              </p>
              <Badge
                variant="outline"
                className="mt-2 text-[10px] border-emerald-500/40 text-emerald-400"
              >
                Most Secure
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-blue-400">
                Standard (Whitelist)
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                Only explicitly allowed domains are accessible. Agents can reach
                approved AI APIs and services. Recommended for production use
                with CMMC compliance.
              </p>
              <Badge
                variant="outline"
                className="mt-2 text-[10px] border-blue-500/40 text-blue-400"
              >
                Recommended for CMMC
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-orange-400">
                Permissive (Allow All)
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                All outbound network access is allowed. Use only for development
                and testing. Not compliant with CMMC boundary monitoring
                requirements.
              </p>
              <Badge
                variant="outline"
                className="mt-2 text-[10px] border-orange-500/40 text-orange-400"
              >
                Development Only
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: Current Network Policies
// ────────────────────────────────────────────────────────────────────────────

function StepPolicies({
  policies,
  isLoading,
}: {
  policies: PolicyTemplate[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Loading policy templates...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Active Policy Templates
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <p>
            These are the policy templates available in your organization. Each
            template defines network access rules, AI model restrictions, and
            tool permissions for assigned claw agents.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {policies.map((policy) => {
          const netMode = getNetworkModeFromBundle(policy.bundle);
          return (
            <Card key={policy.id} className="border-border/50 bg-card/50">
              <CardContent className="py-4 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{policy.name}</h4>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-muted-foreground/30"
                      >
                        {policy.scope}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {policy.description}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${netMode.color} border-current`}
                  >
                    {netMode.label}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <Network className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      Network:{" "}
                      <span className={`font-medium ${netMode.color}`}>
                        {netMode.mode}
                      </span>
                    </span>
                  </div>
                  {policy.bundle && (
                    <div className="flex items-center gap-1.5">
                      <Info className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">
                        Bundle: {policy.bundle}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {policies.length === 0 && (
          <Card className="border-dashed border-border/50">
            <CardContent className="py-8 flex flex-col items-center text-center">
              <ShieldAlert className="h-6 w-6 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No policy templates found. Create one in Claw Policies to define
                network boundary rules.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: Configure Whitelist
// ────────────────────────────────────────────────────────────────────────────

function StepWhitelist({ policies }: { policies: PolicyTemplate[] }) {
  const standardPolicy = policies.find((p) =>
    p.bundle?.includes("standard"),
  );
  const restrictivePolicy = policies.find((p) =>
    p.bundle?.includes("restrictive"),
  );

  const recommendedDomains = [
    {
      domain: "api.openai.com",
      purpose: "OpenAI GPT models",
    },
    {
      domain: "api.anthropic.com",
      purpose: "Anthropic Claude models",
    },
    {
      domain: "generativelanguage.googleapis.com",
      purpose: "Google Gemini models",
    },
    {
      domain: "api.cohere.ai",
      purpose: "Cohere models",
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Network Whitelist Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            For CMMC compliance, production agents should use{" "}
            <span className="font-medium text-foreground">whitelist mode</span>{" "}
            (Standard template) or{" "}
            <span className="font-medium text-foreground">deny-all</span>{" "}
            (Restrictive template). Only allow domains that are strictly
            necessary for your agents' operations.
          </p>
        </CardContent>
      </Card>

      {/* Recommended domains */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Common AI API Domains
        </h3>
        <p className="text-xs text-muted-foreground mb-2">
          Only add domains your agents actually need. Remove any that are not in
          active use.
        </p>
        <div className="grid gap-2">
          {recommendedDomains.map(({ domain, purpose }) => (
            <Card key={domain} className="border-border/50 bg-card/50">
              <CardContent className="py-2.5 px-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <code className="text-xs font-mono">{domain}</code>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {purpose}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Link to policy editor */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <ExternalLink className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-400">
              Edit Network Rules in Policy Editor
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Navigate to{" "}
              <a
                href="/app/claw-policies"
                className="underline text-primary hover:text-primary/80"
              >
                Claw Policies
              </a>{" "}
              to edit the network whitelist for the{" "}
              {standardPolicy?.name ?? "Standard"} template. Add or remove
              allowed domains directly in the policy editor.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Best practices */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold">
            Whitelist Best Practices
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>
              Use specific domain names, not IP addresses or wildcards.
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>
              Review the whitelist monthly and remove any domains no longer in
              use.
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>
              Assign agents handling CUI to the{" "}
              {restrictivePolicy?.name ?? "Restrictive"} template (deny-all) when
              they do not need external API access.
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span>
              Log all outbound requests for audit. The platform does this
              automatically via claw_tool_events.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: Verify OPA Active
// ────────────────────────────────────────────────────────────────────────────

function StepVerify({
  opaStatus,
  isLoading,
  onRefetch,
  onComplete,
}: {
  opaStatus?: OpaStatus;
  isLoading: boolean;
  onRefetch: () => void;
  onComplete?: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Checking OPA policy engine status...
        </p>
      </div>
    );
  }

  const healthy = opaStatus?.healthy === true;
  const policyCount = opaStatus?.policies?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Main status card */}
      <Card
        className={`border ${
          healthy
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-red-500/30 bg-red-500/5"
        }`}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {healthy ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-red-400" />
            )}
            OPA Policy Engine Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-sm text-muted-foreground">Health</span>
            {healthy ? (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-medium text-emerald-400">
                  Healthy
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="text-sm font-medium text-red-400">
                  Unreachable
                </span>
              </div>
            )}
          </div>

          {opaStatus?.url && (
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
              <span className="text-sm text-muted-foreground">
                OPA Endpoint
              </span>
              <code className="text-xs font-mono text-muted-foreground">
                {opaStatus.url}
              </code>
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <span className="text-sm text-muted-foreground">
              Loaded Policies
            </span>
            <span className="text-sm font-medium">{policyCount}</span>
          </div>
        </CardContent>
      </Card>

      {healthy ? (
        <Card className="border-emerald-500/30 bg-emerald-500/10">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-400">
              OPA is active and enforcing boundary policies. All outbound
              network requests from claw agents are evaluated against their
              assigned policy templates. Control SC.1.175 requirements are
              satisfied.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="py-3 px-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-400">
                <p className="font-medium">OPA is not reachable.</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Boundary monitoring requires the OPA sidecar to be running.
                  Verify the OPA container is active and the endpoint URL is
                  correctly configured. Without OPA, network policy enforcement
                  is not active.
                </p>
                {opaStatus?.error && (
                  <p className="text-xs mt-1 font-mono text-red-300">
                    Error: {opaStatus.error}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefetch}
          >
            <Loader2 className="h-4 w-4 mr-1" />
            Retry Check
          </Button>
        </div>
      )}

      {/* Loaded policies list */}
      {healthy && policyCount > 0 && opaStatus?.policies && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Loaded Policy Bundles</h3>
          <div className="grid gap-2">
            {opaStatus.policies.map((p, i) => (
              <Card key={i} className="border-border/50 bg-card/50">
                <CardContent className="py-2 px-4 flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                  <code className="text-xs font-mono text-muted-foreground truncate">
                    {p.id}
                  </code>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
