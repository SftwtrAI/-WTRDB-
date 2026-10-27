# Extraction Specification — Wtr.Vision-KG

**Feature:** Image-to-Knowledge-Graph for WtrDB (B2C, general-purpose)
**Version:** 2.0
**Prompt version:** p1
**Related:** `SYSTEM_DESIGN.md`, `GRAPH_DB_SPEC.md`

---

## 1. Purpose

This document defines how GPT-5 Vision is prompted, what it returns, and how the system defends against malformed or hallucinated output. This is where the real design lives, because in the lean architecture the prompt is doing the work that a fixed ontology and a mapping layer used to do.

The governing rule:

> GPT-5 identifies, categorizes, and names objects and relationships in a single pass, guided by categorization instructions in the prompt. It returns JSON only. It never writes Cypher and never invents structure outside the schema. Its output is an untrusted proposal, validated for shape before anything is written.

GPT-5 Vision is called behind the `VisionProvider` interface (see `SYSTEM_DESIGN.md`), so a later model swap is a config change. The prompt below is the concrete instruction set for GPT-5.

---

## 2. Single-pass extraction

There is no ontology to map onto, so extraction is one model call, not the two-stage observe-then-map flow of a governed-schema design. GPT-5 sees the image and returns a complete graph fragment: nodes with categories and names, relationships, and provenance-relevant fields. This is simpler, cheaper, and lower-latency.

```
Image + categorization prompt
        │
        ▼
   GPT-5 Vision (single call)
        │
        ▼
Raw graph proposal JSON  ──►  parse + validate shape  ──►  Cypher generation  ──►  FalkorDB
```

---

## 3. The categorization approach

This is the heart of it. GPT-5 decides categories on its own. The prompt does not give it a list to choose from; it gives it *instructions on how to categorize* so the categories come out at a consistent grain. For a broad consumer platform this works well, because GPT-5 already has strong common-sense categories for everyday things.

The instructions steer three things:

**Grain.** Categories should be broad and common-sense, the kind of bucket a person would name without thinking: Person, Animal, Vehicle, Machine, Tool, Food, Furniture, Plant, Building, Product, Document, Clothing. Not narrow sub-types. A golden retriever is category `Animal`, name `golden retriever`, not category `GoldenRetriever`. The prompt tells the model to reach for the broad, obvious bucket.

**The category/name split.** The broad bucket goes in `category`. The specific descriptor, in the model's own words, goes in `name`. This split is what lets the graph both connect things (query all `Animal`) and keep specific detail (this one is a `golden retriever`). The prompt makes the split explicit and gives examples.

**Consistency of wording.** The prompt asks the model to prefer the most common, plain word for a category, so that across images it naturally reaches for the same word. This is guidance, not enforcement; a B2C corpus does not need airtight consistency, and none is imposed.

The prompt provides a handful of illustrative examples so the model understands the grain by demonstration. The examples are illustrative, not a closed list. The model is free to produce categories not among the examples whenever the image calls for it.

---

## 4. System prompt (p1)

```
You are a visual knowledge-graph extraction engine.

You are given a single image. Identify the objects in it, the relationships
between them, and describe each one. Return the result as structured JSON.

For every object, provide:
- "category": a BROAD, common-sense category, the kind of simple bucket a
  person would use without thinking. Prefer the most common, plain word.
  Examples of the right level of breadth: Person, Animal, Vehicle, Machine,
  Tool, Food, Furniture, Plant, Building, Product, Document, Clothing.
  These examples are illustrative, not a fixed list. If none fits, choose
  your own broad category at the same level of breadth. Do NOT use narrow
  sub-types as the category.
- "name": a specific, free-form descriptor of this particular object, in
  your own words. This is where the detail goes.
- "properties": any clearly visible attributes (color, state, material,
  brand, legible text), only if actually visible.
- "confidence": a number between 0 and 1 for how clearly the object is
  present and correctly identified.
- "bbox": bounding box [x1, y1, x2, y2] if you can provide one.

Examples of the category/name split:
- a golden retriever  → category "Animal",  name "golden retriever"
- a red pickup truck  → category "Vehicle", name "red pickup truck"
- a hydraulic press   → category "Machine", name "hydraulic press"
- a slice of pizza    → category "Food",    name "slice of pepperoni pizza"

For every relationship between two objects, provide:
- "source_ref" and "target_ref": the local refs of the two objects
- "type": a short, lowercase relationship label in your own words
  (for example: "holding", "next to", "inside", "sitting on", "looking at")
- "confidence": a number between 0 and 1

Rules:
- Output valid JSON only. No prose, no markdown, no code fences, no commentary.
- Report only what is visually present. Do not add objects you expect but
  cannot see. Do not complete or correct text you cannot fully read.
- Every object and every relationship carries a confidence between 0 and 1.
- Do NOT write database queries or Cypher. Return only the JSON fragment.

Return JSON matching the extraction schema exactly.
```

