import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BrainCircuit,
  Hammer,
  Map,
  Sparkles,
  Telescope,
} from "lucide-react";

export interface VoidLocation {
  id: string;
  name: string;
  route: string;
  description: string;
  shortKey: string;
  icon: LucideIcon;
  coordinates: { x: number; y: number; z: number };
  matchers: string[];
}

export const VOID_LOCATIONS: VoidLocation[] = [
  {
    id: "constellation",
    name: "Celestial Field",
    route: "/app/constellation",
    description: "Zoomed-out star field of all knowledge graphs.",
    shortKey: "g c",
    icon: Sparkles,
    coordinates: { x: 0, y: 0, z: 0 },
    matchers: [
      "/app/constellation",
      "/app/knowledge-graph/",
      "/app/knowledge-graph-3d/",
      "/app/federations/",
    ],
  },
  {
    id: "cartographer",
    name: "The Cartographer",
    route: "/app/cartographer",
    description: "Guided terrain for onboarding and graph creation.",
    shortKey: "g l",
    icon: Map,
    coordinates: { x: -200, y: 0, z: 0 },
    matchers: ["/app/cartographer"],
  },
  {
    id: "workbench",
    name: "The Workbench",
    route: "/app/merge-playground",
    description: "Spatial merge playground for federation operations.",
    shortKey: "g m",
    icon: Hammer,
    coordinates: { x: 200, y: 0, z: 0 },
    matchers: ["/app/merge-playground"],
  },
  {
    id: "observatory",
    name: "The Observatory",
    route: "/app/eval-harness",
    description: "Evaluation instruments and quality telemetry.",
    shortKey: "g e",
    icon: Telescope,
    coordinates: { x: 0, y: 150, z: 0 },
    matchers: ["/app/eval-harness"],
  },
  {
    id: "pulse-array",
    name: "The Pulse Array",
    route: "/app/graph-pulse",
    description: "Live intake events from Graph Pulse agents.",
    shortKey: "g p",
    icon: Activity,
    coordinates: { x: 0, y: -100, z: 0 },
    matchers: ["/app/graph-pulse"],
  },
  {
    id: "brain-relay",
    name: "Brain Relay",
    route: "/app/brain-endpoints",
    description: "Published brain endpoints and relay status.",
    shortKey: "g b",
    icon: BrainCircuit,
    coordinates: { x: 150, y: 100, z: 0 },
    matchers: ["/app/brain-endpoints"],
  },
];

export function pathMatchesLocation(pathname: string, location: VoidLocation): boolean {
  return location.matchers.some((prefix) => {
    if (prefix === pathname) return true;
    if (prefix === "/app") return pathname === "/app";
    return pathname.startsWith(prefix);
  });
}

export function getVoidLocationFromPath(pathname: string): VoidLocation {
  return (
    VOID_LOCATIONS.find((location) => pathMatchesLocation(pathname, location)) ??
    VOID_LOCATIONS[0]
  );
}
