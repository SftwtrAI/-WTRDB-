# System Design — Wtr.Vision-KG

**Feature:** Image-to-Knowledge-Graph for WtrDB (B2C, general-purpose)
**Version:** 2.0
**Audience:** Engineering team
**Related:** `EXTRACTION_SPEC.md`, `GRAPH_DB_SPEC.md`

---

## 1. Purpose and scope

This is the top-level engineering reference for Wtr.Vision-KG. It defines the component architecture, the pipeline, the public API, the runtime flows, the error contract, and deployment.

The feature ingests images and produces a knowledge graph in FalkorDB. GPT-5 Vision identifies and categorizes objects and relationships in a single pass, guided by a prompt that sets the categorization grain. The system attaches provenance and writes the result deterministically and transactionally. GPT-5 never writes to the database and never authors Cypher.

This is a general-purpose consumer platform: images are varied and unconstrained. The design deliberately carries no fixed ontology and no schema governance, relying on GPT-5's native categorization for everyday objects.

Out of scope for v1: video, 3D scene graphs, real-time streaming, cross-image entity re-identification (matching the same real person or object across different images). These are anticipated as extensions (section 11), not built now.

---

## 2. Design principles

**AI-driven categorization.** GPT-5 chooses each object's broad category and specific name. No predefined types, no mapping layer, no quarantine. Guidance in the prompt sets the grain; the model does the rest. See `EXTRACTION_SPEC.md`.

**Provenance everywhere.** Every node and edge records its source image, timestamp, model, model version, extraction version, and confidence. This is what makes the graph explainable and auditable, and it is the one rigor the lean design keeps in full.

**Deterministic, transactional writes.** Given the same validated fragment and graph state, Cypher generation is identical every time. The whole fragment for an image commits atomically or not at all. Writes are MERGE-based on deterministic ids, so re-ingest is idempotent. See `GRAPH_DB_SPEC.md`.

**Shape validation, not schema validation.** The system validates that model output is well-formed JSON matching the expected structure. It does not validate categories or names against any vocabulary, because there is none. The model is free in content, constrained only in structure.

**Swappable model.** GPT-5 Vision sits behind a thin `VisionProvider` interface so it can be replaced later without touching the rest of the pipeline.

---

## 3. Component architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        API Layer (FastAPI)                       │
│   POST /images    GET /jobs/{id}    GET /graph/query             │
└───────────────┬──────────────────────────────────────────────────┘
                │ enqueue job / read status
                ▼
┌────────────────────────────────────────────────────────────────┐
│                     Orchestration Service                        │
│   Owns the pipeline state machine. Coordinates every stage.      │
│   Runs inline (sync) or via Celery worker (async). Idempotent.   │
└───┬────────┬─────────┬──────────┬───────────┬───────────────────┘
    │        │         │          │           │
    ▼        ▼         ▼          ▼           ▼
┌────────┐┌────────┐┌────────┐┌──────────┐┌──────────────┐
│Preproc ││Vision  ││Parser  ││Validator ││ Cypher Gen   │
│        ││(GPT-5) ││        ││ (shape)  ││              │
└────────┘└────────┘└────────┘└──────────┘└──────┬───────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │  FalkorDB    │
                                          │  Client      │
                                          │  (txn+retry) │
                                          └──────────────┘

Supporting stores:
  PostgreSQL ── job records, extraction metadata, category log
  Object Storage ── raw images, keyed by content hash
  Redis ── Celery broker + result backend (async mode only)
