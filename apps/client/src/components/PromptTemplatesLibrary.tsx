import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AuthStorage } from "@/lib/auth-storage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useIsViewer } from "@/hooks/useIsViewer";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  FileText,
  Users,
  Sparkles,
  Copy,
  Check,
  Globe,
  Megaphone,
  Calendar,
  MessageSquare,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface PromptTemplate {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  category: string;
  systemPrompt: string;
  firstMessage: string | null;
  variables: string[] | null;
  suggestedVoiceTone: string | null;
  suggestedPersonality: string | null;
  isSystemTemplate: boolean;
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
}

interface PromptTemplatesLibraryProps {
  onSelectTemplate?: (template: {
    systemPrompt: string;
    firstMessage?: string;
    suggestedVoiceTone?: string;
    suggestedPersonality?: string;
  }) => void;
  mode?: "browse" | "select";
}

const CATEGORIES = [
  {
    value: "all",
    label: "All Templates",
    icon: FileText,
    color: "text-slate-500",
  },
  {
    value: "agent_preset",
    label: "Agent Presets",
    icon: Sparkles,
    color: "text-indigo-500",
  },
  {
    value: "sales",
    label: "Sales",
    icon: Megaphone,
    color: "text-emerald-500",
  },
  { value: "support", label: "Support", icon: Users, color: "text-blue-500" },
  {
    value: "appointment",
    label: "Appointment",
    icon: Calendar,
    color: "text-purple-500",
  },
  {
    value: "survey",
    label: "Survey",
    icon: MessageSquare,
    color: "text-amber-500",
  },
  { value: "general", label: "General", icon: Globe, color: "text-slate-500" },
];

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    agent_preset: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    sales: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    support: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    appointment: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    survey: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    general: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  return colors[category] || colors.general;
};

const ITEMS_PER_PAGE = 6;

