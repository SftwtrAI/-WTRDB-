# wtrdb

**wtrdb turns text, images, video, and live MongoDB databases into governed, queryable knowledge graphs.**

It provides multi-source ingestion with AI-assisted entity/relationship extraction, graph
exploration, policy-aware access controls, compliance evidence tooling, and publishable
REST/MCP Brain Endpoints.

## What it does

- Build a knowledge graph from five kinds of source material (see below) and inspect
  entities, relationships, provenance, schema proposals, and extraction activity.
- Query graphs with natural language or Cypher; explore them in a 3D graph view with
  graph-quality signals.
- Publish one knowledge graph as a Brain Endpoint: a REST API and Model Context Protocol
  server backed by a per-endpoint API key.
- Control access with JWT authentication, RBAC, teams, scoped permissions, audit records,
  MFA, and viewer mode.
- Assess controls and collect/export evidence for supported compliance frameworks.

## Ingestion sources

The "New Graph" panel in the app offers five tabs.

| Source | Endpoint | Supported input | Limit |
| --- | --- | --- | --- |
| **Upload** | `POST /api/rag-knowledge/upload` | `.txt` `.md` `.html` `.htm` `.json` `.xml` `.csv` | 20 MB |
| **Text** | `POST /api/rag-knowledge/text` | pasted text | 10 MB request body |
| **MongoDB** | `POST /api/connectors/mongodb/test` and `/kg` | connection URI + database name | 12 documents sampled per collection |
| **Video** | `POST /video-kg/videos` (or resumable `tus` at `/video-kg/files/*`) | `video/*` | 2 GiB |
| **Image** | `POST /image-kg/images` | `image/*` (any format `sharp` decodes) | 25 MiB |

A sixth path is available through the API: **URL ingestion**
(`POST /api/rag-knowledge/url`), which fetches a page, strips the HTML, and ingests the
text. It is SSRF-guarded and capped at 5 MB.

How each source becomes a graph:

- **Text, files, and URLs** are chunked and embedded, then an LLM extracts entities and
  relationships into FalkorDB. Extraction runs in the background and reports progress
  live, so the upload call returns immediately.
- **Video and image** are handled by the two sidecar services, which run their own vision
  pipelines and write the same FalkorDB graph (`kg_{userId}_{kbId}`) and
  `knowledge_base` / `knowledge_graphs` rows the main server reads. Progress streams back
  to the browser as it happens.
- **MongoDB** connects to your database, samples each collection, and derives a graph of
  `Collection` and `Document` nodes joined by field-name edges — deterministic and fast
  enough to return in a single round trip. The result renders in the browser for
  exploration, and `POST /api/connectors/mongodb/ask` answers natural-language questions
  about it.

## Architecture

~~~mermaid
flowchart LR
  A[React client] --> API[Express API :5001]

  T[Text / files / URLs] --> API
  V[Video] --> VK[video-kg :6060]
  I[Image] --> IK[image-kg :6061]
  M[(Your MongoDB)] --> API

  API --> X[Chunk, embed, LLM extraction]
  X --> O[OpenAI]
  X --> G[(FalkorDB :6380)]
  VK --> G
  IK --> G

  API --> P[(PostgreSQL)]
  VK --> P
  IK --> P
  API --> R[(Redis :6379 - concurrency, RBAC cache)]

  VK -. live events .-> API
  IK -. live events .-> API
  API -. sampled preview, browser only .-> A

  G --> B[Brain Endpoint: REST and MCP]
~~~

The monorepo uses React/Vite for the client, Express/TypeScript for the API, PostgreSQL
with Drizzle ORM for relational data, FalkorDB for graph storage, Redis for concurrency
counters and RBAC permission caching, and OpenAI for extraction, vision, and embeddings.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the component-level design.

The sidecars stream progress back to the browser by POSTing to `/internal/kg-events` on
the main server, which re-emits them over the WebSocket bus.

## Repository layout

~~~
apps/
  client/         React + Vite frontend
  server/         Express API (the main service)
  docs/           Nextra documentation site
libs/
  shared/         Drizzle schema, KG types, temporal helpers
  core/           Logger, errors, validation, formatting
video-kg/         Standalone video → KG service (own deps, own .env)
image-kg/         Standalone image → KG service (own deps, own .env)
~~~

