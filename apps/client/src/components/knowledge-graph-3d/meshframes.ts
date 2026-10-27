/**
 * Procedural meshframe factories for the 3D Knowledge Graph visualization.
 * Each entity type gets a unique wireframe/line-based 3D silhouette built
 * from composited sub-geometries in a THREE.Group.
 */

import * as THREE from "three";
import type { MeshframeType } from "./types";

// ── Helpers ──

function ringPoints(
  radius: number,
  segments: number,
  yOffset = 0,
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push(
      new THREE.Vector3(
        Math.cos(theta) * radius,
        yOffset,
        Math.sin(theta) * radius,
      ),
    );
  }
  return pts;
}

function lineMat(color: number, opacity: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function glowMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function makeLineLoop(
  points: THREE.Vector3[],
  color: number,
  opacity: number,
): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(geo, lineMat(color, opacity));
}

function makeLineSegments(
  geo: THREE.EdgesGeometry,
  color: number,
  opacity: number,
): THREE.LineSegments {
  return new THREE.LineSegments(geo, lineMat(color, opacity));
}

function makeLine(
  points: THREE.Vector3[],
  color: number,
  opacity: number,
): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geo, lineMat(color, opacity));
}

// ── 1. Station Core ──

function createStationCore(
  s: number,
  seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Outer cage
  const outerEdges = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(s * 2, s * 2, s * 2),
  );
  group.add(makeLineSegments(outerEdges, color, 0.6));

  // Inner cage rotated
  const innerEdges = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(s * 1.3, s * 1.3, s * 1.3),
  );
  const innerCage = makeLineSegments(innerEdges, color, 0.4);
  innerCage.rotation.set(Math.PI / 4 + seed * 0.2, Math.PI / 4, 0);
  group.add(innerCage);

  // Cross-struts: 4 diagonals corner to corner
  const corners: [number, number, number][] = [
    [-1, -1, -1],
    [1, 1, 1],
    [-1, -1, 1],
    [1, 1, -1],
    [-1, 1, -1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, -1, -1],
  ];
  for (let i = 0; i < corners.length; i += 2) {
    const a = corners[i];
    const b = corners[i + 1];
    group.add(
      makeLine(
        [
          new THREE.Vector3(a[0] * s, a[1] * s, a[2] * s),
          new THREE.Vector3(b[0] * s, b[1] * s, b[2] * s),
        ],
        color,
        0.25,
      ),
    );
  }

  // Docking rings on +X, -X, +Y, -Y faces
  const dockingOffsets: [number, number, number, number, number, number][] = [
    [s, 0, 0, 0, 0, Math.PI / 2], // +X face, rotate ring to face outward
    [-s, 0, 0, 0, 0, -Math.PI / 2],
    [0, s, 0, 0, 0, 0], // +Y face (ring already horizontal)
    [0, -s, 0, 0, 0, 0],
  ];
  for (const [px, py, pz, rx, ry, rz] of dockingOffsets) {
    const ring = makeLineLoop(ringPoints(s * 0.4, 16), color, 0.3);
    ring.position.set(px, py, pz);
    ring.rotation.set(rx, ry, rz);
    group.add(ring);
  }

  // Core glow
  const coreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.5, 16, 12),
    glowMat(color, 0.08),
  );
  group.add(coreMesh);

  return group;
}

// ── 2. Subspace Anomaly ──

function createSubspaceAnomaly(
  s: number,
  seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Stellated shell: icosahedron with spiked vertices
  const icoGeo = new THREE.IcosahedronGeometry(s * 0.7, 0);
  const posAttr = icoGeo.getAttribute("position");
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const spike = 1.0 + (((i * 7 + seed * 3) % 5) * 0.25);
    posAttr.setXYZ(i, x * spike, y * spike, z * spike);
  }
  posAttr.needsUpdate = true;
  icoGeo.computeVertexNormals();
  const stellatedEdges = new THREE.EdgesGeometry(icoGeo);
  group.add(makeLineSegments(stellatedEdges, color, 0.7));

  // Inner octahedron
  const octEdges = new THREE.EdgesGeometry(
    new THREE.OctahedronGeometry(s * 0.4),
  );
  const octLines = makeLineSegments(octEdges, color, 0.5);
  octLines.rotation.y = seed * 0.5;
  group.add(octLines);

  // Hazard rings
  for (let i = 0; i < 2; i++) {
    const radius = i === 0 ? s * 0.9 : s * 1.2;
    const ring = makeLineLoop(ringPoints(radius, 24), color, 0.2);
    ring.rotation.x = Math.PI / 3 + i * 0.8 + seed * 0.2;
    group.add(ring);
  }

  // Core glow
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.15, 12, 8),
    glowMat(color, 0.2),
  );
  group.add(core);

  return group;
}