export default function PromptTemplatesLibrary({
  onSelectTemplate,
  mode = "browse",
}: PromptTemplatesLibraryProps) {
  const { toast } = useToast();
  const isViewer = useIsViewer();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(
    null,
  );
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<PromptTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] =
    useState<PromptTemplate | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: templates = [], isLoading } = useQuery<PromptTemplate[]>({
    queryKey: ["/api/prompt-templates", selectedCategory],
    queryFn: async () => {
      const url =
        selectedCategory === "all"
          ? "/api/prompt-templates"
          : `/api/prompt-templates?category=${selectedCategory}`;
      const headers: Record<string, string> = {};
      const authHeader = AuthStorage.getAuthHeader();
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<PromptTemplate>) => {
      const res = await apiRequest("POST", "/api/prompt-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-templates"] });
      setCreateDialogOpen(false);
      toast({ title: "Template created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<PromptTemplate>;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/prompt-templates/${id}`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-templates"] });
      setEditingTemplate(null);
      toast({ title: "Template updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/prompt-templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-templates"] });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      toast({ title: "Template deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (template: PromptTemplate) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      deleteMutation.mutate(templateToDelete.id);
    }
  };

  const useMutation_template = useMutation({
    mutationFn: async ({
      id,
      variableValues,
    }: {
      id: string;
      variableValues: Record<string, string>;
    }) => {
      const res = await apiRequest("POST", `/api/prompt-templates/${id}/use`, {
        variableValues,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-templates"] });
      if (onSelectTemplate) {
        onSelectTemplate({
          systemPrompt: data.systemPrompt,
          firstMessage: data.firstMessage || undefined,
          suggestedVoiceTone: data.suggestedVoiceTone || undefined,
          suggestedPersonality: data.suggestedPersonality || undefined,
        });
      }
      setVariableDialogOpen(false);
      setSelectedTemplate(null);
      setVariableValues({});
      toast({ title: "Template applied successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to apply template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTemplates = filteredTemplates.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  // Reset to page 1 when search or category changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  const handleSelectTemplate = (template: PromptTemplate) => {
    if (template.variables && template.variables.length > 0) {
      setSelectedTemplate(template);
      setVariableValues({});
      setVariableDialogOpen(true);
    } else {
      useMutation_template.mutate({ id: template.id, variableValues: {} });
    }
  };

  const getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find((c) => c.value === category);
    return cat?.icon || FileText;
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates by name or description..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 h-11"
            data-testid="input-template-search"
          />
        </div>
        {mode === "browse" && !isViewer && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="h-11 shrink-0"
                data-testid="button-create-template"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
              <div className="flex flex-col flex-1 overflow-hidden">
                <TemplateForm
                  onSubmit={(data) => createMutation.mutate(data)}
                  isLoading={createMutation.isPending}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Category Tabs - Single Row */}
      <Tabs value={selectedCategory} onValueChange={handleCategoryChange}>
        <TabsList className="w-full h-auto p-1 flex flex-nowrap gap-1 bg-muted/50 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <TabsTrigger
              key={cat.value}
              value={cat.value}
              className="flex items-center gap-1.5 px-3 py-1.5 shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              data-testid={`tab-category-${cat.value}`}
            >
              <cat.icon className={`h-3.5 w-3.5 ${cat.color}`} />
              <span className="text-xs font-medium whitespace-nowrap">
                {cat.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <Skeleton className="h-16 w-full rounded" />
                <div className="flex gap-1.5 mt-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardContent>
              <CardFooter className="p-2 border-t">
                <Skeleton className="h-4 w-16" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {searchQuery ? "No templates found" : "No templates available"}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
              {searchQuery
                ? "Try adjusting your search query or browse different categories"
                : "Get started by creating your first prompt template"}
            </p>
            {mode === "browse" && !searchQuery && (
              <Button
                onClick={() => setCreateDialogOpen(true)}
                data-testid="button-create-first-template"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginatedTemplates.map((template) => {
              const CategoryIcon = getCategoryIcon(template.category);
              return (
                <Card
                  key={template.id}
                  className="group overflow-hidden hover-elevate transition-all duration-200"
                  data-testid={`card-template-${template.id}`}
                >
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold leading-tight truncate flex-1">
                        {template.name}
                      </CardTitle>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 font-medium border ${getCategoryColor(template.category)}`}
                        >
                          <CategoryIcon className="h-2.5 w-2.5 mr-0.5" />
                          {template.category}
                        </Badge>
                        {template.isSystemTemplate && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            <Shield className="h-2.5 w-2.5 mr-0.5" />
                            System
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription className="text-xs line-clamp-1 mt-1">
                      {template.description || "No description"}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-3 pt-0">
                    <div className="bg-muted/20 rounded p-2 border border-border/50">
                      <p className="text-[10px] text-muted-foreground font-mono leading-relaxed line-clamp-3">
                        {template.systemPrompt.substring(0, 120)}
                        {template.systemPrompt.length > 120 && "..."}
                      </p>
                    </div>

                    {template.variables && template.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-[10px] text-muted-foreground">
                          Variables:
                        </span>
                        {template.variables.slice(0, 2).map((v) => (
                          <Badge
                            key={v}
                            variant="outline"
                            className="text-[10px] px-1 py-0 font-mono bg-primary/5 border-primary/20 text-primary"
                          >
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                        {template.variables.length > 2 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0"
                          >
                            +{template.variables.length - 2} more
                          </Badge>
                        )}
                      </div>
                    )}

                    {template.suggestedVoiceTone && (
                      <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                        <Sparkles className="h-2.5 w-2.5" />
                        <span className="truncate">
                          {template.suggestedVoiceTone}
                        </span>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="flex justify-between items-center p-2 border-t bg-muted/20">
                    <span className="text-[10px] text-muted-foreground">
                      {template.usageCount}x used
                    </span>
                    <div className="flex gap-0.5">
                      {mode === "select" && onSelectTemplate && (
                        <Button
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => handleSelectTemplate(template)}
                          data-testid={`button-use-template-${template.id}`}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Use
                        </Button>
                      )}
                      {mode === "browse" &&
                        !template.isSystemTemplate &&
                        !isViewer && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditingTemplate(template)}
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(template)}
                              data-testid={`button-delete-template-${template.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      {mode === "browse" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              template.systemPrompt,
                            );
                            toast({ title: "Copied to clipboard" });
                          }}
                          data-testid={`button-copy-template-${template.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-
                {Math.min(
                  startIndex + ITEMS_PER_PAGE,
                  filteredTemplates.length,
                )}{" "}
                of {filteredTemplates.length} templates
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setCurrentPage(page)}
                        data-testid={`button-page-${page}`}
                      >
                        {page}
                      </Button>
                    ),
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Template Dialog */}
      <Dialog
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <div className="flex flex-col flex-1 overflow-hidden">
            {editingTemplate && (
              <TemplateForm
                template={editingTemplate}
                onSubmit={(data) =>
                  updateMutation.mutate({ id: editingTemplate.id, data })
                }
                isLoading={updateMutation.isPending}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Variable Input Dialog */}
      <Dialog open={variableDialogOpen} onOpenChange={setVariableDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Fill in Variables
            </DialogTitle>
            <DialogDescription>
              This template uses variables. Fill in the values below to
              customize the prompt.
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && selectedTemplate.variables && (
            <div className="space-y-4 py-4">
              {selectedTemplate.variables.map((variable) => (
                <div key={variable} className="space-y-2">
                  <Label
                    htmlFor={`var-${variable}`}
                    className="font-mono text-sm font-medium"
                  >
                    {`{{${variable}}}`}
                  </Label>
                  <Input
                    id={`var-${variable}`}
                    placeholder={`Enter ${variable}...`}
                    value={variableValues[variable] || ""}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [variable]: e.target.value,
                      }))
                    }
                    className="h-11"
                    data-testid={`input-variable-${variable}`}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVariableDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedTemplate) {
                  useMutation_template.mutate({
                    id: selectedTemplate.id,
                    variableValues,
                  });
                }
              }}
              disabled={useMutation_template.isPending}
              data-testid="button-apply-template"
            >
              {useMutation_template.isPending
                ? "Applying..."
                : "Apply Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setTemplateToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TemplateFormProps {
  template?: PromptTemplate;
  onSubmit: (data: Partial<PromptTemplate>) => void;
  isLoading?: boolean;
}

function TemplateForm({ template, onSubmit, isLoading }: TemplateFormProps) {
  const [formData, setFormData] = useState({
    name: template?.name || "",
    description: template?.description || "",
    category: template?.category || "general",
    systemPrompt: template?.systemPrompt || "",
    firstMessage: template?.firstMessage || "",
    suggestedVoiceTone: template?.suggestedVoiceTone || "",
    suggestedPersonality: template?.suggestedPersonality || "",
    isPublic: template?.isPublic || false,
  });

  const extractVariables = (text: string) => {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ""))));
  };

  const allVariables = [
    ...extractVariables(formData.systemPrompt),
    ...extractVariables(formData.firstMessage),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col flex-1 overflow-hidden"
    >
      <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
        <DialogTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          {template ? "Edit Template" : "Create New Template"}
        </DialogTitle>
        <DialogDescription>
          Create reusable prompt templates with variable placeholders like{" "}
          {`{{company}}`} or {`{{product}}`}.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-5 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Template Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Sales Pitch Template"
                className="h-11"
                required
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category" className="text-sm font-medium">
                Category
              </Label>
              <Select
                value={formData.category}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, category: v }))
                }
              >
                <SelectTrigger
                  className="h-11"
                  data-testid="select-template-category"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent_preset">
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-500" />
                      Agent Preset
                    </span>
                  </SelectItem>
                  <SelectItem value="sales">
                    <span className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-emerald-500" />
                      Sales
                    </span>
                  </SelectItem>
                  <SelectItem value="support">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      Support
                    </span>
                  </SelectItem>
                  <SelectItem value="appointment">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-purple-500" />
                      Appointment
                    </span>
                  </SelectItem>
                  <SelectItem value="survey">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-amber-500" />
                      Survey
                    </span>
                  </SelectItem>
                  <SelectItem value="general">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-slate-500" />
                      General
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Brief description of what this template is for..."
              className="h-11"
              data-testid="input-template-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemPrompt" className="text-sm font-medium">
              System Prompt
            </Label>
            <p className="text-xs text-muted-foreground">
              Use {`{{variableName}}`} for placeholders that will be filled in
              when using the template.
            </p>
            <Textarea
              id="systemPrompt"
              value={formData.systemPrompt}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  systemPrompt: e.target.value,
                }))
              }
              placeholder={`You are a helpful sales assistant for {{company}}. Your goal is to explain the benefits of {{product}} to potential customers...`}
              rows={8}
              className="font-mono text-sm"
              required
              data-testid="textarea-template-prompt"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstMessage" className="text-sm font-medium">
              First Message (Optional)
            </Label>
            <Textarea
              id="firstMessage"
              value={formData.firstMessage}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  firstMessage: e.target.value,
                }))
              }
              placeholder={`Hello! Welcome to {{company}}. How can I help you today?`}
              rows={3}
              className="font-mono text-sm"
              data-testid="textarea-template-first-message"
            />
          </div>

          {allVariables.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Detected Variables</Label>
              <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg border">
                {allVariables.map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    className="font-mono bg-primary/5 border-primary/20 text-primary"
                  >
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="suggestedVoiceTone"
                className="text-sm font-medium"
              >
                Suggested Voice Tone
              </Label>
              <Input
                id="suggestedVoiceTone"
                value={formData.suggestedVoiceTone}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    suggestedVoiceTone: e.target.value,
                  }))
                }
                placeholder="e.g., Professional, Friendly"
                className="h-11"
                data-testid="input-template-voice-tone"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="suggestedPersonality"
                className="text-sm font-medium"
              >
                Suggested Personality
              </Label>
              <Input
                id="suggestedPersonality"
                value={formData.suggestedPersonality}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    suggestedPersonality: e.target.value,
                  }))
                }
                placeholder="e.g., Enthusiastic, Helpful"
                className="h-11"
                data-testid="input-template-personality"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
            <Switch
              id="isPublic"
              checked={formData.isPublic}
              onCheckedChange={(v) =>
                setFormData((prev) => ({ ...prev, isPublic: v }))
              }
              data-testid="switch-template-public"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor="isPublic"
                className="text-sm font-medium cursor-pointer"
              >
                Make this template public
              </Label>
              <p className="text-xs text-muted-foreground">
                Public templates can be used by other users on the platform
              </p>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="shrink-0 px-6 py-4 border-t">
        <Button
          type="submit"
          disabled={isLoading}
          className="min-w-[120px]"
          data-testid="button-save-template"
        >
          {isLoading
            ? "Saving..."
            : template
              ? "Update Template"
              : "Create Template"}
        </Button>
      </DialogFooter>
    </form>
  );
}
