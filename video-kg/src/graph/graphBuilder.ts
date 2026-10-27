import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "../logger.js";
import { matchPersons } from "../vision/entityReconciler.js";
import type {
  GraphEventNode,
  GraphInteraction,
  GraphLocationNode,
  GraphObjectNode,
  GraphPerson,
  VideoGraph,
  WindowAnalysis,
} from "../types.js";

const log = createLogger("graph-build");

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function shortAppearance(a: string): string {
  const t = a.trim().replace(/\s+/g, " ");
  return t.length > 40 ? t.slice(0, 37) + "…" : t;
}

/**
 * A live-view-ready node/edge, with a stable global id and (for edges) resolved
 * endpoint NAMES so the client can label them without a lookup.
 */
export interface LiveNode {
  id: string;
  name: string;
  label: "Person" | "Object" | "Location" | "Event";
  props: Record<string, string>;
}
export interface LiveEdge {
  id: string;
  type: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
}

/**
 * The newly-added, client-ready nodes/edges produced by folding one window into
 * the accumulator — used to stream node-by-node deltas to the live view. Only
 * genuinely NEW elements are included (dedup/merges against prior windows are
 * omitted, since those were already emitted). Edges may reference nodes from
 * earlier windows (their names still resolve, since the accumulator remembers
 * every node's name).
 */
export interface GraphDelta {
  nodes: LiveNode[];
  edges: LiveEdge[];
}

// Stable, global node-id scheme shared by the live stream (edges reference these).
// Person track ids and event ids are already globally unique; Object/Location
// ids are assigned per-accumulator (see createGraphAccumulator) to stay 1:1 with
// their dedup key — a lossy sanitize would collide distinct keys (e.g. "t shirt"
// vs "t-shirt", or anything past 80 chars) onto one id and merge unrelated nodes.
const pid = (t: number) => `p_${t}`;
const eid = (e: string) => `ev_${e.replace(/[^A-Za-z0-9]+/g, "_")}`;

/**
 * Stateful, incremental version of `buildGraph`: fold windows in temporal order
 * one at a time via `addWindow`, which returns just the delta for that window
 * (so callers can stream it), and read the accumulated result with `getGraph`.
 * Person identity is resolved across windows via the LLM matcher; objects/
 * locations dedup by type/name; events keep their window timestamps.
 */
