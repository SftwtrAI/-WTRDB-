import type { ReactNode } from "react";
import { VoidAuthCard } from "./VoidAuthCard";

interface PublicConstellationShellProps {
  children?: ReactNode;
}

/**
 * Shown to unauthenticated visitors. Renders only the auth card on a dark
 * background — the celestial field, UtilitiesPanel, and every other
 * authenticated-only surface stay hidden until the user signs in.
 */
export function PublicConstellationShell({ children }: PublicConstellationShellProps) {
  return (
    <div className="void-shell relative h-screen w-screen bg-[#0B1014]">
      <div className="pointer-events-none fixed inset-0 z-20">
        <VoidAuthCard />
        {children}
      </div>
    </div>
  );
}
