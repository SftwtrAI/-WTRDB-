import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Sparkles,
  Shield,
  Users,
  Plus,
  Megaphone,
  MessageSquare,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PromptTemplatesLibrary from "@/components/PromptTemplatesLibrary";
import { AuthStorage } from "@/lib/auth-storage";
import { useIsViewer } from "@/hooks/useIsViewer";

interface PromptTemplate {
  id: string;
  userId: string | null;
  name: string;
  category: string;
  isSystemTemplate: boolean;
  isPublic: boolean;
}

export default function PromptTemplates() {
  const { t } = useTranslation();
  const isViewer = useIsViewer();

  const { data: templates = [], isLoading } = useQuery<PromptTemplate[]>({
    queryKey: ["/api/prompt-templates", "all"],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      const authHeader = AuthStorage.getAuthHeader();
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }
      const res = await fetch("/api/prompt-templates", { headers });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const totalTemplates = templates.length;
  const systemTemplates = templates.filter((t) => t.isSystemTemplate).length;
  const userTemplates = templates.filter((t) => !t.isSystemTemplate).length;
  const salesTemplates = templates.filter((t) => t.category === "sales").length;
  const supportTemplates = templates.filter(
    (t) => t.category === "support",
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <h1
              className="text-2xl font-bold tracking-tight"
              data-testid="text-page-title"
            >
              Prompt Templates
            </h1>
            <p className="text-muted-foreground">
              Create and manage reusable AI prompt templates
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border bg-card">
                <CardContent className="p-5">
                  <Skeleton className="h-8 w-12 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card className="border bg-gradient-to-br from-primary/5 to-primary/10 hover-elevate">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="text-3xl font-bold text-primary"
                      data-testid="stat-total-templates"
                    >
                      {totalTemplates}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium">
                      Total Templates
                    </p>
                  </div>
                  <FileText className="h-5 w-5 text-primary/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="border hover-elevate">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="text-3xl font-bold text-blue-400"
                      data-testid="stat-system-templates"
                    >
                      {systemTemplates}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      System
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border hover-elevate">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="text-3xl font-bold text-emerald-400"
                      data-testid="stat-user-templates"
                    >
                      {userTemplates}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Custom
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border hover-elevate">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="text-3xl font-bold text-amber-400"
                      data-testid="stat-sales-templates"
                    >
                      {salesTemplates}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                      <Megaphone className="h-3.5 w-3.5" />
                      Sales
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Info Banner */}
      <div
        className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5"
        data-info-banner
      >
        <Sparkles className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          Use templates to quickly set up agents with pre-configured prompts.
          Add variables like{" "}
          <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">{`{{company}}`}</code>{" "}
          to personalize prompts for each use case.
        </p>
      </div>

      {/* Templates Library */}
      <PromptTemplatesLibrary mode="browse" />
    </div>
  );
}
