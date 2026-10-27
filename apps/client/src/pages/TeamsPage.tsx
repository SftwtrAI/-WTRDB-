import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Loader2,
    Plus,
    Users,
    ChevronRight,
    ChevronDown,
    UserPlus,
    UserMinus,
    FolderTree,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface Team {
    id: string;
    name: string;
    description: string;
    parentId: string | null;
    memberCount: number;
    children?: Team[];
    members?: TeamMember[];
}

export default function TeamsPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [newTeam, setNewTeam] = useState({ name: "", description: "", parentId: "" });
    const [newMemberEmail, setNewMemberEmail] = useState("");
    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
    const [highlightSection, setHighlightSection] = useState<string | null>(null);

    const teamsListRef = useRef<HTMLDivElement>(null);

    // Read highlight param from URL on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const highlight = params.get("highlight");
        if (!highlight) return;

        // Clean up URL without reloading
        const url = new URL(window.location.href);
        url.searchParams.delete("highlight");
        window.history.replaceState({}, "", url.pathname + url.search);

        if (highlight === "create-team") {
            setIsCreateOpen(true);
        } else if (highlight === "create-ir-team") {
            setNewTeam({ name: "Incident Response", description: "Incident response team responsible for security event handling and remediation", parentId: "" });
            setIsCreateOpen(true);
        } else if (highlight === "team-scoping") {
            setHighlightSection("team-scoping");
        }
    }, []);

    // Scroll to and highlight teams list after data loads
    useEffect(() => {
        if (highlightSection !== "team-scoping") return;

        const timer = setTimeout(() => {
            if (teamsListRef.current) {
                teamsListRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
                teamsListRef.current.classList.add("ring-2", "ring-primary", "animate-pulse", "rounded-lg");
                setTimeout(() => {
                    teamsListRef.current?.classList.remove("ring-2", "ring-primary", "animate-pulse");
                    setHighlightSection(null);
                }, 3000);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [highlightSection, teamsListRef.current]);

    const { data: teams, isLoading } = useQuery<Team[]>({
        queryKey: ["/api/rbac/teams"],
    });

    const { data: selectedTeam } = useQuery<Team>({
        queryKey: ["/api/rbac/teams", selectedTeamId],
        enabled: !!selectedTeamId,
    });

    const createTeamMutation = useMutation({
        mutationFn: async (data: { name: string; description: string; parentId?: string }) => {
            await apiRequest("POST", "/api/rbac/teams", data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rbac/teams"] });
            setIsCreateOpen(false);
            setNewTeam({ name: "", description: "", parentId: "" });
            toast({ title: "Team created", description: "The new team has been created." });
        },
        onError: (error: any) => {
            toast({ title: "Error creating team", description: error.message, variant: "destructive" });
        },
    });

    const addMemberMutation = useMutation({
        mutationFn: async ({ teamId, email }: { teamId: string; email: string }) => {
            await apiRequest("POST", `/api/rbac/teams/${teamId}/members`, { email });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rbac/teams"] });
            setIsAddMemberOpen(false);
            setNewMemberEmail("");
            toast({ title: "Member added", description: "The member has been added to the team." });
        },
        onError: (error: any) => {
            toast({ title: "Error adding member", description: error.message, variant: "destructive" });
        },
    });

    const removeMemberMutation = useMutation({
        mutationFn: async ({ teamId, memberId }: { teamId: string; memberId: string }) => {
            await apiRequest("DELETE", `/api/rbac/teams/${teamId}/members/${memberId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/rbac/teams"] });
            toast({ title: "Member removed", description: "The member has been removed from the team." });
        },
        onError: (error: any) => {
            toast({ title: "Error removing member", description: error.message, variant: "destructive" });
        },
    });

    const toggleExpand = (teamId: string) => {
        setExpandedTeams((prev) => {
            const next = new Set(prev);
            if (next.has(teamId)) {
                next.delete(teamId);
            } else {
                next.add(teamId);
            }
            return next;
        });
    };

    const handleCreateTeam = () => {
        if (!newTeam.name.trim()) return;
        const payload: { name: string; description: string; parentId?: string } = {
            name: newTeam.name,
            description: newTeam.description,
        };
        if (newTeam.parentId) payload.parentId = newTeam.parentId;
        createTeamMutation.mutate(payload);
    };

    // Flatten teams into a list for parent selection
    const flattenTeams = (items: Team[] | undefined): { id: string; name: string; depth: number }[] => {
        const result: { id: string; name: string; depth: number }[] = [];
        const walk = (list: Team[], depth: number) => {
            for (const t of list) {
                result.push({ id: t.id, name: t.name, depth });
                if (t.children?.length) walk(t.children, depth + 1);
            }
        };
        if (items) walk(items, 0);
        return result;
    };

    const renderTeamNode = (team: Team, depth: number = 0) => {
        const isExpanded = expandedTeams.has(team.id);
        const isSelected = selectedTeamId === team.id;
        const hasChildren = team.children && team.children.length > 0;

        return (
            <div key={team.id}>
                <button
                    onClick={() => {
                        setSelectedTeamId(team.id);
                        if (hasChildren) toggleExpand(team.id);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-muted/50 ${
                        isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                    style={{ paddingLeft: `${12 + depth * 20}px` }}
                >
                    {hasChildren ? (
                        isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                        )
                    ) : (
                        <span className="w-4" />
                    )}
                    <Users className="h-4 w-4 shrink-0" />
                    <span className="truncate">{team.name}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                        {team.memberCount}
                    </Badge>
                </button>
                {isExpanded && team.children?.map((child) => renderTeamNode(child, depth + 1))}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
                    <p className="text-muted-foreground">
                        Organize your workforce into hierarchical teams.
                    </p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Create Team
                </Button>
            </div>

            {/* Create team dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle>Create Team</DialogTitle>
                        <DialogDescription>
                            Add a new team to your organization hierarchy.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="team-name">Team Name</Label>
                            <Input
                                id="team-name"
                                value={newTeam.name}
                                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                                placeholder="Engineering"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="team-desc">Description</Label>
                            <Input
                                id="team-desc"
                                value={newTeam.description}
                                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                                placeholder="Core engineering team"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="parent-team">Parent Team (optional)</Label>
                            <select
                                id="parent-team"
                                value={newTeam.parentId}
                                onChange={(e) => setNewTeam({ ...newTeam, parentId: e.target.value })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <option value="">None (top-level)</option>
                                {flattenTeams(teams).map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {"  ".repeat(t.depth) + t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateTeam} disabled={createTeamMutation.isPending}>
                            {createTeamMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Create Team
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add member dialog */}
            <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Add Team Member</DialogTitle>
                        <DialogDescription>
                            Invite a user to join this team by email.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="member-email">Email Address</Label>
                            <Input
                                id="member-email"
                                type="email"
                                value={newMemberEmail}
                                onChange={(e) => setNewMemberEmail(e.target.value)}
                                placeholder="user@example.com"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddMemberOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (selectedTeamId && newMemberEmail) {
                                    addMemberMutation.mutate({ teamId: selectedTeamId, email: newMemberEmail });
                                }
                            }}
                            disabled={addMemberMutation.isPending}
                        >
                            {addMemberMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Add Member
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Main content */}
            {isLoading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : !teams?.length ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FolderTree className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-semibold">No teams yet</h3>
                        <p className="text-muted-foreground mt-2 max-w-sm">
                            Create your first team to organize members and allocate resources.
                        </p>
                        <Button onClick={() => setIsCreateOpen(true)} className="mt-6">
                            <Plus className="mr-2 h-4 w-4" /> Create your first team
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div ref={teamsListRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Tree view */}
                    <Card className="md:col-span-1">
                        <CardHeader>
                            <CardTitle className="text-base">Team Hierarchy</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[500px] px-2 pb-4">
                                {teams.map((team) => renderTeamNode(team))}
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* Team detail */}
                    <Card className="md:col-span-2">
                        {selectedTeam ? (
                            <>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>{selectedTeam.name}</CardTitle>
                                            <CardDescription>{selectedTeam.description || "No description"}</CardDescription>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={() => setIsAddMemberOpen(true)}
                                        >
                                            <UserPlus className="mr-2 h-4 w-4" /> Add Member
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {selectedTeam.members?.length ? (
                                        <div className="space-y-3">
                                            {selectedTeam.members.map((member) => (
                                                <div
                                                    key={member.id}
                                                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                                                            {member.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium">{member.name}</p>
                                                            <p className="text-xs text-muted-foreground">{member.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-xs">
                                                            {member.role}
                                                        </Badge>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                                            onClick={() => {
                                                                if (confirm(`Remove ${member.name} from this team?`)) {
                                                                    removeMemberMutation.mutate({
                                                                        teamId: selectedTeam.id,
                                                                        memberId: member.id,
                                                                    });
                                                                }
                                                            }}
                                                        >
                                                            <UserMinus className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground text-sm">
                                            No members in this team yet.
                                        </div>
                                    )}
                                </CardContent>
                            </>
                        ) : (
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                                <p className="text-muted-foreground text-sm">
                                    Select a team from the hierarchy to view its members.
                                </p>
                            </CardContent>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
}
