import { useQuery } from "@tanstack/react-query";

interface CapabilitiesResponse {
  success: boolean;
  data: {
    capabilities: Record<string, boolean>;
    pluginBundles?: Record<string, string>;
    sipEngine: boolean;
    sipEnginesAllowed: string[];
    maxConcurrentSipCalls: number;
    restApi: boolean;
    teamManagement: boolean;
  };
}

export function usePluginStatus(pluginName?: string) {
  const { data, isLoading, error } = useQuery<CapabilitiesResponse>({
    queryKey: ["/api/plugins/capabilities"],
    staleTime: 60000,
    retry: 1,
  });

  const capabilities = data?.data?.capabilities || {};

  const isPluginEnabled = (name: string): boolean => {
    return capabilities[name] ?? false;
  };

  // SIP access is true only if plugin is enabled AND user's plan allows it
  const isSipPluginEnabled = data?.data?.sipEngine ?? false;
  const sipEnginesAllowed = data?.data?.sipEnginesAllowed ?? [];
  const maxConcurrentSipCalls = data?.data?.maxConcurrentSipCalls ?? 0;
  const isRestApiPluginEnabled = data?.data?.restApi ?? false;
  const isTeamManagementPluginEnabled = data?.data?.teamManagement ?? false;
  const pluginBundles = data?.data?.pluginBundles ?? {};

  if (pluginName) {
    return {
      isEnabled: isPluginEnabled(pluginName),
      isLoading,
      error,
      hasError: !!error,
    };
  }

  return {
    isSipPluginEnabled,
    sipEnginesAllowed,
    maxConcurrentSipCalls,
    isRestApiPluginEnabled,
    isTeamManagementPluginEnabled,
    pluginBundles,
    isPluginEnabled,
    isLoading,
    error,
    hasError: !!error,
  };
}
