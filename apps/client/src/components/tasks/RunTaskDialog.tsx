import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Play, Upload, X, FileText, Archive } from "lucide-react";
import { useLocation } from "wouter";
import { AuthStorage } from "@/lib/auth-storage";

interface RunTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
}

export function RunTaskDialog({ open, onOpenChange, templateId, templateName }: RunTaskDialogProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [inputData, setInputData] = useState<Record<string, any>>({});
  const [fileData, setFileData] = useState<Record<string, File[]>>({});
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>("");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: versionsData } = useQuery<any>({
    queryKey: [`/api/tasks/templates/${templateId}/versions`],
    enabled: open,
  });

  const { data: apiKeysData } = useQuery<any>({
    queryKey: ["/api/tasks/api-keys"],
    enabled: open,
  });

  const versions = versionsData?.versions || [];
  const apiKeys = apiKeysData?.apiKeys || [];
  const publishedVersion = versions.find((v: any) => v.status === "published");

  // Get input schema from the selected version
  const selectedVersion = versions.find((v: any) => v.id === (selectedVersionId || publishedVersion?.id));
  const inputSchema = selectedVersion?.inputSchema || publishedVersion?.inputSchema;
  const fields = inputSchema?.fields || [];

  // Pre-populate inputData with schema defaults so unmodified fields are submitted
  useEffect(() => {
    if (fields.length === 0) return;
    setInputData((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const field of fields) {
        if (field.default != null && updated[field.name] == null) {
          updated[field.name] = field.default;
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [fields]);

  const handleFilesSelected = (fieldName: string, newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;
    const filesArray = Array.from(newFiles);
    setFileData((prev) => ({
      ...prev,
      [fieldName]: [...(prev[fieldName] || []), ...filesArray],
    }));
  };

  const removeFile = (fieldName: string, index: number) => {
    setFileData((prev) => ({
      ...prev,
      [fieldName]: (prev[fieldName] || []).filter((_, i) => i !== index),
    }));
  };

  const runMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("templateId", templateId);
      formData.append("versionId", selectedVersionId || publishedVersion?.id || "");
      if (selectedApiKeyId) {
        formData.append("apiKeyId", selectedApiKeyId);
      }
      formData.append("inputData", JSON.stringify(inputData));

      // Append all files grouped by field name
      for (const [fieldName, files] of Object.entries(fileData)) {
        for (const file of files) {
          formData.append(fieldName, file);
        }
      }

      const headers: Record<string, string> = {};
      const authHeader = AuthStorage.getAuthHeader();
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }
      // Do NOT set Content-Type — browser sets it with boundary for FormData

      const res = await fetch("/api/tasks/executions", {
        method: "POST",
        headers,
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Failed to queue execution");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/executions"] });
      onOpenChange(false);
      setInputData({});
      setFileData({});
      navigate(`/app/tasks/executions/${data.execution.id}`);
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run: {templateName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Version selection */}
          <div>
            <Label>Version</Label>
            <Select
              value={selectedVersionId || publishedVersion?.id || ""}
              onValueChange={setSelectedVersionId}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.version} ({v.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API Key selection */}
          <div>
            <Label>API Key</Label>
            <Select value={selectedApiKeyId} onValueChange={setSelectedApiKeyId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select API key" />
              </SelectTrigger>
              <SelectContent>
                {apiKeys.map((k: any) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.label} ({k.provider}) — {k.apiKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {apiKeys.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No API keys configured. <a href="/app/tasks/api-keys" className="underline">Add one</a>
              </p>
            )}
          </div>

          {/* Dynamic input fields */}
          {fields.map((field: any) => (
            <div key={field.name}>
              <Label>
                {field.label || field.name}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}

              {/* File upload (single) */}
              {field.type === "file" && (
                <div className="mt-1 space-y-2">
                  <input
                    type="file"
                    ref={(el) => { fileInputRefs.current[field.name] = el; }}
                    accept={field.accept || undefined}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setFileData((prev) => ({
                          ...prev,
                          [field.name]: [e.target.files![0]],
                        }));
                      }
                    }}
                  />
                  {(!fileData[field.name] || fileData[field.name].length === 0) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => fileInputRefs.current[field.name]?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose file
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{fileData[field.name][0].name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(fileData[field.name][0].size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeFile(field.name, 0)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* File upload (multiple) — also accepts .zip */}
              {field.type === "file[]" && (
                <div className="mt-1 space-y-2">
                  <input
                    type="file"
                    ref={(el) => { fileInputRefs.current[field.name] = el; }}
                    accept={field.accept ? `${field.accept},.zip` : undefined}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFilesSelected(field.name, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    type="file"
                    ref={(el) => { fileInputRefs.current[`${field.name}_zip`] = el; }}
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      handleFilesSelected(field.name, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 border-dashed"
                      onClick={() => fileInputRefs.current[field.name]?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {fileData[field.name]?.length
                        ? `Add more files (${fileData[field.name].length} selected)`
                        : "Choose files"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-dashed"
                      onClick={() => fileInputRefs.current[`${field.name}_zip`]?.click()}
                      title="Upload a ZIP file containing all documents"
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      ZIP
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload individual files or a single .zip containing all documents
                  </p>
                  {fileData[field.name]?.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {fileData[field.name].map((file, idx) => {
                        const isZip = file.name.toLowerCase().endsWith(".zip");
                        return (
                          <div key={`${file.name}-${idx}`} className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                            {isZip ? (
                              <Archive className="h-4 w-4 shrink-0 text-blue-500" />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                                {isZip && " — will be extracted on server"}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => removeFile(field.name, idx)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Select field */}
              {field.type === "select" && field.options && (
                <Select
                  value={inputData[field.name] || field.default || ""}
                  onValueChange={(v) => setInputData({ ...inputData, [field.name]: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt: string) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Textarea field */}
              {(field.type === "textarea" || field.type === "text") && (
                <Textarea
                  className="mt-1"
                  value={inputData[field.name] || ""}
                  onChange={(e) => setInputData({ ...inputData, [field.name]: e.target.value })}
                  placeholder={field.description || field.label}
                />
              )}

              {/* Number field */}
              {field.type === "number" && (
                <Input
                  type="number"
                  className="mt-1"
                  value={inputData[field.name] || field.default || ""}
                  onChange={(e) => setInputData({ ...inputData, [field.name]: parseFloat(e.target.value) })}
                />
              )}

              {/* Boolean field */}
              {field.type === "boolean" && (
                <div className="mt-1">
                  <input
                    type="checkbox"
                    checked={!!inputData[field.name]}
                    onChange={(e) => setInputData({ ...inputData, [field.name]: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">{field.label || field.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !(selectedVersionId || publishedVersion?.id)}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            Run Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
