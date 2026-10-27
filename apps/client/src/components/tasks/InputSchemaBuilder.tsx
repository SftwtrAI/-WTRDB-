import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useState } from "react";

interface InputField {
  name: string;
  type: string;
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
  default?: any;
}

interface InputSchemaBuilderProps {
  fields: InputField[];
  onChange: (fields: InputField[]) => void;
}

const fieldTypes = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "file", label: "File" },
  { value: "file[]", label: "Multiple Files" },
  { value: "textarea", label: "Text Area" },
  { value: "boolean", label: "Boolean" },
];

export function InputSchemaBuilder({ fields, onChange }: InputSchemaBuilderProps) {
  const addField = () => {
    onChange([
      ...fields,
      { name: "", type: "text", label: "", required: false },
    ]);
  };

  const updateField = (index: number, updates: Partial<InputField>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={index} className="flex items-start gap-2 p-3 border rounded-md bg-card">
          <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-grab" />

          <div className="flex-1 grid grid-cols-4 gap-2">
            <Input
              placeholder="Field name"
              value={field.name}
              onChange={(e) => updateField(index, { name: e.target.value })}
            />
            <Input
              placeholder="Label"
              value={field.label}
              onChange={(e) => updateField(index, { label: e.target.value })}
            />
            <Select value={field.type} onValueChange={(v) => updateField(index, { type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fieldTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={field.required}
                onCheckedChange={(checked) => updateField(index, { required: !!checked })}
              />
              <span className="text-sm">Required</span>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={() => removeField(index)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addField}>
        <Plus className="h-4 w-4 mr-1" /> Add Field
      </Button>
    </div>
  );
}