```

### 3.1 Component responsibilities

| Component | Responsibility | Must not |
|-----------|----------------|----------|
| **API Layer** | Accept uploads, validate request shape, enqueue jobs, serve status and queries | Contain pipeline logic |
| **Orchestration Service** | Drive the pipeline state machine, own transactions and rollback | Contain model- or DB-specific detail |
| **Preprocessing** | Normalize format, resize, strip EXIF, compute content hash, assign image id | Alter semantic content |
| **Vision Provider** | Call GPT-5 Vision, return the raw graph proposal | Be imported by any stage other than the orchestrator |
| **Parser** | Turn raw model output into a typed graph fragment | Repair semantics; it only structures |
| **Validator** | Enforce JSON shape and provenance completeness | Check content against any vocabulary (there is none) |
| **Cypher Generator** | Emit deterministic parameterized Cypher from the validated fragment | Accept any model-authored query text |
| **FalkorDB Client** | Execute Cypher in a transaction, retry transient failures, roll back on error | Generate Cypher |
| **GraphRAG** | Answer queries grounded in graph facts, with confidence filtering and provenance | Return a fact without its provenance |

### 3.2 The VisionProvider interface

GPT-5 Vision is the model, held behind a thin interface so a later swap is a config change.

```python
class VisionProvider(Protocol):
    name: str          # "gpt-5-vision"
    version: str       # concrete model version, recorded in provenance

    async def extract(self, image: PreparedImage, prompt: PromptBundle) -> RawGraphProposal:
        """Single-pass extraction. Returns raw graph-fragment JSON + usage."""
```

The orchestrator holds one `VisionProvider`. No other component imports the adapter. See `EXTRACTION_SPEC.md` for what fills `PromptBundle`.

---

## 4. Pipeline

A linear state machine. Nothing is written to the graph until the final transactional insert.

```
RECEIVED
  → PREPROCESSED        (format normalized, hashed, image id assigned)
    → EXTRACTED           (GPT-5 Vision returns raw graph proposal)
      → PARSED              (raw output structured into a fragment)
        → VALID               (JSON shape + provenance completeness checked)
          → CYPHER_READY         (deterministic Cypher generated)
            → COMMITTED            (transactional insert succeeded)
              → DONE

Any state → FAILED(reason)   (structured error, section 8)
```

State is persisted in PostgreSQL against the job, so a crashed worker fails observably rather than silently.

Note the pipeline is a **single extraction call**, not the two-stage observe-then-map flow of the earlier ontology design. There is no ontology to map onto, so GPT-5 identifies, categorizes, and names in one pass. This is simpler and cheaper.

---

## 5. Sequence flows

### 5.1 Single-image ingest (happy path)

```
Client        API         Orchestrator     Vision(GPT-5)   Validator   Cypher     FalkorDB
  │            │                │               │             │           │           │
  │ POST /images                │               │             │           │           │
  │───────────>│                │               │             │           │           │
  │            │ store image,   │               │             │           │           │
  │            │ create job     │               │             │           │           │
  │            │───────────────>│               │             │           │           │
  │  202 + job_id               │               │             │           │           │
  │<───────────│                │               │             │           │           │
  │            │                │ preprocess (hash, normalize)│           │           │
  │            │                │──────────────>│             │           │           │
  │            │                │ extract()     │             │           │           │
  │            │                │<──────────────│ raw proposal│           │           │
  │            │                │ parse + validate shape      │           │           │
  │            │                │────────────────────────────>│           │           │
  │            │                │<────────────────────────────│ ok        │           │
  │            │                │ generate Cypher from fragment│          │           │
  │            │                │─────────────────────────────────────── >│           │
  │            │                │<─────────────────────────────────────── │ statements│
  │            │                │ BEGIN txn; run; COMMIT       │          │           │
  │            │                │──────────────────────────────────────────────────── >│
  │            │                │<──────────────────────────────────────────────────── │ ok
  │            │                │ mark job DONE                │          │           │
  │ GET /jobs/{id} → DONE + graph summary                     │          │           │
  │<───────────│                │               │             │           │           │
```

### 5.2 Malformed model output (repair then reject)

```
Orchestrator             Vision(GPT-5)        Parser/Validator
     │ extract()             │                     │
     │─────────────────────>│                     │
     │<─────────────────────│ malformed JSON      │
     │ attempt structural repair (EXTRACTION_SPEC §retry)│
     │───────────────────────────────────────────────── >│
     │            repair failed                          │
     │ one corrective re-prompt                          │
     │─────────────────────>│                     │
     │<─────────────────────│ still invalid       │
     │ retries exhausted → FAILED(model_output_invalid)  │
     │ nothing written to graph                          │
