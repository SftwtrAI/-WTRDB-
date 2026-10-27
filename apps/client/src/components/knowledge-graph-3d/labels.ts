/**
 * 3D Knowledge Graph — Camera-Facing Label Sprites.
 *
 * Labels are rendered to an offscreen canvas with a type-colored glow
 * behind crisp white text, then uploaded as sprite textures.  Sprites
 * always face the camera and breathe gently via an opacity sine wave.
 */

import * as THREE from "three";

// ── Exported interface ───────────────────────────────────────────────────────

export interface LabelManager {
  createLabel(text: string, color: number, nodeIndex: number): THREE.Sprite;
  updateLabel(
    sprite: THREE.Sprite,
    position: THREE.Vector3,
    nodeScale: number,
    globalTime: number,
    nodeIndex: number,
  ): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a hex color number (e.g. 0x00f0b5) to a CSS rgb string. */
function hexToCSS(hex: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgb(${r},${g},${b})`;
}

// ── Canvas dimensions ────────────────────────────────────────────────────────

const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 48;

// ── Factory ──────────────────────────────────────────────────────────────────

export function createLabelManager(): LabelManager {
  const sprites: THREE.Sprite[] = [];
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.SpriteMaterial[] = [];

  let globalVisible = true;

  /** Render label text onto an offscreen canvas and return a CanvasTexture. */
  function renderLabelCanvas(text: string, color: number): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.font = "600 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;

    // First pass: shadow glow in the node's type color
    ctx.shadowColor = hexToCSS(color);
    ctx.shadowBlur = 10;
    ctx.fillStyle = hexToCSS(color);
    ctx.fillText(text, cx, cy);

    // Second pass: crisp white text over the glow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, cx, cy);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function createLabel(
    text: string,
    color: number,
    _nodeIndex: number,
  ): THREE.Sprite {
    const texture = renderLabelCanvas(text, color);
    textures.push(texture);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
    });
    materials.push(material);

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3.5, 0.65, 1);
    sprites.push(sprite);

    return sprite;
  }

  function updateLabel(
    sprite: THREE.Sprite,
    position: THREE.Vector3,
    nodeScale: number,
    globalTime: number,
    nodeIndex: number,
  ): void {
    // Position the label above the node
    sprite.position.set(
      position.x,
      position.y + nodeScale * 2.8,
      position.z,
    );

    // Breathing opacity animation
    const phaseOffset = nodeIndex * 0.7;
    const breathOpacity = 0.6 + Math.sin(globalTime * 2 + phaseOffset) * 0.2;

    const mat = sprite.material as THREE.SpriteMaterial;
    mat.opacity = globalVisible ? breathOpacity : 0;
    sprite.visible = globalVisible;
  }

  function setVisible(visible: boolean): void {
    globalVisible = visible;
    for (const sprite of sprites) {
      sprite.visible = visible;
      if (!visible) {
        (sprite.material as THREE.SpriteMaterial).opacity = 0;
      }
    }
  }

  function dispose(): void {
    for (const tex of textures) {
      tex.dispose();
    }
    for (const mat of materials) {
      mat.dispose();
    }
    textures.length = 0;
    materials.length = 0;
    sprites.length = 0;
  }

  return {
    createLabel,
    updateLabel,
    setVisible,
    dispose,
  };
}
