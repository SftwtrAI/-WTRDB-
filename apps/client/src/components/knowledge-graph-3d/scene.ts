/**
 * 3D Knowledge Graph — Scene, Renderer, Camera, Lighting, Post-Processing & Environment.
 *
 * Creates and manages the entire Three.js scene infrastructure including:
 * - WebGL 2.0 renderer with ACES Filmic tone mapping
 * - PerspectiveCamera with OrbitControls (damping + auto-rotate)
 * - Three-point lighting rig with animated key light drift
 * - UnrealBloomPass post-processing via EffectComposer
 * - Holographic wireframe ground plane
 * - Nebula particle field (spherical shell of 2 500 points)
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { COLORS } from "./types";

// ── Exported interface ─────────────────────────────────────────────────────────

export interface SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  controls: OrbitControls;
  clock: THREE.Clock;

  // Groups for organizing objects
  nodesGroup: THREE.Group;
  edgesGroup: THREE.Group;
  labelsGroup: THREE.Group;
  pulsesGroup: THREE.Group;

  // Methods
  init(container: HTMLDivElement): void;
  resize(): void;
  animate(onTick: (t: number, dt: number) => void): void;
  dispose(): void;

  // Config updates
  setAutoRotate(enabled: boolean, speed?: number): void;
  setBloom(strength: number, radius: number, threshold: number): void;
  setGridVisible(visible: boolean): void;
  setNebulaVisible(visible: boolean): void;
}

// ── Nebula palette ─────────────────────────────────────────────────────────────

const NEBULA_PALETTE = [0x07a288, 0x5bbe4e, 0x0a84ff, 0xbf5af2, 0x0b1014];

// ── Factory ────────────────────────────────────────────────────────────────────

export function createSceneManager(): SceneManager {
  // These are initialised lazily inside `init()` — we declare them here so
  // every method in the returned object can close over them.
  let renderer: THREE.WebGLRenderer;
  let composer: EffectComposer;
  let bloomPass: UnrealBloomPass;
  let controls: OrbitControls;
  let animationFrameId: number | null = null;

  // Refs to environment objects so we can toggle visibility
  let gridMesh: THREE.Mesh | null = null;
  let nebulaPoints: THREE.Points | null = null;

  // Lighting — stored so the animation loop can drift the key light
  let keyLight: THREE.PointLight;

  // Core objects created immediately (no DOM dependency)
  const clock = new THREE.Clock();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.void);
  scene.fog = new THREE.FogExp2(COLORS.void, 0.012);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(26, 16, 26);
  camera.lookAt(0, 0, 0);

  // Scene-graph groups
  const nodesGroup = new THREE.Group();
  nodesGroup.name = "nodes";
  const edgesGroup = new THREE.Group();
  edgesGroup.name = "edges";
  const labelsGroup = new THREE.Group();
  labelsGroup.name = "labels";
  const pulsesGroup = new THREE.Group();
  pulsesGroup.name = "pulses";

  scene.add(nodesGroup, edgesGroup, labelsGroup, pulsesGroup);

  // ── Lighting rig ───────────────────────────────────────────────────────────

  const ambientLight = new THREE.AmbientLight(0x101025, 0.3);
  scene.add(ambientLight);

  keyLight = new THREE.PointLight(0x07a288, 1.5, 60);
  keyLight.position.set(18, 22, 18);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0xbf5af2, 1.0, 50);
  fillLight.position.set(-18, -12, -18);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff4f79, 0.5, 40);
  rimLight.position.set(0, -20, 12);
  scene.add(rimLight);

  // ── Environment helpers ────────────────────────────────────────────────────

  function createGrid(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(80, 80, 40, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.gridLine,
      wireframe: true,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -14;
    mesh.name = "holographic-grid";
    return mesh;
  }

  function createNebula(): THREE.Points {
    const count = 2500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // Uniform distribution in a spherical shell (radius 20–60)
      const r = 20 + Math.random() * 40;
      const theta = Math.acos(2 * Math.random() - 1); // polar
      const phi = Math.random() * Math.PI * 2; // azimuthal

      const idx = i * 3;
      positions[idx] = r * Math.sin(theta) * Math.cos(phi);
      positions[idx + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[idx + 2] = r * Math.cos(theta);

      // Random colour from the palette
      tmpColor.set(NEBULA_PALETTE[Math.floor(Math.random() * NEBULA_PALETTE.length)]);
      colors[idx] = tmpColor.r;
      colors[idx + 1] = tmpColor.g;
      colors[idx + 2] = tmpColor.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    points.name = "nebula-particles";
    return points;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const manager: SceneManager = {
    // Expose core objects (getters forward to locals that may be reassigned)
    get scene() {
      return scene;
    },
    get camera() {
      return camera;
    },
    get renderer() {
      return renderer;
    },
    get composer() {
      return composer;
    },
    get controls() {
      return controls;
    },
    get clock() {
      return clock;
    },

    get nodesGroup() {
      return nodesGroup;
    },
    get edgesGroup() {
      return edgesGroup;
    },
    get labelsGroup() {
      return labelsGroup;
    },
    get pulsesGroup() {
      return pulsesGroup;
    },

    // ── init ───────────────────────────────────────────────────────────────

    init(container: HTMLDivElement) {
      const { clientWidth: w, clientHeight: h } = container;

      // Renderer
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      container.appendChild(renderer.domElement);

      // Camera aspect
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // OrbitControls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.03;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.15;
      controls.minDistance = 10;
      controls.maxDistance = 100;
      controls.enablePan = true;

      // Post-processing
      composer = new EffectComposer(renderer);

      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        1.3, // strength
        0.5, // radius
        0.2, // threshold
      );
      composer.addPass(bloomPass);

      // OutputPass ensures tone mapping + color space conversion are applied
      // when rendering through the EffectComposer pipeline.
      const outputPass = new OutputPass();
      composer.addPass(outputPass);

      // Environment
      gridMesh = createGrid();
      scene.add(gridMesh);

      nebulaPoints = createNebula();
      scene.add(nebulaPoints);
    },

    // ── resize ─────────────────────────────────────────────────────────────

    resize() {
      if (!renderer) return;
      const parent = renderer.domElement.parentElement;
      if (!parent) return;

      const { clientWidth: w, clientHeight: h } = parent;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    // ── animate ────────────────────────────────────────────────────────────

    animate(onTick: (t: number, dt: number) => void) {
      const loop = () => {
        animationFrameId = requestAnimationFrame(loop);

        const dt = clock.getDelta();
        const t = clock.getElapsedTime();

        // Update OrbitControls (required when damping is enabled)
        controls.update();

        // Key light drift
        keyLight.position.x = 18 + Math.sin(t * 0.4) * 5;

        // External tick callback (physics, label updates, etc.)
        onTick(t, dt);

        // Render through the post-processing pipeline
        composer.render();
      };

      clock.start();
      loop();
    },

    // ── dispose ────────────────────────────────────────────────────────────

    dispose() {
      // Stop the render loop
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      // Dispose controls
      controls?.dispose();

      // Recursively dispose geometries, materials, and textures
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of materials) {
            if (!mat) continue;
            // Dispose any textures attached to the material
            for (const key of Object.keys(mat)) {
              const value = (mat as Record<string, unknown>)[key];
              if (value instanceof THREE.Texture) {
                value.dispose();
              }
            }
            mat.dispose();
          }
        }
      });

      // Dispose post-processing
      composer?.dispose();

      // Dispose renderer and remove DOM element
      if (renderer) {
        renderer.dispose();
        renderer.domElement.parentElement?.removeChild(renderer.domElement);
      }
    },

    // ── Config setters ─────────────────────────────────────────────────────

    setAutoRotate(enabled: boolean, speed?: number) {
      if (!controls) return;
      controls.autoRotate = enabled;
      if (speed !== undefined) {
        controls.autoRotateSpeed = speed;
      }
    },

    setBloom(strength: number, radius: number, threshold: number) {
      if (!bloomPass) return;
      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;
    },

    setGridVisible(visible: boolean) {
      if (gridMesh) gridMesh.visible = visible;
    },

    setNebulaVisible(visible: boolean) {
      if (nebulaPoints) nebulaPoints.visible = visible;
    },
  };

  return manager;
}
