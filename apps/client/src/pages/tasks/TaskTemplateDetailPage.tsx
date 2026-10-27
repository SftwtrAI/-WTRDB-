import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Plus, Play, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { VersionTimeline } from "@/components/tasks/VersionTimeline";
import { RunTaskDialog } from "@/components/tasks/RunTaskDialog";
import { ExecutionStatusBadge } from "@/components/tasks/ExecutionStatusBadge";

export default function TaskTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [runOpen, setRunOpen] = useState(false);

  const { data: templateData, isLoading } = useQuery<any>({
    queryKey: [`/api/tasks/templates/${params.id}`],
  });

  const { data: versionsData } = useQuery<any>({
    queryKey: [`/api/tasks/templates/${params.id}/versions`],
  });

  const { data: executionsData } = useQuery<any>({
    queryKey: ["/api/tasks/executions"],
  });

  const template = templateData?.template;
  const versions = versionsData?.versions || [];
  const executions = (executionsData?.executions || []).filter(
    (e: any) => e.templateId === params.id,
  );

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/tasks/templates/${params.id}`, editData);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/templates/${params.id}`] });
      setEditing(false);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tasks/templates/${params.id}/versions`, {
        status: "draft",
        changeNotes: "New version",
      });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/templates/${params.id}/versions`] });
      navigate(`/app/tasks/templates/${params.id}/versions/${data.version.id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!template) {
    return <div className="p-6 text-center text-muted-foreground">Template not found</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app/tasks")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{template.name}</h1>
            {template.description && (
              <p className="text-sm text-muted-foreground">{template.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => createVersionMutation.mutate()}>
            <Plus className="h-4 w-4 mr-1" /> New Version
          </Button>
          <Button onClick={() => setRunOpen(true)}>
            <Play className="h-4 w-4 mr-1" /> Run
          </Button>
        </div>
      </div>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
          <TabsTrigger value="executions">Executions ({executions.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Version History</CardTitle>
              </CardHeader>
              <CardContent>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No versions yet. Create one to get started.</p>
                ) : (
                  <VersionTimeline
                    versions={versions}
                    onSelect={(id) => navigate(`/app/tasks/templates/${params.id}/versions/${id}`)}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Quick Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Category:</span> {template.category || "None"}</div>
                <div><span className="text-muted-foreground">Public:</span> {template.isPublic ? "Yes" : "No"}</div>
                <div><span className="text-muted-foreground">Created:</span> {new Date(template.createdAt).toLocaleDateString()}</div>
                <div><span className="text-muted-foreground">Updated:</span> {new Date(template.updatedAt).toLocaleDateString()}</div>
                {versions.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Published version:</span>{" "}
                    {versions.find((v: any) => v.status === "published")
                      ? `v${versions.find((v: any) => v.status === "published").version}`
                      : "None"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="executions" className="mt-4">
          {executions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No executions yet. Run this template to see results here.
            </div>
          ) : (
            <div className="space-y-2">
              {executions.map((exec: any) => (
                <div
                  key={exec.id}
                  className="flex items-center justify-between p-3 border rounded-md hover:bg-accent/50 cursor-pointer"
                  onClick={() => navigate(`/app/tasks/executions/${exec.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <ExecutionStatusBadge status={exec.status} />
                    <span className="text-sm font-mono">{exec.id.slice(0, 8)}</span>
                    <span className="text-sm text-muted-foreground">{exec.triggeredBy}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(exec.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Template Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  defaultValue={template.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  defaultValue={template.description || ""}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  defaultValue={template.category || ""}
                  onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                  className="mt-1"
                />
              </div>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                <Save className="h-4 w-4 mr-1" /> Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Run Dialog */}
      <RunTaskDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        templateId={params.id!}
        templateName={template.name}
      />
    </div>
  );
}
