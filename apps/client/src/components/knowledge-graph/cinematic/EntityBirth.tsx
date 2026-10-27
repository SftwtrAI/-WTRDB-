/**
 * EntityBirth — A small particle-burst animation shown when an entity
 * first appears in the cinematic extraction view.
 *
 * Renders an SVG group positioned absolutely inside its parent (the
 * Act2Extraction right pane). The central circle scales in with a
 * spring, a handful of radial particles burst outward, and the entity
 * name is labeled below the node. Self-cleans up via onComplete.
 */

import { useEffect } from "react";
import { motion } from "framer-motion";

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

interface EntityBirthProps {
  /** X position in percentage (0-100) relative to parent. */
  x: number;
  /** Y position in percentage (0-100) relative to parent. */
  y: number;
  entityType: string;
  entityName: string;
  onComplete?: () => void;
}

const PARTICLE_COUNT = 6;

export function EntityBirth({
  x,
  y,
  entityType,
  entityName,
  onComplete,
}: EntityBirthProps) {
  const color = ENTITY_COLORS[entityType] || ENTITY_COLORS.Other;

  // Call onComplete after the full animation lifetime (~800ms).
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 800);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Radial particle burst */}
      <svg
        width={80}
        height={80}
        viewBox="-40 -40 80 80"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
      >
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
          const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
          const dx = Math.cos(angle) * 28;
          const dy = Math.sin(angle) * 28;
          return (
            <motion.circle
              key={i}
              cx={0}
              cy={0}
              r={2}
              fill={color}
              initial={{ cx: 0, cy: 0, opacity: 1 }}
              animate={{ cx: dx, cy: dy, opacity: 0 }}
              transition={{
                duration: 0.7,
                ease: "easeOut",
                delay: 0.05,
              }}
            />
          );
        })}
      </svg>

      {/* Glowing core node */}
      <motion.div
        className="relative rounded-full"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        style={{
          width: 18,
          height: 18,
          backgroundColor: color,
          boxShadow: `0 0 16px ${color}, 0 0 32px ${color}66`,
        }}
      >
        {/* Subtle halo pulse */}
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ backgroundColor: color }}
        />
      </motion.div>

      {/* Entity name label */}
      <motion.div
        className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-center"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            color: "#E7EEF6",
            backgroundColor: "rgba(17, 26, 33, 0.85)",
            border: `1px solid ${color}66`,
          }}
        >
          {entityName}
        </span>
      </motion.div>
    </motion.div>
  );
}
