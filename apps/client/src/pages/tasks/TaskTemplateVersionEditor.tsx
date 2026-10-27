import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Save, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PromptEditor } from "@/components/tasks/PromptEditor";
import { InputSchemaBuilder } from "@/components/tasks/InputSchemaBuilder";
import { OutputStyleEditor } from "@/components/tasks/OutputStyleEditor";
import { ToolsConfigurator } from "@/components/tasks/ToolsConfigurator";

export default function TaskTemplateVersionEditor() {
  const params = useParams<{ id: string; versionId: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [inputFields, setInputFields] = useState<any[]>([]);
  const [outputStyle, setOutputStyle] = useState<any>({ format: "markdown", sections: [] });
  const [toolsConfig, setToolsConfig] = useState<any>({
    allowWebSearch: false,
    allowFileRead: true,
    allowCodeExecution: false,
    skills: [],
    tools: [],
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/tasks/versions/${params.versionId}`],
  });

  const version = data?.version;

  useEffect(() => {
    if (version) {
      setSystemPrompt(version.systemPrompt || "");
      setUserPrompt(version.userPrompt || "");
      setChangeNotes(version.changeNotes || "");
      setInputFields(version.inputSchema?.fields || []);
      setOutputStyle(version.outputStyle || { format: "markdown", sections: [] });
      setToolsConfig(
        version.toolsConfig || {
          allowWebSearch: false,
          allowFileRead: true,
          allowCodeExecution: false,
          skills: [],
          tools: [],
        },
      );
    }
  }, [version]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/tasks/versions/${params.versionId}`, {
        systemPrompt,
        userPrompt,
        changeNotes,
        inputSchema: { fields: inputFields },
        outputStyle,
        toolsConfig,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/versions/${params.versionId}`] });
      qc.invalidateQueries({ queryKey: [`/api/tasks/templates/${params.id}/versions`] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      // Save first, then publish
      await apiRequest("PUT", `/api/tasks/versions/${params.versionId}`, {
        systemPrompt,
        userPrompt,
        changeNotes,
        inputSchema: { fields: inputFields },
        outputStyle,
        toolsConfig,
      });
      const res = await apiRequest("POST", `/api/tasks/versions/${params.versionId}/publish`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/tasks/versions/${params.versionId}`] });
      qc.invalidateQueries({ queryKey: [`/api/tasks/templates/${params.id}/versions`] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!version) {
    return <div className="p-6 text-center text-muted-foreground">Version not found</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/app/tasks/templates/${params.id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">Version {version.version}</h1>
            <Badge variant={version.status === "published" ? "default" : "outline"}>
              {version.status}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
          {version.status === "draft" && (
            <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Publish
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="prompts">
        <TabsList>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="inputs">Input Schema</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="output">Output Style</TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <PromptEditor
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="Define the AI agent's role, capabilities, and approach..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">User Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <PromptEditor
                value={userPrompt}
                onChange={setUserPrompt}
                placeholder="The main task prompt with {{variable}} placeholders..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="What changed in this version?"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inputs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Input Fields</CardTitle>
            </CardHeader>
            <CardContent>
              <InputSchemaBuilder fields={inputFields} onChange={setInputFields} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tools & Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <ToolsConfigurator value={toolsConfig} onChange={setToolsConfig} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="output" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Output Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <OutputStyleEditor value={outputStyle} onChange={setOutputStyle} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
