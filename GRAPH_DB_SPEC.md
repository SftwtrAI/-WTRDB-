# Graph & Database Specification — Wtr.Vision-KG

**Feature:** Image-to-Knowledge-Graph for WtrDB (B2C, general-purpose)
**Version:** 2.0
**Target store:** FalkorDB (Cypher-speaking property graph)
**Related:** `SYSTEM_DESIGN.md`, `EXTRACTION_SPEC.md`

---

## 1. Purpose

This document defines the graph model, the provenance fields carried on every node and edge, the FalkorDB representation, indexes, the deterministic Cypher generation rules, the transactional guarantees, and the query/GraphRAG surface.

The governing rule:

> Cypher is generated deterministically from the validated graph fragment. GPT-5 never writes Cypher and never touches the database. Given the same validated fragment and graph state, generation produces the same statements every time. Writes are MERGE-based on deterministic ids, so re-ingest is idempotent.

FalkorDB is the reference store. Generation targets a Cypher-speaking property graph, so the same layer can drive another such store by swapping the client adapter (see `SYSTEM_DESIGN.md`).

---

## 2. The node model

Every node has two identity-of-meaning fields plus full provenance. This is the shape that came out of the design discussion: a broad AI-chosen category that lets the graph connect, and a free-form AI-chosen name that keeps the specific detail.

```json
{
  "id": "animal_7f3a9c",
  "category": "Animal",
  "name": "golden retriever",
  "properties": { "color": "golden", "state": "sitting" },
  "confidence": 0.95,
  "source_image_id": "img_sha256:ab12...",
  "model_name": "gpt-5-vision",
  "model_version": "...",
  "extraction_version": "v1",
  "created_at": "2026-07-09T10:15:02Z",
  "bbox": [12, 40, 220, 510]
}
```

### 2.1 The two meaning fields

- **`category`** — the broad bucket GPT-5 chose (`Animal`, `Machine`, `Vehicle`, ...). This becomes the node's **label** in FalkorDB, so `MATCH (n:Animal)` finds every animal across every image. It is what makes the graph queryable and connected.
- **`name`** — GPT-5's specific free-form descriptor (`golden retriever`). Stored as a **property**. It distinguishes nodes that share a category.

Both are the model's own output. Neither is validated against any vocabulary. See `EXTRACTION_SPEC.md`.

### 2.2 Provenance fields (on every node, always)

| Field | Type | Set by | Notes |
|-------|------|--------|-------|
| `id` | string | system | Stable, deterministic, content-derived (section 4) |
| `category` | string | model | Becomes the node label |
| `name` | string | model | Specific descriptor, stored as property |
| `confidence` | float [0,1] | model | The model's confidence in this node |
| `source_image_id` | string | system | The image this node came from |
| `model_name` | string | system | e.g. `gpt-5-vision` |
| `model_version` | string | system | Concrete model version |
| `extraction_version` | string | system | Pipeline extraction version |
| `created_at` | timestamp | system | First-seen time; never overwritten |
| `bbox` | int[4] | model | Bounding box if supplied |
| `properties` | map | model | Visible attributes; only recognized-as-visible keys, values verbatim |

Provenance is the one rigor the lean design keeps in full. Every fact in the graph can be traced to the image, model, version, and confidence that produced it.

---

## 3. The edge model

Edges use the relationship type GPT-5 produced, normalized for formatting. There is no fixed set of edge types, mirroring the no-fixed-categories decision for nodes.

```json
{
  "source_id": "animal_7f3a9c",
  "target_id": "furniture_2b8d1e",
  "type": "SITTING_ON",
  "confidence": 0.88,
  "source_image_id": "img_sha256:ab12...",
  "extraction_version": "v1",
  "created_at": "2026-07-09T10:15:02Z"
}
```

### 3.1 Edge type normalization

GPT-5 returns relationship types as short lowercase phrases (`sitting on`, `next to`, `looking at`). At generation these are normalized to a canonical edge-type token: uppercased, spaces to underscores, trimmed (`sitting on` → `SITTING_ON`). This normalization is purely formatting so the same phrase always maps to the same edge type. No phrase is rejected; the vocabulary is open.

### 3.2 Provenance on edges

