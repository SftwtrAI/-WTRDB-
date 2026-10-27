# WtrDB Technical Mathematics — Knowledge Graph Cost Model

Cost estimation guide for the wtrdb knowledge graph system. **All calculations use 1 GB of effective text (pure extractable content) as the baseline unit.** Source data sizes vary by format — the conversion table in Section 2 maps source formats to effective text.

All figures are derived from actual codebase parameters and current OpenAI pricing (April 2026).

---

## 1. Pipeline Parameters (From Codebase)

| Parameter | Value | Source |
|-----------|-------|--------|
| Chunk size | 500 tokens (~2,000 chars) | `rag-knowledge.ts:37` |
| Chunk overlap | 50 tokens | `rag-knowledge.ts:38` |
| Extraction model | `gpt-4o-mini` | `knowledge-graph-extraction.ts:189` |
| Extraction temperature | 0.1 | `knowledge-graph-extraction.ts:198` |
| Extraction max_tokens | 4,096 | `knowledge-graph-extraction.ts:199` |
| Response format | `json_schema` (structured output) | `knowledge-graph-extraction.ts:194` |
| Embedding model | `text-embedding-3-small` | `rag-knowledge.ts:33` |
| Embedding dimensions | 1,536 | `rag-knowledge.ts:34` |
| Inter-chunk delay | 200ms | `knowledge-graph-extraction.ts` (rate limiter) |
| NL→Cypher model | `gpt-4o-mini` | `knowledge-graph-extraction.ts:746` |
| NL→Cypher max_tokens | 512 | `knowledge-graph-extraction.ts:749` |
| Entity types | 13 canonical | `knowledge-graph-prompts.ts:25-39` |
| Relationship types | 25 canonical | `knowledge-graph-prompts.ts:44-70` |
| Dedup key | `(name.toLowerCase(), label)` | `knowledge-graph-extraction.ts:312` |
| FalkorDB graph naming | `kg_{userId}_{kbId}` | `falkordb/client.ts:36-38` |

---

## 2. Effective Text — The Baseline Unit

**All cost and storage estimates in this document are measured in effective text** — the pure extractable content after stripping markup, metadata, field names, and structural syntax from source documents.

### Chunking 1 GB of Effective Text

```
1 GB effective text = 1,073,741,824 chars
Chunk size          = 2,000 chars (≈ 500 tokens)
Chunk overlap       = ~200 chars (50 tokens)
Effective stride    = 2,000 - 200 = 1,800 chars/chunk

Chunks from 1 GB effective text = ⌈1,073,741,824 / 1,800⌉ ≈ 596,523 chunks
```

### Source Format → Effective Text Conversion

To find your effective text size, divide your source data by the appropriate ratio:

| Source Format | Text Ratio | Source Size for 1 GB Effective Text |
|--------------|-----------|-------------------------------------|
| Plain text (.txt) | ~100% | 1.0 GB |
| Markdown (.md) | ~85% | 1.2 GB |
| PDF (text-heavy) | ~60% | 1.7 GB |
| Word (.docx) | ~40% | 2.5 GB |
| HTML (content pages) | ~30% | 3.3 GB |
| MongoDB JSON docs | ~25–35% | 2.9–4.0 GB |
| CSV/TSV (tabular data) | ~50–70% | 1.4–2.0 GB |

**Example:** A 3 GB MongoDB collection at 30% text ratio = **0.9 GB effective text**. Use the 1 GB row and multiply by 0.9.

---

## 3. Extraction Yield — Entities & Relationships per Chunk

Empirical extraction yields vary by document density:

| Document Type | Entities/Chunk | Relationships/Chunk | Events/Chunk | Dedup Ratio |
|--------------|---------------|---------------------|-------------|-------------|
| IT infrastructure docs | 4–8 | 3–6 | 0.5–1.5 | 40–60% |
| Legal/policy documents | 3–6 | 2–4 | 0.3–0.8 | 30–50% |
| Technical manuals | 5–10 | 4–8 | 0.2–0.5 | 50–70% |
| CRM/sales data | 3–5 | 2–4 | 0.5–1.0 | 20–40% |
| Meeting notes/transcripts | 6–12 | 4–8 | 1.0–3.0 | 30–50% |
| General knowledge base | 4–7 | 3–5 | 0.3–1.0 | 35–55% |

**Dedup ratio** = percentage of raw extracted entities that are duplicates, collapsed by the `(name.toLowerCase(), label)` key. Higher dedup = more cross-chunk entity references = denser, richer graph.

