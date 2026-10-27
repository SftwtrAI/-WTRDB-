import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Compass,
  Landmark,
  Library,
  Map,
  Telescope as TelescopeIcon,
  Waves,
  Lock,
  Check,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  Sparkles,
  ArrowLeft,
  Star,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegionStep {
  id: string;
  title: string;
  description: string;
  link?: string;
}

interface Region {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  position: { cx: number; cy: number };
  steps: RegionStep[];
  completionMessage: string;
}

interface CartographerProgress {
  completedRegions: string[];
  completedSteps: Record<string, string[]>;
  skippedRegions: string[];
  currentRegion: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "wtrdb_cartographer_progress";

const REGIONS: Region[] = [
  {
    id: "first-landing",
    name: "First Landing",
    subtitle: "Build Your First Graph",
    description:
      "Every journey begins with a single step. Upload a document, trigger knowledge extraction, and explore the graph that emerges from your data.",
    icon: Landmark,
    position: { cx: 400, cy: 520 },
    steps: [
      {
        id: "upload",
        title: "Upload a Document",
        description: "Navigate to the Knowledge Base and upload a document to seed your first knowledge graph.",
        link: "/app/knowledge-base",
      },
      {
        id: "extract",
        title: "Trigger Extraction",
        description: "Click 'Generate Knowledge Graph' to extract entities and relationships from your document.",
      },
      {
        id: "explore",
        title: "Explore the Result",
        description: "Open the 2D graph visualizer to explore the entities and relationships that were discovered.",
      },
    ],
    completionMessage: "The lighthouse is lit! You have built your first knowledge graph. The island is alive with data.",
  },
  {
    id: "living-archive",
    name: "The Living Archive",
    subtitle: "Temporal Knowledge",
    description:
      "Knowledge ages. The Living Archive teaches you to manage temporal aspects of your graphs --- understanding freshness, rewinding through time, and handling deprecation.",
    icon: Library,
    position: { cx: 150, cy: 320 },
    steps: [
      {
        id: "freshness",
        title: "View Freshness Scores",
        description: "Check the freshness indicators on your knowledge base cards to understand how current your data is.",
        link: "/app/knowledge-base",
      },
      {
        id: "rewind",
        title: "Use Temporal Rewind",
        description: "Open a graph and use the Temporal Rewind scrubber to see how the graph has evolved over time.",
      },
      {
        id: "deprecation",
        title: "Understand Deprecation",
        description: "Learn how stale entities are visually faded and how deprecated edges are marked in the visualizer.",
      },
    ],
    completionMessage: "The clock tower chimes! You have mastered temporal knowledge. The archive's clocks are now in motion.",
  },
  {
    id: "uncharted-territory",
    name: "Uncharted Territory",
    subtitle: "Schema Discovery",
    description:
      "As new documents are processed, the system proposes new entity types and relationship patterns. Learn to review proposals, merge types, and maintain a clean schema.",
    icon: Map,
    position: { cx: 400, cy: 120 },
    steps: [
      {
        id: "proposals",
        title: "Review Schema Proposals",
        description: "Open the Schema Observatory to see pending type proposals generated during extraction.",
      },
      {
        id: "merge-types",
        title: "Accept or Merge Types",
        description: "Accept, reject, or merge proposed entity types to keep your schema clean and consistent.",
      },
      {
        id: "canonicalization",
        title: "View Canonicalization",
        description: "Understand how the system maps variant names to canonical entity identifiers.",
      },
    ],
    completionMessage: "The road signs are readable! You have charted the uncharted. Schema discovery is now under your command.",
  },
  {
    id: "confluence",
    name: "The Confluence",
    subtitle: "Federation",
    description:
      "When two rivers of knowledge merge, new patterns emerge. Learn to create federations that unify multiple knowledge bases into a single queryable graph.",
    icon: Waves,
    position: { cx: 650, cy: 320 },
    steps: [
      {
        id: "create-federation",
        title: "Create a Federation",
        description: "Navigate to Federations and create your first federation by selecting two or more knowledge bases.",
        link: "/app/federations",
      },
      {
        id: "review-alignments",
        title: "Review Alignments",
        description: "Examine how entities from different sources are aligned and matched in the federation.",
      },
      {
        id: "resolve-conflicts",
        title: "Resolve Conflicts",
        description: "When contradictions are found between sources, adjudicate them in the Conflict Dashboard.",
      },
    ],
    completionMessage: "The waters flow together! You have mastered federation. Cross-graph insights are now within reach.",
  },
  {
    id: "observatory",
    name: "The Observatory",
    subtitle: "Advanced Mastery",
    description:
      "From the hilltop observatory, you can see the entire landscape. Run evaluations, explore the constellation, and configure Brain API endpoints.",
    icon: TelescopeIcon,
    position: { cx: 400, cy: 120 },
    steps: [
      {
        id: "eval-suite",
        title: "Run an Eval Suite",
        description: "Create and run an evaluation suite to benchmark your knowledge graph quality.",
        link: "/app/eval-harness",
      },
      {
        id: "constellation",
        title: "Explore the Constellation",
        description: "Open the Constellation view to see all your knowledge graphs as a star map.",
        link: "/app/constellation",
      },
      {
        id: "brain-endpoint",
        title: "Configure a Brain Endpoint",
        description: "Publish a Brain API endpoint so external applications can query your knowledge graph.",
        link: "/app/brain-endpoints",
      },
    ],
    completionMessage: "The dome opens and light pours out! You have reached the summit. You are now a Knowledge Cartographer.",
  },
];

// Region rendering order on map (bottom to top)
const REGION_ORDER = ["first-landing", "living-archive", "uncharted-territory", "confluence", "observatory"];

// Map positions for the SVG map layout
const MAP_POSITIONS: Record<string, { cx: number; cy: number }> = {
  "first-landing": { cx: 400, cy: 480 },
  "living-archive": { cx: 160, cy: 300 },
  "uncharted-territory": { cx: 400, cy: 130 },
  "confluence": { cx: 640, cy: 300 },
  "observatory": { cx: 400, cy: 50 },
};

// Path connections between regions (dotted lines on the map)
const MAP_PATHS: Array<[string, string]> = [
  ["first-landing", "living-archive"],
  ["first-landing", "confluence"],
  ["living-archive", "uncharted-territory"],
  ["confluence", "uncharted-territory"],
  ["uncharted-territory", "observatory"],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadProgress(): CartographerProgress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Corrupted localStorage
  }
  return {
    completedRegions: [],
    completedSteps: {},
    skippedRegions: [],
    currentRegion: null,
  };
}

