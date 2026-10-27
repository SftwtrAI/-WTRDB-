import { falkorQuery, getGraphName } from "../falkor.js";
import { createLogger } from "../logger.js";
import { escapeCypherString, singleLine } from "./cypherEscape.js";
import type { VideoGraph } from "../types.js";

const log = createLogger("falkor-write");

/** escape + collapse whitespace for a node `name`/value used in single-line Cypher */
function q(s: string): string {
  return escapeCypherString(singleLine(s));
}

function num(n: number): string {
  return Number.isFinite(n) ? String(n) : "0";
}

function isoFromSec(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  return new Date(ms).toISOString();
}

/**
 * Write the video graph into the SAME FalkorDB instance/graph (kg_{userId}_{kbId})
 * v2 uses, with MERGE statements byte-compatible with v2's own writer (every
 * node carries `name` + `status="Active"` + `sourceKnowledgeBaseId`). Spec node
 * types (Person/Object/Event/Location) and edges (ACTOR/OBJECT/AT_LOCATION/
 * NEXT_EVENT/INTERACTS_WITH) are written; ACTOR is mirrored as PARTICIPATES_IN
 * so v2's NL→Cypher prompt (which knows PARTICIPATES_IN) can answer "who did X".
 */
export async function writeGraphToFalkor(
  userId: string,
  kbId: string,
  graph: VideoGraph,
): Promise<{ entityCount: number; relationshipCount: number; entityTypes: string[] }> {
  const graphName = getGraphName(userId, kbId);
  const now = new Date().toISOString();
  let entityCount = 0;
  let relCount = 0;

  const exec = async (cypher: string): Promise<boolean> => {
    try {
      await falkorQuery(graphName, cypher);
      return true;
    } catch (err: any) {
      log.warn(`write failed: ${err.message} | ${cypher.slice(0, 160)}`);
      return false;
    }
  };

  // ── Resolve unique node names ──
  const personName = new Map<number, string>();
  for (const p of graph.persons) personName.set(p.trackId, singleLine(p.name));
  const objectName = new Map<string, string>();
  for (const o of graph.objects) objectName.set(o.key, singleLine(o.name));
  const locationName = new Map<string, string>();
  for (const l of graph.locations) locationName.set(l.key, singleLine(l.name));

  // Event names must be unique (MERGE keys on name).
  const eventName = new Map<string, string>();
  const usedEventNames = new Set<string>();
  for (const e of graph.events) {
    let base = singleLine(e.name);
    let name = base;
    let k = 2;
    while (usedEventNames.has(name)) name = `${base} (#${k++})`;
    usedEventNames.add(name);
    eventName.set(e.eventId, name);
  }

  // ── Nodes ──
  for (const p of graph.persons) {
    const name = personName.get(p.trackId)!;
    const ok = await exec(
      `MERGE (e:Person {name: "${q(name)}"}) SET e.sourceKnowledgeBaseId = "${q(kbId)}", e.sourceChunkIndex = 0, e.status = "Active", e._updatedAt = "${now}", e.type = "Person", e.description = "${q(p.appearance)}", e.trackId = ${num(p.trackId)}, e.firstSeenSec = ${num(p.firstSeenSec)}, e.lastSeenSec = ${num(p.lastSeenSec)}`,
    );
    if (ok) entityCount++;
  }
  for (const o of graph.objects) {
    const name = objectName.get(o.key)!;
    const ok = await exec(
      `MERGE (e:Object {name: "${q(name)}"}) SET e.sourceKnowledgeBaseId = "${q(kbId)}", e.sourceChunkIndex = 0, e.status = "Active", e._updatedAt = "${now}", e.type = "${q(o.type)}", e.description = "${q(o.type)}"`,
    );
    if (ok) entityCount++;
  }
  for (const l of graph.locations) {
    const name = locationName.get(l.key)!;
    const ok = await exec(
      `MERGE (e:Location {name: "${q(name)}"}) SET e.sourceKnowledgeBaseId = "${q(kbId)}", e.sourceChunkIndex = 0, e.status = "Active", e._updatedAt = "${now}", e.type = "Location"`,
    );
    if (ok) entityCount++;
  }
  for (const e of graph.events) {
    const name = eventName.get(e.eventId)!;
    const ok = await exec(
      `MERGE (n:Event {name: "${q(name)}"}) SET n.sourceKnowledgeBaseId = "${q(kbId)}", n.sourceChunkIndex = 0, n.status = "Active", n._ingested = "${now}", n.eventType = "VideoEvent", n.type = "Event", n.action = "${q(e.action)}", n.description = "${q(e.action)}", n.startDate = "${isoFromSec(e.timestampStartSec)}", n.endDate = "${isoFromSec(e.timestampEndSec)}", n.timestampStartSec = ${num(e.timestampStartSec)}, n.timestampEndSec = ${num(e.timestampEndSec)}, n.confidence = ${num(e.confidence)}, n.evidenceFrames = "${q(JSON.stringify(e.evidenceFrames))}"`,
    );
    if (ok) entityCount++;
  }

  // ── Edges ──
  for (const e of graph.events) {
    const en = eventName.get(e.eventId)!;
    // ACTOR (+ PARTICIPATES_IN alias)
    if (e.actorTrackId !== null && personName.has(e.actorTrackId)) {
      const pn = personName.get(e.actorTrackId)!;
      if (
        await exec(
          `MATCH (p:Person {name: "${q(pn)}"}), (e:Event {name: "${q(en)}"}) MERGE (p)-[r:ACTOR]->(e) SET r.status = "Active", r._ingested = "${now}", r.confidence = ${num(e.confidence)}`,
        )
      )
        relCount++;
      if (
        await exec(
          `MATCH (p:Person {name: "${q(pn)}"}), (e:Event {name: "${q(en)}"}) MERGE (p)-[r:PARTICIPATES_IN]->(e) SET r.status = "Active", r._ingested = "${now}"`,
        )
      )
        relCount++;
    }
    // OBJECT
    for (const ok of e.objectKeys) {
      const on = objectName.get(ok);
      if (!on) continue;
      if (
        await exec(
          `MATCH (e:Event {name: "${q(en)}"}), (o:Object {name: "${q(on)}"}) MERGE (e)-[r:OBJECT]->(o) SET r.status = "Active", r._ingested = "${now}"`,
        )
      )
        relCount++;
    }
    // AT_LOCATION
    if (e.locationKey && locationName.has(e.locationKey)) {
      const ln = locationName.get(e.locationKey)!;
      if (
        await exec(
          `MATCH (e:Event {name: "${q(en)}"}), (l:Location {name: "${q(ln)}"}) MERGE (e)-[r:AT_LOCATION]->(l) SET r.status = "Active", r._ingested = "${now}"`,
        )
      )
        relCount++;
    }
  }

  // INTERACTS_WITH
  for (const it of graph.interactions) {
    const pn = personName.get(it.personTrackId);
    const on = objectName.get(it.objectKey);
    if (!pn || !on) continue;
    if (
      await exec(
        `MATCH (p:Person {name: "${q(pn)}"}), (o:Object {name: "${q(on)}"}) MERGE (p)-[r:INTERACTS_WITH]->(o) SET r.status = "Active", r._ingested = "${now}", r.firstSec = ${num(it.firstSec)}, r.lastSec = ${num(it.lastSec)}, r.confidence = ${num(it.confidence)}`,
      )
    )
      relCount++;
  }

  // NEXT_EVENT timeline chain (events already sorted by start time)
  for (let i = 0; i < graph.events.length - 1; i++) {
    const a = graph.events[i];
    const b = graph.events[i + 1];
    const an = eventName.get(a.eventId)!;
    const bn = eventName.get(b.eventId)!;
    const gap = Math.max(0, b.timestampStartSec - a.timestampEndSec);
    if (
      await exec(
        `MATCH (a:Event {name: "${q(an)}"}), (b:Event {name: "${q(bn)}"}) MERGE (a)-[r:NEXT_EVENT]->(b) SET r.status = "Active", r._ingested = "${now}", r.gapSec = ${num(gap)}`,
      )
    )
      relCount++;
  }

  const entityTypes = [
    ...new Set(
      [
        graph.persons.length ? "Person" : "",
        graph.objects.length ? "Object" : "",
        graph.locations.length ? "Location" : "",
        graph.events.length ? "Event" : "",
      ].filter(Boolean),
    ),
  ];

  log.info(
    `wrote ${entityCount} nodes, ${relCount} edges to graph "${graphName}"`,
  );
  return { entityCount, relationshipCount: relCount, entityTypes };
}
