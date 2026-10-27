import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  CreditCard,
  Settings,
  BarChart,
  Phone,
  Package,
  Bell,
  ListOrdered,
  Loader2,
  CheckCircle2,
  XCircle,
  Handshake,
  DollarSign,
  RefreshCw,
  Server,
  Receipt,
  Mail,
  MessageSquare,
  Headphones,
  ShieldAlert,
  Brain,
  Power,
  Mic,
  Sparkles,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import UserManagement from "@/components/admin/UserManagement";
import LLMModelsManagement from "@/components/admin/LLMModelsManagement";
import SettingsPage from "@/components/admin/SettingsPage";
import Notifications from "@/components/admin/Notifications";
import BatchJobsMonitor from "@/components/admin/BatchJobsMonitor";
import EmailSettingsManagement from "@/components/admin/EmailSettingsManagement";
import BannedWordsManagement from "@/components/admin/BannedWordsManagement";
import { Suspense } from "react";
import { usePluginRegistry } from "@/contexts/plugin-registry";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AuthStorage } from "@/lib/auth-storage";
import { usePluginStatus } from "@/hooks/use-plugin-status";

interface ConnectionStatus {
  connected: boolean;
  error?: string;
  accountName?: string;
  accountStatus?: string;
  voiceCount?: number;
  details?: string;
}

