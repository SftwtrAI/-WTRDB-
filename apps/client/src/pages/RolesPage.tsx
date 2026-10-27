import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Loader2,
    Plus,
    Shield,
    ShieldCheck,
    Pencil,
    UserCog,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Permission {
    id: string;
    key?: string;
    name: string;
    description: string;
    category: string;
}

interface Role {
    id: string;
    name: string;
    displayName?: string;
    description: string;
    isSystem?: boolean;
    isSystemRole?: boolean;
    permissionIds?: string[];
    userCount?: number;
    priority?: number;
}

interface User {
    id: string;
    name: string;
    email: string;
}

export default function RolesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [selectedRoleId, setSelectedRoleId] = useState<string>("");
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [newRole, setNewRole] = useState({ name: "", description: "" });
    const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
    const [highlightSection, setHighlightSection] = useState<string | null>(null);

    const rolesTableRef = useRef<HTMLDivElement>(null);
    const customRolesRef = useRef<HTMLDivElement>(null);

    // Read highlight param from URL on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const highlight = params.get("highlight");
        if (!highlight) return;

        // Clean up URL without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete("highlight");
        window.history.replaceState({}, "", url.pathname + url.search);

        if (highlight === "create-role") {
            setIsCreateOpen(true);
            setSelectedPermissions(new Set());
        } else if (highlight === "admin-review" || highlight === "compliance-officer") {
            setHighlightSection(highlight);
        }
    }, []);

    // Scroll to and highlight section after data loads
    useEffect(() => {
        if (!highlightSection) return;

        const timer = setTimeout(() => {
            let targetRef: React.RefObject<HTMLDivElement | null> | null = null;
            if (highlightSection === "admin-review") {
                targetRef = rolesTableRef;
            } else if (highlightSection === "compliance-officer") {
                targetRef = customRolesRef;
            }

            if (targetRef?.current) {
                targetRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
                targetRef.current.classList.add("ring-2", "ring-primary", "animate-pulse", "rounded-lg");
                setTimeout(() => {
                    targetRef?.current?.classList.remove("ring-2", "ring-primary", "animate-pulse");
                    setHighlightSection(null);
                }, 3000);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [highlightSection, rolesTableRef.current, customRolesRef.current]);

    const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
        queryKey: ["/api/rbac/roles"],
    });

    const { data: permissions } = useQuery<Permission[]>({
        queryKey: ["/api/rbac/permissions"],
    });

    const { data: users } = useQuery<User[]>({
        queryKey: ["/api/rbac/users"],
        enabled: isAssignOpen,
    });

    const createRoleMutation = useMutation({
        mutationFn: async (data: { name: string; description: string; permissionIds: string[] }) => {
            await apiRequest("POST", "/api/rbac/roles", data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles"] });
            setIsCreateOpen(false);
            setNewRole({ name: "", description: "" });
            setSelectedPermissions(new Set());
            toast({ title: "Role created", description: "The custom role has been created." });
        },
        onError: (error: any) => {
            toast({ title: "Error creating role", description: error.message, variant: "destructive" });
        },
    });

    const updateRoleMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: { name: string; description: string; permissionIds: string[] } }) => {
            await apiRequest("PATCH", `/api/rbac/roles/${id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles"] });
            setEditingRole(null);
            setSelectedPermissions(new Set());
            toast({ title: "Role updated", description: "The role permissions have been updated." });
        },
        onError: (error: any) => {
            toast({ title: "Error updating role", description: error.message, variant: "destructive" });
        },
    });

    const assignRoleMutation = useMutation({
        mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
            await apiRequest("POST", `/api/rbac/user-roles`, { roleId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles"] });
            setIsAssignOpen(false);
            setSelectedRoleId("");
            setSelectedUserId("");
            toast({ title: "Role assigned", description: "The role has been assigned to the user." });
        },
        onError: (error: any) => {
            toast({ title: "Error assigning role", description: error.message, variant: "destructive" });
        },
    });

    // Group permissions by category
    const permissionsByCategory = permissions?.reduce<Record<string, Permission[]>>((acc, perm) => {
        if (!acc[perm.category]) acc[perm.category] = [];
        acc[perm.category].push(perm);
        return acc;
    }, {}) ?? {};

    const togglePermission = (permId: string) => {
        setSelectedPermissions((prev) => {
            const next = new Set(prev);
            if (next.has(permId)) {
                next.delete(permId);
            } else {
                next.add(permId);
            }
            return next;
        });
    };

    const handleCreateRole = () => {
        if (!newRole.name.trim()) return;
        createRoleMutation.mutate({
            name: newRole.name,
            description: newRole.description,
            permissionIds: Array.from(selectedPermissions),
        });
    };

    const handleUpdateRole = () => {
        if (!editingRole) return;
        updateRoleMutation.mutate({
            id: editingRole.id,
            data: {
                name: editingRole.name,
                description: editingRole.description,
                permissionIds: Array.from(selectedPermissions),
            },
        });
    };

    const openEditRole = (role: Role) => {
        setEditingRole(role);
        setSelectedPermissions(new Set(role.permissionIds ?? []));
    };

    const PermissionGrid = () => (
        <ScrollArea className="h-[350px] pr-4">
            <div className="space-y-6">
                {Object.entries(permissionsByCategory).map(([category, perms]) => (
                    <div key={category}>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            {category}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {perms.map((perm) => (
                                <label
                                    key={perm.id}
                                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={selectedPermissions.has(perm.id)}
                                        onCheckedChange={() => togglePermission(perm.id)}
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <p className="text-sm font-medium leading-tight">{perm.name}</p>
                                        <p className="text-xs text-muted-foreground">{perm.description}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
                    <p className="text-muted-foreground">
                        Manage access control with system and custom roles.
                    </p>
                </div>
                <div ref={customRolesRef} className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsAssignOpen(true)}>
                        <UserCog className="mr-2 h-4 w-4" /> Assign Role
                    </Button>
                    <Button onClick={() => { setIsCreateOpen(true); setSelectedPermissions(new Set()); }}>
                        <Plus className="mr-2 h-4 w-4" /> Create Role
                    </Button>
                </div>
            </div>

            {/* Create role dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Create Custom Role</DialogTitle>
                        <DialogDescription>
                            Define a new role with specific permissions.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="role-name">Role Name</Label>
                                <Input
                                    id="role-name"
                                    value={newRole.name}
                                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                                    placeholder="Campaign Manager"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="role-desc">Description</Label>
                                <Input
                                    id="role-desc"
                                    value={newRole.description}
                                    onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                                    placeholder="Can manage campaigns and view analytics"
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Permissions</Label>
                            <PermissionGrid />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateRole} disabled={createRoleMutation.isPending}>
                            {createRoleMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Create Role
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit role dialog */}
            <Dialog open={!!editingRole} onOpenChange={(open) => { if (!open) setEditingRole(null); }}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Edit Role: {editingRole?.name}</DialogTitle>
                        <DialogDescription>
                            Modify the permissions for this role.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <PermissionGrid />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingRole(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleUpdateRole} disabled={updateRoleMutation.isPending}>
                            {updateRoleMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Assign role dialog */}
            <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Assign Role to User</DialogTitle>
                        <DialogDescription>
                            Select a user and the role to assign.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>User</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a user" />
                                </SelectTrigger>
                                <SelectContent>
                                    {users?.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>
                                            {u.name} ({u.email})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Role</Label>
                            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles?.map((r) => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAssignOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (selectedUserId && selectedRoleId) {
                                    assignRoleMutation.mutate({ userId: selectedUserId, roleId: selectedRoleId });
                                }
                            }}
                            disabled={assignRoleMutation.isPending}
                        >
                            {assignRoleMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Assign
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Roles table */}
            {rolesLoading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : !roles?.length ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-semibold">No roles configured</h3>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                            Create custom roles to fine-tune access control for your team.
                        </p>
                        <Button onClick={() => setIsCreateOpen(true)} className="mt-6">
                            <Plus className="mr-2 h-4 w-4" /> Create your first role
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <Card ref={rolesTableRef}>
                    <CardHeader>
                        <CardTitle>All Roles</CardTitle>
                        <CardDescription>
                            System roles are read-only. Custom roles can be edited.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Users</TableHead>
                                    <TableHead className="text-right">Permissions</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {roles.map((role) => (
                                    <TableRow key={role.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                {role.isSystemRole || role.isSystem ? (
                                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                                ) : (
                                                    <Shield className="h-4 w-4 text-muted-foreground" />
                                                )}
                                                {role.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={role.isSystemRole || role.isSystem ? "default" : "secondary"}>
                                                {role.isSystemRole || role.isSystem ? "System" : "Custom"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                                            {role.description}
                                        </TableCell>
                                        <TableCell className="text-right">{role.userCount ?? 0}</TableCell>
                                        <TableCell className="text-right">{role.permissionIds?.length ?? 0}</TableCell>
                                        <TableCell className="text-right">
                                            {!role.isSystemRole || role.isSystem && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditRole(role)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
