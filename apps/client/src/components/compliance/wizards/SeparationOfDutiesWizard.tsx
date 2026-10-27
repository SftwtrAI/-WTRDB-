import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ComplianceWizardDialog,
  type WizardStep,
} from "../ComplianceWizardDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  UserPlus,
  ShieldAlert,
  Info,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ════════════════════════════════════════════════════════════════════════════════
// AC.3.017 — Separation of Duties Wizard
// Guides users through creating duty-separated roles and assigning users
// to prevent any single person from controlling an entire critical process.
// ════════════════════════════════════════════════════════════════════════════════

interface Role {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  isSystem?: boolean;
  isSystemRole?: boolean;
  permissionIds?: string[];
}

interface Permission {
  id: string;
  key?: string;
  name: string;
  description: string;
  category: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  organizationId: string;
  scopeTeamId: string | null;
}

interface SeparationOfDutiesWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

// Recommended duty-separated role definitions
const RECOMMENDED_ROLES = [
  {
    name: "policy_author",
    displayName: "Policy Author",
    description:
      "Can create and edit OPA policies and claw configurations, but cannot deploy agents to production. Ensures policy changes are reviewed before deployment.",
    conflictsWith: ["deployer"],
  },
  {
    name: "policy_reviewer",
    displayName: "Policy Reviewer",
    description:
      "Can approve policies and review compliance evidence, but cannot create or edit policies. Provides independent oversight of policy changes.",
    conflictsWith: ["policy_author"],
  },
  {
    name: "deployer",
    displayName: "Deployer",
    description:
      "Can deploy claw agents to production, but cannot modify policies or role assignments. Ensures deployment is a separate responsibility from policy creation.",
    conflictsWith: ["policy_author"],
  },
] as const;

