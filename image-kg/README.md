# image-kg — Image → Knowledge Graph

Turns an uploaded image into a knowledge graph and injects it into the co-located wtrdb
instance, so it appears in wtrdb's existing graph UI alongside every other knowledge base.

Pipeline: `upload → sharp preprocess → GPT vision extraction → shape validation →
confidence filter → deterministic Cypher → FalkorDB + Postgres rows`.

This is an additive, standalone service. It leaves wtrdb untouched and integrates purely
through data: it writes the same FalkorDB graph (`kg_{userId}_{kbId}`) and the same
`knowledge_base` / `knowledge_graphs` rows that wtrdb already reads.

The original design document is [SPEC.md](SPEC.md); it describes a Python stack, while the
service as built is Node/TypeScript on Express.

## Prerequisites

- Node.js 20+
- FalkorDB on `:6380` (Redis with the **graph module** loaded; the Redis cache is on `:6379`)
- PostgreSQL — the same database wtrdb uses
- An OpenAI API key, or a wtrdb `global_settings.openai_api_key` row to fall back to

Image decoding uses `sharp`, which ships prebuilt binaries, so `npm install` is all the
setup required.

## Run

~~~bash
cd image-kg
npm install
cp .env.example .env    # fill in DATABASE_URL, FALKORDB_URL, JWT_SECRET, OPENAI_API_KEY
npm run dev             # :6061
~~~

`dotenv` resolves `.env` relative to the working directory, so always start from inside
this folder. In production PM2 runs it via this package's own local `tsx` with
`cwd` set here (see `../ecosystem.config.cjs`).

Other scripts: `npm start` (single run), `npm run typecheck`, `npm test` (vitest),
`npm run ingest <path>` (CLI, one image).

## Access

Browsers reach this service through wtrdb's authenticated reverse proxy at `/image-kg`,
which strips the prefix, applies authentication, and streams the body through
unbuffered. Keep port 6061 internal to the host so all traffic arrives through that proxy.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | liveness |
| `POST` | `/images?name=<title>` | upload; raw `application/octet-stream` body, or `X-Filename` header |
| `GET` | `/images` | list ingest jobs |
| `GET` | `/images/:imageId` | job status, progress, deep links |
| `POST` | `/query` | `{imageId\|kbId, question, minConfidence, conversationHistory}` |
| `GET` | `/categories` | observed categories, optionally `?kbId=` |

`/query` answers locally: it reads the graph out of FalkorDB and reasons over it with
`QUERY_MODEL`, so it answers independently of wtrdb.

## Input

Anything `sharp` decodes — JPEG, PNG, WebP, TIFF, GIF, AVIF (HEIC only if the installed
libvips has HEIF support) — whatever `sharp` accepts is accepted here. Limit is
`MAX_IMAGE_BYTES`, default **25 MiB**, enforced while streaming (413).

Images are identified by the SHA-256 of their raw bytes (`img_<hash>`), so re-uploading
the same file MERGEs into the existing nodes, keeping ingestion idempotent.

## What it writes

- **FalkorDB** — one `:Image` anchor node MERGEd on id, domain nodes labelled by the
  AI-chosen category, a `DERIVED_FROM` edge from each domain node to the image, and typed
  domain edges. All in a single parameterized `GRAPH.QUERY`, with indexes created per
  label. Every node and edge carries provenance: confidence, source image, model, model
  version, extraction version, timestamp, and bounding box when available.
- **PostgreSQL** — `knowledge_base` (`type = 'image'`) and `knowledge_graphs`
  (`extracting` → `completed` / `failed`), reusing wtrdb's existing schema.
- **Disk** — `data/jobs/*.json` and `data/uploads/<imageId>/`.

Objects below `MIN_CONFIDENCE` (default 0.3) are dropped, along with any relationship
whose endpoint was dropped.

Progress streams back to the browser by POSTing to wtrdb's `/internal/kg-events`, which
re-emits over its WebSocket bus.

## Configuration

All settings go through `src/config.ts`; nothing else reads `process.env`.

| Variable | Default |
| --- | --- |
| `IMAGE_KG_PORT` | `6061` |
| `DATABASE_URL` | — (required) |
| `FALKORDB_URL` | `redis://localhost:6380` |
| `JWT_SECRET` | — (required; also the shared secret for the events bridge) |
| `V2_BASE_URL` | `http://localhost:5001` |
| `OPENAI_API_KEY` | falls back to wtrdb's `global_settings` |
| `VISION_MODEL` / `QUERY_MODEL` | `gpt-5` |
| `MAX_IMAGE_BYTES` | `26214400` (25 MiB) |
| `IMAGE_MAX_DIM` | `1024` |
| `MIN_CONFIDENCE` | `0.3` |
| `DATA_DIR`, `CORS_ORIGINS`, `EXTRACTION_VERSION`, `PROMPT_VERSION` | see `.env.example` |
| `DEFAULT_USER_ID` / `USER_EMAIL` / `USER_PASSWORD` | owner resolution |

The ingested knowledge base is owned by the user resolved from `DEFAULT_USER_ID` or
`USER_EMAIL`, so set one of those to the account that should own ingested images.