Every edge carries `confidence`, `source_image_id`, `extraction_version`, and `created_at`. Plus the structural provenance edge below.

### 3.3 The provenance backbone

Every domain node also gets a `DERIVED_FROM` edge to an `Image` node representing the source image. This is a database-level edge type (distinct from the model's relationship types) and is always present, so every fact links back to its origin image and no node is an orphan.

```
(:Animal { name: "golden retriever" })-[:DERIVED_FROM]->(:Image { id: "img_sha256:ab12..." })
```

---

## 4. Node identity and the id scheme

Ids are deterministic and content-derived, so the same image re-ingested produces the same ids and MERGE makes re-ingest idempotent.

- **`Image` nodes:** `img_<sha256-of-image-bytes>`. The content hash is the image's identity. Re-uploading the same bytes yields the same `Image` id.
- **Domain nodes:** a deterministic id namespaced by category, derived from the node's identifying content within its source image, for example `animal_<hash>`, `machine_<hash>`. The hash is computed from stable fields (category, name, and the source image id) so that the same detection in the same image is the same id on re-ingest.

### 4.1 A deliberate scope note

Because domain-node ids incorporate the source image, **the same real-world entity photographed in two different images produces two different nodes**. The golden retriever in photo A and the golden retriever in photo B are two `Animal` nodes, not one. This is the accepted consequence of the lean design: v1 does not do cross-image entity re-identification. Within a single image, entities are stable and de-duplicated; across images, they are not merged. This is fine for a B2C platform whose near-term value is rich per-image understanding and querying by category across the whole collection. Cross-image re-identification is the most likely future extension, and the provenance and confidence already on every node are exactly what it would need (see `SYSTEM_DESIGN.md` section 11).

---

## 5. FalkorDB representation

- **Node labels** are the categories GPT-5 produced (`Animal`, `Machine`, ...), normalized for formatting (capitalized, spaces to underscores). Plus the structural `Image` label.
- **Edge types** are the normalized relationship types (section 3.1), plus the structural `DERIVED_FROM`.
- One label per node. Multi-labeling is not used.
- All the fields in sections 2 and 3 are stored as node and edge properties.

Because labels come from open model output, the set of labels grows as new categories appear. This is expected and harmless; queries target whatever labels exist, and the `GET /v1/categories` log (see `SYSTEM_DESIGN.md`) makes the label set observable.

---

## 6. Indexes

Indexes back the hot paths: provenance lookup, re-ingest MERGE, and query-time filtering.

| Index | On | Why |
|-------|----|----|
| Unique index on `id` per label | every node label | Enforces node identity; the MERGE anchor |
| Index on `source_image_id` | every node label | Fetch all nodes from one image; provenance, rollback |
| Index on `name` | every node label | Query and filter by specific descriptor |
| Index on `Image.hash` | `Image` | De-duplicate identical uploads |

Exact syntax is FalkorDB's; the client adapter creates these on startup if absent (idempotent). Because labels are open, index creation runs per newly-seen label the first time it appears.

---

## 7. Cypher generation rules

Generation is deterministic, parameterized, and never accepts model-authored text.

### 7.1 Determinism

Given the same validated fragment and graph state, the generator emits the same statements in the same order. This comes from deterministic ids (section 4), normalized labels and edge types (sections 5, 3.1), and a fixed statement order (section 7.5). It is tested (see `SYSTEM_DESIGN.md` determinism test).

### 7.2 Parameterization

All values pass as query parameters, never string-interpolated into the Cypher text. This is both an injection defense and a plan-cache benefit. The generator produces a statement template plus a parameter map. This matters especially here because labels and names are model-generated: they are validated for shape but still handled as untrusted, so names and property values are always parameters, and labels and edge types are drawn only from the normalized, character-whitelisted token (letters, digits, underscore) so a crafted category string cannot inject Cypher.

### 7.3 MERGE, not blind CREATE

Nodes are written with MERGE on the deterministic `id`, so re-ingesting the same image updates rather than duplicates.

```cypher
MERGE (n:`<Category>` { id: $id })
ON CREATE SET n += $create_props
ON MATCH SET  n.confidence = CASE WHEN $confidence > n.confidence
                                  THEN $confidence ELSE n.confidence END
```

- `$create_props` includes `created_at`, `name`, `confidence`, all provenance, and `properties`. Runs only on first creation.
- On re-ingest (`ON MATCH`), confidence is raised to the higher value; `created_at` and first-seen provenance are preserved.

### 7.4 Edge generation

Edges are written with MERGE on the pair-plus-type so re-ingest does not duplicate them:

```cypher
MATCH (a:`<CatA>` { id: $source_id })
MATCH (b:`<CatB>` { id: $target_id })
MERGE (a)-[r:`<REL_TYPE>`]->(b)
ON CREATE SET r += $edge_create_props
ON MATCH SET  r.confidence = CASE WHEN $confidence > r.confidence
                                  THEN $confidence ELSE r.confidence END
```

The `DERIVED_FROM` provenance edge is generated for every domain node in the fragment, linking it to its `Image` node.

### 7.5 Statement ordering

Within a fragment's transaction:

1. MERGE the `Image` node first (the provenance anchor must exist).
2. MERGE all domain nodes, ordered deterministically by id.
3. MERGE all `DERIVED_FROM` provenance edges.
4. MERGE all domain edges, ordered deterministically by (source id, target id, type).

This guarantees every edge's endpoint MATCH finds an already-created node, and makes the emitted sequence reproducible.

### 7.6 What generation refuses

- It refuses any input that is not a validated fragment. It does not accept raw model output.
- It never executes text authored by the model. There is no path from model output to a Cypher string; model output only ever populates parameters and the whitelisted label/edge-type tokens.
- It never interpolates a value into query text.

---

## 8. Transactions and rollback

The entire fragment for one image is written inside a single FalkorDB transaction.

- **Atomicity.** All statements for the fragment commit together or not at all. There is no committed state in which half an image's facts are present. This is what the rest of the system relies on for clean retries.
- **Rollback.** Any statement failure aborts the transaction; nothing from that fragment persists. The orchestrator marks the job failed with `graph_write_error` (see `SYSTEM_DESIGN.md`).
- **Retry.** Transient FalkorDB failures trigger a bounded, full-fragment retry in a fresh transaction. Deterministic ids and MERGE make a retry after a rolled-back attempt safe and idempotent.
- **Idempotency.** Re-running the same fragment is a no-op beyond confidence updates. Ingesting the same image twice does not double the graph.

---

## 9. Query and GraphRAG surface

The GraphRAG layer (see `SYSTEM_DESIGN.md`) reads with the same discipline the writes were made with.

- **Confidence filtering.** Read queries filter on node and edge `confidence` against a caller-supplied minimum, so low-confidence facts can be excluded at read time. This is the primary defense at query time against the occasional stray or hallucinated node.
- **Category queries.** Because categories are node labels, "show me all animals in my photos" is a label match. "Show me all vehicles" likewise. This is the payoff of the category/name split.
- **Provenance retrieval.** Any returned fact traces to its `Image` via `DERIVED_FROM`, and to the model and version via node properties. The retrieval layer never returns a fact stripped of the means to check where it came from.
- **Scoped queries.** Queries can be scoped to a single `source_image_id` or run across the whole accumulated graph, using the `source_image_id` and label indexes.
- **Bounded traversal.** Traversals are hop-bounded per request to keep queries predictable.

Read queries are also parameterized and generated by the query layer. User-supplied question text is never turned into raw Cypher directly.

---

## 10. Summary of invariants

The committed graph always satisfies these, enforced by the generator and client:

1. One label per node; the label is the model's category, normalized. Edge types are the model's relationship types, normalized. Plus the structural `Image` label and `DERIVED_FROM` edge.
2. Unique `id` per label; ids are deterministic and content-derived.
3. Every node and edge carries full provenance (source image, model, version, extraction version, confidence, timestamp).
4. Every domain node links to its `Image` via `DERIVED_FROM`; no orphan facts.
5. Within one image, entities are de-duplicated; across images they are not merged (v1 scope).
6. All writes are MERGE-based, parameterized, deterministic, and transactional; re-ingest is idempotent.
7. Labels and edge types reach Cypher only as character-whitelisted tokens; all other values are parameters. The model never authored any statement.