### Reference Calculation: 1 GB Effective Text (General KB)

```
Chunks:                596,523
Entities/chunk (avg):  5.5 (general knowledge base midpoint)
Relationships/chunk:   4.0
Events/chunk:          0.65

Raw entities:          596,523 × 5.5   = 3,280,877
Raw relationships:     596,523 × 4.0   = 2,386,092
Raw events:            596,523 × 0.65  =   387,740

Dedup ratio:           ~45% (general KB midpoint)
Unique entities:       3,280,877 × 0.55 = ~1,804,482  →  ~1.8M
Valid relationships:   2,386,092 × 0.85 = ~2,028,178  →  ~2.0M  (15% dropped: dangling refs)
Events:                387,740          = ~388K
```

### Yield by Document Type (1 GB Effective Text)

| Document Type | Chunks | Unique Entities | Valid Relationships | Events |
|--------------|--------|-----------------|---------------------|--------|
| IT infrastructure | 596,523 | ~1.43M | ~1.52M | ~447K |
| Legal/policy | 596,523 | ~1.34M | ~1.01M | ~328K |
| Technical manuals | 596,523 | ~1.79M | ~2.03M | ~209K |
| CRM/sales | 596,523 | ~1.43M | ~1.01M | ~447K |
| Meeting transcripts | 596,523 | ~3.58M | ~2.03M | ~1.19M |
| **General KB (reference)** | **596,523** | **~1.80M** | **~2.03M** | **~388K** |

---

## 4. FalkorDB Storage Requirements

### Per-Element Storage Estimates

**Per entity node:**

| Component | Bytes | Notes |
|-----------|-------|-------|
| Node header | 64 | Internal FalkorDB node ID, label index |
| `name` property | 30–80 | Average entity name length |
| `label` property | 8–16 | Entity type string |
| `sourceKnowledgeBaseId` | 36 | UUID |
| `sourceChunkIndex` | 4 | Integer |
| Additional properties (avg 2) | 60–120 | Key-value pairs |
| Index overhead | ~40 | Per-node index entries |
| **Total per entity** | **~300 bytes** | Working estimate |

**Per relationship edge:**

| Component | Bytes | Notes |
|-----------|-------|-------|
| Edge header | 48 | Source/target node IDs, type index |
| Relationship type | 12–20 | e.g., "WORKS_AT" |
| Properties (avg 1) | 30–60 | Key-value pair |
| **Total per relationship** | **~110 bytes** | Working estimate |

### Storage Formula

```
FalkorDB storage = ((entities × 300) + (relationships × 110)) × 1.15
                                                                 ↑ index overhead (15%)
```

### 1 GB Effective Text → FalkorDB Storage

```
Entities:      1,804,482 × 300 bytes  = 541.3 MB
Relationships: 2,028,178 × 110 bytes  = 223.1 MB
Subtotal:                               764.4 MB
Index overhead (15%):                    114.7 MB

Total FalkorDB storage:                ~879 MB  ≈  0.86 GB
```

### Scaling Table (Effective Text → Graph Storage)

| Effective Text | Chunks | Unique Entities | Valid Rels | FalkorDB Storage | Graph:Text Ratio |
|---------------|--------|-----------------|------------|------------------|-----------------|
| 10 MB | ~5,965 | ~18K | ~20K | ~8.8 MB | 1:1.14 |
| 50 MB | ~29,825 | ~90K | ~101K | ~43.9 MB | 1:1.14 |
| 100 MB | ~59,652 | ~180K | ~203K | ~87.9 MB | 1:1.14 |
| 500 MB | ~298,262 | ~902K | ~1.01M | ~439 MB | 1:1.14 |
| **1 GB** | **~596,523** | **~1.80M** | **~2.03M** | **~879 MB** | **1:1.17** |
| 2 GB | ~1,193,046 | ~3.61M | ~4.06M | ~1.76 GB | 1:1.14 |
| 5 GB | ~2,982,615 | ~9.02M | ~10.1M | ~4.39 GB | 1:1.14 |
| 10 GB | ~5,965,230 | ~18.0M | ~20.3M | ~8.79 GB | 1:1.14 |

**Rule of thumb: FalkorDB graph storage ≈ 88% of effective text size.** For 1 GB of effective text, budget ~0.9 GB of FalkorDB memory.

### FalkorDB Memory Requirements

FalkorDB is in-memory (Redis protocol). The graph must fit in RAM with headroom for query execution:

