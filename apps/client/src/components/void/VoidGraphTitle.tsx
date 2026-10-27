import { useVoidView } from "@/contexts/void-view-context";
import { useAppView } from "@/contexts/app-view-context";

const VIEW_NAMES: Record<string, string> = {
  constellation: "Celestial Field",
  "knowledge-graph-3d": "Knowledge Graph",
  "merge-playground": "Merge Workbench",
  "eval-harness": "The Observatory",
  "graph-pulse": "Pulse Array",
  cartographer: "The Cartographer",
  dashboard: "Dashboard",
  settings: "Settings",
  billing: "Billing",
  "knowledge-base": "Knowledge Graphs",
  "prompt-templates": "Prompt Templates",
  federations: "Federations",
  admin: "Administration",
};

export function VoidGraphTitle() {
  const { view } = useAppView();
  const { viewName } = useVoidView();
  const displayName = viewName || VIEW_NAMES[view] || "Celestial Field";

  return (
    <div className="void-graph-title pointer-events-auto">
      <span className="void-graph-title__text">{displayName}</span>
    </div>
  );
}
