import type { Express, RequestHandler } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { db } from "../db";
import { globalSettings } from "@wtrops/shared";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PluginManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  homepage?: string;
  compatibility?: {
    wtrops?: string;
    node?: string;
  };
  entryPoint: string;
  registerFunction: string;
  database?: {
    migrations?: string[];
    tables?: string[];
  };
  routes?: {
    api?: Array<{ path: string; description: string }>;
  };
  ui?: {
    adminSettings?: {
      tab: string;
      label: string;
      component: string;
      menu?: string;
      icon?: string;
    };
    userSettings?: { tab: string; label: string; component: string };
    frontendBundle?: string;
  };
  permissions?: {
    required?: string[];
  };
  features?: string[];
  scopes?: Record<string, string>;
  settings?: Record<
    string,
    {
      type: string;
      default: any;
      label: string;
      description: string;
    }
  >;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  registered: boolean;
  error?: string;
}

export interface PluginLoaderOptions {
  sessionAuthMiddleware: RequestHandler;
  adminAuthMiddleware: RequestHandler;
}

const loadedPlugins: Map<string, LoadedPlugin> = new Map();
export const externallyRegisteredPlugins: Set<string> = new Set();

/**
 * Mark a plugin as externally registered (for backward compatibility)
 * This prevents the loader from trying to register it again
 */
export function markPluginAsRegistered(pluginName: string): void {
  externallyRegisteredPlugins.add(pluginName);
}

/**
 * Check if a plugin is enabled in database settings
 */
async function isPluginEnabled(pluginName: string): Promise<boolean> {
  try {
    const settingKey = `plugin_${pluginName}_enabled`;
    const [setting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, settingKey))
      .limit(1);

    if (setting && setting.value) {
      // Value is jsonb type, could be { enabled: boolean } or string 'true'/'false'
      const val = setting.value as any;
      if (typeof val === "object" && "enabled" in val) {
        return val.enabled === true;
      }
      if (typeof val === "string") {
        return val === "true";
      }
      return Boolean(val);
    }

    // Default: enabled
    return true;
  } catch (error) {
    console.warn(
      `[Plugin Loader] Could not check plugin status for ${pluginName}, defaulting to enabled`,
    );
    return true;
  }
}

/**
 * Discover all plugins in the plugins directory
 */
export function discoverPlugins(): PluginManifest[] {
  const pluginsDir = path.resolve(__dirname, "../../plugins");
  const plugins: PluginManifest[] = [];

  if (!fs.existsSync(pluginsDir)) {
    console.log("[Plugin Loader] No plugins directory found");
    return plugins;
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(pluginsDir, entry.name, "plugin.json");

    if (!fs.existsSync(manifestPath)) {
      console.log(
        `[Plugin Loader] Skipping ${entry.name}: no plugin.json found`,
      );
      continue;
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent) as PluginManifest;
      plugins.push(manifest);
    } catch (error) {
      console.error(`[Plugin Loader] Error parsing ${manifestPath}:`, error);
    }
  }

  return plugins;
}

/**
 * Load and register all enabled plugins
 */