// ── 3. Delta Shield ──

function createDeltaShield(
  s: number,
  _seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Chevron shell: 6-point shape extruded on Z
  const chevronPts: [number, number][] = [
    [0, s * 1.2],
    [-s * 0.7, -s * 0.6],
    [-s * 0.15, -s * 0.2],
    [0, -s * 0.5],
    [s * 0.15, -s * 0.2],
    [s * 0.7, -s * 0.6],
  ];
  const zDepth = s * 0.15;

  // Front face edges
  const frontPts = chevronPts.map(
    ([x, y]) => new THREE.Vector3(x, y, zDepth),
  );
  frontPts.push(frontPts[0].clone()); // close loop
  group.add(makeLine(frontPts, color, 0.75));

  // Back face edges
  const backPts = chevronPts.map(
    ([x, y]) => new THREE.Vector3(x, y, -zDepth),
  );
  backPts.push(backPts[0].clone());
  group.add(makeLine(backPts, color, 0.75));

  // Connecting lines between front and back
  for (let i = 0; i < chevronPts.length; i++) {
    const [x, y] = chevronPts[i];
    group.add(
      makeLine(
        [new THREE.Vector3(x, y, zDepth), new THREE.Vector3(x, y, -zDepth)],
        color,
        0.75,
      ),
    );
  }

  // Inner star: 5-pointed, centered at y=s*0.15
  const starPts: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s * 0.35 : s * 0.15;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    starPts.push(
      new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r + s * 0.15, 0),
    );
  }
  group.add(makeLineLoop(starPts, color, 0.35));

  // Scanner ring (horizontal)
  const scannerRing = makeLineLoop(ringPoints(s * 0.9, 32), color, 0.25);
  scannerRing.rotation.x = Math.PI / 2;
  group.add(scannerRing);

  return group;
}

// ── 4. Deflector Array ──

function createDeflectorArray(
  s: number,
  seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Parabolic dish: 5 concentric rings
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const r = s * (0.15 + t * 0.85);
    const y = -s * t * t * 0.8;
    const segments = 24 + i * 4;
    const opacity = 0.5 - i * 0.06; // 0.5, 0.44, 0.38, 0.32, 0.26
    const ring = makeLineLoop(ringPoints(r, segments, y), color, opacity);
    group.add(ring);
  }

  // Radial spokes: 8 lines from origin to dish edge (outermost ring t=1)
  const edgeR = s * (0.15 + 1.0 * 0.85);
  const edgeY = -s * 1.0 * 0.8;
  for (let i = 0; i < 8; i++) {
    const theta = (i / 8) * Math.PI * 2;
    group.add(
      makeLine(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(
            Math.cos(theta) * edgeR,
            edgeY,
            Math.sin(theta) * edgeR,
          ),
        ],
        color,
        0.3,
      ),
    );
  }

  // Emitter spike
  group.add(
    makeLine(
      [new THREE.Vector3(0, s * 0.6, 0), new THREE.Vector3(0, -s * 0.8, 0)],
      color,
      0.6,
    ),
  );

  // Emitter glow
  const emitterGlow = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.12, 12, 8),
    glowMat(color, 0.25),
  );
  group.add(emitterGlow);

  // Rotate assembly by seed
  group.rotation.x = seed * 0.3;

  return group;
}

// ── 5. Warp Assembly ──

function createWarpAssembly(
  s: number,
  seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Twin nacelles
  for (const sign of [-1, 1]) {
    const nacelleGeo = new THREE.CylinderGeometry(
      s * 0.2,
      s * 0.25,
      s * 1.6,
      8,
    );
    const nacelleEdges = new THREE.EdgesGeometry(nacelleGeo);
    const nacelle = makeLineSegments(nacelleEdges, color, 0.6);
    nacelle.rotation.z = Math.PI / 2; // horizontal
    nacelle.position.x = sign * s * 0.8;
    group.add(nacelle);

    // Bussard caps at the front of each nacelle
    const capGeo = new THREE.SphereGeometry(
      s * 0.25,
      8,
      6,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    const capEdges = new THREE.EdgesGeometry(capGeo);
    const cap = makeLineSegments(capEdges, color, 0.4);
    cap.position.set(sign * s * 0.8, 0, s * 0.8);
    cap.rotation.x = -Math.PI / 2;
    group.add(cap);

    // Ring bands: 3 per nacelle
    for (let j = 0; j < 3; j++) {
      const ringBand = makeLineLoop(ringPoints(s * 0.28, 12), color, 0.3);
      ringBand.position.set(sign * s * 0.8, 0, (j - 1) * s * 0.5);
      group.add(ringBand);
    }

    // Pylons: 2 per nacelle (connecting center to nacelle endpoints)
    const halfLen = s * 0.8;
    group.add(
      makeLine(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(sign * s * 0.8, 0, halfLen),
        ],
        color,
        0.35,
      ),
    );
    group.add(
      makeLine(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(sign * s * 0.8, 0, -halfLen),
        ],
        color,
        0.35,
      ),
    );
  }

  // Central hull
  const hullEdges = new THREE.EdgesGeometry(
    new THREE.SphereGeometry(s * 0.3, 8, 6),
  );
  group.add(makeLineSegments(hullEdges, color, 0.5));

  // Rotate assembly
  group.rotation.y = seed * 0.4;

  return group;
}