export function createGraphAccumulator() {
  const persons: GraphPerson[] = [];
  const personByTrackId = new Map<number, GraphPerson>();
  let nextTrackId = 1;

  const objects = new Map<string, GraphObjectNode>();
  const locations = new Map<string, GraphLocationNode>();
  const events: GraphEventNode[] = [];
  const interactionMap = new Map<string, GraphInteraction>();
  let lastEventId: string | null = null;

  // Remembers every emitted node's display name so edges (which may point at
  // nodes from earlier windows) can carry resolved source/target names.
  const nameById = new Map<string, string>();

  // Object/Location ids assigned 1:1 with their dedup key (collision-free).
  const objIdByKey = new Map<string, string>();
  const locIdByKey = new Map<string, string>();
  let objSeq = 0;
  let locSeq = 0;
  const oidOf = (key: string) => {
    let id = objIdByKey.get(key);
    if (!id) { id = `o_${++objSeq}`; objIdByKey.set(key, id); }
    return id;
  };
  const lidOf = (key: string) => {
    let id = locIdByKey.get(key);
    if (!id) { id = `l_${++locSeq}`; locIdByKey.set(key, id); }
    return id;
  };
  // Disambiguate identical Event display names for the live reveal (the writer
  // does the same for FalkorDB; keeping names unique here means it won't double-suffix).
  const usedEventNames = new Set<string>();

  async function addWindow(w: WindowAnalysis): Promise<GraphDelta> {
    const delta: GraphDelta = { nodes: [], edges: [] };
    const addNode = (
      id: string,
      name: string,
      label: LiveNode["label"],
      props: Record<string, string> = {},
    ) => {
      nameById.set(id, name);
      delta.nodes.push({ id, name, label, props });
    };
    const addEdge = (sourceId: string, targetId: string, type: string) => {
      const sourceName = nameById.get(sourceId);
      const targetName = nameById.get(targetId);
      if (!sourceName || !targetName) return; // endpoint unknown — skip
      delta.edges.push({
        id: `${type}__${sourceId}__${targetId}`,
        type,
        sourceId,
        sourceName,
        targetId,
        targetName,
      });
    };

    // 1. Resolve persons in this window to global trackIds.
    const mapping = await matchPersons(
      persons,
      w.persons.map((p) => ({ localId: p.localId, appearance: p.appearance })),
    );
    const localToTrack = new Map<string, number>();
    for (const p of w.persons) {
      let trackId = mapping.get(p.localId) ?? null;
      if (trackId === null) {
        trackId = nextTrackId++;
        const person: GraphPerson = {
          trackId,
          name: `Person ${trackId} (${shortAppearance(p.appearance)})`,
          appearance: p.appearance,
          firstSeenSec: w.startSec,
          lastSeenSec: w.endSec,
        };
        persons.push(person);
        personByTrackId.set(trackId, person);
        addNode(pid(trackId), person.name, "Person", { appearance: p.appearance });
      } else {
        const existing = personByTrackId.get(trackId);
        if (existing) existing.lastSeenSec = Math.max(existing.lastSeenSec, w.endSec);
      }
      localToTrack.set(p.localId, trackId);
    }

    // 2. Objects (dedup by lowercased type).
    const localToObjKey = new Map<string, string>();
    for (const o of w.objects) {
      const key = o.type.trim().toLowerCase();
      if (!key) continue;
      if (!objects.has(key)) {
        const node = { key, name: o.type.trim(), type: o.type.trim() };
        objects.set(key, node);
        addNode(oidOf(key), node.name, "Object", { type: node.type });
      }
      localToObjKey.set(o.localId, key);
    }

    // 3. Locations (dedup by lowercased name).
    for (const l of w.locations) {
      const key = l.name.trim().toLowerCase();
      if (key && !locations.has(key)) {
        const node = { key, name: l.name.trim() };
        locations.set(key, node);
        addNode(lidOf(key), node.name, "Location");
      }
    }

    // 4. Events (every window event is new; mint a unique id). Collect for edges.
    //    Process in timestamp order so the live reveal + NEXT_EVENT chain match
    //    the timestamp-sorted persisted graph (getGraph sorts globally).
    const newEvents: GraphEventNode[] = [];
    const orderedEvents = [...w.events].sort(
      (a, b) => a.timestampStartSec - b.timestampStartSec,
    );
    orderedEvents.forEach((e, i) => {
      const actorTrackId =
        e.actorLocalId && localToTrack.has(e.actorLocalId)
          ? localToTrack.get(e.actorLocalId)!
          : null;
      const objectKeys = e.objectLocalIds
        .map((id) => localToObjKey.get(id))
        .filter((k): k is string => !!k);
      const locationKey = e.locationName
        ? e.locationName.trim().toLowerCase()
        : null;
      if (locationKey && !locations.has(locationKey)) {
        const node = { key: locationKey, name: e.locationName!.trim() };
        locations.set(locationKey, node);
        addNode(lidOf(locationKey), node.name, "Location");
      }
      // Unique display name (append " (#k)" on collision) so the live event rail
      // doesn't show two identically-labelled events.
      const baseName = `${e.action} @ ${mmss(e.timestampStartSec)}`;
      let name = baseName;
      let k = 2;
      while (usedEventNames.has(name)) name = `${baseName} (#${k++})`;
      usedEventNames.add(name);
      const node: GraphEventNode = {
        eventId: `evt_${w.windowIndex}_${i}`,
        name,
        action: e.action,
        timestampStartSec: e.timestampStartSec,
        timestampEndSec: e.timestampEndSec,
        confidence: e.confidence,
        evidenceFrames: e.evidenceFrameIds,
        actorTrackId,
        objectKeys,
        locationKey,
      };
      events.push(node);
      newEvents.push(node);
      addNode(eid(node.eventId), node.name, "Event", { action: e.action });
    });

    // 5. Interactions (merge across windows by person+object; only new ones emit).
    const newInteractions: GraphInteraction[] = [];
    for (const it of w.interactions) {
      const trackId = localToTrack.get(it.personLocalId);
      const objKey = localToObjKey.get(it.objectLocalId);
      if (trackId === undefined || objKey === undefined) continue;
      const k = `${trackId}::${objKey}`;
      const existing = interactionMap.get(k);
      if (existing) {
        existing.firstSec = Math.min(existing.firstSec, w.startSec);
        existing.lastSec = Math.max(existing.lastSec, w.endSec);
        existing.confidence = Math.max(existing.confidence, it.confidence);
      } else {
        const node: GraphInteraction = {
          personTrackId: trackId,
          objectKey: objKey,
          firstSec: w.startSec,
          lastSec: w.endSec,
          confidence: it.confidence,
        };
        interactionMap.set(k, node);
        newInteractions.push(node);
      }
    }

    // 6. Edges for this window's new events/interactions (all nodes now known).
    for (const e of newEvents) {
      if (e.actorTrackId !== null) addEdge(pid(e.actorTrackId), eid(e.eventId), "ACTOR");
      for (const k of e.objectKeys) addEdge(eid(e.eventId), oidOf(k), "OBJECT");
      if (e.locationKey) addEdge(eid(e.eventId), lidOf(e.locationKey), "AT_LOCATION");
      // Timeline chain in temporal order (windows arrive sorted by start).
      if (lastEventId) addEdge(eid(lastEventId), eid(e.eventId), "NEXT_EVENT");
      lastEventId = e.eventId;
    }
    for (const it of newInteractions) {
      addEdge(pid(it.personTrackId), oidOf(it.objectKey), "INTERACTS_WITH");
    }

    return delta;
  }

  function getGraph(): VideoGraph {
    const sorted = [...events].sort(
      (a, b) => a.timestampStartSec - b.timestampStartSec,
    );
    return {
      persons,
      objects: [...objects.values()],
      locations: [...locations.values()],
      events: sorted,
      interactions: [...interactionMap.values()],
    };
  }

  return { addWindow, getGraph };
}

/**
 * Spec step 10: assemble reconciled windows into a single temporal VideoGraph
 * (Person/Object/Event/Location + interactions). Thin wrapper over
 * `createGraphAccumulator` for callers that have all windows up front.
 */
export async function buildGraph(analyses: WindowAnalysis[]): Promise<VideoGraph> {
  const acc = createGraphAccumulator();
  const ordered = [...analyses].sort((a, b) => a.startSec - b.startSec);
  for (const w of ordered) await acc.addWindow(w);
  const graph = acc.getGraph();
  log.info(
    `built graph: ${graph.persons.length} persons, ${graph.objects.length} objects, ${graph.locations.length} locations, ${graph.events.length} events, ${graph.interactions.length} interactions`,
  );
  return graph;
}

export async function saveGraph(graph: VideoGraph, outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(graph, null, 2), "utf8");
}