```

### 5.3 Re-ingest of the same image (idempotent)

Preprocessing hashes the image; an identical upload yields the same image id and the same deterministic node ids. Cypher generation uses MERGE throughout, so the second ingest updates confidence where higher and otherwise changes nothing. No duplicate nodes or edges. See `GRAPH_DB_SPEC.md` section 7.

---

## 6. API surface

REST over JSON, versioned under `/v1`. Auth via bearer token, inherited from the host WtrDB deployment.

**`POST /v1/images`** — submit one or more images.

Request: `multipart/form-data`, one or more file parts, optional JSON `options`.

```json
{ "options": { "async": true, "min_confidence": 0.5 } }
```

Response `202 Accepted` (async) or `200 OK` (sync):

```json
{
  "job_id": "job_01H...",
  "status": "RECEIVED",
  "image_ids": ["img_sha256:ab12..."],
  "submitted_at": "2026-07-09T10:15:00Z"
}
```

**`GET /v1/jobs/{job_id}`** — poll status.

```json
{
  "job_id": "job_01H...",
  "status": "DONE",
  "state_detail": "COMMITTED",
  "graph_summary": {
    "nodes_created": 6,
    "nodes_updated": 1,
    "edges_created": 9,
    "categories_seen": ["Person", "Machine", "Tool"]
  },
  "error": null,
  "timings_ms": { "preprocess": 40, "vision_extract": 3100, "validate": 12, "cypher": 8, "commit": 90 }
}
```

**`GET /v1/graph/query`** — GraphRAG retrieval.

```json
{ "question": "What animals appear in my photos?", "min_confidence": 0.6, "max_hops": 2, "source_image_id": null }
```

Response includes the answer, the subgraph it was grounded in, and per-fact confidence and provenance. The retrieval layer never returns a fact without its provenance.

**`GET /v1/categories`** — read-only list of categories the model has produced so far, with counts. This is observability, not governance; it exists so you can watch the vocabulary form, not to gate anything. Categories are never approved or rejected.

### 6.1 API rules

- The API layer validates request shape only. Semantic work happens in the orchestrator and below.
- Sync mode (`async: false`) is for small single images and testing. Production defaults to async.
- Every response carries the `job_id` so the full pipeline is traceable.
- Errors follow the contract in section 8.

---

## 7. Category tracking (observability only)

Every category GPT-5 produces is logged to PostgreSQL with a running count, surfaced at `GET /v1/categories`. This is purely so the category vocabulary is visible as it forms. Nothing feeds back into the prompt, nothing is approved, nothing is rejected, and the graph is written regardless of what category the model picks. If category grain ever looks wrong in practice, this log is where you would notice, and the fix would be tuning the prompt guidance in `EXTRACTION_SPEC.md`, not editing a schema.

---

## 8. Error handling contract

Errors are structured, categorized, and never leave the graph in a partial state.

| Category | Example | Behavior | Client sees |
|----------|---------|----------|-------------|
| `input_invalid` | Unsupported format, corrupt file | Fail before vision call | `400` |
| `vision_provider_error` | Timeout, rate limit, 5xx from GPT-5 | Retry with backoff, then fail | `502` after retries |
| `model_output_invalid` | Unparseable or shape-violating JSON after repair and one re-prompt | Fail; nothing written | `422` |
| `graph_write_error` | FalkorDB unavailable, txn failure | Roll back whole fragment, retry, then fail | `503` after retries |
| `internal_error` | Unexpected exception | Roll back, log with job_id, fail | `500` |

### 8.1 Transactional guarantee

The entire graph fragment for one image is written in a single FalkorDB transaction. If any statement fails, the transaction rolls back. There is no state in which half an image's facts are committed. Retries are whole-fragment retries against a clean slate, safe because writes are MERGE-based on deterministic ids.

### 8.2 Structured error shape

```json
{
  "job_id": "job_01H...",
  "status": "FAILED",
  "error": {
    "category": "model_output_invalid",
    "message": "Graph proposal failed shape validation after one repair attempt.",
    "stage": "VALID",
    "retryable": false,
    "detail": { "schema_errors": ["node[3] missing required field: confidence"] }
  }
}
```

### 8.3 Retry policy

- **GPT-5 calls:** exponential backoff with jitter, capped attempts, transient errors only (timeout, 429, 5xx).
- **Model output repair:** structural repair first (see `EXTRACTION_SPEC.md`), then one corrective re-prompt, then fail.
- **Graph writes:** bounded retries on transient FalkorDB errors, each a full-fragment retry in a fresh transaction.

---

## 9. Observability

Every stage emits metrics and structured logs keyed by `job_id` and `image_id`.

**Metrics:** API latency, GPT-5 token usage, vision call latency, validation failure counts, Cypher generation time, graph insertion time, transaction rollback count, new-category count.

**Logs:** one structured record per state transition (from-state, to-state, duration, and on failure the full error). Prompts and raw outputs are logged at debug level, redactable, retained per the deployment's data policy.

**Traces:** the job_id threads through the whole pipeline so a single ingest can be reconstructed end to end.

---

## 10. Deployment

Containerized, Docker Compose for single-node, adaptable to Kubernetes for scale.

```
┌──────────────────────────────────────────────────────────┐
│                       Ingress / LB                         │
└───────────────┬────────────────────────────────────────────┘
                ▼
        ┌───────────────┐        ┌────────────────────┐
        │  api           │        │  worker            │
        │  (FastAPI,     │        │  (Celery,          │
        │   uvicorn)     │        │   pipeline stages) │
        │  N replicas    │        │  M replicas        │
        └───────┬────────┘        └─────────┬──────────┘
                │                            │
     ┌──────────┼────────────┬──────────────┼───────────────┐
     ▼          ▼            ▼               ▼               ▼