export default function AdminDashboard() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState("analytics");
  const [vobizStatus, setVobizStatus] = useState<ConnectionStatus | null>(null);
  const [openaiStatus, setOpenaiStatus] = useState<ConnectionStatus | null>(
    null,
  );
  const [openaiRealtimeStatus, setOpenaiRealtimeStatus] =
    useState<ConnectionStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const { isTeamManagementPluginEnabled } = usePluginStatus();
  const pluginRegistry = usePluginRegistry();
  const adminMenuItems = pluginRegistry.getAdminMenuItems();
  const adminSettingsTabs = pluginRegistry.getAdminSettingsTabs();

  // Fetch application version
  const { data: versionData } = useQuery<{ version: string }>({
    queryKey: ["/api/system/version"],
    staleTime: Infinity,
  });

  // Get analytics summary
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/admin/analytics"],
  });

  // Get global settings to check configuration
  // Auto-refresh every 60 minutes and on window focus to keep connection status current
  const {
    data: settings,
    isLoading: settingsLoading,
    refetch: refetchSettings,
    isFetching,
  } = useQuery({
    queryKey: ["/api/admin/settings"],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/admin/settings?t=${Date.now()}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      return response.json();
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 60 * 1000, // 60 minutes
    staleTime: 0,
  });

  // Promise chain for serialized connection checks - ensures every trigger runs in order
  const checkChainRef = useRef<Promise<void>>(Promise.resolve());
  const wasFetchingRef = useRef(false);
  const hasCheckedRef = useRef(false);

  // Perform the actual connection test - internal function
  const performConnectionCheck = async (settingsToUse: any): Promise<void> => {
    setCheckingStatus(true);

    try {
      // Test Vobiz connection
      try {
        const vobizResponse = await apiRequest(
          "POST",
          "/api/admin/test-connection/vobiz",
        );
        const vobizResult = await vobizResponse.json();
        setVobizStatus(vobizResult as ConnectionStatus);
      } catch (err) {
        setVobizStatus({
          connected: false,
          error: `Test failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }

      // Test OpenAI connection (embeddings/GPT models)
      if (settingsToUse?.openai_configured) {
        try {
          const openaiResponse = await apiRequest(
            "POST",
            "/api/admin/test-connection/openai",
          );
          const openaiResult = await openaiResponse.json();
          setOpenaiStatus(openaiResult as ConnectionStatus);
        } catch (err) {
          setOpenaiStatus({
            connected: false,
            error: `Test failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          });
        }
      } else {
        setOpenaiStatus({ connected: false, error: "Not configured" });
      }

      // Test OpenAI Realtime Voice API connection
      if (settingsToUse?.openai_realtime_configured) {
        try {
          const realtimeResponse = await apiRequest(
            "POST",
            "/api/admin/test-connection/openai-realtime",
          );
          const realtimeResult = await realtimeResponse.json();
          setOpenaiRealtimeStatus(realtimeResult as ConnectionStatus);
        } catch (err) {
          setOpenaiRealtimeStatus({
            connected: false,
            error: `Test failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          });
        }
      } else {
        setOpenaiRealtimeStatus({ connected: false, error: "Not configured" });
      }
    } catch (error) {
      console.error("Error checking API connections:", error);
      setVobizStatus({ connected: false, error: "Check failed" });
      setOpenaiStatus({ connected: false, error: "Check failed" });
      setOpenaiRealtimeStatus({ connected: false, error: "Check failed" });
    } finally {
      setCheckingStatus(false);
    }
  };

  // Queue a connection check - chains onto existing promise to ensure serial execution
  const checkAPIConnections = (currentSettings?: any) => {
    const settingsToUse = currentSettings || settings;
    if (!settingsToUse) return;

    // Chain this check onto the existing promise chain
    checkChainRef.current = checkChainRef.current
      .then(() => performConnectionCheck(settingsToUse))
      .catch((err) => {
        console.error("Connection check chain error:", err);
        // Reset error states on chain failure
        setVobizStatus({ connected: false, error: "Check failed" });
        setOpenaiStatus({ connected: false, error: "Check failed" });
        setOpenaiRealtimeStatus({ connected: false, error: "Check failed" });
        setCheckingStatus(false);
      });
  };

  // Manual refresh handler for recovery
  const handleManualRefresh = async () => {
    await refetchSettings();
  };

  // Force refresh connection status when navigating to /admin
  useEffect(() => {
    if (location?.startsWith("/admin")) {
      refetchSettings();
    }
  }, [location]);

  // Check connections when settings fetch completes (for route navigation, 60-min interval, and window focus)
  useEffect(() => {
    if (wasFetchingRef.current && !isFetching && settings) {
      // Fetch just completed, check connections with fresh data
      checkAPIConnections(settings);
    }
    wasFetchingRef.current = isFetching;
  }, [isFetching, settings]);

  // Initial check when settings first loads
  useEffect(() => {
    if (settings && !hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkAPIConnections(settings);
    }
    // Reset flag if settings becomes unavailable (e.g., after error)
    if (!settings) {
      hasCheckedRef.current = false;
    }
  }, [settings]);

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold">Platform Analytics</h1>
          <p className="text-muted-foreground mt-1 md:mt-2 text-sm md:text-base">
            Monitor platform performance and system health
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {checkingStatus ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Checking...</span>
            </div>
          ) : (
            <>
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  vobizStatus?.connected
                    ? "bg-[#B8E52B]/20 border-[#B8E52B]/40"
                    : "bg-slate-900/30 border-slate-700"
                }`}
                data-testid={
                  vobizStatus?.connected
                    ? "status-vobiz-connected"
                    : "status-vobiz-disconnected"
                }
                title={vobizStatus?.error || undefined}
              >
                <div
                  className={`p-1 rounded-full ${
                    vobizStatus?.connected ? "bg-[#B8E52B]" : "bg-slate-400"
                  }`}
                >
                  <Phone className="h-3 w-3 text-white" />
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-xs font-medium ${
                      vobizStatus?.connected
                        ? "text-[#B8E52B]"
                        : "text-slate-400"
                    }`}
                  >
                    Vobiz
                  </span>
                  <span
                    className={`text-[10px] ${
                      vobizStatus?.connected
                        ? "text-[#B8E52B]/70"
                        : "text-slate-500"
                    }`}
                  >
                    {vobizStatus?.connected ? "Connected" : "Not Connected"}
                  </span>
                </div>
              </div>

              {/* OpenAI Status Indicator */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  openaiStatus?.connected
                    ? "bg-[#07A288]/20 border-[#07A288]/40"
                    : "bg-slate-900/30 border-slate-700"
                }`}
                data-testid={
                  openaiStatus?.connected
                    ? "status-openai-connected"
                    : "status-openai-disconnected"
                }
                title={openaiStatus?.error || undefined}
              >
                <div
                  className={`p-1 rounded-full ${
                    openaiStatus?.connected ? "bg-[#07A288]" : "bg-slate-400"
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-white" />
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-xs font-medium ${
                      openaiStatus?.connected
                        ? "text-[#07A288]"
                        : "text-slate-400"
                    }`}
                  >
                    OpenAI
                  </span>
                  <span
                    className={`text-[10px] ${
                      openaiStatus?.connected
                        ? "text-[#07A288]/70"
                        : "text-slate-500"
                    }`}
                  >
                    {openaiStatus?.connected
                      ? (openaiStatus as any).modelCount !== undefined
                        ? `${(openaiStatus as any).modelCount} models`
                        : "Connected"
                      : "Not Connected"}
                  </span>
                </div>
              </div>

              {/* OpenAI Realtime Voice API Status Indicator */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  openaiRealtimeStatus?.connected
                    ? "bg-[#5BBE4E]/20 border-[#5BBE4E]/40"
                    : "bg-slate-900/30 border-slate-700"
                }`}
                data-testid={
                  openaiRealtimeStatus?.connected
                    ? "status-openai-voice-connected"
                    : "status-openai-voice-disconnected"
                }
                title={openaiRealtimeStatus?.error || undefined}
              >
                <div
                  className={`p-1 rounded-full ${
                    openaiRealtimeStatus?.connected
                      ? "bg-[#5BBE4E]"
                      : "bg-slate-400"
                  }`}
                >
                  <Mic className="h-3 w-3 text-white" />
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-xs font-medium ${
                      openaiRealtimeStatus?.connected
                        ? "text-[#5BBE4E]"
                        : "text-slate-400"
                    }`}
                  >
                    OpenAI Voice
                  </span>
                  <span
                    className={`text-[10px] ${
                      openaiRealtimeStatus?.connected
                        ? "text-[#5BBE4E]/70"
                        : "text-slate-500"
                    }`}
                  >
                    {openaiRealtimeStatus?.connected
                      ? (openaiRealtimeStatus as any).keyCount !== undefined
                        ? `${(openaiRealtimeStatus as any).keyCount} keys`
                        : "Connected"
                      : "Not Connected"}
                  </span>
                </div>
              </div>

              {/* Version Badge */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors bg-[#E7EEF6]/20 border-[#E7EEF6]/40"
                data-testid="status-version"
                title="Application Version"
              >
                <div className="p-1 rounded-full bg-[#E7EEF6]">
                  <Power className="h-3 w-3 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[#B8E52B]">
                    Version
                  </span>
                  <span className="text-[10px] text-[#B8E52B]/70">
                    v{versionData?.version || "1.0.0"}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualRefresh}
                disabled={checkingStatus || isFetching}
                title="Refresh connection status"
                data-testid="button-refresh-status"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Admin Tabs - Menu first */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <div className="overflow-x-auto -mx-4 md:-mx-8 px-4 md:px-8 pb-2 scrollbar-thin">
          <TabsList className="flex gap-1 h-auto w-max min-w-full">
            <TabsTrigger
              value="analytics"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-analytics"
            >
              <BarChart className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-users"
            >
              <Users className="h-4 w-4 mr-1 md:mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger
              value="contacts"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-contacts"
            >
              <Handshake className="h-4 w-4 mr-1 md:mr-2" />
              Contacts
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-billing"
            >
              <CreditCard className="h-4 w-4 mr-1 md:mr-2" />
              Billing
            </TabsTrigger>
            <TabsTrigger
              value="phones"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-phones"
            >
              <Phone className="h-4 w-4 mr-1 md:mr-2" />
              Phones
            </TabsTrigger>
            <TabsTrigger
              value="queue"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-batch-jobs"
            >
              <ListOrdered className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Batch Jobs</span>
              <span className="sm:hidden">Jobs</span>
            </TabsTrigger>
            <TabsTrigger
              value="calls"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-calls"
            >
              <Headphones className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Call Monitoring</span>
              <span className="sm:hidden">Calls</span>
            </TabsTrigger>
            <TabsTrigger
              value="communications"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-communications"
            >
              <MessageSquare className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Communications</span>
              <span className="sm:hidden">Comms</span>
            </TabsTrigger>
            <TabsTrigger
              value="voice-ai"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-voice-ai"
            >
              <Brain className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Voice AI</span>
              <span className="sm:hidden">Voice</span>
            </TabsTrigger>
            {adminMenuItems.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="text-xs md:text-sm whitespace-nowrap"
                data-testid={`tab-${item.id}`}
              >
                {item.icon === "Users" && (
                  <Building2 className="h-4 w-4 mr-1 md:mr-2" />
                )}
                {item.icon === "Server" && (
                  <Server className="h-4 w-4 mr-1 md:mr-2" />
                )}
                {item.label}
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="settings"
              className="text-xs md:text-sm whitespace-nowrap"
              data-testid="tab-settings"
            >
              <Settings className="h-4 w-4 mr-1 md:mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analytics" className="space-y-4">
          <div className="text-muted-foreground text-center py-8">Analytics module removed</div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <UserManagement />
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="text-muted-foreground text-center py-8">Contacts module removed</div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <BillingPanel />
        </TabsContent>

        <TabsContent value="phones" className="space-y-4">
          <div className="text-muted-foreground text-center py-8">Phone numbers module removed</div>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <BatchJobsMonitor />
        </TabsContent>

        <TabsContent value="calls" className="space-y-4">
          <CallsPanel />
        </TabsContent>

        <TabsContent value="communications" className="space-y-4">
          <CommunicationsPanel />
        </TabsContent>

        <TabsContent value="voice-ai" className="space-y-4">
          <VoiceAIPanel />
        </TabsContent>

        {adminMenuItems.map((item) => (
          <TabsContent key={item.id} value={item.id} className="space-y-4">
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              }
            >
              <item.component />
            </Suspense>
          </TabsContent>
        ))}

        <TabsContent value="settings" className="space-y-4">
          <SettingsPage onSwitchTab={setActiveTab} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BillingPanel() {
  const [activeSubTab, setActiveSubTab] = useState("plans");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
        <p className="text-muted-foreground">
          Manage subscription plans, credits, transactions, and payment gateways
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="plans" data-testid="subtab-plans">
            <Package className="h-4 w-4 mr-2" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="credits" data-testid="subtab-credits">
            <CreditCard className="h-4 w-4 mr-2" />
            Credits
          </TabsTrigger>
          <TabsTrigger value="transactions" data-testid="subtab-transactions">
            <Receipt className="h-4 w-4 mr-2" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="payments" data-testid="subtab-payments">
            <DollarSign className="h-4 w-4 mr-2" />
            Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-6 space-y-4">
          <LLMModelsManagement />
        </TabsContent>

        <TabsContent value="credits" className="mt-6">
          <div className="text-muted-foreground text-center py-8">Credit packages module removed</div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <div className="text-muted-foreground text-center py-8">Transactions module removed</div>
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <div className="text-muted-foreground text-center py-8">Payments module removed</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CallsPanel() {
  const [activeSubTab, setActiveSubTab] = useState("monitoring");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Call Monitoring</h2>
        <p className="text-muted-foreground">
          Monitor all calls, detect content violations, and manage banned words
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="monitoring" data-testid="subtab-call-monitoring">
            <Headphones className="h-4 w-4 mr-2" />
            All Calls
          </TabsTrigger>
          <TabsTrigger value="banned-words" data-testid="subtab-banned-words">
            <ShieldAlert className="h-4 w-4 mr-2" />
            Banned Words
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring" className="mt-6">
          <div className="text-muted-foreground text-center py-8">Call monitoring module removed</div>
        </TabsContent>

        <TabsContent value="banned-words" className="mt-6">
          <BannedWordsManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CommunicationsPanel() {
  const [activeSubTab, setActiveSubTab] = useState("email-settings");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Communications</h2>
        <p className="text-muted-foreground">
          Manage email templates, notifications, and communication settings
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger
            value="email-settings"
            data-testid="subtab-email-settings"
          >
            <Mail className="h-4 w-4 mr-2" />
            Email Settings
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="subtab-notifications">
            <Bell className="h-4 w-4 mr-2" />
            In-App Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email-settings" className="mt-6">
          <EmailSettingsManagement />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Notifications />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VoiceAIPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Voice AI Engine</h2>
        <p className="text-muted-foreground">
          Manage OpenAI configurations for the LiveKit Voice AI engine
        </p>
      </div>

      <div className="space-y-6">
        <div className="text-muted-foreground text-center py-8">Voice AI module removed</div>
      </div>
    </div>
  );
}
