import { useMemo, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useAppView } from "@/contexts/app-view-context";
import { VoidViewProvider } from "@/contexts/void-view-context";
import { VoidGraphTitle } from "./VoidGraphTitle";
import { VoidReadingZone } from "./VoidReadingZone";
import { VoidCommandPalette } from "./VoidCommandPalette";
import { HolographicPanel } from "./HolographicPanel";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGlobalGraphShortcuts } from "@/hooks/useGlobalGraphShortcuts";

// Lazy-load page components
const CelestialFieldPage = lazy(() => import("@/pages/CelestialFieldPage"));
const KnowledgeCartographerPage = lazy(() => import("@/pages/KnowledgeCartographerPage"));
const MetaGraph3D = lazy(() => import("@/components/meta-graph-3d/MetaGraph3D"));

// Non-immersive pages (rendered in HolographicPanel overlay)
import Dashboard from "@/pages/Dashboard";
import Billing from "@/pages/Billing";
import Settings from "@/pages/Settings";
import PromptTemplates from "@/pages/PromptTemplates";
import AdminDashboard from "@/pages/AdminDashboard";

const PANEL_VIEWS: Record<string, { component: React.ComponentType; title: string; subtitle?: string }> = {
  dashboard: { component: Dashboard, title: "Dashboard", subtitle: "Metrics & system health" },
  settings: { component: Settings, title: "Settings", subtitle: "Account & preferences" },
  billing: { component: Billing, title: "Billing", subtitle: "Credits & subscriptions" },
  "prompt-templates": { component: PromptTemplates, title: "Prompt Templates", subtitle: "Template library" },
  admin: { component: AdminDashboard, title: "Administration", subtitle: "System management" },
};

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export function VoidAppShell() {
  const { view, goHome, setView, isImmersive } = useAppView();
  const isMobile = useIsMobile();

  useGlobalGraphShortcuts();

  const panelView = PANEL_VIEWS[view];

  // CelestialFieldPage handles: constellation, knowledge-graph-3d, merge-playground, eval-harness, graph-pulse
  const isCelestialView = view === "constellation" || view === "knowledge-graph-3d" ||
    view === "merge-playground" || view === "eval-harness" ||
    view === "graph-pulse";

  const isCartographer = view === "cartographer";
  const isMetaGraph3D = view === "meta-graph-3d";

  return (
    <VoidViewProvider>
      <div className={cn("void-shell", isMobile && "void-shell--mobile")}>
        <div className="void-overlay">
          {/* Zone 1 — Top center title */}
          <VoidGraphTitle />

          {/* Zone 3 — Top left reading zone */}
          <VoidReadingZone onNavigate={(route) => {
            // Convert old route strings to view state for notification links
            const match = route.match(/^\/app\/([^/?#]+)/);
            if (match) setView(match[1] as any);
          }} />

          {/* CelestialFieldPage is ALWAYS mounted — the 3D scene persists */}
          <main className="void-main void-main--immersive">
            <section className="void-route-stage pointer-events-auto">
              <Suspense fallback={<PageFallback />}>
                <CelestialFieldPage />
              </Suspense>
            </section>
          </main>

          {/* Cartographer overlays the constellation */}
          {isCartographer && (
            <div className="fixed inset-0 z-10 bg-[#0B1014]">
              <Suspense fallback={<PageFallback />}>
                <KnowledgeCartographerPage />
              </Suspense>
            </div>
          )}

          {/* Meta-Graph 3D — standalone immersive view */}
          {isMetaGraph3D && (
            <Suspense fallback={<PageFallback />}>
              <MetaGraph3D />
            </Suspense>
          )}

          {/* Non-immersive panel views float over the constellation */}
          {panelView && (
            <div className="fixed inset-0 z-10 pointer-events-none">
              <div className="void-main pointer-events-auto flex items-start justify-center pt-16">
                <HolographicPanel
                  title={panelView.title}
                  subtitle={panelView.subtitle}
                  variant="workspace"
                  collapsible
                  onClose={goHome}
                  className="void-workspace-panel"
                  bodyClassName="void-route-slot"
                >
                  <panelView.component />
                </HolographicPanel>
              </div>
            </div>
          )}
        </div>

        <VoidCommandPalette />
      </div>
    </VoidViewProvider>
  );
}
