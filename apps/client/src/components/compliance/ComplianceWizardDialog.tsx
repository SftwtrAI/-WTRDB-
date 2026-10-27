import { useState, useCallback, type ReactNode } from "react";
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
import { Progress } from "@/components/ui/progress";
import {
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    X,
    Lightbulb,
    AlertTriangle,
    Info,
} from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════════
// ComplianceWizardDialog -- Shared multi-step wizard wrapper
// Provides consistent navigation, progress tracking, and step rendering
// for all CMMC compliance configuration wizards.
//
// Features:
//   - Step indicator (1/5, 2/5, etc.)
//   - Back / Next / Finish buttons
//   - Educational styling (lightbulb icon for learning, warning for actions)
//   - Progress bar at the top
// ════════════════════════════════════════════════════════════════════════════════

export interface WizardStep {
    id: string;
    title: string;
    description: string;
    /** "learn" renders a lightbulb accent, "action" renders a warning accent */
    variant?: "learn" | "action";
    icon?: ReactNode;
    content: ReactNode;
    /** If false, the "Next" button is disabled until the step is completed */
    canProceed?: boolean;
}

interface ComplianceWizardDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    controlId: string;
    steps: WizardStep[];
    /** Called when the wizard is completed (user clicks "Done" on the last step) */
    onComplete?: () => void;
}

export function ComplianceWizardDialog({
    open,
    onOpenChange,
    title,
    description,
    controlId,
    steps,
    onComplete,
}: ComplianceWizardDialogProps) {
    const [currentStep, setCurrentStep] = useState(0);

    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === steps.length - 1;
    const step = steps[currentStep];
    const progress = ((currentStep + 1) / steps.length) * 100;
    const canProceed = step?.canProceed !== false;

    const handleNext = useCallback(() => {
        if (isLastStep) {
            onComplete?.();
            onOpenChange(false);
            setCurrentStep(0);
        } else {
            setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
        }
    }, [isLastStep, onComplete, onOpenChange, steps.length]);

    const handleBack = useCallback(() => {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
    }, []);

    const handleClose = useCallback(
        (nextOpen: boolean) => {
            if (!nextOpen) {
                setCurrentStep(0);
            }
            onOpenChange(nextOpen);
        },
        [onOpenChange],
    );

    if (!step) return null;

    // Determine accent based on step variant
    const variant = step.variant ?? "learn";
    const accentBorder =
        variant === "learn" ? "border-amber-500/30" : "border-orange-500/30";
    const accentBg =
        variant === "learn" ? "bg-amber-500/10" : "bg-orange-500/10";
    const accentText =
        variant === "learn" ? "text-amber-400" : "text-orange-400";
    const VariantIcon = variant === "learn" ? Lightbulb : AlertTriangle;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                {/* Progress bar at very top */}
                <div className="px-6 pt-5 pb-0">
                    <Progress value={progress} className="h-1.5" />
                </div>

                <DialogHeader className="shrink-0 px-6 pt-4 pb-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border ${accentBorder} ${accentBg} shrink-0`}
                            >
                                <VariantIcon className={`h-4 w-4 ${accentText}`} />
                            </div>
                            <div className="min-w-0">
                                <DialogTitle className="text-base font-semibold">
                                    {title}
                                </DialogTitle>
                                <DialogDescription className="text-xs mt-0.5">
                                    {description}
                                </DialogDescription>
                            </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs font-mono">
                            {controlId}
                        </Badge>
                    </div>

                    {/* Step indicator bar */}
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                {step.icon ?? <VariantIcon className={`h-3 w-3 ${accentText}`} />}
                                Step {currentStep + 1} of {steps.length}: {step.title}
                            </span>
                            <span className="font-mono">{Math.round(progress)}%</span>
                        </div>

                        {/* Step pill indicators */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {steps.map((s, i) => (
                                <button
                                    key={s.id}
                                    onClick={() => i <= currentStep && setCurrentStep(i)}
                                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                                        i === currentStep
                                            ? "bg-primary/20 text-primary font-medium"
                                            : i < currentStep
                                                ? "bg-emerald-500/15 text-emerald-400 cursor-pointer hover:bg-emerald-500/25"
                                                : "bg-muted/50 text-muted-foreground"
                                    }`}
                                    disabled={i > currentStep}
                                >
                                    {i < currentStep ? (
                                        <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                        <span className="w-3 h-3 rounded-full border flex items-center justify-center text-[8px]">
                                            {i + 1}
                                        </span>
                                    )}
                                    <span className="hidden sm:inline">{s.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogHeader>

                {/* Step Content — scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                    {step.content}
                </div>

                {/* Footer Navigation */}
                <DialogFooter className="shrink-0 flex items-center justify-between sm:justify-between gap-2 border-t px-6 py-4 bg-muted/30">
                    <div>
                        {!isFirstStep && (
                            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
                                <ChevronLeft className="h-4 w-4" />
                                Back
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClose(false)}
                            className="gap-1"
                        >
                            <X className="h-4 w-4" />
                            Close
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleNext}
                            disabled={!canProceed}
                            className="gap-1"
                        >
                            {isLastStep ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Finish
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ════════════════════════════════════════════════════════════════════════════════
// Shared helper sub-components for wizard step content
// ════════════════════════════════════════════════════════════════════════════════

/** Styled educational info box with lightbulb icon */
export function LearnBox({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2.5">
                <Lightbulb className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground leading-relaxed">
                    {children}
                </div>
            </div>
        </div>
    );
}

/** Styled action/warning box */
export function ActionBox({
    children,
    variant = "warning",
}: {
    children: ReactNode;
    variant?: "warning" | "success" | "info";
}) {
    const styles = {
        warning: {
            border: "border-orange-500/20",
            bg: "bg-orange-500/5",
            iconColor: "text-orange-400",
            Icon: AlertTriangle,
        },
        success: {
            border: "border-emerald-500/20",
            bg: "bg-emerald-500/5",
            iconColor: "text-emerald-400",
            Icon: CheckCircle2,
        },
        info: {
            border: "border-blue-500/20",
            bg: "bg-blue-500/5",
            iconColor: "text-blue-400",
            Icon: Info,
        },
    };
    const s = styles[variant];
    const { Icon } = s;

    return (
        <div className={`rounded-lg border ${s.border} ${s.bg} p-4`}>
            <div className="flex items-start gap-2.5">
                <Icon className={`h-4 w-4 ${s.iconColor} mt-0.5 shrink-0`} />
                <div className="text-sm leading-relaxed">{children}</div>
            </div>
        </div>
    );
}
