/**
 * FirstSuccessConfetti — A 1.5s confetti burst that fires the FIRST time
 * a user successfully generates a knowledge graph in this browser.
 *
 * Stores `wtrops-kg-first-success` in localStorage so it only fires once.
 *
 * Usage: render once at the page root and call `<FirstSuccessConfetti trigger={hasSucceeded} />`.
 * When `trigger` flips from false → true and the localStorage key is unset,
 * the burst plays.
 */

import { useEffect, useState, useMemo } from "react";

interface FirstSuccessConfettiProps {
  /** Set to true when a successful generation is detected. */
  trigger: boolean;
}

interface ConfettiPiece {
  id: number;
  left: number; // 0..100 (%)
  color: string;
  size: number;
  delay: number; // ms
  rotation: number;
  drift: number; // horizontal drift in px
}

const STORAGE_KEY = "wtrops-kg-first-success";
const BRAND_COLORS = ["#07A288", "#5BBE4E", "#B8E52B", "#E7EEF6"];

function generatePieces(): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < 60; i++) {
    pieces.push({
      id: i,
      left: Math.random() * 100,
      color: BRAND_COLORS[i % BRAND_COLORS.length],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 200,
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 200,
    });
  }
  return pieces;
}

export function FirstSuccessConfetti({ trigger }: FirstSuccessConfettiProps) {
  const [active, setActive] = useState(false);
  const pieces = useMemo(() => generatePieces(), []);

  useEffect(() => {
    if (!trigger) return;

    // Check localStorage to ensure first-time only
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return;
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // localStorage unavailable — still fire (graceful degradation)
    }

    setActive(true);

    // Auto-dismiss after 2.5s (animation runs ~1.8s)
    const timer = setTimeout(() => setActive(false), 2500);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      data-testid="first-success-confetti"
    >
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={
            {
              left: `${p.left}%`,
              bottom: "-20px",
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              borderRadius: "2px",
              boxShadow: `0 0 8px ${p.color}80`,
              animation: `confetti-rise 1.8s ease-out ${p.delay}ms forwards`,
              "--rotation": `${p.rotation}deg`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
      <style>{`
        @keyframes confetti-rise {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          100% {
            transform: translateY(-110vh) translateX(var(--drift)) rotate(var(--rotation));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
