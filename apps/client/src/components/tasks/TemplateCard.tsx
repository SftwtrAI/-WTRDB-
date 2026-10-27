import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Settings, Clock } from "lucide-react";
import { useLocation } from "wouter";

interface TemplateCardProps {
  template: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    tags: any;
    isPublic: boolean;
    updatedAt: string;
  };
  onRun?: (id: string) => void;
}

export function TemplateCard({ template, onRun }: TemplateCardProps) {
  const [, navigate] = useLocation();
  const tags = Array.isArray(template.tags) ? template.tags : [];

  return (
    <Card className="hover:border-indigo-500/50 transition-colors cursor-pointer"
      onClick={() => navigate(`/app/tasks/templates/${template.id}`)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">{template.name}</CardTitle>
          {template.isPublic && <Badge variant="outline" className="text-xs">Public</Badge>}
        </div>
        {template.description && (
          <CardDescription className="line-clamp-2">{template.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex flex-wrap gap-1">
          {template.category && (
            <Badge variant="secondary" className="text-xs">{template.category}</Badge>
          )}
          {tags.slice(0, 3).map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
          ))}
          {tags.length > 3 && (
            <Badge variant="outline" className="text-xs">+{tags.length - 3}</Badge>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(template.updatedAt).toLocaleDateString()}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/app/tasks/templates/${template.id}`); }}>
            <Settings className="h-4 w-4" />
          </Button>
          {onRun && (
            <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); onRun(template.id); }}>
              <Play className="h-4 w-4 mr-1" /> Run
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