┌────────┐ ┌────────┐  ┌──────────┐   ┌───────────┐   ┌──────────────┐
│FalkorDB│ │Postgres│  │  Redis   │   │  Object   │   │  GPT-5 API   │
│        │ │        │  │ (broker) │   │  Storage  │   │  (external)  │
└────────┘ └────────┘  └──────────┘   └───────────┘   └──────────────┘
```

| Service | Role | Scaling |
|---------|------|---------|
| `api` | Request handling, job creation, query serving | Horizontal, stateless |
| `worker` | Runs pipeline stages for async jobs | Horizontal, stateless |
| `falkordb` | The knowledge graph | Vertical first; cluster per FalkorDB guidance at scale |
| `postgres` | Job records, metadata, category log | Managed in production |
| `redis` | Celery broker and result backend | Managed in production |
| `object-storage` | Raw images by content hash | S3-compatible |

**Configuration** is environment-driven, behind `config/`: GPT-5 credentials and model version, FalkorDB connection and graph name, Postgres and Redis DSNs, object-storage bucket, confidence threshold, retry limits.

**Sync vs async:** Compose ships both `api` and `worker`. Local and small workloads can run the pipeline inline (async off). Production runs async: `api` enqueues, `worker` executes. The orchestration code is identical in both; only invocation differs.

---

## 11. Extension points

| Future capability | How the architecture accommodates it |
|-------------------|--------------------------------------|
| Cross-image entity re-identification | Add an embedding-based resolver stage before Cypher generation; node shape already carries everything it needs |
| Category consistency (if ever needed) | Add a category registry that feeds back into the prompt; the category log is already the seed |
| Video to KG | Frame-sampling preprocessor feeding the same pipeline |
| Multi-image fusion | Batch ingest plus the re-identification resolver above |
| Embedding retrieval | GraphRAG layer swaps in vector-assisted candidate selection |
| Model swap | VisionProvider interface; already a config change |
| Graph store swap | Cypher generation targets a Cypher-speaking store; FalkorDB client is one adapter |

The lean design does not build these, but nothing in it blocks them. In particular, cross-image re-identification is the most likely near-term addition, and the full provenance and confidence already on every node are exactly what it would need.

---

## 12. Testing strategy

- **Unit tests** per stage against fixed fixtures. Parser, validator, and Cypher generator are pure enough to test in isolation.
- **Contract tests** for the VisionProvider interface, run against recorded GPT-5 responses so the pipeline is testable without live model calls.
- **Integration test** exercising the full pipeline against a real FalkorDB container and a real Postgres container, covering create, re-ingest idempotency, and rollback paths.
- **Determinism test** asserting the same validated fragment and graph state yield byte-identical Cypher.
- **Failure-injection tests** for each error category in section 8, asserting no partial writes.

Coverage target and CI wiring follow the host WtrDB project conventions.