---

## 5. Output schema

GPT-5 must return JSON matching this shape. Validated by JSON Schema and Pydantic before Cypher generation. Note that categories, names, and relationship types are free-form strings; the schema constrains *structure and required fields*, not vocabulary.

```json
{
  "objects": [
    {
      "local_ref": "o1",
      "category": "Animal",
      "name": "golden retriever",
      "properties": { "color": "golden", "state": "sitting" },
      "confidence": 0.95,
      "bbox": [12, 40, 220, 510]
    },
    {
      "local_ref": "o2",
      "category": "Furniture",
      "name": "wooden bench",
      "properties": { "material": "wood" },
      "confidence": 0.9,
      "bbox": [0, 300, 640, 512]
    }
  ],
  "relationships": [
    {
      "source_ref": "o1",
      "target_ref": "o2",
      "type": "sitting on",
      "confidence": 0.88
    }
  ]
}
```

### 5.1 Field rules

| Field | Required | Free-form | Notes |
|-------|----------|-----------|-------|
| `local_ref` | yes | — | The model's temporary handle, used to wire relationships within this fragment. Not a database id; the system assigns real ids later |
| `category` | yes | yes | Broad bucket, the model's choice. Becomes the node label in FalkorDB |
| `name` | yes | yes | Specific descriptor, the model's own words. Stored as a property |
| `properties` | no | keys free | Only visible attributes. Values stored verbatim, trimmed |
| `confidence` | yes | — | Float in [0,1]. Missing confidence fails validation |
| `bbox` | no | — | `[x1,y1,x2,y2]` if supplied |
| relationship `type` | yes | yes | Short lowercase label, the model's words. Becomes the edge type |
| relationship `confidence` | yes | — | Float in [0,1] |

### 5.2 What validation checks

Validation is about **shape and provenance completeness**, never vocabulary.

- The JSON parses and matches the schema structure.
- Every object has a `category`, a `name`, and a `confidence` in [0,1].
- Every relationship has `source_ref`, `target_ref`, `type`, and a `confidence` in [0,1].
- Every `source_ref` and `target_ref` points at an object present in the fragment (no dangling relationships).
- No object is missing a `local_ref`.

Categories and names are accepted as-is. There is no list to check them against. The category becomes a node label and the relationship type becomes an edge type at generation time, normalized only for formatting (see `GRAPH_DB_SPEC.md`).

---

## 6. Retry and repair strategy

Model output is fallible. The system repairs what it can, re-prompts once when it cannot, and fails cleanly rather than writing garbage. Nothing reaches the graph until it validates.

### 6.1 Failure classes and responses

| Failure | Detected at | Response |
|---------|-------------|----------|
| Transient GPT-5 error (timeout, 429, 5xx) | Provider call | Exponential backoff with jitter, capped attempts, then fail `vision_provider_error` |
| Output has fences or wrapping prose | Parser | Strip defensively, then parse. No re-call |
| Malformed JSON (recoverable) | Parser | Structural repair (6.2). If it parses and validates, proceed |
| Malformed JSON (unrecoverable) | Parser | One corrective re-prompt (6.3), then fail `model_output_invalid` |
| Parses but violates shape (missing field, dangling ref) | Validator | One corrective re-prompt naming the errors, then fail |

### 6.2 Structural repair

Before re-calling the model, the parser attempts cheap, deterministic fixes on the raw text: removing code fences, trimming leading or trailing prose, closing an obviously truncated trailing structure, fixing trailing commas. Repair only ever removes noise or closes an unambiguous truncation. It never invents field values, never adds objects, never changes a confidence. If repair yields valid, schema-conformant JSON, the pipeline proceeds. Otherwise repair is abandoned and the corrective re-prompt runs.

### 6.3 Corrective re-prompt

