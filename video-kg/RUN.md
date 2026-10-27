# Running locally (this machine)

The actual wiring on this machine: **Postgres :5432**, **Redis :6379** (cache, your
Homebrew service), **FalkorDB :6380** (graph, Docker container), **wtrdb/v2 :5000**,
**video-kg :6060**. v2's `.env` is stitched to read graphs from FalkorDB on 6380;
video-kg's `.env` points there too. (FalkorDB and Redis must stay on different ports.)

## Start (in this order)

```bash
# 1) FalkorDB graph DB on :6380  (Docker must be running)
docker start wtrdb-falkordb
#    first-time-only, if that container doesn't exist:
#    docker run -d --name wtrdb-falkordb -p 6380:6379 \
#      -v wtrdb_falkordb_data:/data --restart unless-stopped falkordb/falkordb:latest

# 2) Ensure Postgres (:5432) and Redis (:6379) are up — your existing services
#    (Redis: `brew services start redis` if needed)

# 3) wtrdb core (v2) on :5000  — serves the UI + graph viewers + NL query
cd /path/to/wtrdb            # repo root
npm start

# 4) video-kg on :6060  — upload + pipeline + GraphRAG query   (new terminal)
cd /path/to/wtrdb/video-kg
npm start
```

Check health: `curl -s localhost:6060/health` → `falkordb/postgres/openaiKey` should be `true`.

## Use it

- **Upload + ask:** open http://localhost:6060 → upload a video → when done, use the Ask box (GraphRAG, gpt-5).
- **View the graph in wtrdb:** http://localhost:5000/app/constellation (or `…/app/knowledge-graph/{kbId}` / `…/knowledge-graph-3d/{kbId}`).
- **CLI ingest (no browser):**
  ```bash
  cd /path/to/wtrdb/video-kg
  npm run ingest -- /path/to/clip.mp4 "My clip"
  ```
- **Query API:**
  ```bash
  curl -s -X POST http://localhost:6060/query -H "Content-Type: application/json" \
    -d '{"kbId":"<kbId>","question":"is there a dragon?"}'
  ```
  (Use the video-kg Ask box / this endpoint for *semantic* answers. v2's own UI query box
  uses literal Cypher and won't reason about synonyms.)

## Stop

```bash
pkill -f "tsx.*src/server.ts"          # video-kg (:6060)
pkill -f "dist/apps/server/index.js"   # wtrdb/v2 (:5000)
docker stop wtrdb-falkordb             # FalkorDB (:6380)
```

## Notes

- **Models** (configurable in `video-kg/.env`): `VISION_MODEL=gpt-5`, `QUERY_MODEL=gpt-5`, `RECONCILE_MODEL=gpt-5-mini`. Cost knobs: `SAMPLE_FPS`, `MAX_FRAMES_PER_WINDOW`, `MAX_ANALYZE_SECONDS`.
- **Owner:** `video-kg/.env` `DEFAULT_USER_ID` = the wtrdb user that owns ingested videos.
- v2 rebuild only if you change v2's client code: `cd version-2.0 && npm run build` (then `npm start`).
- The FalkorDB container has a persistent volume (`wtrdb_falkordb_data`), so graphs survive restarts.