export function SeparationOfDutiesWizard({
  open,
  onOpenChange,
  onComplete,
}: SeparationOfDutiesWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Track which recommended roles have been created
  const [createdRoles, setCreatedRoles] = useState<
    Record<string, string>
  >({});
  // Track user assignments per role
  const [assignments, setAssignments] = useState<
    Record<string, string>
  >({});

  // Fetch existing roles
  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/rbac/roles"],
    enabled: open,
  });

  // Fetch permissions
  const { data: permissions } = useQuery<Permission[]>({
    queryKey: ["/api/rbac/permissions"],
    enabled: open,
  });

  // Fetch users
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/rbac/users"],
    enabled: open,
  });

  // Fetch existing role assignments
  const { data: userRoles } = useQuery<UserRoleAssignment[]>({
    queryKey: ["/api/rbac/user-roles"],
    enabled: open,
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      displayName: string;
      description: string;
    }) => {
      const res = await apiRequest("POST", "/api/rbac/roles", data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rbac/roles"] });
      setCreatedRoles((prev) => ({
        ...prev,
        [variables.name]: data.id,
      }));
      toast({
        title: "Role created",
        description: `"${variables.displayName}" role has been created successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Assign user to role mutation
  const assignRoleMutation = useMutation({
    mutationFn: async (data: { userId: string; roleId: string }) => {
      const res = await apiRequest(
        "POST",
        "/api/rbac/user-roles",
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/rbac/user-roles"],
      });
      toast({
        title: "User assigned",
        description: "Role assignment saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to assign role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Check which recommended roles already exist
  const existingRoleMap = useMemo(() => {
    const map: Record<string, Role> = {};
    if (roles) {
      for (const role of roles) {
        for (const rec of RECOMMENDED_ROLES) {
          if (
            role.name === rec.name ||
            role.displayName?.toLowerCase() === rec.displayName.toLowerCase()
          ) {
            map[rec.name] = role;
          }
        }
      }
    }
    return map;
  }, [roles]);

  // Build the verification matrix: check that no user has conflicting roles
  const conflictMatrix = useMemo(() => {
    if (!userRoles || !roles) return [];

    // Map roleId -> role name
    const roleIdToName: Record<string, string> = {};
    for (const r of roles) {
      roleIdToName[r.id] = r.name;
    }

    // Map userId -> list of role names
    const userRoleNames: Record<string, Set<string>> = {};
    for (const ur of userRoles) {
      if (!userRoleNames[ur.userId]) {
        userRoleNames[ur.userId] = new Set();
      }
      const roleName = roleIdToName[ur.roleId];
      if (roleName) {
        userRoleNames[ur.userId].add(roleName);
      }
    }

    // Check for conflicts
    const conflicts: {
      userId: string;
      userName: string;
      userEmail: string;
      roles: string[];
      conflict: string;
    }[] = [];

    for (const [userId, roleNames] of Object.entries(userRoleNames)) {
      for (const rec of RECOMMENDED_ROLES) {
        if (roleNames.has(rec.name)) {
          for (const conflictRole of rec.conflictsWith) {
            if (roleNames.has(conflictRole)) {
              const user = users?.find((u) => u.id === userId);
              conflicts.push({
                userId,
                userName: user?.name ?? "Unknown",
                userEmail: user?.email ?? "",
                roles: [rec.displayName, RECOMMENDED_ROLES.find((r) => r.name === conflictRole)?.displayName ?? conflictRole],
                conflict: `${rec.displayName} conflicts with ${RECOMMENDED_ROLES.find((r) => r.name === conflictRole)?.displayName ?? conflictRole}`,
              });
            }
          }
        }
      }
    }

    // Deduplicate (A conflicts with B and B conflicts with A)
    const seen = new Set<string>();
    return conflicts.filter((c) => {
      const key = [c.userId, ...c.roles.sort()].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [userRoles, roles, users]);

  // All users with their assigned role names
  const userAssignmentSummary = useMemo(() => {
    if (!users || !userRoles || !roles) return [];

    const roleIdToName: Record<string, string> = {};
    for (const r of roles) {
      roleIdToName[r.id] = r.displayName || r.name;
    }

    return users.map((u) => {
      const assignedRoleIds = userRoles
        .filter((ur) => ur.userId === u.id)
        .map((ur) => ur.roleId);
      const roleNames = assignedRoleIds
        .map((id) => roleIdToName[id])
        .filter(Boolean);
      return {
        ...u,
        roles: roleNames,
        roleIds: assignedRoleIds,
      };
    });
  }, [users, userRoles, roles]);

  const handleCreateRole = (rec: (typeof RECOMMENDED_ROLES)[number]) => {
    createRoleMutation.mutate({
      name: rec.name,
      displayName: rec.displayName,
      description: rec.description,
    });
  };

  const handleAssignUser = (roleName: string) => {
    const userId = assignments[roleName];
    const roleId =
      createdRoles[roleName] || existingRoleMap[roleName]?.id;
    if (!userId || !roleId) return;

    assignRoleMutation.mutate({ userId, roleId });
    setAssignments((prev) => ({ ...prev, [roleName]: "" }));
  };

  // ── Step 1: Why Separation of Duties? ─────────────────────────────────────

  const step1Content = (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">
                What is Separation of Duties?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Separation of duties ensures that no single individual has
                complete control over an entire critical process. By dividing
                responsibilities among multiple people, you create checks
                and balances that prevent both mistakes and malicious
                activity.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-400" />
            Example: Policy Lifecycle
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-xs font-medium text-emerald-400">
                Policy Author
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Creates and edits OPA policies and claw agent
                configurations.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-xs font-medium text-blue-400">
                Policy Reviewer
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Reviews and approves policies before they can be deployed.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50 max-w-xs mx-auto">
            <div className="text-xs font-medium text-amber-400">
              Deployer
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Deploys approved configurations to production. Cannot modify
              what is deployed.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/80">
          <strong>Why it matters:</strong> Without separation of duties, a
          rogue insider can both create a malicious configuration and deploy
          it without oversight. This control requires that the person who
          writes policies is different from the person who deploys them.
        </p>
      </div>
    </div>
  );

  // ── Step 2: Create Duty-Separated Roles ───────────────────────────────────

  const step2Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Create the recommended duty-separated roles below. If a role
        already exists in your organization, it will be shown as created.
      </p>

      {rolesLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {RECOMMENDED_ROLES.map((rec) => {
            const existing = existingRoleMap[rec.name];
            const justCreated = createdRoles[rec.name];
            const isCreated = !!existing || !!justCreated;

            return (
              <Card
                key={rec.name}
                className={
                  isCreated
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border/50"
                }
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold">
                          {rec.displayName}
                        </h4>
                        {isCreated && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-emerald-500/40 text-emerald-400"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                            Created
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rec.description}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        <Badge
                          variant="outline"
                          className="text-[9px] border-amber-500/30 text-amber-400"
                        >
                          <ShieldAlert className="h-2 w-2 mr-0.5" />
                          Conflicts with:{" "}
                          {rec.conflictsWith
                            .map(
                              (c) =>
                                RECOMMENDED_ROLES.find((r) => r.name === c)
                                  ?.displayName ?? c,
                            )
                            .join(", ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {isCreated ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleCreateRole(rec)}
                          disabled={createRoleMutation.isPending}
                        >
                          {createRoleMutation.isPending &&
                          createRoleMutation.variables?.name ===
                            rec.name ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 mr-1" />
                          )}
                          Create Role
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Show existing roles */}
      {roles && roles.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">
            All Current Roles ({roles.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <Badge
                key={role.id}
                variant="outline"
                className="text-[10px]"
              >
                {role.displayName || role.name}
                {(role.isSystem || role.isSystemRole) && (
                  <span className="ml-1 text-muted-foreground">
                    (system)
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Step 3: Assign Users ──────────────────────────────────────────────────

  const step3Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        For each duty-separated role, assign a user. A user should not hold
        conflicting roles (e.g., Policy Author and Deployer).
      </p>

      {RECOMMENDED_ROLES.map((rec) => {
        const roleId =
          createdRoles[rec.name] || existingRoleMap[rec.name]?.id;
        const isAvailable = !!roleId;

        return (
          <Card
            key={rec.name}
            className={!isAvailable ? "opacity-50" : ""}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">
                    {rec.displayName}
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {!isAvailable
                      ? "Create this role first in Step 2"
                      : "Select a user to assign this role"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={assignments[rec.name] || ""}
                    onValueChange={(value) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [rec.name]: value,
                      }))
                    }
                    disabled={!isAvailable}
                  >
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((user) => (
                        <SelectItem
                          key={user.id}
                          value={user.id}
                          className="text-xs"
                        >
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !isAvailable ||
                      !assignments[rec.name] ||
                      assignRoleMutation.isPending
                    }
                    onClick={() => handleAssignUser(rec.name)}
                  >
                    {assignRoleMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <UserPlus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  // ── Step 4: Verify Separation ─────────────────────────────────────────────

  const step4Content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The matrix below shows whether any user holds conflicting roles. A
        compliant configuration has zero conflicts.
      </p>

      {conflictMatrix.length === 0 ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-5 pb-5 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-400">
                No Conflicts Detected
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                No user holds conflicting duty-separated roles. Your
                separation of duties configuration is compliant with
                AC.3.017.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h4 className="text-sm font-semibold text-red-400">
                {conflictMatrix.length} Conflict
                {conflictMatrix.length !== 1 ? "s" : ""} Found
              </h4>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">
                    Conflicting Roles
                  </TableHead>
                  <TableHead className="text-xs">Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflictMatrix.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">
                      <div>
                        <div className="font-medium">{c.userName}</div>
                        <div className="text-muted-foreground">
                          {c.userEmail}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex gap-1">
                        {c.roles.map((r) => (
                          <Badge
                            key={r}
                            variant="outline"
                            className="text-[9px] border-red-500/30 text-red-400"
                          >
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-red-400">
                      {c.conflict}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Full assignment summary */}
      <Card>
        <CardContent className="pt-4">
          <h4 className="text-xs font-semibold mb-3">
            User Role Assignment Summary
          </h4>
          {userAssignmentSummary.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No user data available.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">
                    Assigned Roles
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userAssignmentSummary.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-xs">
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-muted-foreground text-[10px]">
                          {u.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            No custom roles
                          </span>
                        ) : (
                          u.roles.map((r) => (
                            <Badge
                              key={r}
                              variant="outline"
                              className="text-[9px]"
                            >
                              {r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: "why",
      title: "Why Separation of Duties?",
      description: "Understanding the need for duty separation",
      icon: <BookOpen className="h-5 w-5 text-primary" />,
      content: step1Content,
    },
    {
      id: "create-roles",
      title: "Create Duty-Separated Roles",
      description: "Create recommended roles for duty separation",
      icon: <ShieldCheck className="h-5 w-5 text-primary" />,
      content: step2Content,
    },
    {
      id: "assign-users",
      title: "Assign Users",
      description: "Assign users to each duty-separated role",
      icon: <UserPlus className="h-5 w-5 text-primary" />,
      content: step3Content,
    },
    {
      id: "verify",
      title: "Verify Separation",
      description: "Confirm no user holds conflicting roles",
      icon: <Users className="h-5 w-5 text-primary" />,
      content: step4Content,
    },
  ];

  return (
    <ComplianceWizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Separation of Duties"
      description="Create roles that enforce separation of duties across critical processes."
      controlId="AC.3.017"
      steps={steps}
      onComplete={onComplete}
    />
  );
}
