import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as THREE from "three";
import {
  ArrowLeft,
  Brain,
  Plus,
  Loader2,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppView } from "@/contexts/app-view-context";
import type {
  MetaGraphRow,
} from "@/components/utilities/MetaGraphsSection";
import { createSceneManager, type SceneManager } from "@/components/knowledge-graph-3d/scene";
import { createMeshframe } from "@/components/knowledge-graph-3d/meshframes";
import { createEdgeManager, type EdgeManager } from "@/components/knowledge-graph-3d/edges";
import { createLabelManager, type LabelManager } from "@/components/knowledge-graph-3d/labels";
import { COLORS, type MeshframeType } from "@/components/knowledge-graph-3d/types";

interface ProceduralNode {
  id: string;
  name: string;
  slotId: string | null;
  description: string | null;
  properties: Record<string, string>;
}

interface ProceduralEdge {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  description: string | null;
}

interface ProceduralResponse {
  nodes: ProceduralNode[];
  edges: ProceduralEdge[];
}

const SLOT_RING = 11; // radius of the circle the slots sit on
const SLOT_SCALE = 1.6; // meshframe scale for slots (large)
const PROC_SCALE = 0.55; // meshframe scale for procedural nodes
const PROC_OFFSET = 4.0; // distance from slot center to procedural cluster
const PROC_RING = 1.6; // radius of the procedural cluster ring around each slot

const SLOT_MESHFRAMES: MeshframeType[] = [
  "stationCore",
  "warpAssembly",
  "deltaShield",
  "deflectorArray",
  "sensorPod",
  "subspaceAnomaly",
  "redAlertBeacon",
  "containmentGrid",
];

