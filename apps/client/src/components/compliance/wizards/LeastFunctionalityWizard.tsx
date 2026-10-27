import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Search,
  Wrench,
  BarChart3,
  Lock,
  Unlock,
  Globe,
  Plug,
  Info,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Types ---

interface PolicyTemplate {
  id: string;
  name: string;
  scope: string;
  description: string;
  bundle: string;
}

interface Claw {
  id: string;
  name: string;
  displayName: string | null;
  status: string;
  policyTemplateId: string | null;
  modelProvider: string;
  modelId: string;
  dataClassification: string | null;
  skills: string[];
}

interface ClawsResponse {
  claws: Claw[];
  total: number;
}

interface AgentFinding {
  clawId: string;
  clawName: string;
  issues: AgentIssue[];
  severity: "pass" | "warn" | "fail";
}

interface AgentIssue {
  type: "permissive_policy" | "no_policy" | "allow_all_network" | "excessive_skills";
  label: string;
  detail: string;
  severity: "warn" | "fail";
}

const STEPS = [
  { title: "Principle of Least Functionality", icon: BookOpen },
  { title: "Agent Security Audit", icon: Search },
  { title: "Remediate", icon: Wrench },
  { title: "Verify", icon: BarChart3 },
];

const SEVERITY_CONFIG = {
  pass: {
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/5",
    icon: CheckCircle2,
  },
  warn: {
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/5",
    icon: AlertTriangle,
  },
  fail: {
    color: "text-red-400",
    borderColor: "border-red-500/30",
    bgColor: "bg-red-500/5",
    icon: XCircle,
  },
};

// --- Component ---

