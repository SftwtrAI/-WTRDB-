# Permissive Claw Policy
# -------------------------------------------------------
# Allow-all network, all providers and models, all skills
# without approval, all workflows, all MCP servers, voice
# dispatch with no daily caps. Intended for trusted
# internal / admin claws only.
# -------------------------------------------------------

package claw.system.permissive

import rego.v1

# ── Defaults ─────────────────────────────────────────────

default allow := true
default requires_approval := false

# ── Network Access ───────────────────────────────────────

# No network restrictions -- all destinations allowed.

# ── Model Provider ───────────────────────────────────────

# All providers and models are allowed without restriction.

# ── Skill Gate ──────────────────────────────────────────

# All skills at any grade are allowed without approval.

# ── Workflow Execution ──────────────────────────────────

# All workflows (org, team, personal) are allowed.

# ── MCP Server Access ──────────────────────────────────

# All MCP server connections are allowed.

# ── Voice Dispatch ──────────────────────────────────────

# Voice dispatch is allowed with no daily cap.

# ── Aggregate ────────────────────────────────────────────

# No deny rules exist in the permissive policy.
deny := set()

audit_reasons := set()
