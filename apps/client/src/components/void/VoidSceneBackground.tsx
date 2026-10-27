import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { VOID_LOCATIONS } from "./void-locations";

type QualityPreset = "high" | "medium" | "low";

interface VoidSceneBackgroundProps {
  activeLocationId: string;
  onNavigate: (route: string) => void;
  disabled?: boolean;
}

interface QualityConfig {
  stars: number;
  dust: number;
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  vignette: boolean;
  gridDivisions: number;
  pixelRatioCap: number;
}

const QUALITY_CONFIGS: Record<QualityPreset, QualityConfig> = {
  high: {
    stars: 3000,
    dust: 500,
    bloom: true,
    bloomStrength: 0.4,
    bloomRadius: 0.6,
    bloomThreshold: 0.85,
    vignette: true,
    gridDivisions: 100,
    pixelRatioCap: 2,
  },
  medium: {
    stars: 1500,
    dust: 280,
    bloom: true,
    bloomStrength: 0.25,
    bloomRadius: 0.5,
    bloomThreshold: 0.9,
    vignette: true,
    gridDivisions: 60,
    pixelRatioCap: 1.5,
  },
  low: {
    stars: 450,
    dust: 120,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
    vignette: false,
    gridDivisions: 30,
    pixelRatioCap: 1.25,
  },
};

interface BeaconRef {
  locationId: string;
  route: string;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  pulseRing: THREE.Mesh;
}

function isWebGL2Supported(): boolean {
  const canvas = document.createElement("canvas");
  return !!canvas.getContext("webgl2");
}

function createNoiseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.needsUpdate = true;
    return fallback;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createRadialGradient(
    canvas.width * 0.4,
    canvas.height * 0.45,
    30,
    canvas.width * 0.5,
    canvas.height * 0.55,
    canvas.width * 0.6,
  );
  gradient.addColorStop(0, "rgba(7, 162, 136, 0.45)");
  gradient.addColorStop(0.45, "rgba(91, 190, 78, 0.22)");
  gradient.addColorStop(1, "rgba(184, 229, 43, 0.04)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 15000; index += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const alpha = 0.02 + Math.random() * 0.04;
    const radius = 0.5 + Math.random() * 1.8;
    context.fillStyle = `rgba(200,220,210,${alpha.toFixed(4)})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

function createSoftParticleTexture(color = "#07A288"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.needsUpdate = true;
    return fallback;
  }

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, `${color}66`);
  gradient.addColorStop(0.35, `${color}33`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(64, 64, 64, 0, Math.PI * 2);
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

async function runQualityBenchmark(
  renderer: THREE.WebGLRenderer,
  viewportWidth: number,
  viewportHeight: number,
): Promise<QualityPreset> {
  const benchmarkScene = new THREE.Scene();
  const benchmarkCamera = new THREE.PerspectiveCamera(
    60,
    viewportWidth / Math.max(1, viewportHeight),
    0.1,
    100,
  );
  benchmarkCamera.position.z = 7;

  const geometry = new THREE.IcosahedronGeometry(0.85, 3);
  const material = new THREE.MeshBasicMaterial({
    color: 0x07a288,
    wireframe: true,
    transparent: true,
    opacity: 0.78,
  });

  const testMeshes: THREE.Mesh[] = [];
  for (let index = 0; index < 8; index += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    const offset = index - 3.5;
    mesh.position.set((offset % 4) * 1.6, Math.floor(offset / 4) * 1.6, 0);
    benchmarkScene.add(mesh);
    testMeshes.push(mesh);
  }

  const fps = await new Promise<number>((resolve) => {
    let frames = 0;
    const startedAt = performance.now();

    const tick = () => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - startedAt;
      for (const mesh of testMeshes) {
        mesh.rotation.x += 0.015;
        mesh.rotation.y += 0.022;
      }
      renderer.render(benchmarkScene, benchmarkCamera);
      if (elapsed < 1000) {
        requestAnimationFrame(tick);
        return;
      }
      resolve((frames * 1000) / Math.max(1, elapsed));
    };

    requestAnimationFrame(tick);
  });

  geometry.dispose();
  material.dispose();
  benchmarkScene.clear();

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (deviceMemory <= 2 || fps < 34) return "low";
  if (deviceMemory <= 4 || fps < 52) return "medium";
  return "high";
}

function getCameraOffset(locationId: string): THREE.Vector3 {
  switch (locationId) {
    case "observatory":
      return new THREE.Vector3(0, 52, 138);
    case "pulse-array":
      return new THREE.Vector3(0, 22, 130);
    case "workbench":
      return new THREE.Vector3(45, 26, 125);
    case "cartographer":
      return new THREE.Vector3(-45, 30, 125);
    case "brain-relay":
      return new THREE.Vector3(28, 45, 120);
    case "constellation":
    default:
      return new THREE.Vector3(0, 30, 145);
  }
}

export function VoidSceneBackground({
  activeLocationId,
  onNavigate,
  disabled = false,
}: VoidSceneBackgroundProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const activeLocationRef = useRef(activeLocationId);
  const navigateRef = useRef(onNavigate);
  const [fallbackTo2D, setFallbackTo2D] = useState(false);

  useEffect(() => {
    activeLocationRef.current = activeLocationId;
  }, [activeLocationId]);

  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    if (!hostRef.current) return;
    if (disabled) {
      setFallbackTo2D(true);
      return;
    }
    setFallbackTo2D(false);
    if (!isWebGL2Supported()) {
      setFallbackTo2D(true);
      return;
    }

    const container = hostRef.current;
    let disposed = false;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0B1014");
    scene.fog = new THREE.FogExp2("#0B1014", 0.0009);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    camera.position.set(0, 30, 145);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#0B1014");
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.minDistance = 25;
    controls.maxDistance = 460;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.03;
    controls.target.set(0, 0, 0);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const textureDisposables: THREE.Texture[] = [];
    const materialDisposables: THREE.Material[] = [];
    const geometryDisposables: THREE.BufferGeometry[] = [];
    const beacons: BeaconRef[] = [];
    let deepField: THREE.Mesh | null = null;
    let stars: THREE.Points | null = null;
    let dust: THREE.Points | null = null;
    let grid: THREE.GridHelper | null = null;
    let starMaterial: THREE.ShaderMaterial | null = null;
    let dustVelocity = new Float32Array();
    let qualityPreset: QualityPreset = "medium";
    let keyLight: THREE.DirectionalLight | null = null;
    let lastInteractionAt = performance.now();
    let pendingHoverLocation: string | null = null;

    let lastAppliedLocation = "";
    let tweening = false;
    const tweenFromPosition = new THREE.Vector3();
    const tweenFromTarget = new THREE.Vector3();
    const tweenToPosition = new THREE.Vector3();
    const tweenToTarget = new THREE.Vector3();
    let tweenStartedAt = 0;
    const tweenDurationMs = 800;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownX = 0;
    let pointerDownY = 0;

    const onInteraction = () => {
      lastInteractionAt = performance.now();
      controls.autoRotate = false;
    };

    const updateSize = () => {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      composer.setSize(width, height);
    };

    const startCameraTween = (locationId: string) => {
      const location = VOID_LOCATIONS.find((entry) => entry.id === locationId);
      if (!location) return;

      tweenFromPosition.copy(camera.position);
      tweenFromTarget.copy(controls.target);

      tweenToTarget.set(
        location.coordinates.x,
        location.coordinates.y,
        location.coordinates.z,
      );
      tweenToPosition.copy(tweenToTarget).add(getCameraOffset(locationId));

      tweenStartedAt = performance.now();
      tweening = true;
    };

    const setBeaconVisuals = (locationId: string) => {
      for (const beacon of beacons) {
        const isActive = beacon.locationId === locationId;
        const activeScale = isActive ? 1.35 : 1;
        beacon.group.scale.lerp(
          new THREE.Vector3(activeScale, activeScale, activeScale),
          0.18,
        );
        (beacon.core.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.95 : 0.55;
        (beacon.ring.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.82 : 0.35;
        (beacon.pulseRing.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.52 : 0.16;
      }
    };

    const createBeacon = (location: (typeof VOID_LOCATIONS)[number], index: number) => {
      const group = new THREE.Group();
      group.position.set(location.coordinates.x, location.coordinates.y, location.coordinates.z);
      group.name = `void-beacon-${location.id}`;

      const baseColor = new THREE.Color("#07A288").lerp(
        new THREE.Color("#B8E52B"),
        index / Math.max(1, VOID_LOCATIONS.length - 1),
      );

      const coreGeometry = new THREE.IcosahedronGeometry(6, 0);
      geometryDisposables.push(coreGeometry);
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: baseColor,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      });
      materialDisposables.push(coreMaterial);
      const core = new THREE.Mesh(coreGeometry, coreMaterial);

      const ringGeometry = new THREE.TorusGeometry(10, 0.36, 8, 40);
      geometryDisposables.push(ringGeometry);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: baseColor,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      });
      materialDisposables.push(ringMaterial);
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI * 0.5;

      const pulseGeometry = new THREE.TorusGeometry(12.5, 0.2, 6, 32);
      geometryDisposables.push(pulseGeometry);
      const pulseMaterial = new THREE.MeshBasicMaterial({
        color: baseColor,
        wireframe: true,
        transparent: true,
        opacity: 0.18,
      });
      materialDisposables.push(pulseMaterial);
      const pulseRing = new THREE.Mesh(pulseGeometry, pulseMaterial);
      pulseRing.rotation.x = Math.PI * 0.5;

      const hitGeometry = new THREE.SphereGeometry(14, 12, 12);
      geometryDisposables.push(hitGeometry);
      const hitMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      materialDisposables.push(hitMaterial);
      const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);

      group.add(core, ring, pulseRing, hitMesh);
      scene.add(group);
      beacons.push({
        locationId: location.id,
        route: location.route,
        group,
        hitMesh,
        core,
        ring,
        pulseRing,
      });
    };

    const buildEnvironment = (config: QualityConfig) => {
      const deepTexture = createNoiseTexture();
      textureDisposables.push(deepTexture);

      const deepFieldGeometry = new THREE.SphereGeometry(2600, 64, 64);
      geometryDisposables.push(deepFieldGeometry);
      const deepFieldMaterial = new THREE.MeshBasicMaterial({
        map: deepTexture,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.42,
      });
      materialDisposables.push(deepFieldMaterial);
      deepField = new THREE.Mesh(deepFieldGeometry, deepFieldMaterial);
      scene.add(deepField);

      const starGeometry = new THREE.BufferGeometry();
      const starPositions = new Float32Array(config.stars * 3);
      const starBrightness = new Float32Array(config.stars);
      const starFrequency = new Float32Array(config.stars);
      const starPhase = new Float32Array(config.stars);
      const starSize = new Float32Array(config.stars);

      for (let index = 0; index < config.stars; index += 1) {
        const theta = Math.acos(2 * Math.random() - 1);
        const phi = Math.random() * Math.PI * 2;
        const radius = 500 + Math.random() * 1500;
        const base = index * 3;

        starPositions[base] = radius * Math.sin(theta) * Math.cos(phi);
        starPositions[base + 1] = radius * Math.sin(theta) * Math.sin(phi);
        starPositions[base + 2] = radius * Math.cos(theta);
        starBrightness[index] = 0.3 + Math.random() * 0.7;
        starFrequency[index] = 0.8 + Math.random() * 2.4;
        starPhase[index] = Math.random() * Math.PI * 2;
        starSize[index] = 1.2 + Math.random() * 2.8;
      }

      starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      starGeometry.setAttribute("aBrightness", new THREE.BufferAttribute(starBrightness, 1));
      starGeometry.setAttribute("aFreq", new THREE.BufferAttribute(starFrequency, 1));
      starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(starPhase, 1));
      starGeometry.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));
      geometryDisposables.push(starGeometry);

      starMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0.95 },
        },
        vertexShader: `
          attribute float aBrightness;
          attribute float aFreq;
          attribute float aPhase;
          attribute float aSize;
          varying float vBrightness;
          varying float vFreq;
          varying float vPhase;
          void main() {
            vBrightness = aBrightness;
            vFreq = aFreq;
            vPhase = aPhase;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = aSize * (360.0 / max(1.0, -mvPosition.z));
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uOpacity;
          varying float vBrightness;
          varying float vFreq;
          varying float vPhase;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            float circle = smoothstep(0.5, 0.0, d);
            float twinkle = 0.55 + 0.45 * sin(uTime * vFreq + vPhase);
            float alpha = circle * vBrightness * twinkle * uOpacity;
            vec3 color = mix(vec3(0.56, 0.76, 1.0), vec3(0.95, 0.98, 1.0), vBrightness);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materialDisposables.push(starMaterial);
      stars = new THREE.Points(starGeometry, starMaterial);
      scene.add(stars);

      const dustGeometry = new THREE.BufferGeometry();
      const dustPositions = new Float32Array(config.dust * 3);
      const dustSizes = new Float32Array(config.dust);
      dustVelocity = new Float32Array(config.dust * 3);
      for (let index = 0; index < config.dust; index += 1) {
        const base = index * 3;
        dustPositions[base] = -100 + Math.random() * 200;
        dustPositions[base + 1] = -95 + Math.random() * 190;
        dustPositions[base + 2] = -100 + Math.random() * 200;
        dustVelocity[base] = (-0.5 + Math.random()) * 0.02;
        dustVelocity[base + 1] = (-0.5 + Math.random()) * 0.015;
        dustVelocity[base + 2] = (-0.5 + Math.random()) * 0.02;
        dustSizes[index] = 8 + Math.random() * 16;
      }
      dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
      dustGeometry.setAttribute("size", new THREE.BufferAttribute(dustSizes, 1));
      geometryDisposables.push(dustGeometry);

      const dustTexture = createSoftParticleTexture("#07A288");
      textureDisposables.push(dustTexture);
      const dustMaterial = new THREE.PointsMaterial({
        map: dustTexture,
        transparent: true,
        opacity: 0.08,
        size: 1.3,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      materialDisposables.push(dustMaterial);
      dust = new THREE.Points(dustGeometry, dustMaterial);
      scene.add(dust);

      grid = new THREE.GridHelper(200, config.gridDivisions, "#243645", "#243645");
      const gridMaterial = grid.material as THREE.Material | THREE.Material[];
      if (Array.isArray(gridMaterial)) {
        for (const material of gridMaterial) {
          material.transparent = true;
          material.opacity = 0.15;
          material.depthWrite = false;
          material.blending = THREE.AdditiveBlending;
          materialDisposables.push(material);
        }
      } else {
        gridMaterial.transparent = true;
        gridMaterial.opacity = 0.15;
        gridMaterial.depthWrite = false;
        gridMaterial.blending = THREE.AdditiveBlending;
        materialDisposables.push(gridMaterial);
      }
      geometryDisposables.push(grid.geometry as THREE.BufferGeometry);
      grid.position.y = -50;
      scene.add(grid);

      const key = new THREE.DirectionalLight("#E7EEF6", 0.8);
      key.position.set(50, 80, 50);
      const fill = new THREE.DirectionalLight("#07A288", 0.3);
      fill.position.set(-30, 40, -20);
      const rim = new THREE.DirectionalLight("#B8E52B", 0.15);
      rim.position.set(0, -20, -60);
      const ambient = new THREE.AmbientLight("#16212B", 0.4);

      scene.add(key, fill, rim, ambient);
      keyLight = key;
    };

    const setupPointerHandlers = () => {
      const toPointer = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const pickBeacon = (event: MouseEvent): BeaconRef | null => {
        toPointer(event);
        raycaster.setFromCamera(pointer, camera);
        const intersections = raycaster.intersectObjects(
          beacons.map((beacon) => beacon.hitMesh),
          false,
        );
        if (intersections.length === 0) return null;
        const hit = intersections[0]?.object;
        return beacons.find((beacon) => beacon.hitMesh.uuid === hit.uuid) ?? null;
      };

      const onMouseDown = (event: MouseEvent) => {
        pointerDownX = event.clientX;
        pointerDownY = event.clientY;
        onInteraction();
      };

      const onMouseMove = (event: MouseEvent) => {
        onInteraction();
        const beacon = pickBeacon(event);
        const nextHover = beacon?.locationId ?? null;
        if (nextHover !== pendingHoverLocation) {
          pendingHoverLocation = nextHover;
          renderer.domElement.style.cursor = beacon ? "pointer" : "grab";
        }
      };

      const onMouseUp = (event: MouseEvent) => {
        onInteraction();
        const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
        if (moved > 6) return;
        const beacon = pickBeacon(event);
        if (!beacon) return;
        navigateRef.current(beacon.route);
      };

      renderer.domElement.addEventListener("mousedown", onMouseDown);
      renderer.domElement.addEventListener("mousemove", onMouseMove);
      renderer.domElement.addEventListener("mouseup", onMouseUp);
      window.addEventListener("wheel", onInteraction, { passive: true });
      window.addEventListener("keydown", onInteraction);

      return () => {
        renderer.domElement.removeEventListener("mousedown", onMouseDown);
        renderer.domElement.removeEventListener("mousemove", onMouseMove);
        renderer.domElement.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("wheel", onInteraction);
        window.removeEventListener("keydown", onInteraction);
      };
    };

    let detachPointerHandlers: (() => void) | null = null;

    const boot = async () => {
      updateSize();
      try {
        qualityPreset = await runQualityBenchmark(
          renderer,
          container.clientWidth || window.innerWidth,
          container.clientHeight || window.innerHeight,
        );
      } catch {
        qualityPreset = "medium";
      }
      if (disposed) return;

      const config = QUALITY_CONFIGS[qualityPreset];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.pixelRatioCap));
      updateSize();

      buildEnvironment(config);
      for (const [index, location] of VOID_LOCATIONS.entries()) {
        createBeacon(location, index);
      }
      setBeaconVisuals(activeLocationRef.current);
      startCameraTween(activeLocationRef.current);

      if (config.bloom) {
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(container.clientWidth, container.clientHeight),
          config.bloomStrength,
          config.bloomRadius,
          config.bloomThreshold,
        );
        composer.addPass(bloom);
      }

      if (config.vignette) {
        const vignette = new ShaderPass(VignetteShader);
        vignette.uniforms.offset.value = 1.1;
        vignette.uniforms.darkness.value = 1.12;
        composer.addPass(vignette);
      }

      detachPointerHandlers = setupPointerHandlers();
      renderer.domElement.style.cursor = "grab";

      const clock = new THREE.Clock();
      const animate = () => {
        if (disposed) return;
        frameId = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        const elapsed = clock.getElapsedTime();
        const now = performance.now();

        if (deepField) {
          deepField.rotation.y += 0.0001 * (dt * 60);
        }
        if (starMaterial) {
          starMaterial.uniforms.uTime.value = elapsed;
        }
        if (dust) {
          const positions = dust.geometry.attributes.position as THREE.BufferAttribute;
          for (let index = 0; index < positions.count; index += 1) {
            const base = index * 3;
            let x = positions.array[base] + dustVelocity[base] * (dt * 60);
            let y = positions.array[base + 1] + dustVelocity[base + 1] * (dt * 60);
            let z = positions.array[base + 2] + dustVelocity[base + 2] * (dt * 60);
            if (x > 100) x = -100;
            if (x < -100) x = 100;
            if (y > 95) y = -95;
            if (y < -95) y = 95;
            if (z > 100) z = -100;
            if (z < -100) z = 100;
            positions.array[base] = x;
            positions.array[base + 1] = y;
            positions.array[base + 2] = z;
          }
          positions.needsUpdate = true;
        }
        if (keyLight) {
          keyLight.position.x = 50 + Math.sin(elapsed * (Math.PI / 60)) * 5;
        }

        for (const [index, beacon] of beacons.entries()) {
          const spin = 0.001 + index * 0.00015;
          beacon.core.rotation.y += spin;
          beacon.ring.rotation.z += spin * 0.75;
          const pulse = 1 + Math.sin(elapsed * 1.4 + index) * 0.07;
          beacon.pulseRing.scale.setScalar(pulse);
        }

        const nextLocation = activeLocationRef.current;
        if (lastAppliedLocation !== nextLocation) {
          lastAppliedLocation = nextLocation;
          setBeaconVisuals(nextLocation);
          startCameraTween(nextLocation);
        }

        if (tweening) {
          const t = Math.min(1, (now - tweenStartedAt) / tweenDurationMs);
          const eased = 1 - Math.pow(1 - t, 3);
          camera.position.lerpVectors(tweenFromPosition, tweenToPosition, eased);
          controls.target.lerpVectors(tweenFromTarget, tweenToTarget, eased);
          if (t >= 1) tweening = false;
        }

        controls.autoRotate = now - lastInteractionAt > 30000;
        controls.update();
        composer.render();
      };

      animate();
    };

    boot();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", updateSize);
    }

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      detachPointerHandlers?.();
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", updateSize);
      }
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      for (const geometry of geometryDisposables) geometry.dispose();
      for (const material of materialDisposables) material.dispose();
      for (const texture of textureDisposables) texture.dispose();
      scene.clear();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [disabled]);

  if (fallbackTo2D) {
    return (
      <div className="void-scene-fallback" aria-hidden>
        <div className="void-scene-fallback__constellation" />
      </div>
    );
  }

  return <div ref={hostRef} className="void-scene-canvas" aria-hidden />;
}
