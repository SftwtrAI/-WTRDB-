import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Pagination } from "@/components/Pagination";
import {
  Loader2,
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Ban,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";

interface BannedWord {
  id: string;
  word: string;
  category: string;
  severity: string;
  isActive: boolean;
  autoBlock: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

type Category =
  | "profanity"
  | "harassment"
  | "hate_speech"
  | "threats"
  | "general";
type Severity = "low" | "medium" | "high" | "critical";

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "profanity", label: "Profanity" },
  { value: "threats", label: "Threats" },
  { value: "hate_speech", label: "Discrimination" },
  { value: "general", label: "Other" },
];

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  medium: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  high: "bg-red-500/10 text-red-700 border-red-500/30",
  critical: "bg-red-700/20 text-red-800 border-red-700/50",
};

const CATEGORY_LABELS: Record<string, string> = {
  harassment: "Harassment",
  profanity: "Profanity",
  threats: "Threats",
  hate_speech: "Discrimination",
  general: "Other",
};

interface FormData {
  word: string;
  category: Category;
  severity: Severity;
  autoBlock: boolean;
  isActive: boolean;
}

const defaultFormData: FormData = {
  word: "",
  category: "general",
  severity: "medium",
  autoBlock: false,
  isActive: true,
};

export default function BannedWordsManagement() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedWord, setSelectedWord] = useState<BannedWord | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);

  const { data: bannedWords, isLoading } = useQuery<BannedWord[]>({
    queryKey: ["/api/admin/banned-words"],
  });

  const paginatedWords =
    bannedWords?.slice((page - 1) * pageSize, page * pageSize) || [];
  const totalPages = Math.ceil((bannedWords?.length || 0) / pageSize);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("POST", "/api/admin/banned-words", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banned-words"] });
      toast({ title: "Banned word added successfully" });
      setShowAddDialog(false);
      setFormData(defaultFormData);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add banned word",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<FormData>;
    }) => {
      return apiRequest("PATCH", `/api/admin/banned-words/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banned-words"] });
      toast({ title: "Banned word updated successfully" });
      setShowEditDialog(false);
      setSelectedWord(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update banned word",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/banned-words/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banned-words"] });
      toast({ title: "Banned word deleted successfully" });
      setShowDeleteDialog(false);
      setSelectedWord(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete banned word",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const scanAllCallsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/banned-words/scan-all-calls",
      );
      return res.json();
    },
    onSuccess: (data: { callsScanned: number; violationsFound: number }) => {
      toast({
        title: "Scan completed",
        description: `Scanned ${data.callsScanned} calls, found ${data.violationsFound} violations.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calls"] });
    },
    onError: (error: any) => {
      toast({
        title: "Scan failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAdd = () => {
    setFormData(defaultFormData);
    setShowAddDialog(true);
  };

  const handleEdit = (word: BannedWord) => {
    setSelectedWord(word);
    setFormData({
      word: word.word,
      category: word.category as Category,
      severity: word.severity as Severity,
      autoBlock: word.autoBlock,
      isActive: word.isActive,
    });
    setShowEditDialog(true);
  };

  const handleDelete = (word: BannedWord) => {
    setSelectedWord(word);
    setShowDeleteDialog(true);
  };

  const handleToggleActive = (word: BannedWord) => {
    updateMutation.mutate({
      id: word.id,
      updates: { isActive: !word.isActive },
    });
  };

  const handleToggleAutoBlock = (word: BannedWord) => {
    updateMutation.mutate({
      id: word.id,
      updates: { autoBlock: !word.autoBlock },
    });
  };

  const handleSubmitAdd = () => {
    createMutation.mutate({
      word: formData.word,
      category: formData.category,
      severity: formData.severity,
      autoBlock: formData.autoBlock,
      isActive: formData.isActive,
    });
  };

  const handleSubmitEdit = () => {
    if (!selectedWord) return;
    updateMutation.mutate({
      id: selectedWord.id,
      updates: formData,
    });
  };

  const handleConfirmDelete = () => {
    if (!selectedWord) return;
    deleteMutation.mutate(selectedWord.id);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Banned Words Management
          </CardTitle>
          <CardDescription>
            Configure words that trigger violation detection in call transcripts
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

  const activeCount = bannedWords?.filter((w) => w.isActive).length || 0;
  const autoBlockCount = bannedWords?.filter((w) => w.autoBlock).length || 0;
  const criticalCount =
    bannedWords?.filter((w) => w.severity === "critical").length || 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Banned Words Management
              </CardTitle>
              <CardDescription>
                Configure words that trigger violation detection in call
                transcripts
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => scanAllCallsMutation.mutate()}
                disabled={scanAllCallsMutation.isPending}
                data-testid="button-scan-all-calls"
              >
                {scanAllCallsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Scan All Calls
              </Button>
              <Button onClick={handleAdd} data-testid="button-add-banned-word">
                <Plus className="h-4 w-4 mr-2" />
                Add Banned Word
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-md">
                <div className="text-sm text-muted-foreground">Total Words</div>
                <div
                  className="text-2xl font-bold"
                  data-testid="text-total-count"
                >
                  {bannedWords?.length || 0}
                </div>
              </div>
              <div className="p-4 border rounded-md">
                <div className="text-sm text-muted-foreground">Active</div>
                <div
                  className="text-2xl font-bold text-green-600"
                  data-testid="text-active-count"
                >
                  {activeCount}
                </div>
              </div>
              <div className="p-4 border rounded-md">
                <div className="text-sm text-muted-foreground">Auto-Block</div>
                <div
                  className="text-2xl font-bold text-orange-600"
                  data-testid="text-autoblock-count"
                >
                  {autoBlockCount}
                </div>
              </div>
              <div className="p-4 border rounded-md">
                <div className="text-sm text-muted-foreground">Critical</div>
                <div
                  className="text-2xl font-bold text-red-600"
                  data-testid="text-critical-count"
                >
                  {criticalCount}
                </div>
              </div>
            </div>

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Word</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Auto-Block</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedWords.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        No banned words configured. Add words to enable
                        violation detection.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedWords.map((word) => (
                      <TableRow
                        key={word.id}
                        data-testid={`row-banned-word-${word.id}`}
                      >
                        <TableCell
                          className="font-medium"
                          data-testid={`text-word-${word.id}`}
                        >
                          {word.word}
                        </TableCell>
                        <TableCell data-testid={`text-category-${word.id}`}>
                          <Badge variant="outline">
                            {CATEGORY_LABELS[word.category] || word.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={SEVERITY_COLORS[word.severity] || ""}
                            data-testid={`badge-severity-${word.id}`}
                          >
                            {word.severity.charAt(0).toUpperCase() +
                              word.severity.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={word.autoBlock}
                            onCheckedChange={() => handleToggleAutoBlock(word)}
                            disabled={updateMutation.isPending}
                            data-testid={`switch-autoblock-${word.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={word.isActive}
                            onCheckedChange={() => handleToggleActive(word)}
                            disabled={updateMutation.isPending}
                            data-testid={`switch-active-${word.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEdit(word)}
                              data-testid={`button-edit-${word.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(word)}
                              data-testid={`button-delete-${word.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalItems={bannedWords?.length || 0}
              />
            )}

            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <strong>Note:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  Words marked as <strong>Active</strong> will be detected in
                  call transcripts
                </li>
                <li>
                  <strong>Auto-Block</strong> will automatically block users
                  when the word is detected
                </li>
                <li>
                  <strong>Critical</strong> severity words are flagged for
                  immediate review
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Banned Word
            </DialogTitle>
            <DialogDescription>
              Add a new word to the banned words list for violation detection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-word">Word or Phrase</Label>
              <Input
                id="add-word"
                placeholder="Enter word or phrase..."
                value={formData.word}
                onChange={(e) =>
                  setFormData({ ...formData, word: e.target.value })
                }
                data-testid="input-word"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value: Category) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger id="add-category" data-testid="select-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-severity">Severity</Label>
              <Select
                value={formData.severity}
                onValueChange={(value: Severity) =>
                  setFormData({ ...formData, severity: value })
                }
              >
                <SelectTrigger id="add-severity" data-testid="select-severity">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <Badge
                        variant="outline"
                        className={SEVERITY_COLORS[option.value]}
                      >
                        {option.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="add-autoblock"
                checked={formData.autoBlock}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, autoBlock: checked as boolean })
                }
                data-testid="checkbox-autoblock"
              />
              <Label htmlFor="add-autoblock" className="text-sm">
                <span className="flex items-center gap-2">
                  <Ban className="h-4 w-4 text-orange-600" />
                  Auto-block users when this word is detected
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              data-testid="button-cancel-add"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAdd}
              disabled={!formData.word.trim() || createMutation.isPending}
              data-testid="button-submit-add"
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Add Word
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Banned Word
            </DialogTitle>
            <DialogDescription>
              Update the banned word settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-word">Word or Phrase</Label>
              <Input
                id="edit-word"
                placeholder="Enter word or phrase..."
                value={formData.word}
                onChange={(e) =>
                  setFormData({ ...formData, word: e.target.value })
                }
                data-testid="input-edit-word"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value: Category) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger
                  id="edit-category"
                  data-testid="select-edit-category"
                >
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-severity">Severity</Label>
              <Select
                value={formData.severity}
                onValueChange={(value: Severity) =>
                  setFormData({ ...formData, severity: value })
                }
              >
                <SelectTrigger
                  id="edit-severity"
                  data-testid="select-edit-severity"
                >
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <Badge
                        variant="outline"
                        className={SEVERITY_COLORS[option.value]}
                      >
                        {option.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-autoblock"
                checked={formData.autoBlock}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, autoBlock: checked as boolean })
                }
                data-testid="checkbox-edit-autoblock"
              />
              <Label htmlFor="edit-autoblock" className="text-sm">
                <span className="flex items-center gap-2">
                  <Ban className="h-4 w-4 text-orange-600" />
                  Auto-block users when this word is detected
                </span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked as boolean })
                }
                data-testid="checkbox-edit-active"
              />
              <Label htmlFor="edit-active" className="text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Active (detect this word in transcripts)
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEdit}
              disabled={!formData.word.trim() || updateMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Banned Word
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedWord?.word}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
