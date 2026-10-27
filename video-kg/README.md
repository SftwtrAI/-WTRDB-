# video-kg — Video → Knowledge Graph

Turns an uploaded video into a **temporal knowledge graph** and injects it into the
co-located **wtrdb version-2.0** so you can explore and query it in version-2.0's
**existing** UI — without modifying version-2.0 at all.

Pipeline: `upload → ffmpeg (normalize / scene-detect / sample) → OpenAI multimodal
vision per window → LLM entity reconciliation → graph assembly → inject (FalkorDB +
Postgres) → view/query in version-2.0`.

This is an **additive, standalone** service. It leaves version-2.0 untouched and
integrates purely through data: it writes the same FalkorDB graph (`kg_{userId}_{kbId}`)
and the Postgres rows version-2.0 already reads.

## Architecture decisions (per approved plan)

- **Hosted multimodal vision via OpenAI** (`gpt-5`, reconciliation on `gpt-5-mini`) —
  no local YOLO/ByteTrack, no GPU.
- **Reuses version-2.0's OpenAI key** (from `global_settings`) if you don't set one.
- **Direct data-contract injection** — writes FalkorDB plus
  `knowledge_base`/`knowledge_graphs` rows directly, idempotently, so ingested video
  appears in version-2.0 through its existing schema.
- **TypeScript/Node** for byte-compatible FalkorDB writes (copied from v2's client).

## Prerequisites

1. **ffmpeg and ffprobe on `PATH`** — the service shells out to both.
   `brew install ffmpeg` on macOS (Apple Silicon gets `h264_videotoolbox` HW encode);
   on Linux install a static build and set `FFMPEG_FORCE_CPU=1` to use the CPU encoder.
   PM2 inherits the environment of whoever ran `pm2 start`, so make sure that `PATH`
   includes ffmpeg.
2. **FalkorDB on `:6380`** — the SAME instance version-2.0 uses, running Redis with the
   graph module loaded. Port `6379` is the separate Redis cache.
   If you don't have it running:
   ```bash
   docker run -d --name falkordb -p 6380:6379 falkordb/falkordb
   ```
3. **Postgres + version-2.0 server running** (defaults: Postgres `:5432`, v2 `:5001`).
4. **An OpenAI key** — set `OPENAI_API_KEY`, or rely on v2's `global_settings`.

## Setup

```bash
cd video-kg
npm install
cp .env.example .env        # then edit (values must match version-2.0/.env)
```

Set the owner user in `.env` (one of):
- `DEFAULT_USER_ID=<wtrdb user uuid>`, or
- `USER_EMAIL=you@example.com` (looked up in the shared users table), optionally with
  `USER_PASSWORD` to fall back to v2 login.

## Run

```bash
npm start            # http://localhost:6060  (web UI + API)
# or ingest a local file directly:
npm run ingest -- /path/to/video.mp4 "My clip"
# retry/resume a job:
npm run worker -- <jobId>
npm run typecheck
```

Open `http://localhost:6060`, upload a video, watch progress, then click through to
version-2.0's 3D graph viewer and ask questions.

In a deployed setup browsers go through version-2.0's authenticated `/video-kg` reverse
proxy instead, which applies authentication — keep port 6060 internal to the host so all
traffic arrives through it.

## API (spec §9)

| Method | Path | Purpose |
|---|---|---|
| POST | `/videos` | raw streaming upload (curl/CLI) → starts a job |
| (tus) | `/files` | resumable ≤2 GB upload (web UI) |
| GET | `/videos/:videoId` | job status + deep links |
| GET | `/videos` | list jobs |
| POST | `/query` | `{videoId\|kbId, question}` → answered locally from the graph via `QUERY_MODEL` |
| GET | `/events/:videoId` | events timeline (+ evidence frame URLs) |
| GET | `/graph/:videoId` | the assembled graph.json |
| GET | `/videos/:videoId/frames/:frameId` | evidence frame image |
| GET | `/health` | FalkorDB / Postgres / OpenAI-key / v2 status |

## Data model written to FalkorDB

Nodes `Person` / `Object` / `Event` / `Location` (every node has a `name`, matching
v2's reader). Edges `ACTOR` (+ `PARTICIPATES_IN` alias so v2's NL prompt can answer
"who did X"), `OBJECT`, `AT_LOCATION`, `NEXT_EVENT` (timeline chain), `INTERACTS_WITH`.
Events carry `startDate`/`endDate` (v2 convention) plus numeric `timestampStartSec`/
`timestampEndSec`, `confidence`, and `evidenceFrames`.

## Tuning (env)

`SAMPLE_FPS`, `MAX_FRAMES_PER_WINDOW`, `SCENE_THRESHOLD`, `FRAME_MAX_DIM`,
`MAX_ANALYZE_SECONDS` (cap analyzed duration for cost), `VISION_MODEL`,
`RECONCILE_MODEL`, `FFMPEG_FORCE_CPU` (set `1` in Docker — no VideoToolbox there).

## Tests

```bash
npx tsx scripts/smoke-ffmpeg.ts /tmp/clip.mp4      # ffmpeg pipeline (no OpenAI/DB)
npx tsx scripts/smoke-inject.ts <userId>           # injection seam via v2 endpoints (no OpenAI; needs FalkorDB)
```

## Notes / limitations

- **Entity persistence** uses LLM appearance-matching, not true tracking — `track_id`
  accuracy degrades in crowded/fast scenes (MVP trade-off).
- **Cost/latency**: vision runs per sampled frame; use the sampling/duration knobs on
  long videos.
- Jobs are stored as JSON under `data/jobs/`, so the service runs entirely on v2's
  existing schema.
