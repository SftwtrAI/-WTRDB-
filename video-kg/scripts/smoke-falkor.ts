/**
 * Smoke test for the FalkorDB write+read path (no OpenAI, no Postgres).
 * Writes a synthetic graph then reads it back using the EXACT queries
 * version-2.0's queryEntities/queryRelationships use — proving our writer
 * produces a graph v2's readers return correctly.
 *
 * Point at a FalkorDB instance via FALKORDB_URL, e.g.:
 *   FALKORDB_URL=redis://localhost:6380 npx tsx scripts/smoke-falkor.ts
 */
import { writeGraphToFalkor } from "../src/graph/falkorWriter.js";
import { falkorQuery, getGraphName, closeFalkor } from "../src/falkor.js";
import type { VideoGraph } from "../src/types.js";

const userId = "smokeuser";
const kbId = "smokekb";
const graphName = getGraphName(userId, kbId);

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

async function main() {
  // clean slate
  try { await falkorQuery(graphName, "MATCH (n) DETACH DELETE n"); } catch {}

  const counts = await writeGraphToFalkor(userId, kbId, graph);
  console.log("write counts:", counts);

  // v2 queryEntities query (verbatim shape)
  const ents = await falkorQuery(
    graphName,
    `MATCH (n) RETURN id(n) AS nodeId, labels(n) AS label, n.name AS name, n.type AS type ORDER BY n.name`,
  );
  console.log(`\nEntities read back (${ents.records.length}):`);
  for (const r of ents.records) {
    const label = Array.isArray(r.label) ? r.label[0] : r.label;
    console.log(`  ${label}: ${r.name}`);
  }

  // v2 queryRelationships query (verbatim shape)
  const rels = await falkorQuery(
    graphName,
    `MATCH (a)-[r]->(b) RETURN a.name AS source, type(r) AS type, b.name AS target ORDER BY a.name`,
  );
  console.log(`\nRelationships read back (${rels.records.length}):`);
  for (const r of rels.records) {
    console.log(`  (${r.source}) -[:${r.type}]-> (${r.target})`);
  }

  // Temporal range query (proves numeric timestamp props are queryable)
  const ranged = await falkorQuery(
    graphName,
    `MATCH (e:Event) WHERE e.timestampStartSec >= 2 AND e.timestampStartSec <= 4 RETURN e.name AS name, e.timestampStartSec AS t ORDER BY t`,
  );
  console.log(`\nEvents in [2s,4s] (${ranged.records.length}):`);
  for (const r of ranged.records) console.log(`  ${r.name} @ ${r.t}s`);

  // "who did what" via PARTICIPATES_IN (the alias v2's NL prompt knows)
  const who = await falkorQuery(
    graphName,
    `MATCH (p:Person)-[:PARTICIPATES_IN]->(e:Event) RETURN p.name AS person, e.name AS event ORDER BY e.timestampStartSec`,
  );
  console.log(`\nPerson→Event via PARTICIPATES_IN (${who.records.length}):`);
  for (const r of who.records) console.log(`  ${r.person} → ${r.event}`);

  await falkorQuery(graphName, "MATCH (n) DETACH DELETE n");
  await closeFalkor();
  console.log("\nSMOKE-FALKOR OK ✓");
}

main().catch(async (e) => {
  console.error("SMOKE-FALKOR FAILED:", e);
  await closeFalkor();
  process.exit(1);
});
