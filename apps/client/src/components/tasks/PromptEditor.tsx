import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  variables?: string[];
}

export function PromptEditor({ value, onChange, placeholder, label, variables }: PromptEditorProps) {
  const detectedVariables = useMemo(() => {
    const matches = value.matchAll(/\{\{(\w+(?:\.\w+)*)\}\}/g);
    return [...new Set(Array.from(matches, (m) => m[1]))];
  }, [value]);

  const allVariables = variables || detectedVariables;

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Enter your prompt... Use {{variable}} for template variables"}
        className="min-h-[200px] font-mono text-sm"
      />

      {allVariables.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Variables:</span>
          {allVariables.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="text-xs cursor-pointer font-mono"
              onClick={() => {
                onChange(value + `{{${v}}}`);
              }}
            >
              {`{{${v}}}`}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
