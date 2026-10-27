/**
 * CommentaryStream — Scrolling commentary feed showing the latest
 * extraction events as natural-language strings at the bottom of the
 * cinematic stage.
 *
 * Items slide in from below using framer-motion AnimatePresence, and
 * older items fade (opacity gradient). The feed is intentionally
 * compact and full-width.
 */

import { AnimatePresence, motion } from "framer-motion";
import type { ExtractionEventPayload } from "@/lib/wsClient";

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

const BRAND_TEAL = "#07A288";
const BRAND_LIME = "#B8E52B";
const TEXT_PRIMARY = "#E7EEF6";
const TEXT_MUTED = "#8FA2B5";

interface CommentaryStreamProps {
  events: ExtractionEventPayload[];
  maxVisible?: number;
}

interface CommentaryItem {
  key: string;
  message: string;
  color: string;
}

function buildItem(ev: ExtractionEventPayload): CommentaryItem | null {
  const key =
    ev.id || `${ev.timestamp}-${ev.eventType}-${ev.entityName ?? ev.sourceEntity ?? ""}`;

  switch (ev.eventType) {
    case "chunk_start": {
      const total =
        (ev.details && typeof ev.details.totalChunks === "number"
          ? (ev.details.totalChunks as number)
          : undefined) ?? 0;
      const idx = (ev.chunkIndex ?? 0) + 1;
      return {
        key,
        message: total > 0
          ? `Reading chunk ${idx} of ${total}...`
          : `Reading chunk ${idx}...`,
        color: BRAND_TEAL,
      };
    }
    case "entity_discovered": {
      const type = ev.entityLabel || "Other";
      const color = ENTITY_COLORS[type] || ENTITY_COLORS.Other;
      return {
        key,
        message: `Discovered ${ev.entityName ?? "unknown"} (${type})`,
        color,
      };
    }
    case "relationship_extracted": {
      return {
        key,
        message: `${ev.sourceEntity ?? "?"} → ${ev.relationshipType ?? "related to"} → ${ev.targetEntity ?? "?"}`,
        color: BRAND_LIME,
      };
    }
    case "event_detected": {
      return {
        key,
        message: `Event: ${ev.eventName ?? "unnamed"}`,
        color: "#F59E0B",
      };
    }
    case "schema_proposal": {
      const proposalType =
        (ev.details && typeof ev.details.proposalType === "string"
          ? (ev.details.proposalType as string)
          : "type") ?? "type";
      const proposedLabel =
        (ev.details && typeof ev.details.proposedLabel === "string"
          ? (ev.details.proposedLabel as string)
          : "") ?? "";
      return {
        key,
        message: `Proposing new ${proposalType}: ${proposedLabel}`,
        color: "#8B5CF6",
      };
    }
    case "deprecation": {
      return {
        key,
        message: `Deprecated: ${ev.sourceEntity ?? "?"} → ${ev.targetEntity ?? "?"}`,
        color: TEXT_MUTED,
      };
    }
    case "adjudication_result": {
      const idx = (ev.chunkIndex ?? 0) + 1;
      return {
        key,
        message: `Adjudication complete for chunk ${idx}`,
        color: BRAND_TEAL,
      };
    }
    case "extraction_complete": {
      return {
        key,
        message: "Extraction complete!",
        color: BRAND_LIME,
      };
    }
    case "extraction_error": {
      return {
        key,
        message: "Extraction error",
        color: "#EC4899",
      };
    }
    default:
      return null;
  }
}

export function CommentaryStream({
  events,
  maxVisible = 5,
}: CommentaryStreamProps) {
  // Build latest items (newest last) from the tail of the event list.
  const tail = events.slice(-Math.max(maxVisible * 2, maxVisible));
  const items: CommentaryItem[] = [];
  for (const ev of tail) {
    const item = buildItem(ev);
    if (item) items.push(item);
  }
  // Keep only the newest maxVisible items.
  const visible = items.slice(-maxVisible);
  const count = visible.length;

  return (
    <div className="pointer-events-none w-full">
      <div className="mx-auto flex flex-col gap-1 px-4 py-2">
        <AnimatePresence initial={false}>
          {visible.map((item, idx) => {
            // Newest item is at the bottom (idx === count - 1) → full opacity.
            const distanceFromNewest = count - 1 - idx;
            const opacity = Math.max(0.3, 1 - distanceFromNewest * 0.18);
            return (
              <motion.div
                key={item.key}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="flex items-center gap-2 text-xs"
                style={{ color: TEXT_PRIMARY }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: `0 0 6px ${item.color}`,
                  }}
                />
                <span className="truncate font-mono">{item.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {count === 0 && (
          <div
            className="text-xs font-mono italic"
            style={{ color: TEXT_MUTED }}
          >
            Waiting for extraction events...
          </div>
        )}
      </div>
    </div>
  );
}
