/**
 * ApproachTrail — A subtle "this is being processed right now" effect
 * applied to a knowledge base item card while its graph is being extracted.
 *
 * Visual: a slow-rotating brand-gradient border (teal → green → lime) plus
 * a few tiny entity-shaped icons that drift upward from the card.
 *
 * Wraps any children. Does NOT change layout — uses absolute positioning
 * for the trail particles and inset for the border ring.
 */

import { useEffect, useState } from "react";
import { Network, Sparkles, Zap } from "lucide-react";

interface ApproachTrailProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}

interface Particle {
  id: number;
  left: number; // 0..100 (%)
  delay: number; // ms
  Icon: typeof Network;
  color: string;
}

const ICONS = [Network, Sparkles, Zap] as const;
const COLORS = ["#07A288", "#5BBE4E", "#B8E52B"] as const;

export function ApproachTrail({ active, children, className = "" }: ApproachTrailProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  // Spawn a fresh particle every ~700ms while active
  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    let counter = 0;
    const spawn = () => {
      counter += 1;
      const id = counter;
      const Icon = ICONS[id % ICONS.length];
      const color = COLORS[id % COLORS.length];
      const newParticle: Particle = {
        id,
        left: 10 + Math.random() * 80,
        delay: 0,
        Icon,
        color,
      };
      setParticles((prev) => [...prev, newParticle]);

      // Remove after animation completes (2s)
      setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== id));
      }, 2200);
    };

    spawn();
    const interval = setInterval(spawn, 700);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className={`relative ${className}`} data-testid="approach-trail">
      {/* Rotating gradient border ring */}
      {active && (
        <div
          className="pointer-events-none absolute -inset-[1px] rounded-lg"
          style={{
            background:
              "conic-gradient(from var(--angle), #07A288, #5BBE4E, #B8E52B, #07A288)",
            animation: "approach-trail-rotate 4s linear infinite",
            opacity: 0.85,
            padding: "1px",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      )}

      {/* Drifting particles */}
      {active && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {particles.map((p) => {
            const Icon = p.Icon;
            return (
              <div
                key={p.id}
                className="absolute"
                style={{
                  left: `${p.left}%`,
                  bottom: "0px",
                  animation: "approach-trail-drift 2.2s ease-out forwards",
                  color: p.color,
                  filter: `drop-shadow(0 0 6px ${p.color})`,
                }}
              >
                <Icon className="h-3 w-3" />
              </div>
            );
          })}
        </div>
      )}

      {children}

      <style>{`
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes approach-trail-rotate {
          0% { --angle: 0deg; }
          100% { --angle: 360deg; }
        }
        @keyframes approach-trail-drift {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-60px) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