`video-kg` and `image-kg` are self-contained services. Each has its own `node_modules`,
lockfile, and `.env`, and runs TypeScript directly through its own local `tsx`, so each
can be installed, upgraded, and deployed independently of the root workspace.

## Quick start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- FalkorDB (Redis with the graph module loaded)
- Redis, as a separate instance from FalkorDB
- **ffmpeg and ffprobe on `PATH`** — used by `video-kg`
- An OpenAI API key

### Ports

| Service | Port |
| --- | --- |
| Express API (serves the client too) | 5001 |
| FalkorDB | 6380 |
| Redis | 6379 |
| video-kg | 6060 |
| image-kg | 6061 |
| Docs site | 3001 |

FalkorDB runs on **6380** and the Redis cache on **6379**, as two separate instances.
Point `FALKORDB_URL` at 6380 and `REDIS_URL` at 6379.

### Run locally

The quickest way to get the three databases is Docker. If you already run PostgreSQL,
FalkorDB, or Redis yourself, skip step 1 and point `.env` at them instead.

**1. Start PostgreSQL, FalkorDB, and Redis**

~~~bash
docker run -d --name wtrdb-postgres -p 5432:5432 \
  -e POSTGRES_USER=wtrdb -e POSTGRES_PASSWORD=wtrdb -e POSTGRES_DB=wtrdb \
  -v wtrdb_pg:/var/lib/postgresql/data postgres:16-alpine

docker run -d --name wtrdb-falkordb -p 6380:6379 \
  -v wtrdb_falkordb:/data falkordb/falkordb:latest

docker run -d --name wtrdb-redis -p 6379:6379 redis:7-alpine
~~~

**2. Install and configure**

~~~bash
git clone https://github.com/SftwtrAI/-WTRDB-.git wtrdb
cd wtrdb
npm install
cp .env.example .env
~~~

In `.env`, set at least these (generate secrets with `openssl rand -hex 32`):

~~~dotenv
DATABASE_URL=postgresql://wtrdb:wtrdb@localhost:5432/wtrdb
OPENAI_API_KEY=sk-...
JWT_SECRET=<random>
JWT_REFRESH_SECRET=<random>
SESSION_SECRET=<random>
INTERNAL_API_KEY=<random>
~~~

The FalkorDB, Redis, and port defaults in `.env.example` already match step 1.

**3. Create the schema and seed data**

~~~bash
npm run db:push
npm run db:seed
~~~

**4. Start the app**

~~~bash
npm run dev:server        # API + client on http://localhost:5001
~~~

Check it with `curl http://localhost:5001/health`, which should return `{"status":"ok"}`.

**5. Create your account**

Open http://localhost:5001 and sign up. The **first account registered becomes the
admin**. Sign-up sends a one-time email code. If SMTP isn't configured locally, read the
code from the database instead:

~~~bash
docker exec wtrdb-postgres psql -U wtrdb -d wtrdb -tAc \
  "select otp_code from otp_verifications order by created_at desc limit 1"
~~~

**6. (Optional) Start the video and image services**

Only needed for the Video and Image ingestion tabs. Run each in its own terminal:

~~~bash
cd video-kg && cp .env.example .env && npm install && npm run dev    # :6060, needs ffmpeg
cd image-kg && cp .env.example .env && npm install && npm run dev    # :6061
~~~

In each sidecar `.env`, set `DATABASE_URL` and `OPENAI_API_KEY` to the same values as
the root `.env`, and `JWT_SECRET` to the **same** secret as the root `JWT_SECRET`.
Check them with `curl localhost:6060/health` and `curl localhost:6061/health`.

**Use npm.** `package-lock.json` is the lockfile CI installs from (`npm ci`), so npm is
the canonical package manager. The sidecars carry their own `package-lock.json` files.

`npm run dev:server` mounts Vite as middleware, so one command serves both the API and
the client on a single port. Use `npm run dev:client` when you want a separate Vite dev
server; it proxies `/api` back to `PORT`.

The two sidecars run as their own processes, each started from its own folder:

~~~bash
cd video-kg && npm install && npm run dev    # :6060, uses ffmpeg
cd image-kg && npm install && npm run dev    # :6061
~~~

Each reads its own `video-kg/.env` / `image-kg/.env` (see the `.env.example` in each).
`dotenv` resolves these relative to the working directory, so start each service from
inside its own folder. On Linux, set `FFMPEG_FORCE_CPU=1` for `video-kg` to use the
CPU encoder.

