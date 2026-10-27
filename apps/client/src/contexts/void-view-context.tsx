import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface VoidViewContextValue {
  viewName: string | null;
  setViewName: (name: string | null) => void;
}

const VoidViewContext = createContext<VoidViewContextValue>({
  viewName: null,
  setViewName: () => {},
});

export function VoidViewProvider({ children }: { children: ReactNode }) {
  const [viewName, setViewNameState] = useState<string | null>(null);
  const setViewName = useCallback((name: string | null) => {
    setViewNameState(name);
  }, []);

  return (
    <VoidViewContext.Provider value={{ viewName, setViewName }}>
      {children}
    </VoidViewContext.Provider>
  );
}

export function useVoidView() {
  return useContext(VoidViewContext);
}
