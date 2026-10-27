/**
 * REST API Plugin - API Keys Management Tab
 * User-facing component for managing their API keys
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  ipWhitelist: string[] | null;
  rateLimit: number;
  rateLimitWindow: number;
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  {
    id: "calls:read",
    label: "View Calls",
    description: "Read call history and details",
  },
  {
    id: "calls:write",
    label: "Manage Calls",
    description: "Trigger and control calls",
  },
  {
    id: "campaigns:read",
    label: "View Campaigns",
    description: "Read campaign data",
  },
  {
    id: "campaigns:write",
    label: "Manage Campaigns",
    description: "Create and modify campaigns",
  },
  {
    id: "agents:read",
    label: "View Agents",
    description: "Read agent configurations",
  },
  {
    id: "agents:write",
    label: "Manage Agents",
    description: "Modify agent settings",
  },
  {
    id: "contacts:read",
    label: "View Contacts",
    description: "Read CRM contacts",
  },
  {
    id: "contacts:write",
    label: "Manage Contacts",
    description: "Create and modify contacts",
  },
  {
    id: "credits:read",
    label: "View Credits",
    description: "Check balance and usage",
  },
  {
    id: "webhooks:read",
    label: "View Webhooks",
    description: "Read webhook subscriptions",
  },
  {
    id: "webhooks:write",
    label: "Manage Webhooks",
    description: "Configure webhooks",
  },
  {
    id: "analytics:read",
    label: "View Analytics",
    description: "Access analytics data",
  },
];

export function ApiKeysTab() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "calls:read",
    "credits:read",
  ]);
  const [newKeyIpWhitelist, setNewKeyIpWhitelist] = useState("");

  const { data: apiKeys = [], isLoading } = useQuery<
    { success: boolean; data: ApiKey[] },
    Error,
    ApiKey[]
  >({
    queryKey: ["/api/user/api-keys"],
    select: (response) => response.data || [],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      scopes: string[];
      ipWhitelist?: string[];
    }) => {
      const response = await apiRequest("POST", "/api/user/api-keys", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || error.error || "Failed to create API key",
        );
      }
      return response.json();
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      setNewSecret(response.data?.key || response.key);
      setCreateDialogOpen(false);
      setSecretDialogOpen(true);
      resetForm();
      toast({ title: "API key created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/user/api-keys/${keyId}/regenerate`,
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || error.error || "Failed to regenerate API key",
        );
      }
      return response.json();
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      setNewSecret(response.data?.key || response.key);
      setRegenerateDialogOpen(false);
      setSecretDialogOpen(true);
      toast({ title: "API key regenerated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to regenerate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/user/api-keys/${keyId}`,
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete API key");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/api-keys"] });
      setDeleteDialogOpen(false);
      setSelectedKey(null);
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

  const resetForm = () => {
    setNewKeyName("");
    setNewKeyScopes(["calls:read", "credits:read"]);
    setNewKeyIpWhitelist("");
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast({ title: "Please enter a key name", variant: "destructive" });
      return;
    }
    if (newKeyScopes.length === 0) {
      toast({
        title: "Please select at least one scope",
        variant: "destructive",
      });
      return;
    }

    const ipList = newKeyIpWhitelist.trim()
      ? newKeyIpWhitelist
          .split(",")
          .map((ip) => ip.trim())
          .filter(Boolean)
      : undefined;

    createKeyMutation.mutate({
      name: newKeyName.trim(),
      scopes: newKeyScopes,
      ipWhitelist: ipList,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const toggleScope = (scopeId: string) => {
    setNewKeyScopes((prev) =>
      prev.includes(scopeId)
        ? prev.filter((s) => s !== scopeId)
        : [...prev, scopeId],
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Manage API keys for programmatic access to your account
              </CardDescription>
            </div>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-create-api-key"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create API Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm">
                Create an API key to integrate with external systems
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`api-key-${key.id}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      {key.isActive ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-900 text-green-100"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-mono">{key.keyPrefix}...</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last used: {formatDate(key.lastUsedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap mt-2">
                      {key.scopes.slice(0, 3).map((scope) => (
                        <Badge
                          key={scope}
                          variant="outline"
                          className="text-xs"
                        >
                          {scope}
                        </Badge>
                      ))}
                      {key.scopes.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{key.scopes.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        setSelectedKey(key);
                        setRegenerateDialogOpen(true);
                      }}
                      data-testid={`button-regenerate-${key.id}`}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setSelectedKey(key);
                        setDeleteDialogOpen(true);
                      }}
                      data-testid={`button-delete-${key.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Tips
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Keep your API keys secret. Never share them in public repositories
            or client-side code.
          </p>
          <p>Use IP whitelisting to restrict key usage to known servers.</p>
          <p>Grant only the minimum required permissions (scopes).</p>
          <p>Rotate keys regularly by regenerating them.</p>
          <p>Monitor the "Last used" timestamp for unexpected activity.</p>
        </CardContent>
      </Card>

      {/* Create Key Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production Server"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                data-testid="input-key-name"
              />
            </div>

            <div>
              <Label>Permissions (Scopes)</Label>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto">
                {AVAILABLE_SCOPES.map((scope) => (
                  <div
                    key={scope.id}
                    className="flex items-start gap-2 p-2 border rounded hover-elevate cursor-pointer"
                    onClick={() => toggleScope(scope.id)}
                  >
                    <Checkbox
                      checked={newKeyScopes.includes(scope.id)}
                      onCheckedChange={() => toggleScope(scope.id)}
                    />
                    <div className="text-sm">
                      <p className="font-medium">{scope.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {scope.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="ip-whitelist">IP Whitelist (Optional)</Label>
              <Input
                id="ip-whitelist"
                placeholder="e.g., 192.168.1.1, 10.0.0.0"
                value={newKeyIpWhitelist}
                onChange={(e) => setNewKeyIpWhitelist(e.target.value)}
                data-testid="input-ip-whitelist"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comma-separated IPs. Leave empty to allow all IPs.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={createKeyMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createKeyMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Display Dialog */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Save Your API Key
            </DialogTitle>
            <DialogDescription>
              This is the only time you will see this key. Copy it now and store
              it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm font-mono break-all">
                  {showSecret
                    ? newSecret
                    : newSecret
                      ? newSecret.substring(0, 10) + "..."
                      : ""}
                </code>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => newSecret && copyToClipboard(newSecret)}
                    data-testid="button-copy-secret"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-3 bg-amber-950 border border-amber-800 rounded-lg text-sm text-amber-200">
              <strong>Important:</strong> Store this key in a secure location.
              You will not be able to see it again.
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setSecretDialogOpen(false);
                setNewSecret(null);
                setShowSecret(false);
              }}
            >
              I have Saved My Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Confirmation */}
      <AlertDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate the current key immediately. Any applications
              using it will stop working until you update them with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedKey && regenerateKeyMutation.mutate(selectedKey.id)
              }
              className="bg-amber-600 hover:bg-amber-700"
            >
              {regenerateKeyMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{selectedKey?.name}&quot; and
              revoke all access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedKey && deleteKeyMutation.mutate(selectedKey.id)
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

export default ApiKeysTab;
