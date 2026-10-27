import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BrandingProvider } from "@/components/BrandingProvider";
import { DirectionProvider } from "@/components/DirectionProvider";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AuthStorage } from "./lib/auth-storage";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { SessionTimeoutDialog } from "@/components/SessionTimeoutDialog";
import { useActivityTimeout } from "@/hooks/useActivityTimeout";
import { PluginRegistryProvider } from "@/contexts/plugin-registry";
import { AppViewProvider, useAppView } from "@/contexts/app-view-context";
import { VoidAppShell } from "@/components/void/VoidAppShell";
import { PublicConstellationShell } from "@/components/void/PublicConstellationShell";

import PrivacyPolicy from "@/pages/policies/PrivacyPolicy";
import TermsOfService from "@/pages/policies/TermsOfService";
import CookiePolicy from "@/pages/policies/CookiePolicy";
import MetaGraphPage from "@/pages/MetaGraphPage";

function SessionTimeoutWrapper({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();

  const handleTimeout = useCallback(() => {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    AuthStorage.clearAuth();
    queryClient.clear();
    // Force reload to show public constellation with auth card
    window.location.reload();
  }, []);

  const { isWarningVisible, remainingTime, dismissWarning } = useActivityTimeout({
    enabled: AuthStorage.isAuthenticated(),
    onTimeout: handleTimeout,
    warningThresholdMs: 5 * 60 * 1000,
  });

  return (
    <>
      {children}
      <SessionTimeoutDialog
        open={isWarningVisible}
        remainingTime={remainingTime}
        onContinue={dismissWarning}
        onLogout={handleTimeout}
      />
    </>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => AuthStorage.isAuthenticated());
  const { setView } = useAppView();
  const [location] = useLocation();

  // Listen for auth changes (login/logout from VoidAuthCard)
  useEffect(() => {
    const check = () => setIsAuthenticated(AuthStorage.isAuthenticated());
    // Poll localStorage for auth changes (cross-component communication)
    const interval = setInterval(check, 500);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", check);
    };
  }, []);

  // New user → cartographer on first authenticated render
  useEffect(() => {
    if (isAuthenticated && localStorage.getItem("wtrdb_new_user") === "true") {
      localStorage.removeItem("wtrdb_new_user");
      setView("cartographer");
    }
  }, [isAuthenticated, setView]);

  if (!isAuthenticated) {
    return <PublicConstellationShell />;
  }

  // Meta-Graph (WS3) is a standalone overlay route — renders the yellow
  // spider-web visualization for merged cross-document graphs without the
  // immersive VoidAppShell.
  if (location === "/app/knowledge-graph/merged") {
    return (
      <SessionTimeoutWrapper>
        <Switch>
          <Route path="/app/knowledge-graph/merged" component={MetaGraphPage} />
        </Switch>
      </SessionTimeoutWrapper>
    );
  }

  return (
    <SessionTimeoutWrapper>
      <VoidAppShell />
    </SessionTimeoutWrapper>
  );
}

export default function App() {
  const [location] = useLocation();

  // Policy pages are the only real routes
  if (location === "/privacy") return <PolicyWrapper><PrivacyPolicy /></PolicyWrapper>;
  if (location === "/terms") return <PolicyWrapper><TermsOfService /></PolicyWrapper>;
  if (location === "/cookies") return <PolicyWrapper><CookiePolicy /></PolicyWrapper>;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DirectionProvider>
          <BrandingProvider>
            <PluginRegistryProvider>
              <TooltipProvider>
                <AppViewProvider>
                  <AnalyticsScripts />
                  <AppContent />
                  <Toaster />
                  <CookieConsentBanner />
                </AppViewProvider>
              </TooltipProvider>
            </PluginRegistryProvider>
          </BrandingProvider>
        </DirectionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function PolicyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DirectionProvider>
          <BrandingProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </BrandingProvider>
        </DirectionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
