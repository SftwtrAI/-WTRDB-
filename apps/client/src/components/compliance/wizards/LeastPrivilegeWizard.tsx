import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
    ComplianceWizardDialog,
    LearnBox,
    ActionBox,
    type WizardStep,
} from "@/components/compliance/ComplianceWizardDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Lightbulb,
    ShieldCheck,
    Users,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    ArrowDown,
    Crown,
    ShieldAlert,
    UserCog,
    Eye,
    Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ════════════════════════════════════════════════════════════════════════════════
// LeastPrivilegeWizard — AC.2.007
//
// 5-step wizard guiding the user through reviewing and reducing excessive
// privilege assignments to comply with CMMC least-privilege requirements.
// ════════════════════════════════════════════════════════════════════════════════

interface LeastPrivilegeWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
}

// ── Types for API responses ──

interface RbacRole {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    organizationId: string | null;
    permissions: string[];
}

interface UserRoleAssignment {
    id: string;
    userId: string;
    roleId: string;
    organizationId: string;
    scopeTeamId: string | null;
    createdAt: string;
    // Joined fields if available
    userName?: string;
    userEmail?: string;
    roleName?: string;
}

// ── Role icon + color mapping ──

const ROLE_DISPLAY: Record<string, { icon: typeof Crown; color: string; label: string }> = {
    owner: { icon: Crown, color: "text-amber-400", label: "Owner" },
    admin: { icon: ShieldAlert, color: "text-red-400", label: "Admin" },
    "team member": { icon: UserCog, color: "text-blue-400", label: "Team Member" },
    viewer: { icon: Eye, color: "text-muted-foreground", label: "Viewer" },
};

function getRoleDisplay(name: string) {
    const key = name.toLowerCase();
    return ROLE_DISPLAY[key] ?? { icon: Users, color: "text-muted-foreground", label: name };
}

// ── Main component ──