function saveProgress(progress: CartographerProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage full or unavailable
  }
}

function isRegionAccessible(regionId: string, completedRegions: string[]): boolean {
  // First landing is always accessible
  if (regionId === "first-landing") return true;
  // A region is accessible if the previous region in order is completed
  const idx = REGION_ORDER.indexOf(regionId);
  if (idx <= 0) return true;
  const previousRegion = REGION_ORDER[idx - 1];
  return completedRegions.includes(previousRegion);
}

function isRegionComplete(regionId: string, progress: CartographerProgress): boolean {
  return progress.completedRegions.includes(regionId) || progress.skippedRegions.includes(regionId);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** SVG arc progress indicator beneath a region icon */
function ProgressArc({ progress, cx, cy, radius = 32 }: { progress: number; cx: number; cy: number; radius?: number }) {
  const circumference = Math.PI * radius; // half circle
  const offset = circumference * (1 - progress);

  return (
    <path
      d={`M ${cx - radius} ${cy + 8} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy + 8}`}
      fill="none"
      stroke={progress >= 1 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
      strokeWidth={3}
      strokeDasharray={`${circumference}`}
      strokeDashoffset={offset}
      strokeLinecap="round"
      opacity={progress > 0 ? 0.8 : 0.2}
      className="transition-all duration-500"
    />
  );
}

/** Celebration particle burst (CSS-only, renders for ~1.5s) */
function CelebrationBurst({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full animate-ping"
          style={{
            background: i % 3 === 0 ? "#07A288" : i % 3 === 1 ? "#5BBE4E" : "#B8E52B",
            transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-${40 + (i % 3) * 20}px)`,
            animationDelay: `${i * 80}ms`,
            animationDuration: "1s",
            animationIterationCount: "1",
          }}
        />
      ))}
    </div>
  );
}

/** Region detail view (zoomed in) */
function RegionDetail({
  region,
  progress,
  onCompleteStep,
  onSkipRegion,
  onBack,
}: {
  region: Region;
  progress: CartographerProgress;
  onCompleteStep: (regionId: string, stepId: string) => void;
  onSkipRegion: (regionId: string) => void;
  onBack: () => void;
}) {
  const [, setLocation] = useLocation();
  const completedSteps = progress.completedSteps[region.id] || [];
  const regionDone = isRegionComplete(region.id, progress);
  const [celebrating, setCelebrating] = useState(false);

  const handleCompleteStep = useCallback(
    (stepId: string) => {
      onCompleteStep(region.id, stepId);
      // Check if completing this step finishes the region
      const newCompleted = [...completedSteps, stepId];
      if (newCompleted.length === region.steps.length) {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 1500);
      }
    },
    [region, completedSteps, onCompleteStep],
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={onBack} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Cartographer
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{region.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: Step tracker */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <region.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{region.name}</h2>
              <p className="text-xs text-muted-foreground">{region.subtitle}</p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-1">
            {region.steps.map((step, i) => {
              const isComplete = completedSteps.includes(step.id);
              const isActive = !isComplete && (i === 0 || completedSteps.includes(region.steps[i - 1].id));

              return (
                <div key={step.id} className="flex items-start gap-3">
                  {/* Dot + connecting line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                        isComplete
                          ? "bg-primary border-primary text-primary-foreground"
                          : isActive
                            ? "border-primary text-primary bg-primary/10"
                            : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {isComplete ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    {i < region.steps.length - 1 && (
                      <div
                        className={`w-0.5 h-8 ${isComplete ? "bg-primary" : "bg-muted-foreground/20"} transition-colors`}
                      />
                    )}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 pb-4">
                    <p
                      className={`text-sm font-medium ${
                        isComplete ? "text-primary" : isActive ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Skip option */}
          {!regionDone && (
            <button
              onClick={() => onSkipRegion(region.id)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-4"
            >
              Skip this region
            </button>
          )}
        </div>

        {/* Right: Content area */}
        <div className="relative">
          <CelebrationBurst active={celebrating} />

          {/* Introduction */}
          <Card className="p-5 mb-6 border-l-2 border-l-primary bg-card">
            <p className="text-sm text-muted-foreground leading-relaxed">{region.description}</p>
          </Card>

          {/* Step cards */}
          <div className="space-y-4">
            {region.steps.map((step, i) => {
              const isComplete = completedSteps.includes(step.id);
              const isActive = !isComplete && (i === 0 || completedSteps.includes(region.steps[i - 1].id));

              return (
                <Card
                  key={step.id}
                  className={`p-5 transition-all duration-200 ${
                    isComplete
                      ? "border-primary/30 bg-primary/5 opacity-75"
                      : isActive
                        ? "border-primary/40 shadow-sm"
                        : "opacity-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                        {isComplete && (
                          <Badge variant="outline" className="text-xs text-primary border-primary/30">
                            Complete
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {step.link && isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(step.link!)}
                        >
                          Open
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                      {isActive && !isComplete && (
                        <Button size="sm" onClick={() => handleCompleteStep(step.id)}>
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Done
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Region complete card */}
          {regionDone && (
            <Card className="mt-6 p-5 border-primary/40 bg-primary/5">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">Region Complete</h3>
                  <p className="text-sm text-muted-foreground">{region.completionMessage}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={onBack}>
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Back to Map
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map SVG
// ---------------------------------------------------------------------------

function CartographerMap({
  progress,
  onSelectRegion,
}: {
  progress: CartographerProgress;
  onSelectRegion: (regionId: string) => void;
}) {
  const overallProgress = useMemo(() => {
    const totalRegions = REGIONS.length;
    const completed = progress.completedRegions.length + progress.skippedRegions.length;
    return Math.round((completed / totalRegions) * 100);
  }, [progress]);

  return (
    <div className="relative w-full">
      {/* Overall progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Knowledge Cartographer</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Journey Progress</span>
          <div className="w-32">
            <Progress value={overallProgress} className="h-2" />
          </div>
          <span className="text-sm font-semibold text-foreground">{overallProgress}%</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Navigate through five regions of graph mastery. Click a region to begin exploring.
      </p>

      {/* SVG Map */}
      <div className="relative w-full aspect-[800/580] max-w-4xl mx-auto">
        <svg
          viewBox="0 0 800 580"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background with topographic contour lines */}
          <defs>
            <pattern id="topo-pattern" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
              <circle cx="40" cy="40" r="30" fill="none" stroke="#1A2530" strokeWidth="0.5" opacity="0.6" />
              <circle cx="40" cy="40" r="20" fill="none" stroke="#1A2530" strokeWidth="0.5" opacity="0.4" />
              <circle cx="40" cy="40" r="10" fill="none" stroke="#1A2530" strokeWidth="0.5" opacity="0.2" />
            </pattern>

            {/* Brand gradient for discovered regions */}
            <linearGradient id="brand-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#07A288" stopOpacity="0.15" />
              <stop offset="45%" stopColor="#5BBE4E" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#B8E52B" stopOpacity="0.08" />
            </linearGradient>

            {/* Fog filter for undiscovered regions */}
            <filter id="fog-filter">
              <feGaussianBlur stdDeviation="2" />
            </filter>

            {/* Glow for complete region icons */}
            <filter id="icon-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Topo background */}
          <rect width="800" height="580" fill="#0D1318" rx="12" />
          <rect width="800" height="580" fill="url(#topo-pattern)" rx="12" />

          {/* Dotted path connections */}
          {MAP_PATHS.map(([from, to]) => {
            const fromPos = MAP_POSITIONS[from];
            const toPos = MAP_POSITIONS[to];
            const fromDone = isRegionComplete(from, progress);
            const toDone = isRegionComplete(to, progress);
            const bothDone = fromDone && toDone;

            return (
              <line
                key={`${from}-${to}`}
                x1={fromPos.cx}
                y1={fromPos.cy}
                x2={toPos.cx}
                y2={toPos.cy}
                stroke={bothDone ? "#07A288" : "#243645"}
                strokeWidth={bothDone ? 2 : 1.5}
                strokeDasharray={bothDone ? "none" : "6 4"}
                opacity={bothDone ? 0.6 : 0.4}
                className="transition-all duration-700"
              />
            );
          })}

          {/* Region nodes */}
          {REGIONS.map((region) => {
            const pos = MAP_POSITIONS[region.id];
            const accessible = isRegionAccessible(region.id, [
              ...progress.completedRegions,
              ...progress.skippedRegions,
            ]);
            const done = isRegionComplete(region.id, progress);
            const stepsCompleted = (progress.completedSteps[region.id] || []).length;
            const stepProgress = stepsCompleted / region.steps.length;

            return (
              <g
                key={region.id}
                className={`${accessible ? "cursor-pointer" : "cursor-not-allowed"} transition-all duration-300`}
                onClick={() => accessible && onSelectRegion(region.id)}
                role="button"
                tabIndex={accessible ? 0 : -1}
                onKeyDown={(e) => {
                  if (accessible && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectRegion(region.id);
                  }
                }}
                aria-label={`${region.name}: ${done ? "Complete" : accessible ? "Available" : "Locked"}`}
              >
                {/* Region background circle */}
                <circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={42}
                  fill={done ? "url(#brand-gradient)" : accessible ? "#111A21" : "#0B1014"}
                  stroke={done ? "#07A288" : accessible ? "#243645" : "#1A2530"}
                  strokeWidth={done ? 2 : 1}
                  opacity={accessible ? 1 : 0.5}
                  filter={!accessible ? "url(#fog-filter)" : undefined}
                  className={`transition-all duration-500 ${accessible && !done ? "hover:stroke-[#07A288]/60" : ""}`}
                />

                {/* Complete glow */}
                {done && (
                  <circle
                    cx={pos.cx}
                    cy={pos.cy}
                    r={46}
                    fill="none"
                    stroke="#07A288"
                    strokeWidth={1}
                    opacity={0.3}
                    className="animate-pulse"
                  />
                )}

                {/* Progress arc */}
                {!done && accessible && stepProgress > 0 && (
                  <ProgressArc progress={stepProgress} cx={pos.cx} cy={pos.cy} radius={42} />
                )}

                {/* Icon placeholder (Lucide icons can't render inside SVG directly, so we use simple shapes) */}
                {done ? (
                  <g filter="url(#icon-glow)">
                    <circle cx={pos.cx} cy={pos.cy - 4} r={12} fill="#07A288" opacity={0.2} />
                    <text
                      x={pos.cx}
                      y={pos.cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#07A288"
                      fontSize="16"
                      fontWeight="bold"
                    >
                      &#x2713;
                    </text>
                  </g>
                ) : !accessible ? (
                  <text
                    x={pos.cx}
                    y={pos.cy - 4}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#3A4A56"
                    fontSize="14"
                  >
                    &#x1F512;
                  </text>
                ) : (
                  <circle
                    cx={pos.cx}
                    cy={pos.cy - 4}
                    r={8}
                    fill="none"
                    stroke={stepProgress > 0 ? "#07A288" : "#8FA2B5"}
                    strokeWidth={1.5}
                    opacity={0.8}
                  />
                )}

                {/* Region name label */}
                <text
                  x={pos.cx}
                  y={pos.cy + 56}
                  textAnchor="middle"
                  fill={done ? "#E7EEF6" : accessible ? "#8FA2B5" : "#3A4A56"}
                  fontSize="12"
                  fontWeight="600"
                  className="transition-all duration-300"
                >
                  {region.name}
                </text>
                <text
                  x={pos.cx}
                  y={pos.cy + 70}
                  textAnchor="middle"
                  fill={done ? "#8FA2B5" : "#3A4A56"}
                  fontSize="10"
                >
                  {region.subtitle}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-primary bg-primary/20" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/40" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/20 opacity-50" />
          <span>Locked</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function KnowledgeCartographerPage() {
  const [progress, setProgress] = useState<CartographerProgress>(loadProgress);
  const [activeRegion, setActiveRegion] = useState<string | null>(null);

  // Persist progress to localStorage
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const handleSelectRegion = useCallback((regionId: string) => {
    setActiveRegion(regionId);
  }, []);

  const handleCompleteStep = useCallback((regionId: string, stepId: string) => {
    setProgress((prev) => {
      const prevSteps = prev.completedSteps[regionId] || [];
      if (prevSteps.includes(stepId)) return prev;

      const newSteps = [...prevSteps, stepId];
      const region = REGIONS.find((r) => r.id === regionId);
      const allStepsComplete = region ? newSteps.length >= region.steps.length : false;

      return {
        ...prev,
        completedSteps: {
          ...prev.completedSteps,
          [regionId]: newSteps,
        },
        completedRegions: allStepsComplete
          ? [...new Set([...prev.completedRegions, regionId])]
          : prev.completedRegions,
      };
    });
  }, []);

  const handleSkipRegion = useCallback((regionId: string) => {
    setProgress((prev) => ({
      ...prev,
      skippedRegions: [...new Set([...prev.skippedRegions, regionId])],
    }));
  }, []);

  const handleBackToMap = useCallback(() => {
    setActiveRegion(null);
  }, []);

  const currentRegion = activeRegion ? REGIONS.find((r) => r.id === activeRegion) : null;

  if (currentRegion) {
    return (
      <RegionDetail
        region={currentRegion}
        progress={progress}
        onCompleteStep={handleCompleteStep}
        onSkipRegion={handleSkipRegion}
        onBack={handleBackToMap}
      />
    );
  }

  return (
    <CartographerMap progress={progress} onSelectRegion={handleSelectRegion} />
  );
}
