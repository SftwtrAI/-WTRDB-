/**
 * Smoke test for the reuse seam (P5/P6) — NO OpenAI cost.
 * Injects a synthetic video graph under a real user, then verifies it shows up
 * and reads back through version-2.0's OWN HTTP endpoints (summary/entities/
 * relationships + KB list), then cleans everything up.
 *
 * Usage: npx tsx scripts/smoke-inject.ts <userId>
 */
import { randomUUID } from "node:crypto";
import { config } from "../src/config.js";
import { writeGraphToFalkor } from "../src/graph/falkorWriter.js";
import { injectKnowledgeBaseRows } from "../src/graph/v2Inject.js";
import { mintToken } from "../src/auth/v2auth.js";
import { falkorQuery, getGraphName, closeFalkor } from "../src/falkor.js";
import { pool } from "../src/db.js";
import type { VideoGraph } from "../src/types.js";

const userId = process.argv[2];
if (!userId) {
  console.error("usage: npx tsx scripts/smoke-inject.ts <userId>");
  process.exit(1);
}
const kbId = randomUUID();

const graph: VideoGraph = {
  persons: [
    { trackId: 1, name: "Person 1 (red jacket)", appearance: "red jacket", firstSeenSec: 0, lastSeenSec: 6 },
    { trackId: 2, name: "Person 2 (blue shirt)", appearance: "blue shirt", firstSeenSec: 2, lastSeenSec: 6 },
  ],
  objects: [
    { key: "backpack", name: "backpack", type: "backpack" },
    { key: "phone", name: "phone", type: "phone" },
  ],
  locations: [{ key: "office", name: "office" }],
  events: [
    { eventId: "evt_0_0", name: "picks up backpack @ 0:01", action: "picks up backpack", timestampStartSec: 1, timestampEndSec: 2, confidence: 0.8, evidenceFrames: ["w0_f00001"], actorTrackId: 1, objectKeys: ["backpack"], locationKey: "office" },
    { eventId: "evt_1_0", name: "hands phone @ 0:03", action: "hands phone to person 2", timestampStartSec: 3, timestampEndSec: 4, confidence: 0.7, evidenceFrames: ["w1_f00002"], actorTrackId: 1, objectKeys: ["phone"], locationKey: "office" },
    { eventId: "evt_1_1", name: "walks away @ 0:05", action: "walks away", timestampStartSec: 5, timestampEndSec: 6, confidence: 0.6, evidenceFrames: ["w1_f00004"], actorTrackId: 2, objectKeys: [], locationKey: "office" },
  ],
  interactions: [
    { personTrackId: 1, objectKey: "backpack", firstSec: 0, lastSec: 2, confidence: 0.8 },
    { personTrackId: 1, objectKey: "phone", firstSec: 2, lastSec: 4, confidence: 0.7 },
  ],
};

async function v2(pathname: string, token: string) {
  const res = await fetch(`${config.v2BaseUrl}${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  console.log(`Injecting test graph for user ${userId}, kb ${kbId}`);
  const counts = await writeGraphToFalkor(userId, kbId, graph);
  console.log("falkor write:", counts);

  await injectKnowledgeBaseRows({
    kbId, userId, title: "SMOKE TEST video", sizeBytes: 1234,
    durationSec: 6, videoId: "smoke-" + kbId,
    entityCount: counts.entityCount, relationshipCount: counts.relationshipCount,
    entityTypes: counts.entityTypes,
  });
  console.log("postgres rows inserted");

  const token = mintToken(userId);

  // 1. KB list (the working list ConstellationPage/KB UI reads)
  const list = await v2("/api/rag-knowledge", token);
  const inList = list.body.includes(kbId);
  console.log(`\n[v2] GET /api/rag-knowledge -> HTTP ${list.status}; contains our kb: ${inList ? "YES ✓" : "NO ✗"}`);

  // 2. Graph summary
  const summary = await v2(`/api/knowledge-graph/${kbId}/summary`, token);
  console.log(`[v2] GET /summary -> HTTP ${summary.status}: ${summary.body.slice(0, 300)}`);

  // 3. Entities
  const ents = await v2(`/api/knowledge-graph/${kbId}/entities`, token);
  console.log(`[v2] GET /entities -> HTTP ${ents.status}`);
  try {
    const parsed = JSON.parse(ents.body);
    const arr = parsed.entities ?? parsed;
    console.log(`     entity count: ${arr.length}`);
    console.log(`     sample:`, arr.slice(0, 6).map((e: any) => `${e.label}:${e.name}`));
  } catch { console.log("     (raw)", ents.body.slice(0, 300)); }

  // 4. Relationships
  const rels = await v2(`/api/knowledge-graph/${kbId}/relationships`, token);
  try {
    const parsed = JSON.parse(rels.body);
    const arr = parsed.relationships ?? parsed;
    console.log(`[v2] GET /relationships -> HTTP ${rels.status}; count: ${arr.length}`);
    console.log(`     sample types:`, [...new Set(arr.map((r: any) => r.type))]);
  } catch { console.log(`[v2] GET /relationships -> HTTP ${rels.status}`, rels.body.slice(0, 200)); }

  // ── Cleanup ──
  console.log("\nCleaning up test data…");
  try { await falkorQuery(getGraphName(userId, kbId), "MATCH (n) DETACH DELETE n"); } catch {}
  await pool.query("DELETE FROM knowledge_graphs WHERE knowledge_base_id = $1", [kbId]);
  await pool.query("DELETE FROM knowledge_base WHERE id = $1", [kbId]);
  console.log("cleanup done ✓");

  await pool.end();
  await closeFalkor();
  console.log("\nSMOKE-INJECT DONE");
}

main().catch(async (e) => {
  console.error("SMOKE-INJECT FAILED:", e);
  try { await pool.query("DELETE FROM knowledge_graphs WHERE knowledge_base_id = $1", [kbId]); } catch {}
  try { await pool.query("DELETE FROM knowledge_base WHERE id = $1", [kbId]); } catch {}
  process.exit(1);
});
