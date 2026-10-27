import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Brain, CheckCircle2, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LLMModel {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  tier: "free" | "pro";
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function LLMModelsManagement() {
  const { toast } = useToast();

  const { data: models, isLoading } = useQuery<LLMModel[]>({
    queryKey: ["/api/admin/llm-models"],
  });

  const updateModel = useMutation({
    mutationFn: async ({
      modelId,
      updates,
    }: {
      modelId: string;
      updates: Partial<LLMModel>;
    }) => {
      return apiRequest("PATCH", `/api/admin/llm-models/${modelId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/llm-models"] });
      toast({ title: "Model updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update model",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTierChange = (modelId: string, tier: "free" | "pro") => {
    updateModel.mutate({ modelId, updates: { tier } });
  };

  const handleActiveToggle = (modelId: string, isActive: boolean) => {
    updateModel.mutate({ modelId, updates: { isActive } });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            LLM Model Configuration
          </CardTitle>
          <CardDescription>
            Configure which AI models are available to Free vs Pro users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const freeModels = models?.filter((m) => m.tier === "free") || [];
  const proModels = models?.filter((m) => m.tier === "pro") || [];
  const sortedModels = [...freeModels, ...proModels];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          LLM Model Configuration
        </CardTitle>
        <CardDescription>
          Configure which AI models are available to Free vs Pro users. When
          users downgrade from Pro to Free, their agents will automatically
          switch to Free tier models.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-md">
              <div className="text-sm text-muted-foreground">Total Models</div>
              <div className="text-2xl font-bold">{models?.length || 0}</div>
            </div>
            <div className="p-4 border rounded-md">
              <div className="text-sm text-muted-foreground">Free Tier</div>
              <div className="text-2xl font-bold text-green-600">
                {freeModels.length}
              </div>
            </div>
            <div className="p-4 border rounded-md">
              <div className="text-sm text-muted-foreground">Pro Tier</div>
              <div className="text-2xl font-bold text-blue-600">
                {proModels.length}
              </div>
            </div>
          </div>

          {/* Models table */}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedModels.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No models configured
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedModels.map((model) => (
                    <TableRow
                      key={model.id}
                      data-testid={`row-model-${model.id}`}
                    >
                      <TableCell
                        className="font-medium"
                        data-testid={`text-model-name-${model.id}`}
                      >
                        {model.name}
                      </TableCell>
                      <TableCell
                        data-testid={`text-model-provider-${model.id}`}
                      >
                        {model.provider}
                      </TableCell>
                      <TableCell
                        className="font-mono text-sm text-muted-foreground"
                        data-testid={`text-model-id-${model.id}`}
                      >
                        {model.modelId}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={model.tier}
                          onValueChange={(value: "free" | "pro") =>
                            handleTierChange(model.id, value)
                          }
                          disabled={updateModel.isPending}
                        >
                          <SelectTrigger
                            className="w-32"
                            data-testid={`select-tier-${model.id}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">
                              <Badge
                                variant="secondary"
                                className="text-green-600 border-green-600"
                              >
                                Free
                              </Badge>
                            </SelectItem>
                            <SelectItem value="pro">
                              <Badge
                                variant="secondary"
                                className="text-blue-600 border-blue-600"
                              >
                                Pro
                              </Badge>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {model.isActive ? (
                          <Badge
                            variant="secondary"
                            className="text-green-600 border-green-600"
                            data-testid={`badge-active-${model.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-red-600 border-red-600"
                            data-testid={`badge-inactive-${model.id}`}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={model.isActive}
                          onCheckedChange={(checked) =>
                            handleActiveToggle(model.id, checked)
                          }
                          disabled={updateModel.isPending}
                          data-testid={`switch-active-${model.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <strong>Note:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Free tier users can only access models marked as "Free"</li>
              <li>Pro tier users can access both Free and Pro models</li>
              <li>Inactive models are hidden from all users</li>
              <li>
                When users downgrade to Free, their agents using Pro models will
                automatically switch to gpt-4o-mini
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