One re-prompt, not a loop. The corrective message restates the JSON-only requirement and, when the failure was a shape violation, names the specific problem (for example, "object[2] is missing required field 'confidence'" or "relationship[0].target_ref 'o9' does not match any object"). The image and original instruction are re-sent. The model gets exactly one chance to correct. If the corrected output still fails validation, the job fails with `model_output_invalid` and nothing is written. Bounded retries, because an unbounded repair loop is how a system quietly burns tokens and still writes nothing.

### 6.4 Retry budget

- GPT-5 transient errors: capped attempts with backoff, configured in `config/`.
- Output-quality corrective re-prompts: one, maximum.
- Graph-write retries: handled downstream in the FalkorDB client (see `SYSTEM_DESIGN.md`), each a full-fragment retry in a fresh transaction.

---

## 7. Hallucination mitigation

Vision models confabulate: they complete occluded objects, read text that is not there, and assert plausible but unobserved relationships. The lean design has fewer structural guards than a governed-ontology design (there is no vocabulary to reject an invented type against), so the prompt-level and confidence-level defenses carry more weight, and the provenance and deterministic-write guarantees carry the rest.

### 7.1 Prompt-level defenses

- **Evidence-only framing.** The prompt asks for what is visually present and explicitly forbids adding expected-but-unseen objects.
- **No text completion.** The prompt forbids completing or correcting text that cannot be fully read, which stops fabricated signage and labels.
- **Confidence on everything.** Requiring a confidence per object and per relationship makes the model's uncertainty explicit and machine-actionable.
- **Free naming reduces forcing.** Because the model names things in its own words rather than forcing them into predefined types, one common source of labeling hallucination, jamming an ill-fitting object into the nearest allowed type, simply does not arise.

### 7.2 System-level defenses

- **Confidence thresholding.** Objects and relationships below the configured `min_confidence` are filtered before insertion, or retained but flagged for read-time filtering, per config. Low-confidence facts never masquerade as certain.
- **Shape validation.** Dangling relationships, missing fields, and malformed structure are rejected before anything is written.
- **Provenance.** Every node and edge records the model, model version, image, extraction version, and confidence that produced it. A later-discovered hallucination is traceable and removable, and its blast radius is known.
- **No model-authored writes.** Cypher is generated deterministically and the model never touches the database, so even a fully hallucinated fragment can only ever propose. It cannot execute.
- **Idempotent re-ingest.** MERGE-based writes on deterministic ids mean a re-ingested image cannot silently multiply hallucinated facts.

### 7.3 The layered stance

No single defense is trusted alone. The prompt reduces hallucination at the source; confidence filtering suppresses the uncertain; shape validation blocks the malformed; provenance makes the rest auditable; and the deterministic-write boundary guarantees the model never reaches the graph directly. Correctness comes from the layering. The lean design leans harder on prompt and confidence than a governed design would, which is the deliberate trade for its simplicity, and it is an appropriate trade for a B2C platform where the cost of an occasional stray node is low and easily filtered.

---

## 8. Prompt versioning

Prompts are versioned artifacts in `prompts/`.

```
prompts/
├── extraction_p1.txt
└── CHANGELOG.md
```

- Each job records the prompt version used, alongside the model and extraction versions, for full reproducibility.
- Prompt changes are additive and versioned, never edited silently in place. A change that alters output shape is coordinated with the schema and the validator.
- The prompt version is part of provenance, so any fact can be traced to the exact instruction that produced it.

Tuning the categorization grain, if the category log ever shows the model drifting to the wrong level of breadth, is a prompt edit here, coordinated with a version bump. There is no schema to change, because there is no schema.

---

## 9. Provider adapter notes

The prompt above is written for GPT-5 Vision. The adapter absorbs the API specifics.

- **Image passing.** GPT-5 expects images in its own encoding and message structure; the adapter handles that, taking a `PreparedImage` from preprocessing.
- **Structured output.** Where GPT-5 supports a JSON mode or response schema, the adapter enables it and supplies the schema from section 5. Otherwise the parser's defensive handling and the retry strategy cover the gap.
- **Usage reporting.** The adapter returns token usage so the observability layer can record per-call token cost (see `SYSTEM_DESIGN.md`).

The rest of the pipeline neither knows nor cares which model is configured. Swapping GPT-5 for another vision model later is a config change behind the `VisionProvider` interface.
