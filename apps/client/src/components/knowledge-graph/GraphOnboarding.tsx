import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, SkipForward, Network, Palette, MousePointerClick, MessageSquare, LayoutGrid } from "lucide-react";

const STORAGE_KEY = "wtrdb-kg-tour-v2";

interface TourStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Positioning hint for the spotlight card */
  position: "top-center" | "bottom-left" | "center" | "bottom-center" | "top-left";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "canvas",
    icon: <Network className="h-5 w-5 text-[#07A288]" />,
    title: "Your Knowledge Graph",
    description:
      "Each card is an entity extracted from your document. Lines show relationships between them.",
    position: "top-center",
  },
  {
    id: "legend",
    icon: <Palette className="h-5 w-5 text-[#5BBE4E]" />,
    title: "Color-Coded Types",
    description:
      "Entities are color-coded by type \u2014 Person, Organization, Concept, and more. Click any type in the legend to filter.",
    position: "bottom-left",
  },
  {
    id: "node-interaction",
    icon: <MousePointerClick className="h-5 w-5 text-[#B8E52B]" />,
    title: "Click to Explore",
    description:
      "Click any entity to see its details in the sidebar. Double-click for the full view.",
    position: "center",
  },
  {
    id: "query",
    icon: <MessageSquare className="h-5 w-5 text-[#07A288]" />,
    title: "Ask Questions",
    description:
      "Ask questions about your data in plain English. Try: \u201CWhat organizations are mentioned?\u201D",
    position: "bottom-center",
  },
  {
    id: "layouts",
    icon: <LayoutGrid className="h-5 w-5 text-[#5BBE4E]" />,
    title: "Change the View",
    description:
      "Switch between Force, Radial, and Hierarchical layouts to discover different patterns.",
    position: "top-left",
  },
];

export interface GraphOnboardingProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

export interface GraphOnboardingHandle {
  replayTour: () => void;
}

/**
 * Multi-step interactive tour for the Knowledge Graph page.
 *
 * Usage:
 * ```tsx
 * const tourRef = useRef<GraphOnboardingHandle>(null);
 * <GraphOnboarding ref={tourRef} onComplete={() => {}} />
 * // later: tourRef.current?.replayTour()
 * ```
 */
const GraphOnboarding = forwardRef<GraphOnboardingHandle, GraphOnboardingProps>(
  function GraphOnboarding({ onComplete, forceShow }, ref) {
    const [visible, setVisible] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    // Determine initial visibility
    useEffect(() => {
      if (forceShow) {
        setVisible(true);
        setCurrentStep(0);
        return;
      }
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    }, [forceShow]);

    const dismiss = useCallback(() => {
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, "completed");
      onComplete?.();
    }, [onComplete]);

    const handleNext = useCallback(() => {
      if (currentStep < TOUR_STEPS.length - 1) {
        setCurrentStep((s) => s + 1);
      } else {
        dismiss();
      }
    }, [currentStep, dismiss]);

    const handleBack = useCallback(() => {
      setCurrentStep((s) => Math.max(0, s - 1));
    }, []);

    const handleSkip = useCallback(() => {
      dismiss();
    }, [dismiss]);

    // Expose replayTour to parent
    useImperativeHandle(
      ref,
      () => ({
        replayTour: () => {
          setCurrentStep(0);
          setVisible(true);
        },
      }),
      []
    );

    if (!visible) return null;

    const step = TOUR_STEPS[currentStep];
    const isFirst = currentStep === 0;
    const isLast = currentStep === TOUR_STEPS.length - 1;

    // Map position to Tailwind classes
    const positionClasses: Record<TourStep["position"], string> = {
      "top-center": "top-24 left-1/2 -translate-x-1/2",
      "bottom-left": "bottom-24 left-8",
      center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
      "bottom-center": "bottom-24 left-1/2 -translate-x-1/2",
      "top-left": "top-24 left-8",
    };

    return (
      <div
        data-testid="graph-onboarding-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        {/* Semi-transparent overlay */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={handleSkip}
        />

        {/* Pulsing spotlight ring positioned at the step's target area */}
        <div
          data-testid={`tour-spotlight-${step.id}`}
          className={`absolute ${positionClasses[step.position]} pointer-events-none`}
        >
          <div className="h-32 w-32 rounded-full border-2 border-[#07A288]/40 animate-pulse" />
        </div>

        {/* Tour card */}
        <Card
          data-testid="graph-onboarding-card"
          className={`absolute ${positionClasses[step.position]} z-10 w-[380px] max-w-[90vw] border-[#243645] bg-[#111A21] shadow-2xl transition-all duration-300`}
          style={{ transform: step.position === "center" ? "translate(-50%, -50%)" : undefined }}
        >
          <CardContent className="p-5">
            {/* Header row */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#07A288]/10">
                  {step.icon}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Step {currentStep + 1} of {TOUR_STEPS.length}
                  </p>
                  <h3 className="text-base font-semibold text-foreground">
                    {step.title}
                  </h3>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleSkip}
                data-testid="tour-close-btn"
                aria-label="Close tour"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Description */}
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>

            {/* Step indicator dots */}
            <div className="mb-4 flex items-center justify-center gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === currentStep
                      ? "w-6 bg-[#07A288]"
                      : i < currentStep
                        ? "w-1.5 bg-[#07A288]/50"
                        : "w-1.5 bg-[#243645]"
                  }`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleSkip}
                data-testid="tour-skip-btn"
              >
                <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                Skip tour
              </Button>

              <div className="flex gap-2">
                {!isFirst && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBack}
                    data-testid="tour-back-btn"
                  >
                    <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleNext}
                  data-testid="tour-next-btn"
                  className="bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
                >
                  {isLast ? "Get Started" : "Next"}
                  {!isLast && <ChevronRight className="ml-1 h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
);

export default GraphOnboarding;

/** Standalone function to reset the tour so it shows again on next page visit. */
export function resetTour() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Programmatic replay helper (non-ref usage). */
export function replayTour() {
  localStorage.removeItem(STORAGE_KEY);
  // Caller should re-render or re-mount the component after calling this.
}