// ── 6. Red Alert Beacon ──

function createRedAlertBeacon(
  s: number,
  seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Core octahedron
  const octEdges = new THREE.EdgesGeometry(
    new THREE.OctahedronGeometry(s * 0.6),
  );
  group.add(makeLineSegments(octEdges, color, 0.8));

  // Danger spikes: 6 lines from origin to +/- on each axis
  const axes: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const [ax, ay, az] of axes) {
    group.add(
      makeLine(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(ax * s * 1.1, ay * s * 1.1, az * s * 1.1),
        ],
        color,
        0.4,
      ),
    );
  }

  // Crosshairs at spike tips: perpendicular bars at s*0.9 on each axis
  const crossLen = s * 0.2;
  const tipDist = s * 0.9;
  // For each axis, draw 2 perpendicular bars
  // +X/-X: bars in Y and Z
  for (const sign of [-1, 1]) {
    // X-axis tips
    group.add(
      makeLine(
        [
          new THREE.Vector3(sign * tipDist, -crossLen / 2, 0),
          new THREE.Vector3(sign * tipDist, crossLen / 2, 0),
        ],
        color,
        0.4,
      ),
    );
    group.add(
      makeLine(
        [
          new THREE.Vector3(sign * tipDist, 0, -crossLen / 2),
          new THREE.Vector3(sign * tipDist, 0, crossLen / 2),
        ],
        color,
        0.4,
      ),
    );
    // Y-axis tips
    group.add(
      makeLine(
        [
          new THREE.Vector3(-crossLen / 2, sign * tipDist, 0),
          new THREE.Vector3(crossLen / 2, sign * tipDist, 0),
        ],
        color,
        0.4,
      ),
    );
    group.add(
      makeLine(
        [
          new THREE.Vector3(0, sign * tipDist, -crossLen / 2),
          new THREE.Vector3(0, sign * tipDist, crossLen / 2),
        ],
        color,
        0.4,
      ),
    );
    // Z-axis tips
    group.add(
      makeLine(
        [
          new THREE.Vector3(-crossLen / 2, 0, sign * tipDist),
          new THREE.Vector3(crossLen / 2, 0, sign * tipDist),
        ],
        color,
        0.4,
      ),
    );
    group.add(
      makeLine(
        [
          new THREE.Vector3(0, -crossLen / 2, sign * tipDist),
          new THREE.Vector3(0, crossLen / 2, sign * tipDist),
        ],
        color,
        0.4,
      ),
    );
  }

  // Warning rings
  const ringRadii = [s * 0.8, s * 0.95, s * 1.1];
  const ringOpacities = [0.35, 0.3, 0.25];
  for (let i = 0; i < 3; i++) {
    const ring = makeLineLoop(ringPoints(ringRadii[i], 24), color, ringOpacities[i]);
    ring.rotation.x = (Math.PI / 4) * i + seed * 0.2;
    ring.rotation.y = seed * 0.15 * i;
    group.add(ring);
  }

  // Core pulse glow
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.2, 12, 8),
    glowMat(color, 0.15),
  );
  group.add(core);

  return group;
}

// ── 7. Sensor Pod ──

