import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plug, TestTube, Trash2 } from "lucide-react";

interface IntegrationCardProps {
  integration: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    lastSyncAt: string | null;
    createdAt: string;
  };
  onTest?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const typeLabels: Record<string, string> = {
  webhook: "Webhook",
  api_pull: "API Pull",
  s3: "S3 Bucket",
  google_drive: "Google Drive",
  database: "Database",
  custom: "Custom",
};

export function IntegrationCard({ integration, onTest, onDelete }: IntegrationCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{integration.name}</CardTitle>
          </div>
          <Badge variant={integration.isActive ? "default" : "secondary"}>
            {integration.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        <CardDescription>{typeLabels[integration.type] || integration.type}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {integration.lastSyncAt
              ? `Last sync: ${new Date(integration.lastSyncAt).toLocaleString()}`
              : "Never synced"}
          </span>
          <div className="flex gap-1">
            {onTest && (
              <Button variant="ghost" size="sm" onClick={() => onTest(integration.id)}>
                <TestTube className="h-4 w-4 mr-1" /> Test
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(integration.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
