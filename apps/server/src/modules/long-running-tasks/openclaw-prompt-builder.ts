import type { TaskTemplateVersion } from "@wtrops/shared";

/**
 * Merges schema-defined default values into inputData for any keys that are
 * missing (null or undefined).  Allows falsy values like 0, "", and false
 * to pass through unchanged.
 */
function applyFieldDefaults(
  inputData: Record<string, any>,
  version: TaskTemplateVersion,
): Record<string, any> {
  const fields: any[] =
    (version.inputSchema as any)?.fields ?? [];
  if (fields.length === 0) return inputData;

  const merged = { ...inputData };
  for (const field of fields) {
    if (field.default != null && merged[field.name] == null) {
      merged[field.name] = field.default;
    }
  }
  return merged;
}

/**
 * Builds the system prompt (SOUL.md / AGENTS.md content) for an OpenClaw session
 * from template version config and user inputs.
 */
export function buildSystemPrompt(
  version: TaskTemplateVersion,
  inputData: Record<string, any>,
): string {
  let prompt = version.systemPrompt || "";

  // Merge schema defaults then replace {{variable}} placeholders
  const data = applyFieldDefaults(inputData, version);
  prompt = resolveVariables(prompt, data);

  return prompt;
}

/**
 * Builds the user prompt with template variables filled in.
 */
export function buildUserPrompt(
  version: TaskTemplateVersion,
  inputData: Record<string, any>,
): string {
  let prompt = version.userPrompt || "";

  // Merge schema defaults then replace {{variable}} placeholders
  const data = applyFieldDefaults(inputData, version);
  prompt = resolveVariables(prompt, data);

  return prompt;
}

/**
 * Replaces {{variable}} placeholders in a prompt with actual values.
 * Supports nested object access via dot notation: {{project.name}}
 */
function resolveVariables(
  template: string,
  data: Record<string, any>,
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path: string) => {
    const keys = path.split(".");
    let value: any = data;
    for (const key of keys) {
      if (value == null || typeof value !== "object") return match;
      value = value[key];
    }
    if (value == null) return match;
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/**
 * Extracts variable names from a prompt template.
 */
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+(?:\.\w+)*)\}\}/g);
  const variables = new Set<string>();
  for (const match of matches) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

/**
 * Builds the tools/skills configuration for OpenClaw.
 */
export function buildToolsConfig(
  version: TaskTemplateVersion,
): Record<string, any> {
  const config = (version.toolsConfig as Record<string, any>) || {};
  return {
    skills: config.skills || [],
    tools: config.tools || [],
    allowWebSearch: config.allowWebSearch ?? false,
    allowFileRead: config.allowFileRead ?? true,
    allowCodeExecution: config.allowCodeExecution ?? false,
  };
}