Uploads reach the sidecars through the main server's authenticated `/video-kg` and
`/image-kg` reverse proxies, which keeps 6060 and 6061 internal to the host.

### Minimum configuration

~~~dotenv
NODE_ENV=development
PORT=5001
APP_URL=http://localhost:5001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
FALKORDB_URL=redis://localhost:6380
FALKORDB_HOST=localhost
FALKORDB_PORT=6380
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=replace-with-your-key
JWT_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-random-secret
SESSION_SECRET=replace-with-another-long-random-secret
INTERNAL_API_KEY=replace-with-a-shared-secret
~~~

`INTERNAL_API_KEY` gates `/mcp/*`, the RAG tool webhook, and the internal tools routes.
Never expose it to browser clients.

See [.env.example](.env.example) for every variable, and
[the configuration reference](apps/docs/pages/developers/configuration.mdx) for what the
optional integrations do.

Never commit .env files, API keys, endpoint keys, database credentials, or production
addresses.

## Common commands

| Command | Purpose |
| --- | --- |
| npm run dev:server | Start the Express API (also serves the client) |
| npm run dev:client | Start a standalone Vite client that proxies to the API |
| npm run dev:docs | Start Nextra documentation on port 3001 |
| npm run dev:all | Server and docs together |
| npm run build | Build client and server |
| npm run build:client / build:server | Build one target |
| npm start | Run the production server from dist/ |
| npm run check | Type-check the workspace |
| npm run lint | ESLint across all projects |
| npm test | Run the vitest suite |
| npm run db:push | Apply the current schema |
| npm run db:generate | Generate a migration |
| npm run db:seed | Seed platform data |
| npm run test:credits:all | Credit-system smoke and feature suites |
| npm run graph | Open the Nx dependency graph |

Per sidecar (`cd video-kg` or `cd image-kg`): `npm run dev`, `npm start`,
`npm run typecheck`, `npm run ingest` (CLI, one file), and `npm test` in `image-kg`.

## Testing

`npm test` runs the workspace suite:

- `apps/server/src/__tests__/` — six vitest files, 44 tests, covering knowledge-graph
  extraction and query, hybrid knowledge search, and the MongoDB connector (service,
  routes, integration). Config lives in `vitest.config.ts`.
- `image-kg` has its own vitest suite — run `npm test` inside that folder.
- `npm run test:credits:all` runs the credit-system scripts against a live database.

CI (`.github/workflows/ci.yml`) runs build, `tsc`, ESLint, a Prettier check, and
`npm audit` on every push.

## Deployment

Production runs under PM2 behind Caddy on GCP. The relevant files:

- [CICD_SETUP.md](CICD_SETUP.md) — pipeline setup
- [ecosystem.config.cjs](ecosystem.config.cjs) — PM2 apps: `sftwtrs`, `video-kg`, `image-kg`
- [deploy.sh](deploy.sh) and [deploy/caddy-db.sftwtrs.ai.conf](deploy/caddy-db.sftwtrs.ai.conf)

PM2 inherits the shell environment of whoever ran `pm2 start`, so make sure that
environment's `PATH` includes the directory holding `ffmpeg`.

## Documentation

Product and developer docs (Nextra, `npm run dev:docs`):

- [Getting started](apps/docs/pages/getting-started/quickstart.mdx)
- [Knowledge graphs and extraction](apps/docs/pages/platform/knowledge-graphs.mdx)
- [Brain Endpoints: REST and MCP](apps/docs/pages/integrations/brain-endpoints.mdx)
- [Local development and deployment](apps/docs/pages/developers/local-development.mdx)
- [Configuration reference](apps/docs/pages/developers/configuration.mdx)

In-repo design documents:

- [ARCHITECTURE.md](ARCHITECTURE.md) — component-level design
- [FRONTEND.md](FRONTEND.md) — client architecture
- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [EXTRACTION_SPEC.md](EXTRACTION_SPEC.md),
  [GRAPH_DB_SPEC.md](GRAPH_DB_SPEC.md) — the image/vision KG design set
- [video-kg/README.md](video-kg/README.md), [image-kg/README.md](image-kg/README.md)

## License

Proprietary. Copyright © Nilesh AI Systems Pvt Ltd (Sftwtrs.AI). All rights reserved.
For internal use.
