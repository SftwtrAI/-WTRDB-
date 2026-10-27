# WTRDB Platform Writeup (Knowledge Graph Mathematician/Analyst Lens)

## 1. Executive Summary

This platform is a graph-native intelligence system that combines:

- A document ingestion and embedding stack (RAG-style evidence substrate).
- An LLM-assisted knowledge graph extraction engine with governance adjudication.
- A sheaf-theoretic analytics layer for consistency and conflict diagnostics.
- A real-time, analyst-oriented 2D/3D graph exploration interface.
- Enterprise controls (RBAC, compliance, auth, audit, billing, admin operations).

Conceptually, you can treat it as a **multi-graph epistemic operating system**:

- Local knowledge bases are extracted into typed, temporal graph structures.
- Graph updates are constrained by evidence and contradiction checks.
- Sheaf operators provide global consistency signals from local assignments.

## 2. Platform Identity and Problem It Solves

At its core, the system solves a common analyst problem:

- Raw corpora are unstructured and noisy.
- Useful entities/relations/events are distributed across heterogeneous documents.
- Cross-source contradictions are common and often temporal rather than truly inconsistent.
- Multi-team or multi-domain graph unification requires controlled alignment and merge governance.

The platform addresses this by keeping:

- **Evidence tractability** from source chunks.
- **Graph-level reasoning** over entities/relations/events.
- **Controlled evolution** via adjudication and soft deprecation.

## 3. Mathematical/Conceptual Core

### 3.1 Base Graph Object

Each knowledge base is materialized as a graph in FalkorDB with:

- Entity nodes (typed, attributed, source-linked).
- Relationship edges (typed, confidence/evidence aware, temporal metadata).
- Event nodes/edges for evolutionary semantics (change over time).

Notation:

- \( G = (V, E, \tau_V, \tau_E, A) \)
- \( \tau_V, \tau_E \) are type maps.
- \( A \) is attribute/evidence payload (provenance, confidence, timestamps).

### 3.2 Sheaf Layer

The sheaf subsystem constructs a cellular sheaf over graph neighborhoods:

- Stalks encode local feature spaces on nodes/edges.
- Restriction maps encode compatibility between adjacent local sections.
- Coboundary operators are assembled to compute consistency residuals.

Operationally, the system computes:

- Sheaf Laplacian \(L\) as a global consistency operator.
- \(H^0\)-like signals for globally coherent assignments.
- \(H^1\)-like signals for obstruction/conflict cycles.
- Diffusion dynamics to smooth local inconsistencies while preserving structure.

Interpretation:

- Nontrivial first cohomology is treated as a conflict/ambiguity indicator.
- Diffusion is used as an analytic “stress relaxation” pass over conflicting assignments.

### 3.3 Governance as Constraint System

Every candidate extraction/update is adjudicated by three checks:

- Evidence verification against source text.
- Logical verification against current graph state.
- Evolutionary-intent verification for temporal consistency.

The system uses conservative contradiction handling and favors **soft deprecation** over destructive deletion, preserving historical graph states for auditability.

## 4. End-to-End Pipeline

### 4.1 Ingestion and Evidence Substrate

Knowledge can be added as:

- File uploads.
- URLs (with security checks against unsafe targets/patterns).
- Direct text.

Documents are chunked and embedded (`text-embedding-3-small`), then stored as searchable knowledge chunks.

### 4.2 Incremental KG Extraction

Extraction uses `gpt-4o-mini` with structured JSON outputs for entities/relations/events.

Key characteristics:

- Incremental processing based on chunk extraction metadata.
- Dual-track extraction (structural facts + evolutionary events).
- Provenance linkage from graph artifacts back to chunk evidence.

### 4.3 Adjudication and Graph Writes

Candidate graph updates pass governance filters and then:

- Are written to graph storage.
- Trigger extraction event logs.
- Emit real-time status/event streams for UI consumers.

Temporal contradictions are handled via deprecatory evolution rather than hard overwrite.

### 4.4 Query and Retrieval

The platform supports:

- Direct graph summaries/entities/relations queries per knowledge base.
- NL-to-Cypher style KG query endpoint.
- Hybrid retrieval that combines vector similarity (RAG) and KG signals.

