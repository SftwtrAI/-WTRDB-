# RBAC Policy for Claw Operations
# -------------------------------------------------------
# Provides role-based access control for the claw fleet.
#
# Features:
#   - Simple permission check via role lookup
#   - Scope checking (org-wide vs team-level)
#   - Hierarchical team ancestor traversal
#   - Privilege escalation prevention
# -------------------------------------------------------

package claw.rbac

import rego.v1

# ── Defaults ─────────────────────────────────────────────

default allow := false

# ── Role Definitions ────────────────────────────────────

# Higher priority = more privileged (used for escalation check)
role_priority := {
	"viewer":   10,
	"member":   20,
	"operator": 30,
	"admin":    50,
	"owner":    100,
}

# Permission matrix: role -> set of allowed actions
role_permissions := {
	"viewer": {
		"claw:read",
		"claw:list",
		"claw:logs:read",
		"claw:metrics:read",
		"policy:read",
		"policy:list",
	},
	"member": {
		"claw:read",
		"claw:list",
		"claw:create",
		"claw:message",
		"claw:logs:read",
		"claw:metrics:read",
		"policy:read",
		"policy:list",
	},
	"operator": {
		"claw:read",
		"claw:list",
		"claw:create",
		"claw:update",
		"claw:start",
		"claw:stop",
		"claw:restart",
		"claw:message",
		"claw:logs:read",
		"claw:metrics:read",
		"claw:credits:read",
		"policy:read",
		"policy:list",
		"policy:test",
		"policy:apply",
		"host:list",
		"fleet:overview",
	},
	"admin": {
		"claw:read",
		"claw:list",
		"claw:create",
		"claw:update",
		"claw:delete",
		"claw:start",
		"claw:stop",
		"claw:restart",
		"claw:quarantine",
		"claw:message",
		"claw:logs:read",
		"claw:metrics:read",
		"claw:credits:read",
		"policy:read",
		"policy:list",
		"policy:create",
		"policy:update",
		"policy:delete",
		"policy:apply",
		"policy:test",
		"host:list",
		"fleet:overview",
		"role:assign",
	},
	"owner": {
		"claw:read",
		"claw:list",
		"claw:create",
		"claw:update",
		"claw:delete",
		"claw:start",
		"claw:stop",
		"claw:restart",
		"claw:quarantine",
		"claw:message",
		"claw:logs:read",
		"claw:metrics:read",
		"claw:credits:read",
		"policy:read",
		"policy:list",
		"policy:create",
		"policy:update",
		"policy:delete",
		"policy:apply",
		"policy:test",
		"host:list",
		"fleet:overview",
		"role:assign",
		"org:manage",
	},
}

# ── Role Lookup ─────────────────────────────────────────

# Resolve the actor's role from input data.
# input.actor.role is the direct role assignment.
actor_role := input.actor.role

actor_priority := role_priority[actor_role]

# ── Simple Permission Check ─────────────────────────────

has_permission if {
	some perm in role_permissions[actor_role]
	perm == input.action
}

# ── Scope Checking ──────────────────────────────────────

# Org-wide scope: actor has permission across the entire org.
scope_ok if {
	input.actor.scope == "org"
}

# Team scope: actor's team matches the target resource's team,
# or the actor's team is an ancestor of the target's team.
scope_ok if {
	input.actor.scope == "team"
	input.actor.team_id == input.resource.team_id
}

scope_ok if {
	input.actor.scope == "team"
	is_team_ancestor(input.actor.team_id, input.resource.team_id)
}

# ── Hierarchical Team Ancestor Check ────────────────────

# team_hierarchy is provided as input: a map of team_id -> parent_team_id.
# Use graph.reachable to walk the parent chain without recursion.
# Build a "parent edges" graph and check if ancestor_id is reachable from descendant_id.

parent_graph[child] := {parent} if {
	parent := input.team_hierarchy[child]
	parent != null
}

ancestors[team_id] := reachable if {
	input.team_hierarchy[team_id]
	reachable := graph.reachable(parent_graph, {team_id}) - {team_id}
}

is_team_ancestor(ancestor_id, descendant_id) if {
	ancestor_id != descendant_id
	ancestor_id in ancestors[descendant_id]
}

# ── Privilege Escalation Prevention ─────────────────────

# When assigning a role, the actor's priority must be strictly
# greater than the target role's priority.

deny_escalation contains reason if {
	input.action == "role:assign"
	target_priority := role_priority[input.target_role]
	actor_priority <= target_priority
	reason := sprintf(
		"rbac: privilege escalation denied -- actor role '%s' (priority %d) cannot assign role '%s' (priority %d)",
		[actor_role, actor_priority, input.target_role, target_priority],
	)
}

# ── Final Decision ──────────────────────────────────────

allow if {
	has_permission
	scope_ok
	count(deny_escalation) == 0
}

deny := deny_escalation

audit_reasons := deny
