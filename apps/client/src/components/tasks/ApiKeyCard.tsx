import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Key, Trash2 } from "lucide-react";

interface ApiKeyCardProps {
  apiKey: {
    id: string;
    provider: string;
    label: string;
    apiKey: string;
    model: string | null;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
  };
  onDelete?: (id: string) => void;
}

const providerColors: Record<string, string> = {
  openai: "bg-green-600",
  anthropic: "bg-orange-600",
  google: "bg-blue-600",
  deepseek: "bg-purple-600",
  custom: "bg-gray-600",
};

export function ApiKeyCard({ apiKey, onDelete }: ApiKeyCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{apiKey.label}</CardTitle>
          </div>
          <Badge className={providerColors[apiKey.provider] || "bg-gray-600"}>
            {apiKey.provider}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <code className="text-xs bg-muted px-2 py-1 rounded">{apiKey.apiKey}</code>
            <Badge variant={apiKey.isActive ? "outline" : "secondary"} className="text-xs">
              {apiKey.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          {apiKey.model && (
            <div className="text-xs text-muted-foreground">
              Model: {apiKey.model}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {apiKey.lastUsedAt
                ? `Last used: ${new Date(apiKey.lastUsedAt).toLocaleString()}`
                : "Never used"}
            </span>
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(apiKey.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
