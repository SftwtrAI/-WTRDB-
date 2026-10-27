import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface OutputStyle {
  format: string;
  sections?: string[];
}

interface OutputStyleEditorProps {
  value: OutputStyle;
  onChange: (value: OutputStyle) => void;
}

const formats = [
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "pdf", label: "PDF" },
  { value: "table", label: "Table" },
  { value: "plain", label: "Plain Text" },
];

export function OutputStyleEditor({ value, onChange }: OutputStyleEditorProps) {
  const sections = value.sections || [];

  const addSection = () => {
    onChange({ ...value, sections: [...sections, ""] });
  };

  const updateSection = (index: number, text: string) => {
    const updated = [...sections];
    updated[index] = text;
    onChange({ ...value, sections: updated });
  };

  const removeSection = (index: number) => {
    onChange({ ...value, sections: sections.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Output Format</label>
        <Select value={value.format} onValueChange={(f) => onChange({ ...value, format: f })}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {formats.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium">Sections</label>
        <div className="space-y-2 mt-1">
          {sections.map((section, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={section}
                onChange={(e) => updateSection(i, e.target.value)}
                placeholder="Section name"
              />
              <Button variant="ghost" size="icon" onClick={() => removeSection(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addSection}>
            <Plus className="h-4 w-4 mr-1" /> Add Section
          </Button>
        </div>
      </div>
    </div>
  );
}
