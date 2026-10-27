/**
 * REST API Plugin - Admin API Keys Management Module
 * Admin component for viewing and managing all user API keys
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Key,
  Search,
  Trash2,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
} from "lucide-react";

interface AdminApiKey {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  rateLimitWindow: number;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  requestCount: number;
}

interface RateLimitSettings {
  defaultRateLimit: number;
  defaultRateLimitWindow: number;
}

export function AdminApiKeysModule() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingKey, setEditingKey] = useState<AdminApiKey | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [editRateLimit, setEditRateLimit] = useState(100);
  const [editRateLimitWindow, setEditRateLimitWindow] = useState(60);

  const { data: apiKeys = [], isLoading } = useQuery<AdminApiKey[]>({
    queryKey: ["/api/admin/api-keys"],
  });

  const { data: settings } = useQuery<RateLimitSettings>({
    queryKey: ["/api/admin/api-keys/settings"],
  });

  const toggleKeyMutation = useMutation({
    mutationFn: async ({
      keyId,
      isActive,
    }: {
      keyId: string;
      isActive: boolean;
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/api-keys/${keyId}`,
        { isActive },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update key");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: "API key updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRateLimitMutation = useMutation({
    mutationFn: async ({
      keyId,
      rateLimit,
      rateLimitWindow,
    }: {
      keyId: string;
      rateLimit: number;
      rateLimitWindow: number;
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/api-keys/${keyId}`,
        { rateLimit, rateLimitWindow },
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update rate limit");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      setEditingKey(null);
      toast({ title: "Rate limit updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/admin/api-keys/${keyId}`,
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete key");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      setDeleteDialogOpen(false);
      setSelectedKeyId(null);
      toast({ title: "API key deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateDefaultSettingsMutation = useMutation({
    mutationFn: async (data: RateLimitSettings) => {
      const response = await apiRequest(
        "PUT",
        "/api/admin/api-keys/settings",
        data,
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update settings");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/api-keys/settings"],
      });
      toast({ title: "Default settings updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredKeys = apiKeys.filter(
    (key) =>
      key.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      key.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      key.userName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const activeCount = apiKeys.filter((k) => k.isActive).length;
  const totalRequests = apiKeys.reduce(
    (sum, k) => sum + (k.requestCount || 0),
    0,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total API Keys</p>
                <p className="text-2xl font-bold">{apiKeys.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-900 rounded-lg">
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Keys</p>
                <p className="text-2xl font-bold">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-900 rounded-lg">
                <Users className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">
                  {totalRequests.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* API Keys Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                All API Keys
              </CardTitle>
              <CardDescription>
                View and manage API keys across all users
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
                data-testid="input-search-keys"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Key Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeys.map((key) => (
                  <TableRow
                    key={key.id}
                    data-testid={`admin-api-key-${key.id}`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{key.userName}</p>
                        <p className="text-sm text-muted-foreground">
                          {key.userEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{key.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">
                          {key.keyPrefix}...
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={key.isActive}
                          onCheckedChange={(checked) =>
                            toggleKeyMutation.mutate({
                              keyId: key.id,
                              isActive: checked,
                            })
                          }
                        />
                        {key.isActive ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-900 text-green-100"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {key.rateLimit} / {key.rateLimitWindow}s
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(key.lastUsedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingKey(key);
                            setEditRateLimit(key.rateLimit);
                            setEditRateLimitWindow(key.rateLimitWindow);
                          }}
                          data-testid={`button-edit-${key.id}`}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setSelectedKeyId(key.id);
                            setDeleteDialogOpen(true);
                          }}
                          data-testid={`button-admin-delete-${key.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Rate Limit Dialog */}
      <Dialog
        open={!!editingKey}
        onOpenChange={(open) => !open && setEditingKey(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Rate Limit</DialogTitle>
            <DialogDescription>
              Adjust rate limit for &quot;{editingKey?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rate-limit">Requests per Window</Label>
              <Input
                id="rate-limit"
                type="number"
                min={1}
                value={editRateLimit}
                onChange={(e) =>
                  setEditRateLimit(parseInt(e.target.value) || 100)
                }
              />
            </div>
            <div>
              <Label htmlFor="rate-window">Window (seconds)</Label>
              <Input
                id="rate-window"
                type="number"
                min={1}
                value={editRateLimitWindow}
                onChange={(e) =>
                  setEditRateLimitWindow(parseInt(e.target.value) || 60)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editingKey &&
                updateRateLimitMutation.mutate({
                  keyId: editingKey.id,
                  rateLimit: editRateLimit,
                  rateLimitWindow: editRateLimitWindow,
                })
              }
              disabled={updateRateLimitMutation.isPending}
            >
              {updateRateLimitMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this API key and revoke all access
              for the user. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedKeyId && deleteKeyMutation.mutate(selectedKeyId)
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteKeyMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdminApiKeysModule;
