/**
 * 3D Knowledge Graph — Controls Panel Overlay.
 *
 * Floating panel (bottom-right) that provides real-time control over
 * scene rendering options: rotation, labels, edges, bloom, etc.
 * Uses shadcn/ui primitives for consistent dark-theme styling.
 */

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import type { ControlsConfig } from "./types";

interface ControlsPanelProps {
  config: ControlsConfig;
  onChange: (config: ControlsConfig) => void;
}

function ControlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-400 whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums font-mono">
          {value.toFixed(step < 0.1 ? 2 : 1)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

export function ControlsPanel({ config, onChange }: ControlsPanelProps) {
  function update(partial: Partial<ControlsConfig>) {
    onChange({ ...config, ...partial });
  }

  return (
    <div className="bg-[#111A21]/90 backdrop-blur-md border border-[#243645] rounded-lg p-4 w-64 space-y-4">
      <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
        Controls
      </h3>

      {/* Toggle switches */}
      <div className="space-y-3">
        <ControlRow label="Auto-rotate">
          <Switch
            checked={config.autoRotate}
            onCheckedChange={(checked) => update({ autoRotate: checked })}
          />
        </ControlRow>

        <ControlRow label="Show labels">
          <Switch
            checked={config.showLabels}
            onCheckedChange={(checked) => update({ showLabels: checked })}
          />
        </ControlRow>

        <ControlRow label="Show edges">
          <Switch
            checked={config.showEdges}
            onCheckedChange={(checked) => update({ showEdges: checked })}
          />
        </ControlRow>

        <ControlRow label="Show pulses">
          <Switch
            checked={config.showPulses}
            onCheckedChange={(checked) => update({ showPulses: checked })}
          />
        </ControlRow>

        <ControlRow label="Show grid">
          <Switch
            checked={config.showGrid}
            onCheckedChange={(checked) => update({ showGrid: checked })}
          />
        </ControlRow>
      </div>

      {/* Divider */}
      <div className="border-t border-[#243645]" />

      {/* Sliders */}
      <div className="space-y-3">
        <SliderRow
          label="Bloom strength"
          value={config.bloomStrength}
          min={0}
          max={3}
          step={0.1}
          onChange={(v) => update({ bloomStrength: v })}
        />

        <SliderRow
          label="Node scale"
          value={config.nodeScale}
          min={0.5}
          max={2.0}
          step={0.1}
          onChange={(v) => update({ nodeScale: v })}
        />

        <SliderRow
          label="Edge opacity"
          value={config.edgeOpacity}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => update({ edgeOpacity: v })}
        />
      </div>
    </div>
  );
}
