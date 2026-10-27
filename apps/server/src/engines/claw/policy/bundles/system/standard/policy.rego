# Standard Claw Policy
# -------------------------------------------------------
# Whitelisted network destinations, all cloud providers,
# B-grade+ skills with approval, org workflows, org MCP
# servers, voice dispatch with a daily cap of 50.
# -------------------------------------------------------

package claw.system.standard

import rego.v1

# ── Defaults ─────────────────────────────────────────────

default allow := false
default requires_approval := false

# ── Network Access (whitelisted destinations) ────────────

network_whitelist := {
	"api.openai.com",
	"api.anthropic.com",
	"api.cohere.com",
	"api.mistral.ai",
	"generativelanguage.googleapis.com",
	"api.together.xyz",
	"api.groq.com",
	"api.deepseek.com",
	"api.fireworks.ai",
}

deny_network contains reason if {
	input.action == "network_request"
	not input.destination in network_whitelist
	reason := sprintf("standard: destination '%s' is not in the network whitelist", [input.destination])
}

# ── Model Provider ───────────────────────────────────────

allowed_providers := {
	"openai",
	"anthropic",
	"google",
	"mistral",
	"cohere",
	"together",
	"groq",
	"deepseek",
	"fireworks",
	"local_nemotron",
}

deny_provider contains reason if {
	input.action == "invoke_model"
	not input.provider in allowed_providers
	reason := sprintf("standard: provider '%s' is not in the allowed set", [input.provider])
}

# ── Skill Gate (B-grade and above) ──────────────────────

passing_grades := {"A", "B"}

deny_skill contains reason if {
	input.action == "invoke_skill"
	not input.skill_grade in passing_grades
	reason := sprintf("standard: skill '%s' grade '%s' does not meet B-grade minimum", [input.skill_id, input.skill_grade])
}

# Skills at B-grade require approval; A-grade auto-approved
requires_approval if {
	input.action == "invoke_skill"
	input.skill_grade == "B"
}

# ── Workflow Execution (org workflows only) ─────────────

deny_workflow contains reason if {
	input.action == "execute_workflow"
	input.workflow_scope != "org"
	reason := sprintf("standard: workflow '%s' scope '%s' is not org-level", [input.workflow_id, input.workflow_scope])
}

# ── MCP Server Access (org servers only) ────────────────

deny_mcp contains reason if {
	input.action == "connect_mcp"
	input.mcp_scope != "org"
	reason := sprintf("standard: MCP server '%s' scope '%s' is not org-level", [input.mcp_server_id, input.mcp_scope])
}

# ── Voice Dispatch (daily cap: 50) ─────────────────────

voice_daily_cap := 50

deny_voice contains reason if {
	input.action == "voice_dispatch"
	input.voice_dispatches_today >= voice_daily_cap
	reason := sprintf("standard: daily voice dispatch cap reached (%d/%d)", [input.voice_dispatches_today, voice_daily_cap])
}

# ── Aggregate Deny / Audit ──────────────────────────────

deny := deny_network | deny_provider | deny_skill | deny_workflow | deny_mcp | deny_voice

audit_reasons := deny

allow if {
	count(deny) == 0
}