export function LeastPrivilegeWizard({
    open,
    onOpenChange,
    onComplete,
}: LeastPrivilegeWizardProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [, setLocation] = useLocation();
    const [configured, setConfigured] = useState(false);

    // ── Queries ──

    const { data: roles, isLoading: rolesLoading } = useQuery<RbacRole[]>({
        queryKey: ["/api/rbac/roles"],
        enabled: open,
    });

    const { data: userRoles, isLoading: userRolesLoading } = useQuery<UserRoleAssignment[]>({
        queryKey: ["/api/rbac/user-roles"],
        enabled: open,
    });

    // ── Mutation for downgrading a user role ──

    const downgradeMutation = useMutation({
        mutationFn: async ({
            assignmentId,
            userId,
            teamMemberRoleId,
        }: {
            assignmentId: string;
            userId: string;
            teamMemberRoleId: string;
        }) => {
            // Delete the current admin/owner assignment, then create team member
            await apiRequest("DELETE", `/api/rbac/user-roles/${assignmentId}`);
            await apiRequest("POST", "/api/rbac/user-roles", {
                userId,
                roleId: teamMemberRoleId,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rbac/user-roles"] });
            toast({
                title: "Role downgraded",
                description: "User has been downgraded to Team Member.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Downgrade failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // ── Computed data ──

    const roleMap = useMemo(() => {
        const m = new Map<string, RbacRole>();
        roles?.forEach((r) => m.set(r.id, r));
        return m;
    }, [roles]);

    const teamMemberRole = useMemo(
        () => roles?.find((r) => r.name.toLowerCase() === "team member"),
        [roles],
    );

    // Count users per role
    const roleDistribution = useMemo(() => {
        const dist: Record<string, { name: string; count: number }> = {};
        userRoles?.forEach((ur) => {
            const role = roleMap.get(ur.roleId);
            const name = role?.name ?? "Unknown";
            if (!dist[ur.roleId]) {
                dist[ur.roleId] = { name, count: 0 };
            }
            dist[ur.roleId].count++;
        });
        return Object.entries(dist)
            .map(([roleId, { name, count }]) => ({ roleId, name, count }))
            .sort((a, b) => b.count - a.count);
    }, [userRoles, roleMap]);

    const totalUsers = useMemo(
        () => roleDistribution.reduce((sum, r) => sum + r.count, 0),
        [roleDistribution],
    );

    // Find privileged users (admin + owner)
    const privilegedAssignments = useMemo(() => {
        return (
            userRoles?.filter((ur) => {
                const role = roleMap.get(ur.roleId);
                if (!role) return false;
                const name = role.name.toLowerCase();
                return name === "admin" || name === "owner";
            }) ?? []
        );
    }, [userRoles, roleMap]);

    const adminPercent = totalUsers > 0
        ? Math.round((privilegedAssignments.length / totalUsers) * 100)
        : 0;

    const hasExcessivePrivilege = adminPercent > 30;

    // ── Handlers ──

    const handleDowngrade = useCallback(
        (assignment: UserRoleAssignment) => {
            if (!teamMemberRole) {
                toast({
                    title: "No Team Member role found",
                    description: "Cannot downgrade: the Team Member system role is missing.",
                    variant: "destructive",
                });
                return;
            }
            downgradeMutation.mutate({
                assignmentId: assignment.id,
                userId: assignment.userId,
                teamMemberRoleId: teamMemberRole.id,
            });
        },
        [teamMemberRole, downgradeMutation, toast],
    );

    const handleGoToTeams = useCallback(() => {
        setLocation("/app/teams?highlight=create-team");
        onOpenChange(false);
    }, [setLocation, onOpenChange]);

    // ── Loading state ──

    const isLoading = rolesLoading || userRolesLoading;

    // ── Steps ──

    const steps: WizardStep[] = [
        // Step 1: Understanding Least Privilege
        {
            id: "learn",
            title: "Understanding Least Privilege",
            description: "Learn what this control requires",
            variant: "learn",
            icon: <Lightbulb className="h-3 w-3 text-amber-400" />,
            content: (
                <div className="space-y-4">
                    <LearnBox>
                        <p className="font-medium text-foreground mb-2">
                            What is the Principle of Least Privilege?
                        </p>
                        <p>
                            Each user should have <strong>only the minimum level of access</strong> needed
                            to perform their job. Admin privileges should be reserved for those who truly
                            need them.
                        </p>
                    </LearnBox>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Crown className="h-4 w-4 text-amber-400" />
                                Owner
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Full access to everything. Limit to 1-2 people (company founders / CTO).
                            </p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <ShieldAlert className="h-4 w-4 text-red-400" />
                                Admin
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Manage settings and users. Limit to essential staff only.
                            </p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <UserCog className="h-4 w-4 text-blue-400" />
                                Team Member
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Standard day-to-day operations. <strong>Most users should be here.</strong>
                            </p>
                        </div>
                        <div className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                Viewer
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Read-only access for auditors, stakeholders, and observers.
                            </p>
                        </div>
                    </div>

                    <ActionBox variant="info">
                        <p>
                            <strong>Why it matters:</strong> Excessive privileges mean a single compromised
                            account can cause maximum damage across the entire platform. By restricting
                            access, you limit the blast radius of any security incident.
                        </p>
                    </ActionBox>
                </div>
            ),
        },

        // Step 2: Current Role Distribution
        {
            id: "distribution",
            title: "Current Role Distribution",
            description: "Review how users are distributed across roles",
            variant: "action",
            icon: <Users className="h-3 w-3 text-orange-400" />,
            content: (
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Loading role data...
                        </div>
                    ) : roleDistribution.length === 0 ? (
                        <ActionBox variant="warning">
                            <p>
                                No role assignments found. This may mean RBAC has not been initialized yet.
                                Go to <strong>Roles &amp; Access</strong> to set up roles first.
                            </p>
                        </ActionBox>
                    ) : (
                        <>
                            {/* Bar chart visualization */}
                            <div className="rounded-lg border p-4 space-y-3">
                                <h4 className="text-sm font-medium">Users per Role</h4>
                                <div className="space-y-2">
                                    {roleDistribution.map((rd) => {
                                        const pct = totalUsers > 0 ? (rd.count / totalUsers) * 100 : 0;
                                        const display = getRoleDisplay(rd.name);
                                        const RoleIcon = display.icon;
                                        return (
                                            <div key={rd.roleId} className="space-y-1">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="flex items-center gap-1.5">
                                                        <RoleIcon className={`h-3 w-3 ${display.color}`} />
                                                        {display.label}
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        {rd.count} user{rd.count !== 1 ? "s" : ""} ({Math.round(pct)}%)
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${
                                                            rd.name.toLowerCase() === "owner" || rd.name.toLowerCase() === "admin"
                                                                ? "bg-red-500/70"
                                                                : "bg-primary/70"
                                                        }`}
                                                        style={{ width: `${Math.max(pct, 2)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Warning if excessive privilege */}
                            {hasExcessivePrivilege ? (
                                <ActionBox variant="warning">
                                    <p>
                                        <strong>Warning:</strong> {adminPercent}% of your users have
                                        Admin or Owner privileges. CMMC recommends keeping this under 30%.
                                        Review and downgrade users in the next step.
                                    </p>
                                </ActionBox>
                            ) : (
                                <ActionBox variant="success">
                                    <p>
                                        {adminPercent}% of your users have Admin or Owner privileges.
                                        This is within the recommended threshold.
                                    </p>
                                </ActionBox>
                            )}
                        </>
                    )}
                </div>
            ),
        },

        // Step 3: Review Admin Users
        {
            id: "review-admins",
            title: "Review Admin Users",
            description: "Downgrade users who don't need elevated access",
            variant: "action",
            icon: <ShieldAlert className="h-3 w-3 text-red-400" />,
            content: (
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Loading...
                        </div>
                    ) : privilegedAssignments.length === 0 ? (
                        <ActionBox variant="success">
                            <p>No users with Admin or Owner roles found. You are already following least privilege.</p>
                        </ActionBox>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground">
                                The following users have elevated privileges. For each, decide whether they
                                truly need Admin/Owner access or can be downgraded to Team Member.
                            </p>

                            <div className="rounded-lg border overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-xs">User</TableHead>
                                            <TableHead className="text-xs">Current Role</TableHead>
                                            <TableHead className="text-xs text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {privilegedAssignments.map((assignment) => {
                                            const role = roleMap.get(assignment.roleId);
                                            const roleName = role?.name ?? "Unknown";
                                            const display = getRoleDisplay(roleName);
                                            const RoleIcon = display.icon;
                                            return (
                                                <TableRow key={assignment.id}>
                                                    <TableCell className="text-sm">
                                                        <div>
                                                            <p className="font-medium">
                                                                {assignment.userName ?? `User ${assignment.userId.slice(0, 8)}...`}
                                                            </p>
                                                            {assignment.userEmail && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    {assignment.userEmail}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className="gap-1 text-xs"
                                                        >
                                                            <RoleIcon className={`h-3 w-3 ${display.color}`} />
                                                            {display.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs gap-1"
                                                            onClick={() => handleDowngrade(assignment)}
                                                            disabled={downgradeMutation.isPending}
                                                        >
                                                            {downgradeMutation.isPending ? (
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <ArrowDown className="h-3 w-3" />
                                                            )}
                                                            Downgrade to Team Member
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>

                            <LearnBox>
                                <p>
                                    <strong>Tip:</strong> Keep at least 1 Owner for account recovery. You can
                                    always re-elevate a user later if their responsibilities change.
                                </p>
                            </LearnBox>
                        </>
                    )}
                </div>
            ),
        },

        // Step 4: Enable Team Scoping
        {
            id: "team-scoping",
            title: "Enable Team Scoping",
            description: "Restrict users to only their team's resources",
            variant: "learn",
            icon: <Users className="h-3 w-3 text-blue-400" />,
            content: (
                <div className="space-y-4">
                    <LearnBox>
                        <p className="font-medium text-foreground mb-2">What is Team-Based Access?</p>
                        <p>
                            Instead of giving every user org-wide access, assign them to specific teams.
                            Each user will then only see their team's claws, policies, and data -- reducing
                            the blast radius of a compromised account.
                        </p>
                    </LearnBox>

                    <div className="rounded-lg border p-4 space-y-3">
                        <h4 className="text-sm font-medium">How to set up team scoping:</h4>
                        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                            <li>Go to <strong>Teams</strong> and create teams for each department or project.</li>
                            <li>Assign users to their relevant teams.</li>
                            <li>When assigning roles, scope them to a specific team instead of org-wide.</li>
                            <li>Users will only see resources belonging to their team(s).</li>
                        </ol>
                    </div>

                    <Button
                        className="w-full gap-2"
                        variant="outline"
                        onClick={handleGoToTeams}
                    >
                        <ArrowRight className="h-4 w-4" />
                        Go to Teams Settings
                    </Button>

                    <ActionBox variant="info">
                        <p>
                            Team scoping is optional but strongly recommended for organizations with
                            more than 10 users. It ensures each user can only access claws, policies,
                            and data relevant to their team.
                        </p>
                    </ActionBox>
                </div>
            ),
        },

        // Step 5: Confirmation
        {
            id: "confirmation",
            title: "Confirmation",
            description: "Verify your configuration and mark as complete",
            variant: "action",
            icon: <CheckCircle2 className="h-3 w-3 text-emerald-400" />,
            content: (
                <div className="space-y-4">
                    <ActionBox variant="success">
                        <p className="font-medium text-foreground mb-1">Least Privilege Review Complete</p>
                        <p>
                            You have reviewed your organization's role distribution and taken steps to
                            ensure least privilege is enforced.
                        </p>
                    </ActionBox>

                    {/* Summary of current state */}
                    <div className="rounded-lg border p-4 space-y-3">
                        <h4 className="text-sm font-medium">Current State Summary</h4>

                        {isLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading...
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {roleDistribution.map((rd) => {
                                    const display = getRoleDisplay(rd.name);
                                    const RoleIcon = display.icon;
                                    return (
                                        <div key={rd.roleId} className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <RoleIcon className={`h-3.5 w-3.5 ${display.color}`} />
                                                {display.label}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {rd.count} user{rd.count !== 1 ? "s" : ""}
                                            </span>
                                        </div>
                                    );
                                })}
                                <div className="border-t pt-2 mt-2 flex items-center justify-between text-sm font-medium">
                                    <span>Privileged user ratio</span>
                                    <Badge
                                        variant={hasExcessivePrivilege ? "destructive" : "default"}
                                        className="text-xs"
                                    >
                                        {adminPercent}%
                                    </Badge>
                                </div>
                            </div>
                        )}
                    </div>

                    <LearnBox>
                        <p>
                            <strong>Next steps:</strong> Schedule a quarterly review of role assignments
                            to ensure least privilege is maintained as your team grows. Use the compliance
                            dashboard to track this control's status over time.
                        </p>
                    </LearnBox>

                    {configured ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Marked as configured
                        </div>
                    ) : (
                        <Button
                            className="w-full gap-2"
                            onClick={() => setConfigured(true)}
                        >
                            <ShieldCheck className="h-4 w-4" />
                            Mark AC.2.007 as Configured
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <ComplianceWizardDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Employ Least Privilege"
            description="CMMC AC.2.007 -- Review and enforce minimum necessary access for all users"
            controlId="AC.2.007"
            steps={steps}
            onComplete={onComplete}
        />
    );
}
