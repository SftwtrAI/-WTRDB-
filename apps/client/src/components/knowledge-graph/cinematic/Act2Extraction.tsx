/**
 * Act2Extraction — The main extraction visualization.
 *
 * Layout: a header with document title + progress, a left "Document"
 * pane showing a stack of chunk cards, and a right "Knowledge Graph"
 * pane where entities materialize via EntityBirth and relationships
 * are drawn as SVG lines. A CommentaryStream at the bottom shows all
 * events scrolling by.
 *
 * Entity births are throttled (3 per 100ms) to keep the animation
 * performant with hundreds of entities. Entity positions are stable:
 * seeded by a hash of the entity name so the same entity always lands
 * at the same spot, even if components re-render.
 */

import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExtractionEventPayload } from "@/lib/wsClient";
import { EntityBirth } from "./EntityBirth";
import { CommentaryStream } from "./CommentaryStream";

const BRAND_TEAL = "#07A288";
const CARD_BG = "#111A21";
const BORDER = "#243645";
const BG_DARK = "#0B1014";
const TEXT_PRIMARY = "#E7EEF6";
const TEXT_MUTED = "#8FA2B5";

interface Act2ExtractionProps {
  events: ExtractionEventPayload[];
  documentTitle: string;
}

interface EntityPosition {
  x: number;
  y: number;
  type: string;
}

interface BirthRecord {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  bornAt: number;
}

interface RelationshipLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Deterministic 32-bit string hash (xmur3-ish) used to seed a tiny PRNG
 * so the same entity name always yields the same x/y position.
 */
function stringHash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function positionForName(name: string): { x: number; y: number } {
  const h = stringHash(name);
  // Two pseudo-random floats in [0, 1) derived from the hash.
  const a = ((h >>> 0) % 10000) / 10000;
  const b = (((h * 2654435761) >>> 0) % 10000) / 10000;
  // Map to [10, 90] for x and [15, 85] for y.
  return {
    x: 10 + a * 80,
    y: 15 + b * 70,
  };
}

/** Count-up number used for the stats overlay. */
function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.5,
      ease: "easeOut",
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, mv, rounded]);

  return <span>{display}</span>;
}

