import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, Pencil } from "lucide-react";

interface AutomationRuleCardProps {
  rule: {
    id: string;
    name: string;
    description: string | null;
    trigger: any;
    isActive: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
  };
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function AutomationRuleCard({ rule, onEdit, onDelete }: AutomationRuleCardProps) {
  const trigger = rule.trigger || {};
  const triggerLabel =
    trigger.type === "cron"
      ? `Cron: ${trigger.schedule}`
      : trigger.type === "webhook"
        ? "Webhook"
        : trigger.type || "Unknown";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{rule.name}</CardTitle>
            {rule.description && (
              <CardDescription className="mt-0.5">{rule.description}</CardDescription>
            )}
          </div>
          <Badge variant={rule.isActive ? "default" : "secondary"}>
            {rule.isActive ? "Active" : "Paused"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Trigger: {triggerLabel}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="space-y-0.5">
            <div>Last run: {rule.lastRunAt ? new Date(rule.lastRunAt).toLocaleString() : "Never"}</div>
            <div>Next run: {rule.nextRunAt ? new Date(rule.nextRunAt).toLocaleString() : "Not scheduled"}</div>
          </div>
          <div className="flex gap-1">
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(rule.id)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(rule.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
