import { BookOpen } from "lucide-react";

interface VoidReadingZoneProps {
  onNavigate?: (route: string) => void;
}

/**
 * Top-left "Docs" button. Opens the public /docs/brain page in a new tab
 * so the user never leaves the 3D constellation.
 */
export function VoidReadingZone(_props: VoidReadingZoneProps) {
  return (
    <a
      href="/docs/brain"
      target="_blank"
      rel="noopener noreferrer"
      className="void-reading-toggle pointer-events-auto"
      aria-label="Open docs"
      title="Open docs"
    >
      <BookOpen className="h-4 w-4" />
    </a>
  );
}
