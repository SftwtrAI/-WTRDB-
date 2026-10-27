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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Info,
  Siren,
  Phone,
  Mail,
  Users,
  FileText,
  FlaskConical,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Types ---

interface ComplianceSettings {
  id: string;
  organizationId: string;
  irPrimaryContact: any;
  irSecondaryContact: any;
  irEscalationEmail: string | null;
  irSlackWebhook: string | null;
  [key: string]: any;
}

interface IRContact {
  name: string;
  email: string;
  phone: string;
}

// --- Constants ---

const STEPS = [
  "What is Incident Response?",
  "Configure IR Contacts",
  "IR Team Setup",
  "Document IR Plan",
  "Test Your Plan",
];

const IR_PHASES = [
  {
    phase: "1. Preparation",
    description:
      "Build the team, define roles, set up tools and communication channels before an incident occurs.",
    example:
      "Ensure your IR team has access to the compliance dashboard and can quarantine claw agents.",
    color: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  },
  {
    phase: "2. Identification",
    description:
      "Detect that an incident has occurred. Use monitoring, alerts, and user reports to identify threats.",
    example:
      "A claw agent starts making unauthorized API calls to external services not on the whitelist.",
    color: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  },
  {
    phase: "3. Containment",
    description:
      "Limit the damage. Isolate affected systems to prevent the incident from spreading.",
    example:
      "Quarantine the rogue claw agent, revoke its API keys, and switch its policy to Restrictive.",
    color: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  },
  {
    phase: "4. Eradication",
    description:
      "Remove the threat entirely. Patch vulnerabilities, remove malicious code, reset credentials.",
    example:
      "Update the OPA policy to block the exploited endpoint, rotate all affected API keys.",
    color: "text-red-400 border-red-500/30 bg-red-500/10",
  },
  {
    phase: "5. Recovery",
    description:
      "Restore normal operations. Redeploy clean configurations, monitor closely for recurrence.",
    example:
      "Redeploy the claw agent with the patched policy, run validation tests, monitor for 48 hours.",
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    phase: "6. Lessons Learned",
    description:
      "Post-incident review. Document what happened, what worked, what failed, and what to improve.",
    example:
      "Write a post-mortem: the whitelist gap was caused by a missing domain. Add review step to policy change process.",
    color: "text-primary border-primary/30 bg-primary/10",
  },
];

// --- Component ---