```
RAM required = FalkorDB storage × 1.5  (execution buffers, intermediate results)
```

| Effective Text | FalkorDB Storage | Required RAM | Recommended Instance |
|---------------|------------------|-------------|---------------------|
| 100 MB | 88 MB | 132 MB | 256 MB |
| 500 MB | 439 MB | 659 MB | 1 GB |
| **1 GB** | **879 MB** | **1.32 GB** | **2 GB** |
| 2 GB | 1.76 GB | 2.64 GB | 4 GB |
| 5 GB | 4.39 GB | 6.59 GB | 8 GB |
| 10 GB | 8.79 GB | 13.2 GB | 16 GB |
| 50 GB | 43.9 GB | 65.9 GB | 96 GB |

---

## 5. AI Cost — Extraction Pipeline

### Per-Chunk Extraction Cost (gpt-4o-mini)

| Component | Tokens |
|-----------|--------|
| System prompt (instructions + entity/rel types + dual-track rules) | ~650 |
| User prompt (doc title + chunk text) | ~550 (500 chunk + 50 overhead) |
| Existing entity hints (up to 200 names) | 0–400 |
| JSON schema (structured output overhead) | ~300 |
| **Total input** | **~1,500–1,900** |
| **Response (entities + relationships + events JSON)** | **~800–2,000** |
| **Average input** | **~1,700** |
| **Average output** | **~1,200** |

**gpt-4o-mini pricing (April 2026):**

| Rate | $/1M tokens |
|------|------------|
| Input | $0.15 |
| Output | $0.60 |
| Cached input | $0.075 |

```
Per-chunk cost (no cache):
  Input:  1,700 × $0.15/1M  = $0.000255
  Output: 1,200 × $0.60/1M  = $0.000720
  Total:                       $0.000975 ≈ $0.001/chunk

Per-chunk cost (with prompt caching):
  Cached:  950 × $0.075/1M  = $0.0000713
  Fresh:   750 × $0.15/1M   = $0.0001125
  Output: 1,200 × $0.60/1M  = $0.000720
  Total:                       $0.000904 ≈ $0.0009/chunk
```

### Extraction Cost by Effective Text Size

| Effective Text | Chunks | Cost (no cache) | Cost (cached) | Time (sequential, 200ms/chunk) | Time (10 parallel workers) |
|---------------|--------|-----------------|---------------|-------------------------------|---------------------------|
| 10 MB | 5,965 | $5.82 | $5.37 | 20 min | 2 min |
| 50 MB | 29,825 | $29.08 | $26.84 | 1.7 hrs | 10 min |
| 100 MB | 59,652 | $58.16 | $53.69 | 3.3 hrs | 20 min |
| 500 MB | 298,262 | $290.81 | $268.43 | 16.6 hrs | 1.7 hrs |
| **1 GB** | **596,523** | **$581.61** | **$536.87** | **33.1 hrs** | **3.3 hrs** |
| 2 GB | 1,193,046 | $1,163.22 | $1,073.74 | 66.3 hrs | 6.6 hrs |
| 5 GB | 2,982,615 | $2,908.05 | $2,684.35 | 165.7 hrs | 16.6 hrs |
| 10 GB | 5,965,230 | $5,816.10 | $5,368.71 | 331.4 hrs | 33.1 hrs |

**Parallelism note:** The 200ms inter-chunk delay is per-worker. With N parallel workers, wall-clock time ÷ N. OpenAI Tier 4+ supports 10,000+ RPM for gpt-4o-mini, comfortably handling 10–20 parallel workers.

---

## 6. AI Cost — RAG Embedding Pipeline

Embeddings are computed on the same chunks (prerequisite for RAG, not the knowledge graph itself):

**text-embedding-3-small pricing:** $0.02 / 1M tokens

```
Per-chunk embedding: 500 tokens × $0.02/1M = $0.00001
```

| Effective Text | Chunks | Embedding Cost | PG Vector Storage (1,536 dims × 4 bytes) |
|---------------|--------|---------------|------------------------------------------|
| 100 MB | 59,652 | $0.60 | 366 MB |
| 500 MB | 298,262 | $2.98 | 1.83 GB |
| **1 GB** | **596,523** | **$5.97** | **3.66 GB** |
| 5 GB | 2,982,615 | $29.83 | 18.3 GB |
| 10 GB | 5,965,230 | $59.65 | 36.6 GB |

---

## 7. AI Cost — Natural Language Queries

