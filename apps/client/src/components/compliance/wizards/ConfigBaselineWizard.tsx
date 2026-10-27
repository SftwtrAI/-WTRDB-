import { useState, useEffect } from "react";
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
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Layers,
  Settings,
  BarChart3,
  Lock,
  Unlock,
  Info,
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

const STEPS = [
  { title: "What is a Configuration Baseline?", icon: BookOpen },
  { title: "Review Available Templates", icon: Layers },
  { title: "Assign Baseline to Agents", icon: Settings },
  { title: "Verify Coverage", icon: BarChart3 },
];

const TEMPLATE_ICONS: Record<string, typeof Shield> = {
  Restrictive: Lock,
  Standard: Shield,
  Permissive: Unlock,
};

const TEMPLATE_COLORS: Record<string, string> = {
  Restrictive: "text-red-400 border-red-500/30 bg-red-500/10",
  Standard: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  Permissive: "text-amber-400 border-amber-500/30 bg-amber-500/10",
};

// --- Component ---

export default function ConfigBaselineWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setAssignments({});
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

  // Agents without a policy assigned
  const unassignedClaws = claws.filter((c) => !c.policyTemplateId);
  const assignedClaws = claws.filter((c) => c.policyTemplateId);

  // --- Assign policy mutation ---
  const assignMutation = useMutation({
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
        title: "Assignment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Batch assign all pending assignments
  const [isBatchAssigning, setIsBatchAssigning] = useState(false);

  const handleBatchAssign = async () => {
    const entriesToAssign = Object.entries(assignments).filter(
      ([clawId, policyId]) => policyId && !claws.find((c) => c.id === clawId)?.policyTemplateId
    );

    if (entriesToAssign.length === 0) {
      toast({
        title: "No assignments to make",
        description: "Select a template for at least one agent.",
      });
      return;
    }

    setIsBatchAssigning(true);
    let successCount = 0;
    let failCount = 0;

    for (const [clawId, policyId] of entriesToAssign) {
      try {
        await assignMutation.mutateAsync({ clawId, policyId });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsBatchAssigning(false);
    await refetchClaws();

    toast({
      title: "Baseline assignment complete",
      description: `${successCount} agent${successCount !== 1 ? "s" : ""} assigned.${failCount > 0 ? ` ${failCount} failed.` : ""}`,
    });

    if (failCount === 0) {
      setStep(3); // Move to verify step
    }
  };

  // Coverage calculation
  const totalClaws = claws.length;
  const coveredClaws = claws.filter((c) => c.policyTemplateId || assignments[c.id]).length;
  const coveragePercent = totalClaws > 0 ? Math.round((coveredClaws / totalClaws) * 100) : 100;
  const isFullyCovered = coveragePercent === 100;

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  const getTemplateName = (id: string | null) => {
    if (!id) return null;
    return systemTemplates.find((t) => t.id === id)?.name ?? id;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            CM.2.061 - Establish Configuration Baselines
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
            {/* STEP 0: What is a Configuration Baseline? */}
            {step === 0 && (
              <div className="space-y-4">
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">What is a Configuration Baseline?</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          A <span className="text-foreground font-medium">configuration baseline</span> is
                          your approved, known-good configuration. Any deviation from it is a potential
                          security issue. In Wtrops, <span className="text-foreground font-medium">OPA policy templates</span> serve
                          as baselines -- they define exactly what each AI agent can and cannot do.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/50">
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      Why It Matters for CMMC
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      CMMC Control CM.2.061 requires that every system component has a documented
                      baseline configuration. Without baselines, you cannot detect unauthorized
                      changes or configuration drift. Unmanaged agents operate without policy
                      governance, creating security vulnerabilities.
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/50">
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      How It Works in Wtrops
                    </h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        Wtrops provides 3 system OPA policy templates as baselines
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        Each template defines network rules, model access, skill permissions, and more
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        Every agent must be assigned a baseline to prove compliance
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        Deviations from baselines are logged and flagged automatically
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* STEP 1: Review Available Templates */}
            {step === 1 && (
              <div className="space-y-4">
                {templatesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : systemTemplates.length === 0 ? (
                  <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-2 text-amber-400">
                        <AlertCircle className="h-4 w-4" />
                        <p className="text-sm font-medium">No policy templates found.</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Run One-Click Compliance auto-configuration first to seed the system templates.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Wtrops provides three system policy templates. Review each one and decide which
                      will serve as your organization's baseline.
                    </p>

                    {systemTemplates.map((template) => {
                      const Icon = TEMPLATE_ICONS[template.name] ?? Shield;
                      const colorClass = TEMPLATE_COLORS[template.name] ?? "text-muted-foreground border-border/50 bg-card/50";
                      const isRecommended = template.name === "Standard";

                      return (
                        <Card key={template.id} className={`border ${colorClass} relative`}>
                          {isRecommended && (
                            <Badge className="absolute top-3 right-3 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                              Recommended for CMMC
                            </Badge>
                          )}
                          <CardContent className="pt-5 pb-4 space-y-2">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <h4 className="text-sm font-semibold">{template.name}</h4>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {template.scope}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{template.description}</p>
                            {isRecommended && (
                              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5 mt-2">
                                <p className="text-xs text-emerald-400">
                                  For CMMC compliance, we recommend <span className="font-semibold">"Standard"</span> as
                                  your baseline. It provides strong security (whitelisted network, B-grade+ skills)
                                  while allowing necessary cloud AI functionality. Use "Restrictive" for agents
                                  handling CUI data.
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* STEP 2: Assign Baseline to Agents */}
            {step === 2 && (
              <div className="space-y-4">
                {clawsLoading ? (
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
                        Deploy agents from the Claw Fleet page, then return here to assign baselines.
                        With zero agents, this control is automatically satisfied.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Assign a baseline policy template to each agent. Agents without a baseline are flagged.
                      </p>
                      {unassignedClaws.length > 0 && (
                        <Badge variant="outline" className="border-red-500/30 text-red-400 text-xs">
                          {unassignedClaws.length} unassigned
                        </Badge>
                      )}
                    </div>

                    {/* Unassigned agents first */}
                    {unassignedClaws.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Agents Without Baseline ({unassignedClaws.length})
                        </h4>
                        {unassignedClaws.map((claw) => (
                          <Card key={claw.id} className="border-red-500/20 bg-red-500/5">
                            <CardContent className="py-3 px-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {claw.displayName || claw.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {claw.modelProvider}/{claw.modelId} -- {claw.status}
                                  </p>
                                </div>
                                <Select
                                  value={assignments[claw.id] ?? ""}
                                  onValueChange={(val) =>
                                    setAssignments((prev) => ({ ...prev, [claw.id]: val }))
                                  }
                                >
                                  <SelectTrigger className="w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Select template" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {systemTemplates.map((t) => (
                                      <SelectItem key={t.id} value={t.id} className="text-xs">
                                        {t.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    {/* Already assigned agents */}
                    {assignedClaws.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Agents With Baseline ({assignedClaws.length})
                        </h4>
                        {assignedClaws.map((claw) => (
                          <Card key={claw.id} className="border-emerald-500/20 bg-emerald-500/5">
                            <CardContent className="py-3 px-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {claw.displayName || claw.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {claw.modelProvider}/{claw.modelId} -- {claw.status}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/30 text-emerald-400 text-xs shrink-0"
                                >
                                  {getTemplateName(claw.policyTemplateId)}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    {/* Batch assign button */}
                    {unassignedClaws.length > 0 && (
                      <Button
                        className="w-full gap-2"
                        disabled={
                          isBatchAssigning ||
                          Object.keys(assignments).filter((k) => assignments[k]).length === 0
                        }
                        onClick={handleBatchAssign}
                      >
                        {isBatchAssigning ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        Assign Baselines ({Object.values(assignments).filter(Boolean).length} selected)
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 3: Verify Coverage */}
            {step === 3 && (
              <div className="space-y-4">
                <Card className={`border ${isFullyCovered ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        {isFullyCovered ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-400" />
                        )}
                        Baseline Coverage
                      </h4>
                      <Badge
                        variant="outline"
                        className={
                          isFullyCovered
                            ? "border-emerald-500/30 text-emerald-400"
                            : "border-amber-500/30 text-amber-400"
                        }
                      >
                        {coveragePercent}%
                      </Badge>
                    </div>

                    <Progress
                      value={coveragePercent}
                      className="h-2"
                    />

                    <p className="text-sm text-muted-foreground">
                      <span className="text-foreground font-medium">{coveredClaws}</span> of{" "}
                      <span className="text-foreground font-medium">{totalClaws}</span> agents
                      have a baseline policy assigned.
                      {totalClaws === 0 && " No agents deployed -- control is satisfied by default."}
                    </p>
                  </CardContent>
                </Card>

                {isFullyCovered ? (
                  <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardContent className="pt-5 pb-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <h4 className="text-sm font-semibold text-emerald-400">
                          CM.2.061 Requirements Met
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        All agents have baseline configurations assigned. This satisfies the CMMC
                        requirement for establishing and maintaining baseline configurations and
                        system inventories. Configuration drift from these baselines will be
                        detected and logged automatically.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-amber-500/20 bg-amber-500/5">
                    <CardContent className="pt-5 pb-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-400" />
                        <h4 className="text-sm font-semibold text-amber-400">
                          Action Required
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {totalClaws - coveredClaws} agent{totalClaws - coveredClaws !== 1 ? "s" : ""} still
                        need a baseline. Go back to Step 3 to assign templates, or coverage must be
                        100% for CMMC compliance.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setStep(2)}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Back to Assignments
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Per-agent summary */}
                {claws.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">Agent Inventory</h4>
                    {claws.map((claw) => {
                      const hasBaseline = !!(claw.policyTemplateId || assignments[claw.id]);
                      return (
                        <div
                          key={claw.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded text-xs"
                        >
                          <span className="truncate flex-1">{claw.displayName || claw.name}</span>
                          {hasBaseline ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                              {getTemplateName(claw.policyTemplateId) || getTemplateName(assignments[claw.id])}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px]">
                              No baseline
                            </Badge>
                          )}
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
                disabled={!isFullyCovered && totalClaws > 0}
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