const PROC_MESHFRAMES: MeshframeType[] = [
  "deflectorArray",
  "sensorPod",
  "warpAssembly",
  "stationCore",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorHexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function meshframeForSlot(slotIndex: number): MeshframeType {
  return SLOT_MESHFRAMES[slotIndex % SLOT_MESHFRAMES.length];
}

function meshframeForProcedural(seed: number): MeshframeType {
  return PROC_MESHFRAMES[seed % PROC_MESHFRAMES.length];
}

interface RenderState {
  slotPositions: Map<string, THREE.Vector3>;
  slotColors: Map<string, number>;
  procPositions: Map<string, THREE.Vector3>;
  // For cleanup
  slotMeshframes: THREE.Group[];
  procMeshframes: THREE.Group[];
  patternLines: THREE.Line[];
  procEdges: THREE.Line[];
  pulses: Array<{
    pulse: THREE.Mesh;
    trail: THREE.Mesh | null;
    curve: THREE.QuadraticBezierCurve3;
    speed: number;
    t: number;
  }>;
  labels: THREE.Sprite[];
  labelMeta: Array<{
    sprite: THREE.Sprite;
    position: THREE.Vector3;
    scale: number;
    index: number;
  }>;
}

function emptyRenderState(): RenderState {
  return {
    slotPositions: new Map(),
    slotColors: new Map(),
    procPositions: new Map(),
    slotMeshframes: [],
    procMeshframes: [],
    patternLines: [],
    procEdges: [],
    pulses: [],
    labels: [],
    labelMeta: [],
  };
}

export function MetaGraph3D() {
  const { viewId, goHome } = useAppView();
  const metaGraphId = viewId;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const edgeManagerRef = useRef<EdgeManager | null>(null);
  const labelManagerRef = useRef<LabelManager | null>(null);
  const renderStateRef = useRef<RenderState>(emptyRenderState());
  const showProceduralRef = useRef(true);

  const [showProcedural, setShowProcedural] = useState(true);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeSlotId, setNewNodeSlotId] = useState<string>("");
  const [newNodeDescription, setNewNodeDescription] = useState("");

  const { data: metaData } = useQuery<{ metaGraph: MetaGraphRow }>({
    queryKey: ["/api/meta-graphs", metaGraphId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/meta-graphs/${metaGraphId}`);
      return res.json();
    },
    enabled: !!metaGraphId,
  });

  const { data: proceduralData } = useQuery<ProceduralResponse>({
    queryKey: ["/api/meta-graphs", metaGraphId, "procedural"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/meta-graphs/${metaGraphId}/procedural`);
      return res.json();
    },
    enabled: !!metaGraphId,
  });

  const meta = metaData?.metaGraph;
  const procedural = proceduralData ?? { nodes: [], edges: [] };

  const addNodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/meta-graphs/${metaGraphId}/procedural/nodes`,
        {
          name: newNodeName.trim(),
          slotId: newNodeSlotId || null,
          description: newNodeDescription.trim() || undefined,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/meta-graphs", metaGraphId, "procedural"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/meta-graphs", metaGraphId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meta-graphs"] });
      setShowAddNode(false);
      setNewNodeName("");
      setNewNodeDescription("");
    },
  });

  // ── Scene initialization (mount once) ────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sceneManager = createSceneManager();
    sceneManager.init(container);

    // Park camera further back so the meta-graph composition reads cleanly
    sceneManager.camera.position.set(0, 14, 28);
    sceneManager.camera.lookAt(0, 0, 0);
    sceneManager.controls.autoRotateSpeed = 0.12;
    sceneManager.setBloom(1.4, 0.55, 0.18);

    const edgeManager = createEdgeManager();
    const labelManager = createLabelManager();

    sceneManagerRef.current = sceneManager;
    edgeManagerRef.current = edgeManager;
    labelManagerRef.current = labelManager;

    // Animation loop — labels breathe + pulses ride the curves
    sceneManager.animate((t) => {
      const state = renderStateRef.current;
      const lm = labelManagerRef.current;
      if (lm) {
        for (const m of state.labelMeta) {
          lm.updateLabel(m.sprite, m.position, m.scale, t, m.index);
        }
      }
      for (const p of state.pulses) {
        p.t += p.speed;
        if (p.t > 1) p.t -= 1;
        edgeManager.updatePulse(p.pulse, p.trail, p.curve, p.t, t);
      }
    });

    const handleResize = () => sceneManager.resize();
    window.addEventListener("resize", handleResize);

    // Hover detection via raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMove = (event: MouseEvent) => {
      const renderer = sceneManager.renderer;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, sceneManager.camera);

      // Test against slot/procedural meshframe groups
      const objects: THREE.Object3D[] = [];
      sceneManager.nodesGroup.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData?.metaName) objects.push(o);
      });
      const hits = raycaster.intersectObjects(objects);
      if (hits.length > 0) {
        // Walk up to find the carrier with metaName
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.metaName) obj = obj.parent;
        setHoveredName(obj?.userData?.metaName ?? null);
      } else {
        setHoveredName(null);
      }
    };
    sceneManager.renderer.domElement.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("resize", handleResize);
      sceneManager.renderer.domElement.removeEventListener("mousemove", onMove);
      labelManager.dispose();
      edgeManager.dispose();
      sceneManager.dispose();
      sceneManagerRef.current = null;
      edgeManagerRef.current = null;
      labelManagerRef.current = null;
      renderStateRef.current = emptyRenderState();
    };
  }, []);

  // ── Build / rebuild scene contents whenever data changes ────────────────
  useEffect(() => {
    const sceneManager = sceneManagerRef.current;
    const edgeManager = edgeManagerRef.current;
    const labelManager = labelManagerRef.current;
    if (!sceneManager || !edgeManager || !labelManager || !meta) return;

    // ── Tear down previous content ──
    const prev = renderStateRef.current;
    for (const g of prev.slotMeshframes) sceneManager.nodesGroup.remove(g);
    for (const g of prev.procMeshframes) sceneManager.nodesGroup.remove(g);
    for (const l of prev.patternLines) sceneManager.edgesGroup.remove(l);
    for (const l of prev.procEdges) sceneManager.edgesGroup.remove(l);
    for (const p of prev.pulses) {
      sceneManager.pulsesGroup.remove(p.pulse);
      if (p.trail) sceneManager.pulsesGroup.remove(p.trail);
    }
    for (const s of prev.labels) sceneManager.labelsGroup.remove(s);
    labelManager.dispose();
    edgeManager.dispose();

    const state = emptyRenderState();
    renderStateRef.current = state;

    // ── Slots: meshframes laid out in a circle ──
    const slots = meta.slots ?? [];
    const slotCount = Math.max(1, slots.length);

    let labelIdx = 0;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const angle = (i / slotCount) * Math.PI * 2;
      const position = new THREE.Vector3(
        Math.cos(angle) * SLOT_RING,
        0,
        Math.sin(angle) * SLOT_RING,
      );
      state.slotPositions.set(slot.id, position.clone());

      const color = slot.colorHint
        ? colorHexToInt(slot.colorHint)
        : COLORS.stationCore;
      state.slotColors.set(slot.id, color);

      const meshframeType = meshframeForSlot(i);
      const seed = hashString(slot.id);
      const group = createMeshframe(meshframeType, SLOT_SCALE, seed, color);
      group.position.copy(position);
      group.userData.metaName = slot.name;
      // Tag descendant meshes so the raycaster can hit them
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.userData.metaName = slot.name;
      });
      sceneManager.nodesGroup.add(group);
      state.slotMeshframes.push(group);

      // Label
      const sprite = labelManager.createLabel(slot.name, color, labelIdx);
      sceneManager.labelsGroup.add(sprite);
      state.labels.push(sprite);
      state.labelMeta.push({
        sprite,
        position: position.clone(),
        scale: SLOT_SCALE,
        index: labelIdx,
      });
      labelIdx++;
    }

    // ── Pattern edges between slots: thick curves with pulses ──
    const pattern = meta.pattern ?? [];
    let edgeIndex = 0;
    for (const edge of pattern) {
      const from = state.slotPositions.get(edge.fromSlotId);
      const to = state.slotPositions.get(edge.toSlotId);
      if (!from || !to) continue;
      const sourceColor =
        state.slotColors.get(edge.fromSlotId) ?? COLORS.stationCore;
      const result = edgeManager.createEdge(
        from,
        to,
        edge.relType,
        sourceColor,
        edgeIndex++,
      );
      sceneManager.edgesGroup.add(result.line);
      state.patternLines.push(result.line);
      if (result.pulse && result.hasPulse) {
        sceneManager.pulsesGroup.add(result.pulse);
        if (result.trail) sceneManager.pulsesGroup.add(result.trail);
        state.pulses.push({
          pulse: result.pulse,
          trail: result.trail,
          curve: result.curve,
          speed: result.pulseSpeed,
          t: Math.random(),
        });
      }
    }

    // ── Procedural facet ──
    if (showProceduralRef.current) {
      // Group procedural nodes by parent slot for clustering
      const nodesBySlot = new Map<string | null, ProceduralNode[]>();
      for (const n of procedural.nodes) {
        const list = nodesBySlot.get(n.slotId) ?? [];
        list.push(n);
        nodesBySlot.set(n.slotId, list);
      }

      for (const [slotId, nodes] of nodesBySlot) {
        const slotPos = slotId ? state.slotPositions.get(slotId) : null;
        // If unbound, drop the cluster above the center
        const center = slotPos
          ? slotPos.clone().multiplyScalar(1.45)
          : new THREE.Vector3(0, 4, 0);
        const slotColor = slotId
          ? state.slotColors.get(slotId) ?? COLORS.deflectorArray
          : COLORS.deflectorArray;

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const ringIdx = i;
          const angle = (ringIdx / Math.max(1, nodes.length)) * Math.PI * 2;
          const offset = new THREE.Vector3(
            Math.cos(angle) * PROC_RING,
            PROC_OFFSET * 0.5 + Math.sin(i * 0.6) * 0.45,
            Math.sin(angle) * PROC_RING,
          );
          // Pull the cluster toward the slot's outward direction
          if (slotPos) {
            const outward = slotPos.clone().normalize().multiplyScalar(0.6);
            offset.add(outward);
          }
          const position = center.clone().add(offset);
          state.procPositions.set(n.id, position.clone());

          const seed = hashString(n.id);
          const meshframeType = meshframeForProcedural(seed);
          const group = createMeshframe(
            meshframeType,
            PROC_SCALE,
            seed,
            slotColor,
          );
          group.position.copy(position);
          group.userData.metaName = n.name;
          group.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) obj.userData.metaName = n.name;
          });
          sceneManager.nodesGroup.add(group);
          state.procMeshframes.push(group);

          // Label
          const sprite = labelManager.createLabel(n.name, slotColor, labelIdx);
          sceneManager.labelsGroup.add(sprite);
          state.labels.push(sprite);
          state.labelMeta.push({
            sprite,
            position: position.clone(),
            scale: PROC_SCALE,
            index: labelIdx,
          });
          labelIdx++;
        }
      }

      // Procedural edges with pulses
      for (const e of procedural.edges) {
        const from = state.procPositions.get(e.fromNodeId);
        const to = state.procPositions.get(e.toNodeId);
        if (!from || !to) continue;
        const result = edgeManager.createEdge(
          from,
          to,
          e.type,
          COLORS.deflectorArray,
          edgeIndex++,
        );
        sceneManager.edgesGroup.add(result.line);
        state.procEdges.push(result.line);
        if (result.pulse && result.hasPulse) {
          sceneManager.pulsesGroup.add(result.pulse);
          if (result.trail) sceneManager.pulsesGroup.add(result.trail);
          state.pulses.push({
            pulse: result.pulse,
            trail: result.trail,
            curve: result.curve,
            speed: result.pulseSpeed,
            t: Math.random(),
          });
        }
      }
    }

    // Toggle visibility for the procedural layer respecting current showProcedural
    const procVisible = showProceduralRef.current;
    for (const g of state.procMeshframes) g.visible = procVisible;
    for (const l of state.procEdges) l.visible = procVisible;
  }, [meta, procedural]);

  // ── Toggle procedural visibility without rebuilding ─────────────────────
  useEffect(() => {
    showProceduralRef.current = showProcedural;
    const state = renderStateRef.current;
    for (const g of state.procMeshframes) g.visible = showProcedural;
    for (const l of state.procEdges) l.visible = showProcedural;
    // Hide procedural labels when hiding the layer
    for (const m of state.labelMeta) {
      if (m.scale === PROC_SCALE) {
        m.sprite.visible = showProcedural;
      }
    }
  }, [showProcedural]);

  if (!metaGraphId) {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#0B1014]">
        <div className="text-muted-foreground">No meta-graph selected</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 bg-[#0B1014]">
      {/* 3D canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={goHome}
            className="inline-flex items-center gap-1.5 rounded border border-[#243645] bg-[#111A21]/85 backdrop-blur-md px-3 py-1.5 text-xs text-foreground hover:bg-[#07A288]/15"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          {meta && (
            <div className="rounded border border-[#243645] bg-[#111A21]/85 backdrop-blur-md px-3 py-1.5">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-[#07A288]" />
                <span className="text-sm font-semibold text-foreground">{meta.name}</span>
                <span
                  className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
                    meta.source === "induced"
                      ? "bg-[#B8E52B]/20 text-[#B8E52B]"
                      : "bg-[#243645] text-muted-foreground"
                  }`}
                >
                  {meta.source}
                </span>
              </div>
              {meta.description && (
                <div className="mt-1 text-[10px] text-muted-foreground max-w-md">
                  {meta.description}
                </div>
              )}
              <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>{meta.slots.length} slots</span>
                <span>·</span>
                <span>{meta.pattern.length} pattern edges</span>
                <span>·</span>
                <span>{procedural.nodes.length} procedural</span>
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowProcedural((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded border border-[#243645] bg-[#111A21]/85 backdrop-blur-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {showProcedural ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <Layers className="h-3.5 w-3.5" /> Procedural
          </button>
          <button
            type="button"
            onClick={() => setShowAddNode(true)}
            className="inline-flex items-center gap-1.5 rounded bg-[#07A288] text-[#041514] px-3 py-1.5 text-xs hover:bg-[#07A288]/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add procedural node
          </button>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredName && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 rounded border border-[#243645] bg-[#111A21]/85 backdrop-blur-md px-3 py-1 text-xs text-foreground pointer-events-none">
          {hoveredName}
        </div>
      )}

      {/* Add procedural node dialog */}
      {showAddNode && meta && (
        <div className="absolute bottom-4 right-4 w-80 rounded border border-[#243645] bg-[#111A21]/95 backdrop-blur-md p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            New procedural node
          </div>
          <input
            type="text"
            value={newNodeName}
            onChange={(e) => setNewNodeName(e.target.value)}
            placeholder="Node name (e.g. Reset password via OKTA)"
            className="w-full h-8 rounded border border-[#243645] bg-[#0B1014] px-2 text-xs text-foreground outline-none"
          />
          <select
            value={newNodeSlotId}
            onChange={(e) => setNewNodeSlotId(e.target.value)}
            className="w-full h-8 rounded border border-[#243645] bg-[#0B1014] px-2 text-xs text-foreground outline-none"
          >
            <option value="">No slot (freestanding)</option>
            {meta.slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <textarea
            value={newNodeDescription}
            onChange={(e) => setNewNodeDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded border border-[#243645] bg-[#0B1014] px-2 py-1 text-xs text-foreground outline-none resize-none"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-[#243645]"
              onClick={() => setShowAddNode(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
              disabled={!newNodeName.trim() || addNodeMutation.isPending}
              onClick={() => addNodeMutation.mutate()}
            >
              {addNodeMutation.isPending && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MetaGraph3D;