Each NL→Cypher query makes one gpt-4o-mini call:

| Component | Tokens |
|-----------|--------|
| System prompt (schema, rules) | ~300 |
| Conversation history (0–5 turns) | 0–1,000 |
| User query | ~30–100 |
| **Total input** | **~330–1,400** |
| Cypher output | ~50–200 |
| **Average output** | **~100** |

```
Per-query cost (no history):   $0.00012
Per-query cost (5-turn history): $0.00027
```

| Query Volume | Monthly Cost (no history) | Monthly Cost (5-turn) |
|-------------|--------------------------|----------------------|
| 100/day | $0.36 | $0.81 |
| 1,000/day | $3.60 | $8.10 |
| 10,000/day | $36.00 | $81.00 |
| 100,000/day | $360.00 | $810.00 |

---

## 8. Total Cost Summary — Full Pipeline

### Per-Knowledge-Base (One-Time Extraction from Effective Text)

| Effective Text | Extraction (AI) | Embedding (AI) | Total AI Cost | FalkorDB Storage | PG Vector Storage | Total Storage |
|---------------|-----------------|---------------|--------------|------------------|-------------------|---------------|
| 10 MB | $5.82 | $0.06 | **$5.88** | 8.8 MB | 37 MB | 46 MB |
| 50 MB | $29.08 | $0.30 | **$29.38** | 43.9 MB | 183 MB | 227 MB |
| 100 MB | $58.16 | $0.60 | **$58.76** | 87.9 MB | 366 MB | 454 MB |
| 500 MB | $290.81 | $2.98 | **$293.79** | 439 MB | 1.83 GB | 2.27 GB |
| **1 GB** | **$581.61** | **$5.97** | **$587.58** | **879 MB** | **3.66 GB** | **4.54 GB** |
| 5 GB | $2,908.05 | $29.83 | **$2,937.88** | 4.39 GB | 18.3 GB | 22.7 GB |

### Ongoing Query Costs (Monthly)

| Usage Tier | NL Queries/Day | Monthly AI Cost |
|------------|---------------|----------------|
| Light | 100 | $3.60 |
| Moderate | 1,000 | $36.00 |
| Heavy | 10,000 | $360.00 |
| Enterprise | 100,000 | $3,600.00 |

---

## 9. Cost Optimization Strategies

### Already Implemented

| Strategy | Saving | How |
|----------|--------|-----|
| gpt-4o-mini for extraction | ~13x vs gpt-4o | `knowledge-graph-extraction.ts:189` |
| Structured JSON output | ~20% fewer output tokens | `response_format: json_schema` |
| Dedup by (name, label) key | 35–70% entity reduction | `knowledge-graph-extraction.ts:312` |
| 200ms rate limiter | Prevents 429 errors | Inter-chunk delay |

### Available Optimizations

| Strategy | Potential Saving | Trade-off |
|----------|-----------------|-----------|
| **Prompt caching** (OpenAI) | ~8% extraction cost | System prompt must be ≥1,024 tokens and identical across calls |
| **Batch API** (OpenAI) | 50% extraction cost | 24-hour SLA, not real-time |
| **Parallel extraction** (10 workers) | 10x time reduction | Higher burst rate limits needed (Tier 4+) |
| **Skip unchanged chunks** (incremental) | Up to 90% on re-extraction | Requires chunk hash tracking |
| **Model downgrade to gpt-4.1-nano** | ~50% vs gpt-4o-mini | Lower extraction quality (needs evaluation) |
| **GLiNER (205M params) for NER** | ~99% extraction cost on empty chunks | Entity extraction only — no relationships. Use as pre-filter |
| **Fine-tuned Llama3-8B** | ~95% extraction cost (after training) | Requires 1,500+ labeled examples. Self-hosted GPU needed |
| **Sparse extraction** (every Nth chunk) | Linear cost reduction | Misses entities in skipped chunks |

### Cost Reduction with Batch API (Most Practical)

The OpenAI Batch API charges 50% of standard pricing with a 24-hour SLA:

| Effective Text | Standard Cost | Batch API Cost | Saving |
|---------------|--------------|----------------|--------|
| 100 MB | $58.16 | $29.08 | $29.08 |
| 1 GB | $581.61 | $290.81 | $290.81 |
| 5 GB | $2,908.05 | $1,454.03 | $1,454.03 |

### Cost Reduction Cascade (Recommended for Production)

