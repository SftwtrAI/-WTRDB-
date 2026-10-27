# Prompt changelog

Prompts are versioned artifacts. The prompt version is recorded on every fact as
provenance, so any node/edge traces to the exact instruction that produced it.
Changes are additive and versioned, never edited silently in place.

## p1 — initial

`extraction_p1.txt`. Single-pass image extraction (EXTRACTION_SPEC §4): broad
AI-chosen `category` (→ node label) + free-form `name` (→ property) per object;
short lowercase relationship `type`; confidence on everything; evidence-only,
no-text-completion framing; JSON-only output. Illustrative category examples,
not a closed list.
