import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface PluginSettingsTab {
  id: string;
  pluginName: string;
  label: string;
  icon?: string;
  component: React.ComponentType<any>;
  order?: number;
}

export interface PluginRoute {
  id: string;
  pluginName: string;
  path: string;
  component: React.ComponentType<any>;
  label?: string;
  icon?: string;
}

export interface PluginPhoneNumbersTab {
  id: string;
  pluginName: string;
  label: string;
  icon?: string;
  component: React.ComponentType<any>;
  order?: number;
}

export interface PluginAdminMenuItem {
  id: string;
  pluginName: string;
  label: string;
  icon?: string;
  path: string;
  component: React.ComponentType<any>;
  order?: number;
}

export interface PluginAdminSettingsTab {
  id: string;
  pluginName: string;
  label: string;
  icon?: string;
  component: React.ComponentType<any>;
  order?: number;
}

export interface PluginRegistryState {
  settingsTabs: PluginSettingsTab[];
  routes: PluginRoute[];
  phoneNumbersTabs: PluginPhoneNumbersTab[];
  adminMenuItems: PluginAdminMenuItem[];
  adminSettingsTabs: PluginAdminSettingsTab[];
  loadedPlugins: Set<string>;
}

export interface PluginRegistryAPI {
  registerSettingsTab: (tab: PluginSettingsTab) => void;
  registerRoute: (route: PluginRoute) => void;
  registerPhoneNumbersTab: (tab: PluginPhoneNumbersTab) => void;
  registerAdminMenuItem: (item: PluginAdminMenuItem) => void;
  registerAdminSettingsTab: (tab: PluginAdminSettingsTab) => void;
  markPluginLoaded: (pluginName: string) => void;
  isPluginLoaded: (pluginName: string) => boolean;
  unregisterPlugin: (pluginName: string) => void;
  getSettingsTabs: () => PluginSettingsTab[];
  getRoutes: () => PluginRoute[];
  getPhoneNumbersTabs: () => PluginPhoneNumbersTab[];
  getAdminMenuItems: () => PluginAdminMenuItem[];
  getAdminSettingsTabs: () => PluginAdminSettingsTab[];
}

const PluginRegistryContext = createContext<PluginRegistryAPI | null>(null);

export function PluginRegistryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PluginRegistryState>({
    settingsTabs: [],
    routes: [],
    phoneNumbersTabs: [],
    adminMenuItems: [],
    adminSettingsTabs: [],
    loadedPlugins: new Set(),
  });

  const registerSettingsTab = useCallback((tab: PluginSettingsTab) => {
    setState((prev) => {
      if (prev.settingsTabs.some((t) => t.id === tab.id)) return prev;
      const newTabs = [...prev.settingsTabs, tab].sort(
        (a, b) => (a.order ?? 100) - (b.order ?? 100),
      );
      return { ...prev, settingsTabs: newTabs };
    });
  }, []);

  const registerRoute = useCallback((route: PluginRoute) => {
    setState((prev) => {
      if (prev.routes.some((r) => r.id === route.id)) return prev;
      return { ...prev, routes: [...prev.routes, route] };
    });
  }, []);

  const registerPhoneNumbersTab = useCallback((tab: PluginPhoneNumbersTab) => {
    setState((prev) => {
      if (prev.phoneNumbersTabs.some((t) => t.id === tab.id)) return prev;
      const newTabs = [...prev.phoneNumbersTabs, tab].sort(
        (a, b) => (a.order ?? 100) - (b.order ?? 100),
      );
      return { ...prev, phoneNumbersTabs: newTabs };
    });
  }, []);

  const registerAdminMenuItem = useCallback((item: PluginAdminMenuItem) => {
    setState((prev) => {
      if (prev.adminMenuItems.some((i) => i.id === item.id)) return prev;
      const newItems = [...prev.adminMenuItems, item].sort(
        (a, b) => (a.order ?? 100) - (b.order ?? 100),
      );
      return { ...prev, adminMenuItems: newItems };
    });
  }, []);

  const registerAdminSettingsTab = useCallback(
    (tab: PluginAdminSettingsTab) => {
      setState((prev) => {
        if (prev.adminSettingsTabs.some((t) => t.id === tab.id)) return prev;
        const newTabs = [...prev.adminSettingsTabs, tab].sort(
          (a, b) => (a.order ?? 100) - (b.order ?? 100),
        );
        return { ...prev, adminSettingsTabs: newTabs };
      });
    },
    [],
  );

  const markPluginLoaded = useCallback((pluginName: string) => {
    setState((prev) => {
      const newSet = new Set(prev.loadedPlugins);
      newSet.add(pluginName);
      return { ...prev, loadedPlugins: newSet };
    });
  }, []);

  const isPluginLoaded = useCallback(
    (pluginName: string) => {
      return state.loadedPlugins.has(pluginName);
    },
    [state.loadedPlugins],
  );

  const unregisterPlugin = useCallback((pluginName: string) => {
    setState((prev) => {
      const newSet = new Set(prev.loadedPlugins);
      newSet.delete(pluginName);
      return {
        ...prev,
        settingsTabs: prev.settingsTabs.filter(
          (t) => t.pluginName !== pluginName,
        ),
        routes: prev.routes.filter((r) => r.pluginName !== pluginName),
        phoneNumbersTabs: prev.phoneNumbersTabs.filter(
          (t) => t.pluginName !== pluginName,
        ),
        adminMenuItems: prev.adminMenuItems.filter(
          (i) => i.pluginName !== pluginName,
        ),
        adminSettingsTabs: prev.adminSettingsTabs.filter(
          (t) => t.pluginName !== pluginName,
        ),
        loadedPlugins: newSet,
      };
    });
  }, []);

  const getSettingsTabs = useCallback(
    () => state.settingsTabs,
    [state.settingsTabs],
  );
  const getRoutes = useCallback(() => state.routes, [state.routes]);
  const getPhoneNumbersTabs = useCallback(
    () => state.phoneNumbersTabs,
    [state.phoneNumbersTabs],
  );
  const getAdminMenuItems = useCallback(
    () => state.adminMenuItems,
    [state.adminMenuItems],
  );
  const getAdminSettingsTabs = useCallback(
    () => state.adminSettingsTabs,
    [state.adminSettingsTabs],
  );

  const api: PluginRegistryAPI = {
    registerSettingsTab,
    registerRoute,
    registerPhoneNumbersTab,
    registerAdminMenuItem,
    registerAdminSettingsTab,
    markPluginLoaded,
    isPluginLoaded,
    unregisterPlugin,
    getSettingsTabs,
    getRoutes,
    getPhoneNumbersTabs,
    getAdminMenuItems,
    getAdminSettingsTabs,
  };

  return (
    <PluginRegistryContext.Provider value={api}>
      {children}
    </PluginRegistryContext.Provider>
  );
}

export function usePluginRegistry(): PluginRegistryAPI {
  const context = useContext(PluginRegistryContext);
  if (!context) {
    throw new Error(
      "usePluginRegistry must be used within a PluginRegistryProvider",
    );
  }
  return context;
}

declare global {
  interface Window {
    __WTROPS_PLUGIN_REGISTRY__?: PluginRegistryAPI;
  }
}

export function exposePluginRegistry(api: PluginRegistryAPI) {
  if (typeof window !== "undefined") {
    window.__WTROPS_PLUGIN_REGISTRY__ = api;
  }
}

export function getGlobalPluginRegistry(): PluginRegistryAPI | undefined {
  if (typeof window !== "undefined") {
    return window.__WTROPS_PLUGIN_REGISTRY__;
  }
  return undefined;
}
