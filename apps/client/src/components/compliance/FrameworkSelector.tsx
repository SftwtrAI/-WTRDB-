import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Search,
  Shield,
  Star,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// --- Types ---

interface RelevanceGuide {
  relevantIf: string;
  notRelevantIf: string;
  recommended: boolean;
}

interface FrameworkItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  relevanceGuide: RelevanceGuide;
}

interface FrameworksResponse {
  frameworks: FrameworkItem[];
  enabledCount: number;
}

// --- Component ---

export default function FrameworkSelector() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // --- Fetch frameworks ---

  const { data, isLoading } = useQuery<FrameworksResponse>({
    queryKey: ["compliance-settings-frameworks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/compliance/settings/frameworks");
      return res.json();
    },
  });

  const frameworks = data?.frameworks ?? [];
  const enabledCount = data?.enabledCount ?? 0;
  const totalCount = frameworks.length;

  // --- Toggle mutation ---

  const toggleMutation = useMutation({
    mutationFn: async ({
      frameworkId,
      enabled,
    }: {
      frameworkId: string;
      enabled: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        "/api/compliance/settings/frameworks/toggle",
        { frameworkId, enabled },
      );
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-settings-frameworks"],
      });
      toast({
        title: variables.enabled ? "Framework enabled" : "Framework disabled",
        description: `${frameworks.find((f) => f.id === variables.frameworkId)?.name ?? variables.frameworkId} has been ${variables.enabled ? "enabled" : "disabled"}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error toggling framework",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // --- Filtering ---

  const lowerSearch = search.toLowerCase();
  const filtered = useMemo(() => {
    if (!lowerSearch) return frameworks;
    return frameworks.filter(
      (fw) =>
        fw.name.toLowerCase().includes(lowerSearch) ||
        fw.description.toLowerCase().includes(lowerSearch) ||
        fw.id.toLowerCase().includes(lowerSearch),
    );
  }, [frameworks, lowerSearch]);

  const enabledFrameworks = filtered.filter((fw) => fw.enabled);
  const availableFrameworks = filtered.filter((fw) => !fw.enabled);
  const recommended = filtered.filter(
    (fw) => fw.relevanceGuide.recommended && !fw.enabled,
  );

  // --- Render ---

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Framework Relevance Selector
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which compliance frameworks are relevant to your organization.
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-sm px-3 py-1 border-primary/30 text-primary shrink-0"
        >
          {enabledCount} of {totalCount} frameworks enabled
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search frameworks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Recommended section */}
      {recommended.length > 0 && !search && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">
              Recommended for You
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommended.map((fw) => (
              <FrameworkCard
                key={fw.id}
                framework={fw}
                isToggling={
                  toggleMutation.isPending &&
                  (toggleMutation.variables as any)?.frameworkId === fw.id
                }
                onToggle={(enabled) =>
                  toggleMutation.mutate({ frameworkId: fw.id, enabled })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enabled Frameworks (left) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold">Enabled Frameworks</h3>
            <Badge variant="secondary" className="text-xs">
              {enabledFrameworks.length}
            </Badge>
          </div>
          <ScrollArea className="h-[520px] pr-2">
            <div className="space-y-3">
              {enabledFrameworks.length === 0 ? (
                <Card className="border-dashed border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                    <Info className="h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No frameworks enabled yet.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Toggle on frameworks from the right panel to get started.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                enabledFrameworks.map((fw) => (
                  <FrameworkCard
                    key={fw.id}
                    framework={fw}
                    isToggling={
                      toggleMutation.isPending &&
                      (toggleMutation.variables as any)?.frameworkId === fw.id
                    }
                    onToggle={(enabled) =>
                      toggleMutation.mutate({ frameworkId: fw.id, enabled })
                    }
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Available Frameworks (right) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Available Frameworks</h3>
            <Badge variant="outline" className="text-xs">
              {availableFrameworks.length}
            </Badge>
          </div>
          <ScrollArea className="h-[520px] pr-2">
            <div className="space-y-3">
              {availableFrameworks.length === 0 ? (
                <Card className="border-dashed border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {search
                        ? "No matching frameworks found."
                        : "All frameworks are enabled!"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                availableFrameworks.map((fw) => (
                  <FrameworkCard
                    key={fw.id}
                    framework={fw}
                    isToggling={
                      toggleMutation.isPending &&
                      (toggleMutation.variables as any)?.frameworkId === fw.id
                    }
                    onToggle={(enabled) =>
                      toggleMutation.mutate({ frameworkId: fw.id, enabled })
                    }
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// --- Framework Card ---

function FrameworkCard({
  framework,
  isToggling,
  onToggle,
}: {
  framework: FrameworkItem;
  isToggling: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <Card
      className={`transition-all duration-200 ${
        framework.enabled
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border/50 bg-card/50"
      }`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {framework.name}
              {framework.relevanceGuide.recommended && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400 shrink-0"
                >
                  Recommended
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs mt-1 line-clamp-1">
              {framework.description}
            </CardDescription>
          </div>
          <div className="shrink-0 pt-0.5">
            {isToggling ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={framework.enabled}
                onCheckedChange={(checked) => onToggle(checked)}
              />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-1.5 text-xs">
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground/80">Relevant if:</span>{" "}
              {framework.relevanceGuide.relevantIf}
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <Info className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground/80">Skip if:</span>{" "}
              {framework.relevanceGuide.notRelevantIf}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