export async function loadPlugins(
  app: Express,
  options: PluginLoaderOptions,
): Promise<LoadedPlugin[]> {
  const pluginsDir = path.resolve(__dirname, "../../plugins");
  const manifests = discoverPlugins();
  const results: LoadedPlugin[] = [];

  console.log(`[Plugin Loader] Found ${manifests.length} plugin(s)`);

  for (const manifest of manifests) {
    const pluginPath = path.join(pluginsDir, manifest.name);
    const enabled = await isPluginEnabled(manifest.name);

    const loadedPlugin: LoadedPlugin = {
      manifest,
      path: pluginPath,
      enabled,
      registered: false,
    };

    if (!enabled) {
      console.log(
        `[Plugin Loader] Plugin '${manifest.displayName}' is disabled`,
      );
      loadedPlugins.set(manifest.name, loadedPlugin);
      results.push(loadedPlugin);
      continue;
    }

    // Skip if plugin was already registered externally (backward compatibility)
    if (externallyRegisteredPlugins.has(manifest.name)) {
      loadedPlugin.registered = true;
      console.log(
        `[Plugin Loader] Plugin '${manifest.displayName}' already registered externally`,
      );
      loadedPlugins.set(manifest.name, loadedPlugin);
      results.push(loadedPlugin);
      continue;
    }

    try {
      // Dynamic import of the plugin using file:// URL for cross-platform compatibility (Windows + Linux)
      const entryPointPath = path.join(pluginPath, manifest.entryPoint);
      const entryPointUrl = pathToFileURL(entryPointPath).href;
      const pluginModule = await import(entryPointUrl);

      // Get the register function
      const registerFn = pluginModule[manifest.registerFunction];

      if (typeof registerFn !== "function") {
        throw new Error(
          `Register function '${manifest.registerFunction}' not found in ${manifest.entryPoint}`,
        );
      }

      // Register the plugin
      registerFn(app, options);

      loadedPlugin.registered = true;
      console.log(
        `[Plugin Loader] Registered plugin '${manifest.displayName}' v${manifest.version}`,
      );
    } catch (error: any) {
      loadedPlugin.error = error.message;
      console.error(
        `[Plugin Loader] Failed to load plugin '${manifest.name}':`,
        error,
      );
    }

    loadedPlugins.set(manifest.name, loadedPlugin);
    results.push(loadedPlugin);
  }

  return results;
}

/**
 * Get all loaded plugins
 */
export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

/**
 * Get a specific loaded plugin by name
 */
export function getPlugin(name: string): LoadedPlugin | undefined {
  return loadedPlugins.get(name);
}

/**
 * Check if a plugin is loaded and registered
 */
export function isPluginRegistered(name: string): boolean {
  const plugin = loadedPlugins.get(name);
  return plugin?.registered ?? false;
}

/**
 * Get plugin manifest by name
 */
export function getPluginManifest(name: string): PluginManifest | undefined {
  const plugin = loadedPlugins.get(name);
  return plugin?.manifest;
}

/**
 * Set plugin enabled status in database
 */
export async function setPluginEnabled(
  pluginName: string,
  enabled: boolean,
): Promise<void> {
  const settingKey = `plugin_${pluginName}_enabled`;

  try {
    // Upsert the setting (value is jsonb type)
    await db
      .insert(globalSettings)
      .values({
        key: settingKey,
        value: { enabled },
        description: `Whether the ${pluginName} plugin is enabled`,
      })
      .onConflictDoUpdate({
        target: globalSettings.key,
        set: { value: { enabled } },
      });

    // Update in-memory state
    const plugin = loadedPlugins.get(pluginName);
    if (plugin) {
      plugin.enabled = enabled;
    }

    console.log(
      `[Plugin Loader] Plugin '${pluginName}' ${enabled ? "enabled" : "disabled"}`,
    );
  } catch (error) {
    console.error(`[Plugin Loader] Failed to set plugin status:`, error);
    throw error;
  }
}

/**
 * Get all available plugins with their status
 */
export async function getPluginStatus(): Promise<
  Array<{
    name: string;
    displayName: string;
    version: string;
    description: string;
    enabled: boolean;
    registered: boolean;
    features: string[];
    hasFrontendBundle: boolean;
    error?: string;
  }>
> {
  return Array.from(loadedPlugins.values()).map((plugin) => {
    let hasFrontendBundle = false;
    if (plugin.manifest.ui?.frontendBundle) {
      const bundlePath = path.join(
        plugin.path,
        plugin.manifest.ui.frontendBundle,
      );
      hasFrontendBundle = fs.existsSync(bundlePath);
    }
    return {
      name: plugin.manifest.name,
      displayName: plugin.manifest.displayName,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      enabled: plugin.enabled,
      registered: plugin.registered,
      features: plugin.manifest.features || [],
      hasFrontendBundle,
      error: plugin.error,
    };
  });
}
