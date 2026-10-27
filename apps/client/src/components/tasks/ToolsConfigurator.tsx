import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ExternalLink, Globe } from "lucide-react";

interface ToolsConfig {
  allowWebSearch: boolean;
  allowFileRead: boolean;
  allowCodeExecution: boolean;
  skills: string[];
  tools: string[];
}

interface ToolsConfiguratorProps {
  value: ToolsConfig;
  onChange: (value: ToolsConfig) => void;
}

const toggleOptions = [
  { key: "allowWebSearch" as const, label: "Web Search", description: "Allow the agent to search the web for information" },
  { key: "allowFileRead" as const, label: "File Reading", description: "Allow the agent to read uploaded files" },
  { key: "allowCodeExecution" as const, label: "Code Execution", description: "Allow the agent to execute code" },
];

const toolOptions = [
  {
    key: "website_widget",
    label: "Website Widget",
    description:
      "Enable widget-related context and connect this template with your configured dashboard widget setup.",
  },
];

export function ToolsConfigurator({ value, onChange }: ToolsConfiguratorProps) {
  const selectedTools = Array.isArray(value.tools) ? value.tools : [];

  const updateTool = (toolKey: string, checked: boolean) => {
    const nextTools = checked
      ? Array.from(new Set([...selectedTools, toolKey]))
      : selectedTools.filter((t) => t !== toolKey);
    onChange({ ...value, tools: nextTools });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Tool Access</Label>
        {toolOptions.map((opt) => (
          <div
            key={opt.key}
            className="rounded-md border p-3 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-medium">{opt.label}</Label>
                </div>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
              <Switch
                checked={selectedTools.includes(opt.key)}
                onCheckedChange={(checked) => updateTool(opt.key, checked)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.open("/app/tools/widgets", "_blank")}
              >
                Configure
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-semibold">System Capabilities</Label>
      {toggleOptions.map((opt) => (
        <div key={opt.key} className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm font-medium">{opt.label}</Label>
            <p className="text-xs text-muted-foreground">{opt.description}</p>
          </div>
          <Switch
            checked={value[opt.key]}
            onCheckedChange={(checked) => onChange({ ...value, [opt.key]: checked })}
          />
        </div>
      ))}
      </div>
    </div>
  );
}
