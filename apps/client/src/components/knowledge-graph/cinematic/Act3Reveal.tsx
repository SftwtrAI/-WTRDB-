/**
 * Act3Reveal — The completion celebration shown when extraction
 * finishes. Displays a brand-gradient bordered card with animated
 * entity/relationship count-ups, optional entity type badges, a
 * confetti burst, and two CTAs ("Explore Your Graph" / "Close").
 */

import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Sparkles, ArrowRight, X } from "lucide-react";

const BRAND_TEAL = "#07A288";
const BRAND_GREEN = "#5BBE4E";
const BRAND_LIME = "#B8E52B";
const BG_DARK = "#0B1014";
const CARD_BG = "#111A21";
const BORDER = "#243645";
const TEXT_PRIMARY = "#E7EEF6";
const TEXT_MUTED = "#8FA2B5";
const ON_COLOR_TEXT = "#041514";

const BRAND_GRADIENT = `linear-gradient(90deg, ${BRAND_TEAL} 0%, ${BRAND_GREEN} 45%, ${BRAND_LIME} 100%)`;

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

interface Act3RevealProps {
  entityCount: number;
  relationshipCount: number;
  entityTypes?: Record<string, number>;
  onExplore: () => void;
  onClose: () => void;
}

/** Count-up from 0 to `value` over 1500ms. */
function StatCounter({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.5,
      ease: "easeOut",
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, mv, rounded]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="text-5xl font-bold tabular-nums"
        style={{ color, textShadow: `0 0 24px ${color}55` }}
      >
        {display}
      </div>
      <div
        className="mt-1 text-xs font-mono uppercase tracking-wider"
        style={{ color: TEXT_MUTED }}
      >
        {label}
      </div>
    </div>
  );
}

interface ConfettiParticle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  color: string;
  size: number;
}

function generateConfetti(): ConfettiParticle[] {
  const colors = [BRAND_TEAL, BRAND_GREEN, BRAND_LIME];
  const out: ConfettiParticle[] = [];
  for (let i = 0; i < 12; i++) {
    out.push({
      id: i,
      left: 20 + Math.random() * 60,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 120,
      color: colors[i % colors.length],
      size: 4 + Math.random() * 5,
    });
  }
  return out;
}

export function Act3Reveal({
  entityCount,
  relationshipCount,
  entityTypes,
  onExplore,
  onClose,
}: Act3RevealProps) {
  const confetti = useMemo(() => generateConfetti(), []);
  const typeEntries = entityTypes
    ? Object.entries(entityTypes).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Radial gradient pulse background */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          width: 800,
          height: 500,
          background: `radial-gradient(circle, ${BRAND_TEAL}44 0%, ${BRAND_LIME}22 40%, transparent 70%)`,
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.8, 0.6], scale: [0.6, 1.1, 1] }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      />

      {/* Confetti burst */}
      <div className="pointer-events-none absolute inset-0">
        {confetti.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-sm"
            style={{
              left: `${p.left}%`,
              bottom: -10,
              width: p.size,
              height: p.size * 1.4,
              backgroundColor: p.color,
              boxShadow: `0 0 8px ${p.color}`,
            }}
            initial={{ y: 0, opacity: 1, rotate: 0, x: 0 }}
            animate={{
              y: -500,
              x: p.drift,
              rotate: 360,
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: "easeOut",
              times: [0, 0.7, 1],
            }}
          />
        ))}
      </div>

      {/* Brand-gradient bordered card */}
      <motion.div
        className="relative z-10 w-full max-w-xl rounded-2xl p-[2px]"
        style={{ background: BRAND_GRADIENT }}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div
          className="rounded-2xl px-8 py-8"
          style={{ backgroundColor: CARD_BG }}
        >
          {/* Title */}
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 14,
                delay: 0.2,
              }}
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                background: BRAND_GRADIENT,
                boxShadow: `0 0 24px ${BRAND_TEAL}66`,
              }}
            >
              <Sparkles className="h-6 w-6" style={{ color: ON_COLOR_TEXT }} />
            </motion.div>
            <motion.h2
              className="text-2xl font-bold"
              style={{ color: TEXT_PRIMARY }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              Knowledge Graph Created
            </motion.h2>
            <motion.p
              className="mt-1 text-sm"
              style={{ color: TEXT_MUTED }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              Your document has been transformed into structured knowledge.
            </motion.p>
          </div>

          {/* Stat reveal */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div
              className="rounded-lg border py-4"
              style={{ borderColor: BORDER, backgroundColor: BG_DARK }}
            >
              <StatCounter
                value={entityCount}
                label="Entities"
                color={BRAND_TEAL}
              />
            </div>
            <div
              className="rounded-lg border py-4"
              style={{ borderColor: BORDER, backgroundColor: BG_DARK }}
            >
              <StatCounter
                value={relationshipCount}
                label="Relationships"
                color={BRAND_LIME}
              />
            </div>
          </div>

          {/* Entity type badges */}
          {typeEntries.length > 0 && (
            <motion.div
              className="mt-4 flex flex-wrap items-center justify-center gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
            >
              {typeEntries.map(([type, count]) => {
                const color = ENTITY_COLORS[type] || ENTITY_COLORS.Other;
                return (
                  <div
                    key={type}
                    className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono"
                    style={{
                      borderColor: `${color}66`,
                      backgroundColor: `${color}11`,
                      color: TEXT_PRIMARY,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {type}
                    <span style={{ color: TEXT_MUTED }}>{count}</span>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* CTAs */}
          <motion.div
            className="mt-8 flex flex-col gap-2 sm:flex-row sm:gap-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.4 }}
          >
            <button
              type="button"
              onClick={onExplore}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                background: BRAND_GRADIENT,
                color: ON_COLOR_TEXT,
              }}
              data-testid="button-explore-graph"
            >
              Explore Your Graph
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/5 focus:outline-none focus:ring-2"
              style={{
                borderColor: BORDER,
                color: TEXT_MUTED,
              }}
              data-testid="button-close-cinematic"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
