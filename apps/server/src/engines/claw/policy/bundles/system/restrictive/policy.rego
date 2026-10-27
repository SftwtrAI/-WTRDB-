# Restrictive Claw Policy
# -------------------------------------------------------
# Deny-all default. Only local models, A-grade skills with
# an explicit allowlist, no workflows, no MCP, no voice
# dispatch. Every action requires human approval.
# -------------------------------------------------------

package claw.system.restrictive

import rego.v1

# ── Defaults ─────────────────────────────────────────────

default allow := false
default requires_approval := true

# ── Network Access ───────────────────────────────────────

deny_network contains reason if {
	input.action == "network_request"
	reason := "restrictive: all outbound network access is denied"
}

# ── Model Provider ───────────────────────────────────────

allowed_providers := {"local_nemotron"}

deny_provider contains reason if {
	input.action == "invoke_model"
	not input.provider in allowed_providers
	reason := sprintf("restrictive: provider '%s' is not allowed; only local_nemotron permitted", [input.provider])
}

# ── Skill Gate (A-grade only, explicit allowlist) ────────

skill_allowlist := {
	"search_knowledge_base",
	"read_document",
	"summarize_text",
	"extract_entities",
}

deny_skill contains reason if {
	input.action == "invoke_skill"
	not input.skill_id in skill_allowlist
	reason := sprintf("restrictive: skill '%s' is not in the A-grade allowlist", [input.skill_id])
}

deny_skill contains reason if {
	input.action == "invoke_skill"
	input.skill_grade != "A"
	reason := sprintf("restrictive: skill '%s' grade '%s' does not meet A-grade requirement", [input.skill_id, input.skill_grade])
}

# ── Workflow Execution ───────────────────────────────────

deny_workflow contains reason if {
	input.action == "execute_workflow"
	reason := "restrictive: all workflow execution is denied"
}

# ── MCP Server Access ───────────────────────────────────

deny_mcp contains reason if {
	input.action == "connect_mcp"
	reason := "restrictive: all MCP server connections are denied"
}

# ── Voice Dispatch ──────────────────────────────────────

deny_voice contains reason if {
	input.action == "voice_dispatch"
	reason := "restrictive: voice dispatch is denied"
}

# ── Aggregate Deny / Audit ──────────────────────────────

deny := deny_network | deny_provider | deny_skill | deny_workflow | deny_mcp | deny_voice

audit_reasons := deny

allow if {
	count(deny) == 0
}
