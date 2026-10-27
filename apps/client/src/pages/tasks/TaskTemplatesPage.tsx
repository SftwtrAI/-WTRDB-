import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Search, BrainCircuit } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { TemplateCard } from "@/components/tasks/TemplateCard";
import { RunTaskDialog } from "@/components/tasks/RunTaskDialog";

export default function TaskTemplatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [runTemplateId, setRunTemplateId] = useState<string | null>(null);
  const [runTemplateName, setRunTemplateName] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/tasks/templates"],
  });

  const templates = data?.templates || [];
  const filtered = templates.filter((t: any) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks/templates", {
        name: newName,
        description: newDescription || null,
        category: newCategory || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/templates"] });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNewCategory("");
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BrainCircuit className="h-6 w-6" />
            AI Task Templates
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage reusable AI task templates
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No templates yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first AI task template to get started
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t: any) => (
            <TemplateCard
              key={t.id}
              template={t}
              onRun={(id) => {
                setRunTemplateId(id);
                setRunTemplateName(t.name);
              }}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Bid Estimation"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this template do?"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g., estimation, analysis"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Dialog */}
      {runTemplateId && (
        <RunTaskDialog
          open={!!runTemplateId}
          onOpenChange={(open) => !open && setRunTemplateId(null)}
          templateId={runTemplateId}
          templateName={runTemplateName}
        />
      )}
    </div>
  );
}
