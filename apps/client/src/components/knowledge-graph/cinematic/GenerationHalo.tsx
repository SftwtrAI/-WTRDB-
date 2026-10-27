/**
 * GenerationHalo — Replaces the boring "loading spinner" when a user opens
 * /app/knowledge-graph/:id while the graph is still being extracted.
 *
 * Visual: a slowly rotating ring of placeholder nodes that gradually populate
 * with real entities as they arrive via the WebSocket. Makes the wait feel
 * intentional, not broken.
 *
 * Subscribes to useExtractionEvents internally so the parent doesn't need to.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useExtractionEvents } from "@/hooks/useExtractionEvents";

interface GenerationHaloProps {
  knowledgeBaseId: string;
  documentTitle?: string;
}

const ENTITY_COLORS: Record<string, string> = {
  Person: "#07A288",
  Organization: "#5BBE4E",
  Concept: "#B8E52B",
  Location: "#3B82F6",
  Event: "#F59E0B",
  Product: "#8B5CF6",
  Document: "#6B7280",
  Other: "#EC4899",
};

const RING_SLOTS = 12;
const RADIUS = 130;
const CENTER = 160;

export function GenerationHalo({ knowledgeBaseId, documentTitle }: GenerationHaloProps) {
  const { events, isConnected } = useExtractionEvents({
    knowledgeBaseId,
    enabled: true,
    replayOnMount: true,
  });

  // Pull discovered entities from events (most recent first), unique by name
  const discoveredEntities = useMemo(() => {
    const seen = new Set<string>();
    const list: { name: string; type: string }[] = [];
    for (const ev of events) {
      if (ev.eventType !== "entity_discovered" || !ev.entityName) continue;
      if (seen.has(ev.entityName)) continue;
      seen.add(ev.entityName);
      list.push({ name: ev.entityName, type: ev.entityLabel || "Other" });
    }
    return list;
  }, [events]);

  // Latest chunk progress for the status line
  const chunkProgress = useMemo(() => {
    let current = 0;
    let total = 0;
    for (const ev of events) {
      if (ev.eventType === "chunk_start" && typeof ev.chunkIndex === "number") {
        current = ev.chunkIndex + 1;
        const t = (ev.details && typeof ev.details["totalChunks"] === "number"
          ? (ev.details["totalChunks"] as number)
          : undefined) ?? total;
        if (t) total = t;
      }
    }
    return { current, total };
  }, [events]);

  // Build the ring: fill with real entities, pad with placeholders
  const ringNodes = useMemo(() => {
    const nodes: Array<{ name: string; type: string; isReal: boolean }> = [];
    for (let i = 0; i < RING_SLOTS; i++) {
      if (i < discoveredEntities.length) {
        nodes.push({ ...discoveredEntities[i], isReal: true });
      } else {
        nodes.push({ name: "", type: "Other", isReal: false });
      }
    }
    return nodes;
  }, [discoveredEntities]);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0B1014]"
      data-testid="generation-halo"
    >
      {/* Rotating ring */}
      <motion.div
        className="relative"
        style={{ width: CENTER * 2, height: CENTER * 2 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 30, ease: "linear", repeat: Infinity }}
      >
        {/* Faint connecting circle */}
        <svg
          className="absolute inset-0"
          width={CENTER * 2}
          height={CENTER * 2}
          viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#243645"
            strokeWidth={1}
            strokeDasharray="2 6"
          />
        </svg>

        {ringNodes.map((node, i) => {
          const angle = (i / RING_SLOTS) * Math.PI * 2 - Math.PI / 2;
          const x = CENTER + Math.cos(angle) * RADIUS;
          const y = CENTER + Math.sin(angle) * RADIUS;
          const color = ENTITY_COLORS[node.type] || ENTITY_COLORS.Other;

          return (
            <motion.div
              key={i}
              className="absolute"
              style={{
                left: x - 10,
                top: y - 10,
              }}
              initial={false}
              animate={{
                scale: node.isReal ? 1 : 0.7,
              }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 18,
              }}
            >
              {/* Counter-rotate so dots stay upright */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 30, ease: "linear", repeat: Infinity }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: 20,
                    height: 20,
                    backgroundColor: node.isReal ? color : "#1a2530",
                    border: `1.5px solid ${node.isReal ? color : "#243645"}`,
                    boxShadow: node.isReal
                      ? `0 0 12px ${color}80`
                      : "none",
                    transition: "all 0.3s ease-out",
                  }}
                />
              </motion.div>
            </motion.div>
          );
        })}

        {/* Center: spinner + count */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 30, ease: "linear", repeat: Infinity }}
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        >
          <Loader2 className="h-6 w-6 text-[#07A288] animate-spin" />
          <div className="mt-2 text-2xl font-bold text-[#E7EEF6]">
            {discoveredEntities.length}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[#8FA2B5]">
            entities
          </div>
        </motion.div>
      </motion.div>

      {/* Status text below */}
      <div className="mt-12 flex flex-col items-center gap-2 max-w-md text-center px-4">
        {documentTitle && (
          <div className="text-sm font-medium text-[#E7EEF6]">{documentTitle}</div>
        )}
        <div className="text-xs text-[#8FA2B5]">
          {chunkProgress.current > 0 && chunkProgress.total > 0
            ? `Processing chunk ${chunkProgress.current} of ${chunkProgress.total}…`
            : "Waiting for the first chunk to be processed…"}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              isConnected ? "bg-[#5BBE4E]" : "bg-[#8FA2B5]"
            }`}
          />
          <span className="text-[10px] uppercase tracking-wider text-[#8FA2B5]">
            {isConnected ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>
    </div>
  );
}
