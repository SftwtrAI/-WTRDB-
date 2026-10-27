/**
 * Act1Opening — The opening title sequence (~1.5s).
 *
 * Shows the document title centered on screen with a subtle teal glow,
 * a "Reading the document..." subtitle, and 30 ghostly word-like
 * rectangles drifting upward in the background. After 1500ms calls
 * onComplete so the stage can transition to Act 2.
 */

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";

const BRAND_TEAL = "#07A288";
const TEXT_PRIMARY = "#E7EEF6";
const TEXT_MUTED = "#8FA2B5";

interface Act1OpeningProps {
  documentTitle: string;
  onComplete: () => void;
}

interface Token {
  id: number;
  left: number;
  width: number;
  delay: number;
  duration: number;
  drift: number;
  opacity: number;
}

function generateTokens(count: number): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      left: Math.random() * 100,
      width: 20 + Math.random() * 60,
      delay: Math.random() * 1.2,
      duration: 2 + Math.random() * 2,
      drift: (Math.random() - 0.5) * 40,
      opacity: 0.05 + Math.random() * 0.12,
    });
  }
  return out;
}

export function Act1Opening({ documentTitle, onComplete }: Act1OpeningProps) {
  // Stable per-mount token layout.
  const tokens = useMemo(() => generateTokens(30), []);

  useEffect(() => {
    const t = setTimeout(onComplete, 1500);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Drifting ghostly tokens */}
      <div className="pointer-events-none absolute inset-0">
        {tokens.map((tok) => (
          <motion.div
            key={tok.id}
            className="absolute rounded"
            style={{
              left: `${tok.left}%`,
              bottom: -20,
              width: tok.width,
              height: 8,
              backgroundColor: TEXT_PRIMARY,
            }}
            initial={{ y: 0, opacity: 0, x: 0 }}
            animate={{
              y: -window.innerHeight - 60,
              opacity: [0, tok.opacity, tok.opacity, 0],
              x: tok.drift,
            }}
            transition={{
              duration: tok.duration,
              delay: tok.delay,
              ease: "easeOut",
              times: [0, 0.15, 0.85, 1],
            }}
          />
        ))}
      </div>

      {/* Teal pulse glow behind title */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          width: 560,
          height: 260,
          backgroundColor: BRAND_TEAL,
        }}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: [0, 0.35, 0.22], scale: [0.7, 1.1, 1] }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      />

      {/* Title + subtitle */}
      <div className="relative z-10 max-w-3xl px-6 text-center">
        <motion.h1
          className="text-4xl font-bold leading-tight md:text-5xl"
          style={{ color: TEXT_PRIMARY }}
          initial={{ opacity: 0, scale: 0.95, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        >
          {documentTitle || "Untitled document"}
        </motion.h1>
        <motion.p
          className="mt-4 text-sm font-mono tracking-wide md:text-base"
          style={{ color: TEXT_MUTED }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Reading the document...
        </motion.p>
      </div>
    </div>
  );
}