function createSensorPod(
  s: number,
  seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Hull cylinder
  const cylEdges = new THREE.EdgesGeometry(
    new THREE.CylinderGeometry(s * 0.35, s * 0.35, s * 1.2, 8),
  );
  group.add(makeLineSegments(cylEdges, color, 0.6));

  // Top sensor dish: ring at y=s*0.8 plus spokes to peak
  const dishRing = makeLineLoop(ringPoints(s * 0.55, 16, s * 0.8), color, 0.35);
  group.add(dishRing);

  const peak = new THREE.Vector3(0, s * 1.0, 0);
  for (let i = 0; i < 8; i++) {
    const theta = (i / 8) * Math.PI * 2;
    const rimPt = new THREE.Vector3(
      Math.cos(theta) * s * 0.55,
      s * 0.8,
      Math.sin(theta) * s * 0.55,
    );
    group.add(makeLine([peak.clone(), rimPt], color, 0.35));
  }

  // Antenna arrays: 4 arms extending from hull on XZ plane
  for (let i = 0; i < 4; i++) {
    const theta = (i / 4) * Math.PI * 2 + seed * 0.3;
    const dx = Math.cos(theta);
    const dz = Math.sin(theta);
    const tipX = dx * s * 0.9;
    const tipZ = dz * s * 0.9;

    // Arm line from hull surface to tip
    group.add(
      makeLine(
        [
          new THREE.Vector3(dx * s * 0.35, 0, dz * s * 0.35),
          new THREE.Vector3(tipX, 0, tipZ),
        ],
        color,
        0.45,
      ),
    );

    // Cross-tips: perpendicular bar at the tip
    const perpX = -dz * s * 0.15;
    const perpZ = dx * s * 0.15;
    group.add(
      makeLine(
        [
          new THREE.Vector3(tipX + perpX, 0, tipZ + perpZ),
          new THREE.Vector3(tipX - perpX, 0, tipZ - perpZ),
        ],
        color,
        0.45,
      ),
    );
    // Vertical cross-tip
    group.add(
      makeLine(
        [
          new THREE.Vector3(tipX, -s * 0.15, tipZ),
          new THREE.Vector3(tipX, s * 0.15, tipZ),
        ],
        color,
        0.45,
      ),
    );
  }

  // Base mount cone
  const coneEdges = new THREE.EdgesGeometry(
    new THREE.ConeGeometry(s * 0.35, s * 0.4, 6),
  );
  const cone = makeLineSegments(coneEdges, color, 0.35);
  cone.position.y = -s * 0.8;
  group.add(cone);

  return group;
}

// ── 8. Containment Grid ──

function createContainmentGrid(
  s: number,
  seed: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group();

  // Outer shell: subdivision 1 for dense geodesic lattice
  const outerEdges = new THREE.EdgesGeometry(
    new THREE.IcosahedronGeometry(s * 1.0, 1),
  );
  group.add(makeLineSegments(outerEdges, color, 0.45));

  // Inner icosahedron (no subdivision)
  const innerEdges = new THREE.EdgesGeometry(
    new THREE.IcosahedronGeometry(s * 0.55, 0),
  );
  const innerIco = makeLineSegments(innerEdges, color, 0.6);
  innerIco.rotation.y = seed * 0.5;
  group.add(innerIco);

  // Enforcement bands: 3 rings
  const bandRadii = [s * 0.75, s * 0.9, s * 1.05];
  for (let i = 0; i < 3; i++) {
    const ring = makeLineLoop(ringPoints(bandRadii[i], 24), color, 0.3);
    ring.rotation.x = (Math.PI / 3) * i + seed * 0.15;
    group.add(ring);
  }

  // Polar struts: along Y and X axes
  group.add(
    makeLine(
      [new THREE.Vector3(0, -s * 1.2, 0), new THREE.Vector3(0, s * 1.2, 0)],
      color,
      0.25,
    ),
  );
  group.add(
    makeLine(
      [new THREE.Vector3(-s * 1.2, 0, 0), new THREE.Vector3(s * 1.2, 0, 0)],
      color,
      0.25,
    ),
  );

  // Core lockdown cross: 3 short segments along X, Y, Z
  const armLen = s * 0.3;
  group.add(
    makeLine(
      [new THREE.Vector3(-armLen, 0, 0), new THREE.Vector3(armLen, 0, 0)],
      color,
      0.7,
    ),
  );
  group.add(
    makeLine(
      [new THREE.Vector3(0, -armLen, 0), new THREE.Vector3(0, armLen, 0)],
      color,
      0.7,
    ),
  );
  group.add(
    makeLine(
      [new THREE.Vector3(0, 0, -armLen), new THREE.Vector3(0, 0, armLen)],
      color,
      0.7,
    ),
  );

  return group;
}

// ── Dispatch ──

const BUILDERS: Record<
  MeshframeType,
  (s: number, seed: number, color: number) => THREE.Group
> = {
  stationCore: createStationCore,
  subspaceAnomaly: createSubspaceAnomaly,
  deltaShield: createDeltaShield,
  deflectorArray: createDeflectorArray,
  warpAssembly: createWarpAssembly,
  redAlertBeacon: createRedAlertBeacon,
  sensorPod: createSensorPod,
  containmentGrid: createContainmentGrid,
};

/**
 * Create a meshframe group for a given entity type.
 * @param type - The meshframe type identifier
 * @param scale - Base scale (0.6 + connectionCount * 0.12)
 * @param seed - Pseudo-random seed for variety: (nodeIndex * 7.3 + 2.1) % 10
 * @param color - Hex color from MESHFRAME_COLORS
 */
export function createMeshframe(
  type: MeshframeType,
  scale: number,
  seed: number,
  color: number,
): THREE.Group {
  const builder = BUILDERS[type];
  return builder(scale, seed, color);
}
