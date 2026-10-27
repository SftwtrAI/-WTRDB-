/**
 * SpiderwebSimulation
 *
 * A lightweight, incremental force-directed layout used by the Meta-Graph
 * spider-web visualization. Models a spring-electric system:
 *   - O(n²) Coulomb-style repulsion between all nodes
 *   - Hooke spring attraction along edges
 *   - Soft center gravity to keep the layout bounded
 *
 * Unlike the synchronous layout in KnowledgeGraphPage.tsx, this class exposes
 * a `step()` method so the canvas renderer can tick it once per animation
 * frame and draw the filaments as they settle.
 */

export interface SimNode {
  id: string;
  name: string;
  label: string;
  documentIds: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
}

export interface SimEdge {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
  types: string[];
}

export interface SimulationConfig {
  width: number;
  height: number;
  centerStrength: number;
  repulsionStrength: number;
  linkStrength: number;
  linkDistance: number;
  damping: number;
}

export const DEFAULT_SIM_CONFIG: SimulationConfig = {
  width: 1600,
  height: 1000,
  centerStrength: 0.002,
  repulsionStrength: 8000,
  linkStrength: 0.015,
  linkDistance: 140,
  damping: 0.88,
};

const MAX_VELOCITY = 50;
const MIN_DIST_SQ = 25; // prevent infinite forces at near-zero distance

export class SpiderwebSimulation {
  private nodes: SimNode[];
  private edges: SimEdge[];
  private config: SimulationConfig;
  private nodeById: Map<string, SimNode>;
  private adjacency: Map<string, SimEdge[]>;
  private tickCount = 0;

  constructor(
    nodes: SimNode[],
    edges: SimEdge[],
    config: Partial<SimulationConfig> = {},
  ) {
    this.config = { ...DEFAULT_SIM_CONFIG, ...config };
    this.nodes = nodes.map((n) => ({ ...n }));
    this.edges = edges.map((e) => ({ ...e }));

    // Initial placement: scatter nodes on a ring around the canvas centre so
    // the simulation has something to unpack (avoids zero-force deadlocks).
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;
    const radius = Math.min(this.config.width, this.config.height) * 0.35;
    const n = Math.max(this.nodes.length, 1);

    this.nodes.forEach((node, i) => {
      if (node.x === 0 && node.y === 0) {
        const angle = (2 * Math.PI * i) / n;
        // Slight radial jitter keeps symmetric graphs from freezing.
        const jitter = (Math.sin(i * 2.39) + 1) * 40;
        node.x = centerX + Math.cos(angle) * (radius + jitter);
        node.y = centerY + Math.sin(angle) * (radius + jitter);
      }
      node.vx = 0;
      node.vy = 0;
    });

    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    this.adjacency = new Map();
    for (const edge of this.edges) {
      if (!this.adjacency.has(edge.sourceId)) {
        this.adjacency.set(edge.sourceId, []);
      }
      if (!this.adjacency.has(edge.targetId)) {
        this.adjacency.set(edge.targetId, []);
      }
      this.adjacency.get(edge.sourceId)!.push(edge);
      this.adjacency.get(edge.targetId)!.push(edge);
    }
  }

  /** Advance the simulation by a single tick. */
  step(): void {
    const {
      width,
      height,
      centerStrength,
      repulsionStrength,
      linkStrength,
      linkDistance,
      damping,
    } = this.config;

    const centerX = width / 2;
    const centerY = height / 2;
    const nodes = this.nodes;

    // Repulsion (O(n²))
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.fixed) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < MIN_DIST_SQ) {
          // Jitter apart so the denominator doesn't explode.
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          distSq = dx * dx + dy * dy + MIN_DIST_SQ;
        }
        const dist = Math.sqrt(distSq);
        const force = repulsionStrength / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }

    // Spring attraction along edges
    for (const edge of this.edges) {
      const a = this.nodeById.get(edge.sourceId);
      const b = this.nodeById.get(edge.targetId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const displacement = dist - linkDistance;
      // Heavier edges pull harder — shared entities cluster tighter.
      const force = displacement * linkStrength * (1 + edge.weight * 0.2);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Centering gravity
    for (const node of nodes) {
      if (node.fixed) continue;
      node.vx += (centerX - node.x) * centerStrength;
      node.vy += (centerY - node.y) * centerStrength;
    }

    // Integrate positions with velocity clamping
    for (const node of nodes) {
      if (node.fixed) continue;
      // Clamp velocities to prevent NaN/explosion on degenerate graphs.
      if (!Number.isFinite(node.vx)) node.vx = 0;
      if (!Number.isFinite(node.vy)) node.vy = 0;
      if (node.vx > MAX_VELOCITY) node.vx = MAX_VELOCITY;
      if (node.vx < -MAX_VELOCITY) node.vx = -MAX_VELOCITY;
      if (node.vy > MAX_VELOCITY) node.vy = MAX_VELOCITY;
      if (node.vy < -MAX_VELOCITY) node.vy = -MAX_VELOCITY;

      node.x += node.vx;
      node.y += node.vy;
      node.vx *= damping;
      node.vy *= damping;
    }

    this.tickCount++;
  }

  /** Run `steps` simulation ticks in a tight loop (for warm-up). */
  tick(steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.step();
    }
  }

  getNodes(): SimNode[] {
    return this.nodes;
  }

  getEdges(): SimEdge[] {
    return this.edges;
  }

  getTickCount(): number {
    return this.tickCount;
  }

  getConfig(): SimulationConfig {
    return this.config;
  }
}
