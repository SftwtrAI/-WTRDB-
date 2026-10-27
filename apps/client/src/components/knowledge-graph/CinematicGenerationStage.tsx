/**
 * CinematicGenerationStage — Full-screen modal orchestrating the
 * three-act cinematic knowledge graph generation experience.
 *
 *   Act 1: 1.5s title reveal (Act1Opening)
 *   Act 2: live extraction visualization (Act2Extraction)
 *   Act 3: completion celebration (Act3Reveal)
 *
 * Consumes real-time extraction events via useExtractionEvents. Act 1
 * transitions to Act 2 after 1.5s OR immediately if the first event
 * arrives sooner. Act 2 transitions to Act 3 when an
 * `extraction_complete` event is received.
 *
 * Dismissing the modal does NOT cancel the actual extraction — the
 * backend continues processing in the background.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useExtractionEvents } from "@/hooks/useExtractionEvents";
import { Act1Opening } from "./cinematic/Act1Opening";
import { Act2Extraction } from "./cinematic/Act2Extraction";
import { Act3Reveal } from "./cinematic/Act3Reveal";

interface CinematicGenerationStageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBaseId: string | null;
  documentTitle: string;
}

type Act = 1 | 2 | 3;

export function CinematicGenerationStage({
  open,
  onOpenChange,
  knowledgeBaseId,
  documentTitle,
}: CinematicGenerationStageProps) {
  const [, setLocation] = useLocation();
  const [act, setAct] = useState<Act>(1);

  const { events, isConnected, reset } = useExtractionEvents({
    knowledgeBaseId: knowledgeBaseId,
    enabled: open,
    replayOnMount: true,
  });

  // Reset to Act 1 each time the modal opens.
  useEffect(() => {
    if (open) {
      setAct(1);
      reset();
    }
    // We intentionally only react to `open` — `reset` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Act 1 → Act 2: if any event arrives while in Act 1, skip to Act 2.
  useEffect(() => {
    if (!open) return;
    if (act === 1 && events.length > 0) {
      setAct(2);
    }
  }, [events.length, act, open]);

  // Act 2 → Act 3: when an extraction_complete event is received.
  useEffect(() => {
    if (!open) return;
    if (act === 3) return;
    const done = events.find((e) => e.eventType === "extraction_complete");
    if (done) setAct(3);
  }, [events, act, open]);

  // Derive final stats from the extraction_complete event (or from the
  // raw event stream as a fallback).
  const finalStats = useMemo(() => {
    const completeEv = events.find((e) => e.eventType === "extraction_complete");
    if (completeEv && completeEv.details) {
      const d = completeEv.details as Record<string, unknown>;
      return {
        entityCount:
          typeof d.entityCount === "number" ? (d.entityCount as number) : 0,
        relationshipCount:
          typeof d.relationshipCount === "number"
            ? (d.relationshipCount as number)
            : 0,
      };
    }
    return {
      entityCount: events.filter((e) => e.eventType === "entity_discovered").length,
      relationshipCount: events.filter(
        (e) => e.eventType === "relationship_extracted",
      ).length,
    };
  }, [events]);

  // Tally entity types from the discovered events (for Act 3 badges).
  const entityTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of events) {
      if (ev.eventType !== "entity_discovered") continue;
      const label = ev.entityLabel || "Other";
      counts[label] = (counts[label] || 0) + 1;
    }
    return counts;
  }, [events]);

  const handleExplore = () => {
    if (knowledgeBaseId) {
      setLocation(`/app/knowledge-graph/${knowledgeBaseId}`);
    }
    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="h-screen w-screen max-w-none border-0 bg-[#0B1014]/95 p-0 backdrop-blur-2xl sm:rounded-none"
        aria-describedby={undefined}
      >
        {/* Hidden visually but present for a11y — Dialog requires a title. */}
        <span className="sr-only">Generating knowledge graph</span>

        {/* Connection indicator (top-left) */}
        <div className="pointer-events-none absolute left-4 top-4 z-50 flex items-center gap-2">
          <motion.span
            className="h-2 w-2 rounded-full"
            animate={{
              backgroundColor: isConnected ? "#5BBE4E" : "#6B7280",
              boxShadow: isConnected ? "0 0 8px #5BBE4E" : "none",
            }}
            transition={{ duration: 0.3 }}
          />
          <span
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: "#8FA2B5" }}
          >
            {isConnected ? "Live" : "Offline"}
          </span>
        </div>

        {/* Dismiss button (top-right) */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ borderColor: "#243645", color: "#8FA2B5" }}
          aria-label="Dismiss"
          data-testid="button-dismiss-cinematic"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Act stage */}
        <div className="relative h-full w-full">
          <AnimatePresence mode="wait">
            {act === 1 && (
              <motion.div
                key="act1"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Act1Opening
                  documentTitle={documentTitle}
                  onComplete={() => setAct((prev) => (prev === 1 ? 2 : prev))}
                />
              </motion.div>
            )}
            {act === 2 && (
              <motion.div
                key="act2"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Act2Extraction
                  events={events}
                  documentTitle={documentTitle}
                />
              </motion.div>
            )}
            {act === 3 && (
              <motion.div
                key="act3"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Act3Reveal
                  entityCount={finalStats.entityCount}
                  relationshipCount={finalStats.relationshipCount}
                  entityTypes={entityTypes}
                  onExplore={handleExplore}
                  onClose={handleClose}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