export function Act2Extraction({ events, documentTitle }: Act2ExtractionProps) {
  // Track entity positions by name so the same entity always lands at
  // the same spot. This is a ref, not state, because it never needs to
  // trigger a re-render by itself.
  const positionsRef = useRef<Map<string, EntityPosition>>(new Map());

  // Queue of entity_discovered events waiting to be "born" on screen.
  const pendingQueueRef = useRef<ExtractionEventPayload[]>([]);
  // Set of event keys already queued/processed to dedupe.
  const seenEntityKeysRef = useRef<Set<string>>(new Set());

  // Births currently on screen (animating).
  const [births, setBirths] = useState<BirthRecord[]>([]);

  // Permanent record of entities that have been born (for drawing
  // relationships and for the final count).
  const entitiesBornRef = useRef<Map<string, EntityPosition>>(new Map());
  const [entitiesBornCount, setEntitiesBornCount] = useState(0);

  // Relationship lines drawn between entities.
  const [relationships, setRelationships] = useState<RelationshipLine[]>([]);
  const seenRelKeysRef = useRef<Set<string>>(new Set());

  // Derive chunk progress from the events.
  const { currentChunkIndex, totalChunks, processedChunks } = useMemo(() => {
    let currentChunkIndex = 0;
    let totalChunks = 0;
    const seen = new Set<number>();
    for (const ev of events) {
      if (ev.eventType === "chunk_start") {
        if (typeof ev.chunkIndex === "number") {
          currentChunkIndex = ev.chunkIndex;
          seen.add(ev.chunkIndex);
        }
        const t =
          ev.details && typeof ev.details.totalChunks === "number"
            ? (ev.details.totalChunks as number)
            : 0;
        if (t > totalChunks) totalChunks = t;
      }
    }
    return {
      currentChunkIndex,
      totalChunks,
      processedChunks: seen.size,
    };
  }, [events]);

  // Count relationships in the events list (not throttled — raw total).
  const totalRelationships = useMemo(
    () => events.filter((e) => e.eventType === "relationship_extracted").length,
    [events],
  );

  // Feed new entity_discovered events into the pending queue.
  useEffect(() => {
    for (const ev of events) {
      if (ev.eventType !== "entity_discovered") continue;
      if (!ev.entityName) continue;
      const key = ev.id || `${ev.timestamp}-${ev.entityName}`;
      if (seenEntityKeysRef.current.has(key)) continue;
      seenEntityKeysRef.current.add(key);
      pendingQueueRef.current.push(ev);
    }
  }, [events]);

  // Throttled entity birth processor: up to 3 births per 100ms tick.
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingQueueRef.current.length === 0) return;
      const batch = pendingQueueRef.current.splice(0, 3);
      const now = Date.now();
      const newBirths: BirthRecord[] = [];
      for (const ev of batch) {
        const name = ev.entityName as string;
        const type = ev.entityLabel || "Other";
        let pos = positionsRef.current.get(name);
        if (!pos) {
          const { x, y } = positionForName(name);
          pos = { x, y, type };
          positionsRef.current.set(name, pos);
        }
        entitiesBornRef.current.set(name, pos);
        newBirths.push({
          id: `${name}-${now}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          type,
          x: pos.x,
          y: pos.y,
          bornAt: now,
        });
      }
      if (newBirths.length > 0) {
        setBirths((prev) => [...prev, ...newBirths]);
        setEntitiesBornCount(entitiesBornRef.current.size);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Clean up birth animations after their ~800ms lifetime so the DOM
  // doesn't accumulate hundreds of EntityBirth components.
  useEffect(() => {
    if (births.length === 0) return;
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - 900;
      setBirths((prev) => prev.filter((b) => b.bornAt > cutoff));
    }, 500);
    return () => clearInterval(cleanup);
  }, [births.length]);

  // Draw relationship lines when both endpoints exist.
  useEffect(() => {
    const nextRels: RelationshipLine[] = [];
    for (const ev of events) {
      if (ev.eventType !== "relationship_extracted") continue;
      if (!ev.sourceEntity || !ev.targetEntity) continue;
      const key =
        ev.id ||
        `${ev.sourceEntity}->${ev.relationshipType ?? ""}->${ev.targetEntity}`;
      if (seenRelKeysRef.current.has(key)) continue;

      // Both endpoints must have a known position (either born or at
      // least seeded). If neither endpoint has been seen yet, we seed
      // a position so the line can still be drawn.
      const src =
        positionsRef.current.get(ev.sourceEntity) ||
        (() => {
          const p = positionForName(ev.sourceEntity!);
          positionsRef.current.set(ev.sourceEntity!, { ...p, type: "Other" });
          return positionsRef.current.get(ev.sourceEntity!);
        })();
      const tgt =
        positionsRef.current.get(ev.targetEntity) ||
        (() => {
          const p = positionForName(ev.targetEntity!);
          positionsRef.current.set(ev.targetEntity!, { ...p, type: "Other" });
          return positionsRef.current.get(ev.targetEntity!);
        })();
      if (!src || !tgt) continue;

      seenRelKeysRef.current.add(key);
      nextRels.push({
        id: key,
        x1: src.x,
        y1: src.y,
        x2: tgt.x,
        y2: tgt.y,
      });
    }
    if (nextRels.length > 0) {
      setRelationships((prev) => [...prev, ...nextRels]);
    }
  }, [events]);

  // Derive the "chunk card" stack for the left pane. Show up to 8
  // most recent chunks with the latest highlighted.
  const chunkCards = useMemo(() => {
    const chunks: { index: number; isCurrent: boolean }[] = [];
    const seen = new Set<number>();
    for (const ev of events) {
      if (ev.eventType === "chunk_start" && typeof ev.chunkIndex === "number") {
        if (!seen.has(ev.chunkIndex)) {
          seen.add(ev.chunkIndex);
          chunks.push({ index: ev.chunkIndex, isCurrent: false });
        }
      }
    }
    // Mark the last one as current.
    if (chunks.length > 0) chunks[chunks.length - 1].isCurrent = true;
    return chunks.slice(-8);
  }, [events]);

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: BORDER }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-base font-semibold"
            style={{ color: TEXT_PRIMARY }}
          >
            {documentTitle || "Untitled document"}
          </div>
          <div className="mt-0.5 text-xs font-mono" style={{ color: TEXT_MUTED }}>
            {totalChunks > 0
              ? `Chunk ${currentChunkIndex + 1} of ${totalChunks}`
              : processedChunks > 0
                ? `Chunk ${currentChunkIndex + 1}`
                : "Preparing..."}
          </div>
        </div>

        {/* Stats overlay (top-right) */}
        <div
          className="flex items-center gap-4 rounded-lg border px-3 py-2 text-xs font-mono"
          style={{ borderColor: BORDER, backgroundColor: CARD_BG }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: BRAND_TEAL, boxShadow: `0 0 6px ${BRAND_TEAL}` }}
            />
            <span style={{ color: TEXT_PRIMARY }}>
              <CountUp value={entitiesBornCount} /> entities
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "#B8E52B", boxShadow: "0 0 6px #B8E52B" }}
            />
            <span style={{ color: TEXT_PRIMARY }}>
              <CountUp value={totalRelationships} /> relationships
            </span>
          </div>
        </div>
      </div>

      {/* Main two-pane area */}
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        {/* Left pane: Document / chunk cards */}
        <div
          className="flex w-2/5 flex-col gap-2 overflow-hidden rounded-lg border p-4"
          style={{ borderColor: BORDER, backgroundColor: CARD_BG }}
        >
          <div
            className="mb-2 text-[11px] font-mono uppercase tracking-wider"
            style={{ color: TEXT_MUTED }}
          >
            Document
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto">
            <AnimatePresence initial={false}>
              {chunkCards.map((chunk) => (
                <motion.div
                  key={chunk.index}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{
                    opacity: chunk.isCurrent ? 1 : 0.4,
                    x: 0,
                  }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-md border p-3"
                  style={{
                    borderColor: chunk.isCurrent ? BRAND_TEAL : BORDER,
                    backgroundColor: BG_DARK,
                    boxShadow: chunk.isCurrent
                      ? `0 0 16px ${BRAND_TEAL}44, inset 0 0 0 1px ${BRAND_TEAL}33`
                      : "none",
                  }}
                >
                  <div
                    className="text-[11px] font-mono"
                    style={{ color: chunk.isCurrent ? BRAND_TEAL : TEXT_MUTED }}
                  >
                    Chunk {chunk.index + 1}
                  </div>
                  <div className="mt-1 flex gap-0.5">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full"
                        style={{
                          backgroundColor: chunk.isCurrent
                            ? `${BRAND_TEAL}${i < 14 ? "aa" : "33"}`
                            : `${TEXT_MUTED}33`,
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {chunkCards.length === 0 && (
              <div
                className="text-xs font-mono italic"
                style={{ color: TEXT_MUTED }}
              >
                Waiting for first chunk...
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Knowledge graph canvas */}
        <div
          className="relative flex-1 overflow-hidden rounded-lg border"
          style={{
            borderColor: BORDER,
            backgroundColor: BG_DARK,
            backgroundImage:
              "radial-gradient(circle, rgba(36,54,69,0.5) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div
            className="absolute left-3 top-3 text-[11px] font-mono uppercase tracking-wider"
            style={{ color: TEXT_MUTED }}
          >
            Knowledge Graph
          </div>

          {/* Relationship lines (SVG overlay). */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            {relationships.map((rel) => (
              <motion.line
                key={rel.id}
                x1={rel.x1}
                y1={rel.y1}
                x2={rel.x2}
                y2={rel.y2}
                stroke={BRAND_TEAL}
                strokeOpacity={0.5}
                strokeWidth={0.2}
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.5 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{ strokeLinecap: "round" }}
              />
            ))}
          </svg>

          {/* Entity birth animations. */}
          <AnimatePresence>
            {births.map((b) => (
              <EntityBirth
                key={b.id}
                x={b.x}
                y={b.y}
                entityType={b.type}
                entityName={b.name}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom commentary strip */}
      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: BORDER, backgroundColor: `${CARD_BG}cc` }}
      >
        <CommentaryStream events={events} maxVisible={5} />
      </div>
    </div>
  );
}
