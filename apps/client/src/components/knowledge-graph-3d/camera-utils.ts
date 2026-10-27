/**
 * Camera animation utilities and keyboard shortcut handler
 * for the 3D Knowledge Graph visualization.
 */

import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Node3D, Edge3D } from "./types";

// ── Easing ──

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── Smooth Camera Animation ──

/**
 * Smoothly animates the camera to look at `targetPosition` over `duration` ms.
 * Camera moves to targetPosition + offset(4, 3, 4) and controls target moves
 * to targetPosition using requestAnimationFrame with ease-out cubic easing.
 */
export function animateCameraTo(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  targetPosition: THREE.Vector3,
  duration = 600,
): void {
  const startCameraPos = camera.position.clone();
  const startTarget = (controls.target as THREE.Vector3).clone();

  const endCameraPos = new THREE.Vector3(
    targetPosition.x + 4,
    targetPosition.y + 3,
    targetPosition.z + 4,
  );
  const endTarget = targetPosition.clone();

  const startTime = performance.now();

  function tick() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const t = easeOutCubic(progress);

    camera.position.lerpVectors(startCameraPos, endCameraPos, t);
    (controls.target as THREE.Vector3).lerpVectors(startTarget, endTarget, t);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

// ── Fit All Nodes in View ──

/**
 * Computes the bounding box of all node positions (that have groups),
 * calculates the center and required camera distance to frame all nodes
 * with padding, then smoothly animates the camera to that position.
 */
export function fitViewToNodes(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  nodes: Node3D[],
  padding = 1.5,
): void {
  const positionedNodes = nodes.filter((n) => n.group !== null);
  if (positionedNodes.length === 0) return;

  const box = new THREE.Box3();
  for (const node of positionedNodes) {
    box.expandByPoint(node.position);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);
  const distance = (maxDim * padding) / (2 * Math.tan(fov / 2));

  // Camera looks directly at the graph center
  const endTarget = center.clone();

  // Camera positioned straight in front with slight elevation so graph is centered in viewport
  const startCameraPos = camera.position.clone();
  const startTarget = (controls.target as THREE.Vector3).clone();

  const endCameraPos = new THREE.Vector3(
    center.x,
    center.y + distance * 0.15,
    center.z + distance,
  );

  const startTime = performance.now();
  const duration = 800;

  function tick() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const t = easeOutCubic(progress);

    camera.position.lerpVectors(startCameraPos, endCameraPos, t);
    (controls.target as THREE.Vector3).lerpVectors(startTarget, endTarget, t);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

// ── BFS Depth Filter ──

/**
 * BFS from seedNodeId, following edges in both directions, up to maxDepth hops.
 * Returns the set of reachable node IDs. Used for the depth slider feature.
 */
export function computeReachableNodeIds(
  seedNodeId: string,
  edges: Edge3D[],
  maxDepth: number,
): Set<string> {
  const reachable = new Set<string>([seedNodeId]);
  let frontier = [seedNodeId];

  // Build adjacency for fast lookup
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.sourceId)) adjacency.set(edge.sourceId, []);
    if (!adjacency.has(edge.targetId)) adjacency.set(edge.targetId, []);
    adjacency.get(edge.sourceId)!.push(edge.targetId);
    adjacency.get(edge.targetId)!.push(edge.sourceId);
  }

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      const neighbors = adjacency.get(nodeId);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return reachable;
}

// ── Keyboard Shortcut Handler ──

export interface KeyboardActions {
  onSearchToggle: () => void;
  onFitView: () => void;
  onEscape: () => void;
  onHideSelected: () => void;
  onSearchNext: () => void;
  onSearchPrev: () => void;
}

/**
 * Returns a keydown handler that maps keyboard shortcuts to graph actions.
 * When the user is typing in an input or textarea, only Escape and arrow
 * keys are processed to avoid conflicts.
 */
export function createKeyboardHandler(
  actions: KeyboardActions,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const isTyping =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.isContentEditable;

    // Escape always works
    if (e.key === "Escape") {
      actions.onEscape();
      return;
    }

    // Arrow keys always work (search navigation)
    if (e.key === "ArrowDown") {
      e.preventDefault();
      actions.onSearchNext();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      actions.onSearchPrev();
      return;
    }

    // Skip remaining shortcuts when typing in an input
    if (isTyping) return;

    if (e.key === "/" || (e.ctrlKey && e.key === "f")) {
      e.preventDefault();
      actions.onSearchToggle();
      return;
    }

    if (e.key === "f") {
      actions.onFitView();
      return;
    }

    if (e.key === "h") {
      actions.onHideSelected();
      return;
    }
  };
}
