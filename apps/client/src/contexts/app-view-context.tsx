import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type AppView =
  | "constellation"
  | "knowledge-graph-3d"
  | "meta-graph-3d"
  | "merge-playground"
  | "eval-harness"
  | "graph-pulse"
  | "cartographer"
  | "dashboard"
  | "settings"
  | "billing"
  | "knowledge-base"
  | "prompt-templates"
  | "admin";

const IMMERSIVE_VIEWS = new Set<string>([
  "constellation",
  "knowledge-graph-3d",
  "meta-graph-3d",
  "merge-playground",
  "eval-harness",
  "graph-pulse",
  "cartographer",
]);

export interface AppViewState {
  view: AppView;
  viewId: string | null;
  setView: (view: AppView, id?: string | null) => void;
  goHome: () => void;
  isImmersive: boolean;
}

const AppViewContext = createContext<AppViewState>({
  view: "constellation",
  viewId: null,
  setView: () => {},
  goHome: () => {},
  isImmersive: true,
});

export function AppViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<AppView>("constellation");
  const [viewId, setViewId] = useState<string | null>(null);

  const setView = useCallback((nextView: AppView, id?: string | null) => {
    setViewState(nextView);
    setViewId(id ?? null);
  }, []);

  const goHome = useCallback(() => {
    setViewState("constellation");
    setViewId(null);
  }, []);

  const isImmersive = IMMERSIVE_VIEWS.has(view);

  return (
    <AppViewContext.Provider value={{ view, viewId, setView, goHome, isImmersive }}>
      {children}
    </AppViewContext.Provider>
  );
}

export function useAppView() {
  return useContext(AppViewContext);
}
