# Wtr.Vision-KG — Image to Knowledge Graph

> **This is the original design specification.** The pipeline it describes
> (vision → parser → validator → Cypher generation → FalkorDB → GraphRAG) is exactly what
> was built; the implementation realises it in Node/TypeScript on Express, Zod, on-disk
> job files, Vitest, and PM2, where this document sketches a Python stack and file tree.
> See [README.md](README.md) for the service as it runs today.


**Product:** WtrDB (knowledge graph engine, FalkorDB-backed)
**Feature codename:** Wtr.Vision-KG
**Owner:** Nilesh AI Systems Pvt Ltd (Sftwtrs.AI)
**Type:** General-purpose B2C platform
**Status:** Specification (implemented — see README.md)
**Version:** 2.0 (lean redraft)

---

## What this feature does

Wtr.Vision-KG turns images into a queryable knowledge graph stored in WtrDB. GPT-5 Vision looks at an image, identifies the objects and the relationships between them, categorizes each object into a broad common-sense category, gives it a specific name, and returns all of that as structured JSON. The system attaches full provenance to every node and edge, then writes it to FalkorDB.

This is a general-purpose consumer platform. Images can be anything: pets, food, vehicles, rooms, products, people, places. The design leans on GPT-5's native ability to categorize everyday things sensibly rather than imposing a fixed schema on it.

---

## The core idea

Two things define the design.

**The AI does the categorization.** There is no predefined ontology, no fixed list of types, no schema governance. GPT-5 Vision decides what category each object belongs to and what to name it, guided only by instructions in the prompt that set the *grain* (broad, common-sense buckets). GPT-5 is good at this for everyday objects, and a B2C corpus is broad and varied enough that airtight category consistency across images is not required.

**Provenance rides on everything.** Every node and edge carries confidence, source image, model, model version, extraction version, timestamp, and bounding box when available. The model is free in *what* it says; the system is rigorous about *recording where every fact came from*.

The node shape that expresses this:

```json
{
  "id": "machine_a1b2c3",
  "category": "Machine",
  "name": "hydraulic press",
  "properties": { "color": "red", "state": "idle" },
  "confidence": 0.88,
  "source_image_id": "img_sha256:ab12...",
  "model_name": "gpt-5-vision",
  "model_version": "...",
  "extraction_version": "v1",
  "created_at": "...",
  "bbox": [400, 100, 520, 260]
}
```

`category` is the broad bucket the model chose (queryable, becomes the node label). `name` is the model's specific free-form descriptor. Everything else is provenance.

---

## What changed from the earlier design

Earlier drafts carried a fixed 14-type ontology, a validation-and-mapping layer, an unknown-concept quarantine, versioned ontology YAML, a governance approval process, and a heavy entity-resolution spec. All of that is gone. It was the right shape for an industrial inspection use case where the same object is photographed hundreds of times under controlled conditions and must land in the same bucket every time. This is a broad consumer platform, so that machinery is unnecessary weight. GPT-5 categorizes freely, and the system stays simple.

What is kept: full provenance on every node and edge, deterministic MERGE-based writes so re-ingesting an image does not create duplicates, and confidence stored so low-confidence detections can be filtered at read time. That is basic graph hygiene, not governance, and it is nearly free.

---

## Document set

Read in this order.

| # | Document | Covers |
|---|----------|--------|
| 1 | `SYSTEM_DESIGN.md` | Architecture, pipeline, API surface, sequence flows, error handling, deployment. The whole picture. |
| 2 | `EXTRACTION_SPEC.md` | The GPT-5 Vision prompt design, the categorization guidance that sets the grain, the output JSON schema, retry and repair, hallucination mitigation. This is where the real design lives. |
| 3 | `GRAPH_DB_SPEC.md` | The node and edge model, provenance fields, FalkorDB representation, indexes, deterministic Cypher generation, transactions, and the query/GraphRAG surface. |

Each is self-contained but cross-references the others by filename.

---

## Technology stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | Python 3.12+ | Fully typed |
| API framework | FastAPI | — |
| Vision model | GPT-5 Vision | Called behind a thin `VisionProvider` interface so it can be swapped later |
| Graph database | FalkorDB | Cypher-speaking property graph |
| Validation | Pydantic v2 + JSON Schema | Validates output *shape*, not against any ontology |
| Async queue | Celery + Redis | Optional; sync mode for small jobs and testing |
| Metadata store | PostgreSQL | Job records, extraction metadata, category log |
| Image storage | Object storage (S3-compatible) | Keyed by content hash |
| Testing | PyTest | — |
| Packaging | Docker + Docker Compose | — |

---

## Repository layout

```
app/
├── api/              # FastAPI routers, request/response models
├── config/           # Settings, provider selection, thresholds
├── prompts/          # Versioned prompt templates (see EXTRACTION_SPEC.md)
├── schemas/          # JSON Schema + Pydantic models for all boundaries
├── services/
│   ├── vision/       # VisionProvider interface + GPT-5 adapter
│   ├── parser/       # Model output → structured graph fragment
│   ├── validator/    # Shape validation (see EXTRACTION_SPEC.md)
│   ├── graph/        # Deterministic Cypher generation (see GRAPH_DB_SPEC.md)
│   ├── falkordb/     # FalkorDB client, transactions, retries
│   └── graphrag/     # Query / retrieval surface over the graph
├── models/           # Domain models (Observation, GraphFragment, etc.)
├── tests/            # PyTest unit + integration
├── docker/           # Dockerfiles, compose, entrypoints
└── docs/             # This document set, kept in-repo
```

---

## Non-negotiable rules

1. GPT-5 Vision never writes Cypher. Cypher is generated deterministically from validated JSON.
2. Every node and edge carries full provenance: source image, timestamp, model, model version, extraction version, confidence.
3. Output is validated for *shape* (valid JSON matching the schema) before it is written. Category and name are free; the structure is not.
4. All graph writes are transactional. Any failure rolls back the whole fragment for that image.
5. Writes are MERGE-based on deterministic ids, so re-ingesting the same image does not duplicate nodes or edges.
6. Confidence is preserved end to end and is queryable, so low-confidence facts can be filtered at read time.

---

## Definition of done

- Single-image ingest produces a validated, provenance-complete graph fragment in FalkorDB.
- Nodes carry an AI-chosen category and free-form name, plus full provenance.
- Re-ingesting the same image is idempotent (no duplicates).
- Malformed model output is repaired or rejected cleanly, never partially written.
- Every stage has unit tests; the full pipeline has an integration test against a real FalkorDB container.
- The GraphRAG surface answers a natural-language question grounded in graph facts, with confidence filtering and provenance on every returned fact.
