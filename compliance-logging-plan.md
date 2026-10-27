# Compliance System Implementation Plan

## Architecture Decisions

### Control Categories
Every control falls into one of these categories:

1. **Platform-Level (same for all customers)**: Implemented in code/infrastructure. Evidence is automatic.
   - Examples: encryption at rest, TLS enforcement, audit logging, sandbox isolation

2. **Configurable Per-Customer**: Customer needs to configure settings specific to their org.
   - Examples: board oversight emails, data retention period, incident response contacts, DPO designation

3. **Evidence-Collection**: System collects and presents evidence, customer documents completion.
   - Examples: security training records, vendor agreements, physical security certifications

### Evidence Sources (Real, Not Placeholder)
- **Audit Logs**: Pull from `rbac_audit_events`, `claw_audit_events`, `claw_inference_events`, `claw_tool_events`
- **Configuration State**: Read from `roles`, `permissions`, `user_roles`, `claw_policy_templates`, `concurrency_limits`
- **System Checks**: TLS status, encryption config, session management settings
- **User-Uploaded Documents**: Policies, training records, vendor agreements (stored in DB)

---

## Framework Relevance Guide

| Framework | Relevant If... | Not Relevant If... |
|-----------|---------------|-------------------|
| ISO 27001 | You handle sensitive data of any kind | Never |
| SOC 2 | You serve enterprise B2B customers | Consumer-only product |
| DPDP Act | You have Indian customers/operations | No India presence |
| CMMC | You work with US DoD/defense contractors | No government work |
| HIPAA | You handle health/medical data | No health data |
| GDPR | You have EU customers or process EU data | No EU presence |
| PCI DSS | You process payment card data | No payment processing |
| NIST CSF | You want a security baseline (any org) | Never |
| FedRAMP | You sell to US federal agencies | No federal customers |
| CCPA | You have California customers | No CA customers |
| SOX | You're publicly traded or plan to IPO | Private company, no IPO plans |
| CIS Controls | You want practical security controls | Never |
| CSA STAR | You're a cloud service provider | On-premise only |
| ISO 42001 | You develop/deploy AI systems | No AI involvement |

---

## CMMC Control-by-Control Implementation Plan

### AC (Access Control)

| Control | Type | Implementation | Status |
|---------|------|---------------|--------|
| AC.1.001 | Platform | RBAC + JWT auth on all endpoints | Done |
| AC.1.002 | Platform | Permission-based route middleware | Done |
| AC.2.007 | Configurable | Least privilege review tool + team scoping | Needs UI |
| AC.2.008 | Platform | TLS on all API + JWT required | Done |
| AC.2.016 | Configurable | Data classification + network policies | Needs evidence |
| AC.3.017 | Configurable | Separation of duties via custom roles | Needs wizard |
| AC.3.021 | Platform + Config | MFA for admin operations | Needs MFA impl |

### AU (Audit & Accountability)

| Control | Type | Implementation | Status |
|---------|------|---------------|--------|
| AU.2.041 | Platform | All actions have userId in audit trail | Done - needs evidence UI |
| AU.2.042 | Configurable | Log retention policy (configurable period) | Needs config UI |
| AU.3.045 | Configurable | Audit log review schedule + email reports | Needs widget |
| AU.3.048 | Platform | Centralized audit tables | Done - needs evidence UI |

### CM (Configuration Management)

| Control | Type | Implementation | Status |
|---------|------|---------------|--------|
| CM.2.061 | Platform | Policy templates as baselines | Done |
| CM.2.062 | Platform | RBAC audit trail tracks all changes | Done |
| CM.2.064 | Configurable | Restrictive defaults for production | Needs enforcement |

### IA (Identification & Authentication)

| Control | Type | Implementation | Status |
|---------|------|---------------|--------|
| IA.1.076 | Platform | Unique user IDs via gen_random_uuid | Done |
| IA.2.078 | Configurable | Password policy (min length, complexity) | Needs config |
| IA.2.081 | Needs Implementation | MFA via TOTP authenticator | NOT IMPLEMENTED |

### IR (Incident Response)

| Control | Type | Implementation | Status |
|---------|------|---------------|--------|
| IR.2.092 | Configurable | IR plan documentation + contact config | Needs widget |
| IR.2.093 | Platform + Config | Violation detection + alerting | Needs alert config |

### SC (System & Communications)

| Control | Type | Implementation | Status |
|---------|------|---------------|--------|
| SC.1.175 | Platform | Network whitelists | Done |
| SC.1.176 | Platform | Docker sandbox isolation | Done |
| SC.3.177 | Platform | AES-256 at rest, TLS 1.2+ in transit | Done (verify) |
| SC.3.187 | Platform | JWT + HMAC session management | Done |

### SI (System & Information Integrity)

| Control | Type | Implementation | Status |
|---------|------|---------------|--------|
| SI.1.210 | Configurable | Vulnerability scan schedule | Needs config |
| SI.1.211 | Platform | Skill security scoring + sandbox | Done |
| SI.2.214 | Platform + Config | Violation monitoring | Needs dashboard |

---

## Implementation Priority (Current Sprint)

1. **Framework Relevance Selector** - UI to choose which frameworks apply
2. **ISO 42001** - AI Management System controls
3. **Real Evidence Collection for CMMC** - AU.2.041 etc with live log previews
4. **Configurable Controls** - Board oversight emails, log retention, IR contacts
5. **MFA Implementation** - TOTP for admin accounts
6. **Compliance Settings Page** - Per-org compliance configuration (retention, contacts, reports)
7. **Evidence Export** - Downloadable evidence packages per control
8. **Auditor View** - Read-only compliance dashboard link for external auditors

---

## New DB Tables Needed

- `compliance_settings` - Per-org compliance configuration (enabled frameworks, contacts, retention)
- `compliance_evidence` - Uploaded evidence documents per control
- `compliance_scheduled_reports` - Configurable email report schedules
- `mfa_secrets` - TOTP secrets for MFA (if not using external auth provider)

---

## Agent Coordination Rules

- Each agent writes its section to this file before implementing
- No two agents work on the same file simultaneously
- Evidence collection patterns must be consistent across all controls
- All configurable controls must use the same settings schema