When graph retrieval is degraded/unavailable, hybrid search degrades gracefully to vector retrieval.

## 5. Feature/Capability Inventory by Layer

### 5.1 Analyst-Facing Knowledge Features

- Build and maintain multiple knowledge bases.
- Auto-extract and regenerate graph structure from evolving corpora.
- Inspect entities, relationships, event evolutions.
- Run graph queries from natural language.
- Explore graph structure in both 2D and 3D.
- Monitor extraction quality and event streams.

### 5.2 Mathematical/Reasoning Features

- Sheaf construction over graph neighborhoods.
- Laplacian spectral diagnostics.
- Cohomological obstruction/conflict detection.
- Sheaf diffusion for conflict minimization and consistency smoothing.
- Governance adjudication for logical/evidential validation of updates.

### 5.3 Knowledge Tooling Features

- Internal tool APIs for knowledge lookup and KG querying.
- “Learn-to-graph” capability to append newly learned structured facts with provenance tags.
- Integrations for form/webhook/API actions in operational flows.

### 5.4 Enterprise/Platform Features

- Auth flows: register/login/refresh/logout/password management/OTP.
- MFA routes.
- RBAC: teams, roles, permissions, assignments, audit.
- Compliance: posture, controls, evidence, scheduled reports.
- Admin surfaces: settings, model/email config, analytics.
- Notification and webhook framework.
- Usage metering, subscriptions, plans, billing tables.

## 6. Data Architecture

Control-plane and graph-plane are deliberately separated:

- **Postgres (Drizzle schema):** users, auth/session, RBAC/compliance, knowledge metadata, events, billing, ops state.
- **FalkorDB:** graph-native storage for extracted knowledge bases and updates.
- **Redis/real-time infra:** caching/session/event flow support.
- **OpenAI:** extraction and embedding model operations.

This split gives:

- Graph performance where graph semantics matter.
- Relational traceability and governance on operational metadata.
- Better auditability for enterprise workflows.

## 7. UI and Analyst Experience

The frontend includes both practical and immersive workflows:

- Knowledge Base workspace for ingestion and generation control.
- Knowledge Graph page for 2D graph operations (layout/filter/query/inspection).
- 3D graph renderer (depth/type filtering, camera automation, overlays).
- Celestial/field-style scene for multi-KB navigation and graph interaction.
- Additional advanced observability/research surfaces (resonance/ghost/schema/theatre views).

From an analyst perspective, this is not only CRUD over graph entities; it is intended as a **topological + operational workbench**.

## 8. Security, Reliability, and Operations Posture

Operational controls visible in the system include:

- Startup health checks and detailed health endpoints.
- Request correlation IDs and API logging.
- Connection/resource watchdog behavior.
- WebSocket connection limits per user/IP/process.
- URL ingestion hardening (anti-SSRF patterns and content limits).
- JWT preload/session token management and revocation flows.
- Audit-ready persistence for sensitive governance domains.

## 9. Current Maturity Signal (Important for Peer Evaluation)

The codebase shows a strong implemented core with some in-progress surfaces:

- Fully active: ingestion, extraction, adjudication, graph storage/query, sheaf services, RBAC/compliance/auth core.
- Partially converging: certain UI endpoints in experimental pages rely on placeholders/fallbacks.
- Transitional: legacy platform domains still exist in schema/routes while WTRDB graph-centric extraction is now the dominant technical identity.

Interpretation:

- The mathematical/graph engine and enterprise spine are production-shaped.
- Some advanced orchestration and exploratory UI features are still stabilizing around final API contracts.

## 10. Suggested Mental Model for Another KG Analyst

If you are onboarding as a mathematically inclined analyst, model this platform as:

- A **stateful graph extraction machine** over evolving evidence.
- A **consistency operator stack** (governance + sheaf diagnostics).
- A **real-time analyst cockpit** where graph topology, quality, and conflicts are first-class.

In short, this is not just “RAG + graph.” It is an attempt at a governed, mathematically informed, continuously updating knowledge graph operating environment.