export default function LeastFunctionalityWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [remediations, setRemediations] = useState<Record<string, string>>({});

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setRemediations({});
    }
  }, [open]);

  // --- Fetch policy templates ---
  const {
    data: templates,
    isLoading: templatesLoading,
  } = useQuery<PolicyTemplate[]>({
    queryKey: ["/api/claw-policies"],
    enabled: open,
  });

  // --- Fetch claws ---
  const {
    data: clawsData,
    isLoading: clawsLoading,
    refetch: refetchClaws,
  } = useQuery<ClawsResponse>({
    queryKey: ["/api/claws"],
    enabled: open,
  });

  const claws = clawsData?.claws ?? [];
  const systemTemplates = (templates ?? []).filter((t) => t.scope === "system");

  // Build a lookup from template ID to template
  const templateMap = useMemo(() => {
    const map: Record<string, PolicyTemplate> = {};
    for (const t of systemTemplates) {
      map[t.id] = t;
    }
    return map;
  }, [systemTemplates]);

  // Audit each agent for least functionality issues
  const findings: AgentFinding[] = useMemo(() => {
    return claws.map((claw) => {
      const issues: AgentIssue[] = [];

      // Check policy template
      if (!claw.policyTemplateId) {
        issues.push({
          type: "no_policy",
          label: "No Policy Assigned",
          detail: "Agent has no OPA policy template. It operates without governance.",
          severity: "fail",
        });
      } else {
        const template = templateMap[claw.policyTemplateId];
        if (template?.name === "Permissive") {
          issues.push({
            type: "permissive_policy",
            label: "Permissive Policy",
            detail: "Agent uses the Permissive template which allows all network, providers, models, skills, and tools.",
            severity: "fail",
          });
        }
      }

      // Check for allow_all network (inferred from Permissive policy description)
      const template = claw.policyTemplateId ? templateMap[claw.policyTemplateId] : null;
      if (template?.description?.toLowerCase().includes("allow-all network")) {
        issues.push({
          type: "allow_all_network",
          label: "Allow-All Network",
          detail: "Agent can reach any external endpoint. Restrict to a whitelist of approved destinations.",
          severity: "fail",
        });
      }

      // Check skills count
      const skillCount = claw.skills?.length ?? 0;
      if (skillCount > 10) {
        issues.push({
          type: "excessive_skills",
          label: `${skillCount} Skills Installed`,
          detail: "Agent has a high number of installed skills. Review and remove any that are not essential for its function.",
          severity: "warn",
        });
      }

      const severity: AgentFinding["severity"] =
        issues.some((i) => i.severity === "fail")
          ? "fail"
          : issues.some((i) => i.severity === "warn")
            ? "warn"
            : "pass";

      return {
        clawId: claw.id,
        clawName: claw.displayName || claw.name,
        issues,
        severity,
      };
    });
  }, [claws, templateMap]);

  const failCount = findings.filter((f) => f.severity === "fail").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;
  const passCount = findings.filter((f) => f.severity === "pass").length;
  const flaggedFindings = findings.filter((f) => f.severity !== "pass");
  const allPass = failCount === 0 && warnCount === 0;

  // --- Remediate mutation ---
  const remediateMutation = useMutation({
    mutationFn: async ({ clawId, policyId }: { clawId: string; policyId: string }) => {
      const res = await apiRequest("PATCH", `/api/claws/${clawId}`, {
        policyId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claws"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claw-policies/compliance-status"] });
    },
    onError: (error: any) => {
      toast({
        title: "Remediation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [isBatchRemediating, setIsBatchRemediating] = useState(false);

  const handleBatchRemediate = async () => {
    const entries = Object.entries(remediations).filter(
      ([, policyId]) => policyId
    );

    if (entries.length === 0) {
      toast({
        title: "No remediations selected",
        description: "Choose a replacement template for at least one flagged agent.",
      });
      return;
    }

    setIsBatchRemediating(true);
    let successCount = 0;
    let errorCount = 0;

    for (const [clawId, policyId] of entries) {
      try {
        await remediateMutation.mutateAsync({ clawId, policyId });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsBatchRemediating(false);
    await refetchClaws();

    toast({
      title: "Remediation complete",
      description: `${successCount} agent${successCount !== 1 ? "s" : ""} updated.${errorCount > 0 ? ` ${errorCount} failed.` : ""}`,
    });

    if (errorCount === 0) {
      setStep(3);
    }
  };

  // Non-permissive templates for remediation
  const safeTemplates = systemTemplates.filter(
    (t) => t.name !== "Permissive"
  );

  const getTemplateName = (id: string | null) => {
    if (!id) return null;
    return templateMap[id]?.name ?? id;
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            CM.2.064 - Employ Least Functionality
          </DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step].title}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progressPercent} className="h-1.5" />
          <div className="flex justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`flex items-center gap-1 text-xs transition-colors ${
                    i === step
                      ? "text-primary font-medium"
                      : i < step
                        ? "text-emerald-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {i < step ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <ScrollArea className="flex-1 pr-2 min-h-0">
          <div className="space-y-4 py-2">
            {/* STEP 0: Principle of Least Functionality */}
            {step === 0 && (
              <div className="space-y-4">
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Principle of Least Functionality</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Each system should only have the <span className="text-foreground font-medium">minimum
                          features enabled</span> necessary for its intended function. Every enabled feature
                          is an additional attack surface. For AI agents, this means:
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="pt-4 pb-3 space-y-1.5">
                      <Plug className="h-4 w-4 text-primary" />
                      <h4 className="text-xs font-semibold">Only Necessary Skills</h4>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Remove skills the agent does not actively use. Each skill is a potential
                        vector for misuse.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="pt-4 pb-3 space-y-1.5">
                      <Globe className="h-4 w-4 text-primary" />
                      <h4 className="text-xs font-semibold">Restricted Network Access</h4>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Agents should only reach approved destinations. Block all outbound
                        traffic except for whitelisted domains.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="pt-4 pb-3 space-y-1.5">
                      <Shield className="h-4 w-4 text-primary" />
                      <h4 className="text-xs font-semibold">Limited AI Providers</h4>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Restrict which AI model providers and models each agent can
                        invoke. Fewer providers means fewer data-flow paths.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/50 bg-card/50">
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      Why It Matters for CMMC
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      CMMC Control CM.2.064 requires establishing and enforcing security
                      configuration settings that implement least functionality. Agents with
                      unrestricted network access or permissive policies can exfiltrate data
                      or connect to unauthorized services. Reducing functionality minimizes the
                      blast radius of a compromised agent.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* STEP 1: Agent Security Audit */}
            {step === 1 && (
              <div className="space-y-4">
                {clawsLoading || templatesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : claws.length === 0 ? (
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                      <Info className="h-8 w-8 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        No agents found in your organization.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        With zero agents deployed, least functionality is automatically satisfied.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Summary bar */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 text-emerald-400 text-xs gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {passCount} pass
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 text-amber-400 text-xs gap-1"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {warnCount} warnings
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-red-500/30 text-red-400 text-xs gap-1"
                      >
                        <XCircle className="h-3 w-3" />
                        {failCount} failures
                      </Badge>
                    </div>

                    {/* Flagged agents */}
                    {flaggedFindings.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground">
                          Flagged Agents
                        </h4>
                        {flaggedFindings.map((finding) => {
                          const cfg = SEVERITY_CONFIG[finding.severity];
                          const Icon = cfg.icon;
                          return (
                            <Card
                              key={finding.clawId}
                              className={`border ${cfg.borderColor} ${cfg.bgColor}`}
                            >
                              <CardContent className="py-3 px-4 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                                    <span className="text-sm font-medium">
                                      {finding.clawName}
                                    </span>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${cfg.borderColor} ${cfg.color}`}
                                  >
                                    {finding.issues.length} issue{finding.issues.length !== 1 ? "s" : ""}
                                  </Badge>
                                </div>
                                <div className="space-y-1">
                                  {finding.issues.map((issue, i) => (
                                    <div
                                      key={i}
                                      className="flex items-start gap-2 text-xs"
                                    >
                                      {issue.severity === "fail" ? (
                                        <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                                      ) : (
                                        <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                                      )}
                                      <div>
                                        <span className="font-medium text-foreground/90">
                                          {issue.label}:
                                        </span>{" "}
                                        <span className="text-muted-foreground">
                                          {issue.detail}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}

                    {/* Passing agents */}
                    {passCount > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Passing Agents ({passCount})
                        </h4>
                        {findings
                          .filter((f) => f.severity === "pass")
                          .map((finding) => (
                            <Card
                              key={finding.clawId}
                              className="border-emerald-500/20 bg-emerald-500/5"
                            >
                              <CardContent className="py-2.5 px-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">
                                    {finding.clawName}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="border-emerald-500/30 text-emerald-400 text-[10px]"
                                    >
                                      {getTemplateName(
                                        claws.find((c) => c.id === finding.clawId)
                                          ?.policyTemplateId ?? null
                                      )}
                                    </Badge>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 2: Remediate */}
            {step === 2 && (
              <div className="space-y-4">
                {flaggedFindings.length === 0 ? (
                  <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-3" />
                      <p className="text-sm font-medium text-emerald-400">
                        No issues to remediate
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        All agents already follow the least functionality principle.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      For each flagged agent, select a more restrictive policy template. The
                      "Standard" template provides a good balance. Use "Restrictive" for agents
                      handling sensitive data.
                    </p>

                    {flaggedFindings.map((finding) => {
                      const claw = claws.find((c) => c.id === finding.clawId);
                      if (!claw) return null;

                      const currentTemplate = getTemplateName(claw.policyTemplateId);
                      const selectedRemediation = remediations[finding.clawId];
                      const newTemplateName = selectedRemediation
                        ? getTemplateName(selectedRemediation)
                        : null;

                      return (
                        <Card
                          key={finding.clawId}
                          className="border-border/50 bg-card/50"
                        >
                          <CardContent className="py-4 px-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {finding.clawName}
                              </span>
                              {currentTemplate && (
                                <Badge
                                  variant="outline"
                                  className={
                                    currentTemplate === "Permissive"
                                      ? "border-red-500/30 text-red-400 text-[10px]"
                                      : "border-border/50 text-muted-foreground text-[10px]"
                                  }
                                >
                                  Current: {currentTemplate}
                                </Badge>
                              )}
                              {!currentTemplate && (
                                <Badge
                                  variant="outline"
                                  className="border-red-500/30 text-red-400 text-[10px]"
                                >
                                  No policy
                                </Badge>
                              )}
                            </div>

                            {/* Issues summary */}
                            <div className="space-y-1">
                              {finding.issues.map((issue, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                                >
                                  {issue.severity === "fail" ? (
                                    <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                                  )}
                                  {issue.label}
                                </div>
                              ))}
                            </div>

                            {/* Remediation selector */}
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground shrink-0">
                                Switch to:
                              </span>
                              <Select
                                value={remediations[finding.clawId] ?? ""}
                                onValueChange={(val) =>
                                  setRemediations((prev) => ({
                                    ...prev,
                                    [finding.clawId]: val,
                                  }))
                                }
                              >
                                <SelectTrigger className="w-[180px] h-8 text-xs">
                                  <SelectValue placeholder="Select template" />
                                </SelectTrigger>
                                <SelectContent>
                                  {safeTemplates.map((t) => (
                                    <SelectItem
                                      key={t.id}
                                      value={t.id}
                                      className="text-xs"
                                    >
                                      {t.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Before/After comparison */}
                            {newTemplateName && (
                              <div className="flex items-center gap-2 pt-1">
                                <div className="flex-1 rounded border border-red-500/20 bg-red-500/5 p-2 text-center">
                                  <p className="text-[10px] text-muted-foreground mb-0.5">Before</p>
                                  <p className="text-xs font-medium text-red-400">
                                    {currentTemplate || "No Policy"}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
                                  <p className="text-[10px] text-muted-foreground mb-0.5">After</p>
                                  <p className="text-xs font-medium text-emerald-400">
                                    {newTemplateName}
                                  </p>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}

                    {/* Apply remediations button */}
                    <Button
                      className="w-full gap-2"
                      disabled={
                        isBatchRemediating ||
                        Object.keys(remediations).filter((k) => remediations[k]).length === 0
                      }
                      onClick={handleBatchRemediate}
                    >
                      {isBatchRemediating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                      Apply Remediations (
                      {Object.values(remediations).filter(Boolean).length} selected)
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* STEP 3: Verify */}
            {step === 3 && (
              <div className="space-y-4">
                <Card
                  className={`border ${
                    allPass
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        {allPass ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-400" />
                        )}
                        Least Functionality Check
                      </h4>
                      <Badge
                        variant="outline"
                        className={
                          allPass
                            ? "border-emerald-500/30 text-emerald-400"
                            : "border-amber-500/30 text-amber-400"
                        }
                      >
                        {passCount}/{findings.length} pass
                      </Badge>
                    </div>

                    <Progress
                      value={
                        findings.length > 0
                          ? Math.round((passCount / findings.length) * 100)
                          : 100
                      }
                      className="h-2"
                    />

                    <p className="text-sm text-muted-foreground">
                      {allPass ? (
                        "All agents pass the least functionality check. No agent uses permissive policies or unrestricted network access."
                      ) : (
                        <>
                          {failCount + warnCount} agent{failCount + warnCount !== 1 ? "s" : ""} still
                          have issues. Go back to the Remediate step to fix them.
                        </>
                      )}
                    </p>
                  </CardContent>
                </Card>

                {allPass ? (
                  <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardContent className="pt-5 pb-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-emerald-400" />
                        <h4 className="text-sm font-semibold text-emerald-400">
                          CM.2.064 Requirements Met
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        All agents are configured with minimum necessary functionality. Security
                        configuration settings enforce least functionality through restrictive OPA
                        policies, controlled network access, and managed skills. The system will
                        continue monitoring for configuration drift.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="pt-5 pb-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-400" />
                        <h4 className="text-sm font-semibold text-amber-400">
                          Remediation Needed
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Some agents still have permissive configurations. Go back to the Remediate
                        step to switch them to Standard or Restrictive templates.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setStep(2)}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to Remediate
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Per-agent results */}
                {findings.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">
                      Agent Status
                    </h4>
                    {findings.map((finding) => {
                      const cfg = SEVERITY_CONFIG[finding.severity];
                      const Icon = cfg.icon;
                      const claw = claws.find((c) => c.id === finding.clawId);
                      return (
                        <div
                          key={finding.clawId}
                          className="flex items-center justify-between py-1.5 px-2 rounded text-xs"
                        >
                          <div className="flex items-center gap-2 truncate flex-1">
                            <Icon className={`h-3 w-3 ${cfg.color} shrink-0`} />
                            <span className="truncate">{finding.clawName}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${cfg.borderColor} ${cfg.color}`}
                            >
                              {getTemplateName(claw?.policyTemplateId ?? null) || "No policy"}
                            </Badge>
                            {finding.issues.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {finding.issues.length} issue{finding.issues.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer Navigation */}
        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                size="sm"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onOpenChange(false)}
                className="gap-1"
                disabled={!allPass && claws.length > 0}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