```
Tier 1: GLiNER (205M, CPU)          → Entity NER pre-filter      Cost: ~$0
Tier 2: gpt-4o-mini                 → Relationships + Events     Cost: $0.001/chunk
Tier 3: gpt-4o (conflicts only)     → Conflict resolution        Cost: rare

Expected saving: 40–60% of Tier 2 calls avoided when GLiNER finds <2 entities.
Effective cost for 1 GB: ~$230–$350 (down from $582)
```

---

## 10. Infrastructure Sizing Guide

All tiers measured in effective text, not source data.

### Small (< 100 MB effective text)

| Component | Specification | Monthly Cost |
|-----------|--------------|-------------|
| FalkorDB | 256 MB RAM, 1 vCPU | ~$10 |
| PostgreSQL | 2 GB storage | ~$15 |
| Redis (queues) | 256 MB | ~$10 |
| **Total infra** | | **~$35/mo** |

### Medium (100 MB – 1 GB effective text)

| Component | Specification | Monthly Cost |
|-----------|--------------|-------------|
| FalkorDB | 2 GB RAM, 2 vCPU | ~$40 |
| PostgreSQL | 10 GB storage | ~$30 |
| Redis (queues) | 512 MB | ~$15 |
| **Total infra** | | **~$85/mo** |

### Large (1 – 10 GB effective text)

| Component | Specification | Monthly Cost |
|-----------|--------------|-------------|
| FalkorDB | 16 GB RAM, 4 vCPU | ~$120 |
| PostgreSQL | 50 GB storage | ~$60 |
| Redis (queues) | 1 GB | ~$20 |
| **Total infra** | | **~$200/mo** |

### Enterprise (10 – 50 GB effective text)

| Component | Specification | Monthly Cost |
|-----------|--------------|-------------|
| FalkorDB | 96 GB RAM, 8 vCPU | ~$400 |
| PostgreSQL | 500 GB storage (consider partitioning) | ~$200 |
| Redis (queues) | 2 GB | ~$30 |
| **Total infra** | | **~$630/mo** |

---

## 11. Key Formulas Reference

```
# Chunks from effective text
chunks = ⌈effective_text_bytes / 1,800⌉

# Reference: 1 GB effective text = 596,523 chunks

# Entities after dedup
unique_entities = chunks × entities_per_chunk × (1 - dedup_ratio)

# Relationships after dangling-ref removal
valid_relationships = chunks × rels_per_chunk × 0.85

# FalkorDB storage
falkordb_bytes = ((unique_entities × 300) + (valid_relationships × 110)) × 1.15

# FalkorDB RAM requirement
ram_required = falkordb_bytes × 1.5

# Extraction AI cost (gpt-4o-mini, no cache)
extraction_cost = chunks × $0.000975

# Extraction AI cost (gpt-4o-mini, with prompt caching)
extraction_cost_cached = chunks × $0.000904

# Extraction AI cost (Batch API, 50% discount)
extraction_cost_batch = chunks × $0.000488

# Embedding AI cost (text-embedding-3-small)
embedding_cost = chunks × $0.00001

# PG vector storage
vector_storage = chunks × 6,144 bytes  (1,536 dims × 4 bytes)

# NL query AI cost (per query, no history)
query_cost = $0.00012

# NL query AI cost (per query, 5-turn history)
query_cost_history = $0.00027

# Quick estimates for 1 GB effective text (general KB):
#   Chunks:       ~597K
#   Entities:     ~1.8M unique
#   Relationships: ~2.0M valid
#   FalkorDB:     ~879 MB
#   PG Vectors:   ~3.66 GB
#   AI Extract:   ~$582 (standard) / ~$291 (batch) / ~$537 (cached)
#   AI Embed:     ~$5.97
```

---

## 12. Appendix: OpenAI Pricing Reference (April 2026)

| Model | Input ($/1M tokens) | Output ($/1M tokens) | Cached Input | Batch Input |
|-------|---------------------|---------------------|-------------|------------|
| gpt-4o | $2.50 | $10.00 | $1.25 | $1.25 |
| gpt-4o-mini | $0.15 | $0.60 | $0.075 | $0.075 |
| gpt-4.1-nano | $0.10 | $0.40 | $0.025 | $0.025 |
| text-embedding-3-small | $0.02 | — | — | — |
| text-embedding-3-large | $0.13 | — | — | — |

*All prices are per 1 million tokens. Cached input requires ≥1,024 token prefix match. Batch API requires Tier 3+ and has a 24-hour completion SLA.*