export default function IncidentResponseWizard({
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

  // Contact form state
  const [primaryContact, setPrimaryContact] = useState<IRContact>({
    name: "",
    email: "",
    phone: "",
  });
  const [secondaryContact, setSecondaryContact] = useState<IRContact>({
    name: "",
    email: "",
    phone: "",
  });
  const [escalationEmail, setEscalationEmail] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [contactsInitialized, setContactsInitialized] = useState(false);

  // Attestation state
  const [irPlanAttested, setIrPlanAttested] = useState(false);
  const [testAttested, setTestAttested] = useState(false);

  // --- Fetch current settings ---

  const { data: settings, isLoading } = useQuery<ComplianceSettings>({
    queryKey: ["compliance-settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/compliance/settings");
      return res.json();
    },
    // Initialize form once data arrives
  });

  // Seed form from server data once
  if (settings && !contactsInitialized) {
    if (settings.irPrimaryContact) {
      setPrimaryContact(settings.irPrimaryContact);
    }
    if (settings.irSecondaryContact) {
      setSecondaryContact(settings.irSecondaryContact);
    }
    if (settings.irEscalationEmail) {
      setEscalationEmail(settings.irEscalationEmail);
    }
    if (settings.irSlackWebhook) {
      setSlackWebhook(settings.irSlackWebhook);
    }
    setContactsInitialized(true);
  }

  // --- Save contacts mutation ---

  const saveContactsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/compliance/settings", {
        irPrimaryContact: primaryContact,
        irSecondaryContact: secondaryContact,
        irEscalationEmail: escalationEmail || null,
        irSlackWebhook: slackWebhook || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-settings"] });
      toast({
        title: "IR contacts saved",
        description: "Incident response contacts have been updated.",
      });
      setStep(2);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save IR contacts",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // --- Attestation mutations ---

  const irPlanAttestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/compliance/evidence/cmmc/IR.2.092",
        {
          evidenceType: "attestation",
          title: "Incident Response Plan Attestation",
          description:
            "I confirm our organization has a documented incident response plan covering all 6 phases: Preparation, Identification, Containment, Eradication, Recovery, and Lessons Learned.",
          evidenceData: {
            attestationType: "ir_plan_documented",
            attestedAt: new Date().toISOString(),
          },
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-evidence", "cmmc", "IR.2.092"],
      });
      setIrPlanAttested(true);
      toast({
        title: "Attestation recorded",
        description: "IR plan attestation has been saved as compliance evidence.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save attestation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testAttestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/compliance/evidence/cmmc/IR.2.092",
        {
          evidenceType: "attestation",
          title: "IR Plan Test Attestation",
          description:
            "I confirm our organization has conducted an incident response test (tabletop exercise, simulation, or drill).",
          evidenceData: {
            attestationType: "ir_plan_tested",
            lastTestDate: new Date().toISOString(),
          },
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-evidence", "cmmc", "IR.2.092"],
      });
      setTestAttested(true);
      toast({
        title: "Test attestation recorded",
        description:
          "IR plan testing attestation has been saved as compliance evidence.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save attestation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // --- Navigation ---

  const canGoNext = step < STEPS.length - 1;
  const canGoBack = step > 0;

  const goNext = () => {
    if (step === 1) {
      // Validate and save contacts
      if (!primaryContact.name || !primaryContact.email) {
        toast({
          title: "Primary contact required",
          description:
            "Please provide at least a name and email for the primary IR contact.",
          variant: "destructive",
        });
        return;
      }
      saveContactsMutation.mutate();
      return;
    }
    if (canGoNext) setStep(step + 1);
  };

  const goBack = () => {
    if (canGoBack) setStep(step - 1);
  };

  // --- Loading state ---

  const handleClose = () => onOpenChange?.(false);

  const wrapInDialog = (node: React.ReactNode) =>
    open !== undefined ? (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {node}
        </DialogContent>
      </Dialog>
    ) : (
      node
    );

  if (isLoading) {
    return wrapInDialog(
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return wrapInDialog(
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Siren className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            IR.2.092 — Incident Response Capability
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Establish an operational incident-handling capability for your
          organization.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
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
              <span className="hidden sm:inline">{s}</span>
              <span className="sm:hidden">Step {i + 1}</span>
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
          <StepContacts
            primaryContact={primaryContact}
            setPrimaryContact={setPrimaryContact}
            secondaryContact={secondaryContact}
            setSecondaryContact={setSecondaryContact}
            escalationEmail={escalationEmail}
            setEscalationEmail={setEscalationEmail}
            slackWebhook={slackWebhook}
            setSlackWebhook={setSlackWebhook}
            isPending={saveContactsMutation.isPending}
          />
        )}
        {step === 2 && <StepTeam />}
        {step === 3 && (
          <StepDocument
            attested={irPlanAttested}
            onAttest={() => irPlanAttestMutation.mutate()}
            isPending={irPlanAttestMutation.isPending}
          />
        )}
        {step === 4 && (
          <StepTest
            attested={testAttested}
            onAttest={() => testAttestMutation.mutate()}
            isPending={testAttestMutation.isPending}
            onComplete={onComplete}
          />
        )}
      </div>

      {/* Navigation buttons */}
      <Separator />
      <div className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={goBack}
          disabled={!canGoBack || saveContactsMutation.isPending}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            size="sm"
            onClick={goNext}
            disabled={saveContactsMutation.isPending}
          >
            {step === 1 ? (
              saveContactsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save Contacts
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
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1: What is Incident Response?
// ────────────────────────────────────────────────────────────────────────────

function StepLearn() {
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            The 6 Phases of Incident Response
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <p>
            CMMC requires a documented, tested incident response capability.
            Every IR plan follows six phases. Here is how each phase applies to
            an AI operations platform.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {IR_PHASES.map(({ phase, description, example, color }) => (
          <Card key={phase} className={`border ${color}`}>
            <CardContent className="py-3 px-4">
              <h4 className="text-sm font-semibold mb-1">{phase}</h4>
              <p className="text-xs text-muted-foreground">{description}</p>
              <div className="flex items-start gap-1.5 mt-2">
                <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground italic">
                  Example: {example}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: Configure IR Contacts
// ────────────────────────────────────────────────────────────────────────────

function StepContacts({
  primaryContact,
  setPrimaryContact,
  secondaryContact,
  setSecondaryContact,
  escalationEmail,
  setEscalationEmail,
  slackWebhook,
  setSlackWebhook,
  isPending,
}: {
  primaryContact: IRContact;
  setPrimaryContact: (c: IRContact) => void;
  secondaryContact: IRContact;
  setSecondaryContact: (c: IRContact) => void;
  escalationEmail: string;
  setEscalationEmail: (v: string) => void;
  slackWebhook: string;
  setSlackWebhook: (v: string) => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Primary Contact */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Primary IR Contact
            <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-400">
              Required
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            The first person contacted when a security incident is detected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="Jane Doe"
                value={primaryContact.name}
                onChange={(e) =>
                  setPrimaryContact({ ...primaryContact, name: e.target.value })
                }
                disabled={isPending}
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="jane@company.com"
                value={primaryContact.email}
                onChange={(e) =>
                  setPrimaryContact({
                    ...primaryContact,
                    email: e.target.value,
                  })
                }
                disabled={isPending}
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input
                type="tel"
                placeholder="+1 555-123-4567"
                value={primaryContact.phone}
                onChange={(e) =>
                  setPrimaryContact({
                    ...primaryContact,
                    phone: e.target.value,
                  })
                }
                disabled={isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Contact */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Secondary IR Contact
            <Badge
              variant="outline"
              className="text-[10px] border-muted-foreground/40 text-muted-foreground"
            >
              Optional
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Backup contact if the primary is unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="John Smith"
                value={secondaryContact.name}
                onChange={(e) =>
                  setSecondaryContact({
                    ...secondaryContact,
                    name: e.target.value,
                  })
                }
                disabled={isPending}
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="john@company.com"
                value={secondaryContact.email}
                onChange={(e) =>
                  setSecondaryContact({
                    ...secondaryContact,
                    email: e.target.value,
                  })
                }
                disabled={isPending}
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input
                type="tel"
                placeholder="+1 555-987-6543"
                value={secondaryContact.phone}
                onChange={(e) =>
                  setSecondaryContact({
                    ...secondaryContact,
                    phone: e.target.value,
                  })
                }
                disabled={isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Escalation channels */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Escalation Channels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">
              Escalation Email (group distribution list)
            </Label>
            <Input
              type="email"
              placeholder="security@company.com"
              value={escalationEmail}
              onChange={(e) => setEscalationEmail(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div>
            <Label className="text-xs">Slack Webhook URL (optional)</Label>
            <Input
              placeholder="https://hooks.slack.com/services/..."
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              disabled={isPending}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Receives instant alerts when incidents are detected.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: IR Team Setup
// ────────────────────────────────────────────────────────────────────────────

function StepTeam() {
  const roles = [
    {
      title: "IR Lead",
      description:
        "Coordinates the response, makes containment decisions, communicates with leadership. Typically the CISO or security manager.",
      icon: Siren,
    },
    {
      title: "Technical Lead",
      description:
        "Performs technical investigation, implements containment and eradication steps. Typically a senior engineer or DevOps lead.",
      icon: Shield,
    },
    {
      title: "Communications",
      description:
        "Handles internal and external communications. Notifies affected parties, coordinates with legal. Typically a manager or PR representative.",
      icon: Mail,
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            IR Team Roles
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <p>
            An effective IR team needs defined roles. Each person should know
            their responsibilities before an incident occurs. Create a dedicated
            IR team in the platform to formalize this.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {roles.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="border-border/50 bg-card/50">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold">{title}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <ExternalLink className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-400">
              Create IR Team in Platform
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Navigate to{" "}
              <a
                href="/app/teams?highlight=create-ir-team"
                className="underline text-primary hover:text-primary/80"
              >
                Teams &rarr; Create Team
              </a>{" "}
              and create a team named "Incident Response" with the members
              identified above. This formalizes your IR team and can be
              referenced during incidents.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: Document IR Plan
// ────────────────────────────────────────────────────────────────────────────

function StepDocument({
  attested,
  onAttest,
  isPending,
}: {
  attested: boolean;
  onAttest: () => void;
  isPending: boolean;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Written IR Plan Requirement
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            CMMC requires a <span className="font-medium text-foreground">documented</span>{" "}
            incident response plan. This is not just a best practice but a
            mandatory control. Your plan must cover:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Roles and responsibilities of the IR team</li>
            <li>Detection and reporting procedures</li>
            <li>Containment strategies for different incident types</li>
            <li>Eradication and recovery procedures</li>
            <li>Communication plan (internal and external)</li>
            <li>Post-incident review process</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="py-4 px-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="ir-plan-attest"
              checked={checked || attested}
              onCheckedChange={(v) => setChecked(!!v)}
              disabled={attested || isPending}
            />
            <div className="space-y-1">
              <label
                htmlFor="ir-plan-attest"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                I confirm our organization has a documented incident response
                plan.
              </label>
              <p className="text-xs text-muted-foreground">
                This attestation is recorded as compliance evidence for control
                IR.2.092. It affirms that your organization maintains a written
                IR plan covering all required phases.
              </p>
            </div>
          </div>

          {attested ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-400">
                Attestation recorded successfully.
              </span>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onAttest}
              disabled={!checked || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  Record Attestation
                  <CheckCircle2 className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step 5: Test Your Plan
// ────────────────────────────────────────────────────────────────────────────

function StepTest({
  attested,
  onAttest,
  isPending,
  onComplete,
}: {
  attested: boolean;
  onAttest: () => void;
  isPending: boolean;
  onComplete?: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Annual Testing Requirement
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            CMMC requires that your incident response plan be{" "}
            <span className="font-medium text-foreground">tested annually</span>.
            A tabletop exercise is the most common and practical approach.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tabletop Exercise Guide</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>A tabletop exercise is a discussion-based session where:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>
              Present a realistic scenario (e.g., "A claw agent is exfiltrating
              data to an unknown endpoint")
            </li>
            <li>
              Walk through each IR phase: who does what, in what order, using
              which tools
            </li>
            <li>Identify gaps: unclear roles, missing runbooks, slow communication</li>
            <li>
              Document findings and update the IR plan accordingly
            </li>
          </ol>
          <p className="mt-2">
            Duration: 1-2 hours. Participants: all IR team members. Frequency:
            at least annually, ideally quarterly.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="py-4 px-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="ir-test-attest"
              checked={checked || attested}
              onCheckedChange={(v) => setChecked(!!v)}
              disabled={attested || isPending}
            />
            <div className="space-y-1">
              <label
                htmlFor="ir-test-attest"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                I confirm our organization has conducted an incident response
                test.
              </label>
              <p className="text-xs text-muted-foreground">
                Records the date of your most recent IR plan test as compliance
                evidence.
              </p>
            </div>
          </div>

          {attested ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-400">
                Test attestation recorded. Last test date:{" "}
                {new Date().toLocaleDateString()}.
              </span>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onAttest}
              disabled={!checked || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  Record Test Attestation
                  <CheckCircle2 className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {!attested && (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-3 px-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              If you have not yet tested your IR plan, schedule a tabletop
              exercise soon. You can return to this wizard to record the
              attestation after the test is complete.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
