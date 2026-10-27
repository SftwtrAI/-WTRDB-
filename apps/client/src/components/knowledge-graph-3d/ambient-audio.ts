/**
 * Generative Ambient Audio Engine — Celestial Field & Knowledge Graph
 *
 * Two-layer architecture:
 *   Layer 1 (Field): Always-on warm drone seeded from the user's total KBs.
 *     Sub-bass pad, slowly breathing through coprime LFOs, heavy low-pass,
 *     long algorithmic reverb (multi-tap delay), pink noise bed.
 *
 *   Layer 2 (Graph): Fades in when a specific graph is opened. Adds higher
 *     shimmer voices, gentle harmonic movement, and graph-specific tuning
 *     derived from entity count and types.
 *
 * Reference aesthetic: 80s generative modular — Eno tape-loop phase drift,
 * Ciani Buchla voltage-controlled pads, azurite ambient warmth.
 *
 * Pure Web Audio API. No external dependencies.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FieldSeed {
  entityCount: number;
  freshness: number;
  kbCount: number;
}

export interface GraphSeed {
  entityCount: number;
  relationshipCount: number;
  freshness: number;
  dominantTypes: string[];
}

export interface AmbientAudioEngine {
  start(): void;
  stop(): void;
  setVolume(v: number): void;
  retuneField(seed: FieldSeed): void;
  enterGraph(seed: GraphSeed): void;
  leaveGraph(): void;
  dispose(): void;
  isRunning(): boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Coprime multipliers for LFO periods — guarantees non-repeating combinations */
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23];

/** Entity type → pitch offset in semitones for the graph shimmer layer */
const TYPE_PITCH_MAP: Record<string, number> = {
  Person: 0,
  Organization: 3,
  Technology: 7,
  Service: 5,
  Infrastructure: -2,
  Configuration: 10,
  Credential: 8,
  Policy: 2,
  Location: 4,
  Event: 9,
  Product: 6,
  Document: 1,
  Concept: 11,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pre-render a looping pink noise AudioBuffer.
 * Avoids the deprecated ScriptProcessorNode entirely.
 * Uses Paul Kellet's refined method baked into a 4-second buffer.
 */
function createPinkNoiseBuffer(ctx: AudioContext): AudioBufferSourceNode {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * 4); // 4 seconds, looped
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

/**
 * Algorithmic reverb via multi-tap feedback delay network.
 * Four delay lines with coprime lengths and gentle cross-feedback,
 * each with a low-pass damper in the loop so higher frequencies decay faster.
 * Much more natural than a single feedback delay.
 */
function createReverbNetwork(
  ctx: AudioContext,
  destination: AudioNode,
  wetLevel: number,
): { input: GainNode; dispose: () => void } {
  const input = ctx.createGain();
  input.gain.value = 1;

  const wet = ctx.createGain();
  wet.gain.value = wetLevel;

  const dry = ctx.createGain();
  dry.gain.value = 1 - wetLevel * 0.5; // keep dry present

  // Four delay taps with coprime-ish lengths (seconds)
  const tapTimes = [0.937, 1.331, 1.717, 2.173];
  const feedbacks = [0.42, 0.38, 0.35, 0.32]; // decreasing for stability
  const dampFreqs = [3000, 2600, 2200, 1800]; // progressive darkening

  const delays: DelayNode[] = [];
  const dampers: BiquadFilterNode[] = [];
  const fbGains: GainNode[] = [];

  for (let i = 0; i < 4; i++) {
    const delay = ctx.createDelay(tapTimes[i] + 0.5);
    delay.delayTime.value = tapTimes[i];

    const damper = ctx.createBiquadFilter();
    damper.type = "lowpass";
    damper.frequency.value = dampFreqs[i];
    damper.Q.value = 0.3;

    const fb = ctx.createGain();
    fb.gain.value = feedbacks[i];

    // input → delay → damper → wet mix
    //                  ↓
    //                  fb → delay (feedback)
    input.connect(delay);
    delay.connect(damper);
    damper.connect(fb);
    fb.connect(delay);
    damper.connect(wet);

    delays.push(delay);
    dampers.push(damper);
    fbGains.push(fb);
  }

  wet.connect(destination);
  input.connect(dry);
  dry.connect(destination);

  return {
    input,
    dispose: () => {
      for (const d of delays) d.disconnect();
      for (const d of dampers) d.disconnect();
      for (const g of fbGains) g.disconnect();
      wet.disconnect();
      dry.disconnect();
      input.disconnect();
    },
  };
}

// ─── Drone Voice ────────────────────────────────────────────────────────────

interface DroneVoice {
  osc: OscillatorNode;
  gain: GainNode;
  pitchLfo: OscillatorNode;
  pitchLfoGain: GainNode;
  ampLfo: OscillatorNode;
  ampLfoGain: GainNode;
}

function createDroneVoice(
  ctx: AudioContext,
  destination: AudioNode,
  baseFreq: number,
  voiceIndex: number,
  type: OscillatorType,
  amplitude: number,
  lfoBaseUnit: number,
): DroneVoice {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = baseFreq;

  const gain = ctx.createGain();
  gain.gain.value = amplitude;

  // Pitch LFO: very slow, ±6 cents of drift for richer beating
  const pitchLfo = ctx.createOscillator();
  pitchLfo.type = "sine";
  pitchLfo.frequency.value = 1 / (PRIMES[voiceIndex % PRIMES.length] * lfoBaseUnit);

  const pitchLfoGain = ctx.createGain();
  // ±6 cents = baseFreq × (2^(6/1200) − 1) ≈ baseFreq × 0.00347
  pitchLfoGain.gain.value = baseFreq * 0.00347;

  pitchLfo.connect(pitchLfoGain);
  pitchLfoGain.connect(osc.frequency);

  // Amplitude LFO: slow breathing
  const ampLfo = ctx.createOscillator();
  ampLfo.type = "triangle";
  ampLfo.frequency.value = 1 / (PRIMES[(voiceIndex + 3) % PRIMES.length] * lfoBaseUnit * 0.8);

  const ampLfoGain = ctx.createGain();
  ampLfoGain.gain.value = amplitude * 0.35;

  ampLfo.connect(ampLfoGain);
  ampLfoGain.connect(gain.gain);

  osc.connect(gain);
  gain.connect(destination);

  return { osc, gain, pitchLfo, pitchLfoGain, ampLfo, ampLfoGain };
}

function startVoice(v: DroneVoice, time: number) {
  v.osc.start(time);
  v.pitchLfo.start(time);
  v.ampLfo.start(time);
}

function disposeVoice(v: DroneVoice) {
  try { v.osc.stop(); } catch { /* already stopped */ }
  try { v.pitchLfo.stop(); } catch { /* already stopped */ }
  try { v.ampLfo.stop(); } catch { /* already stopped */ }
  v.osc.disconnect();
  v.gain.disconnect();
  v.pitchLfo.disconnect();
  v.pitchLfoGain.disconnect();
  v.ampLfo.disconnect();
  v.ampLfoGain.disconnect();
}

// ─── Shimmer Voice (graph layer — higher, more delicate) ────────────────────

interface ShimmerVoice {
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

function createShimmerVoice(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  voiceIndex: number,
  amplitude: number,
): ShimmerVoice {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const gain = ctx.createGain();
  gain.gain.value = 0; // starts silent, faded in

  // Slow amplitude LFO — triangle, very gentle
  const lfo = ctx.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 1 / (PRIMES[(voiceIndex + 4) % PRIMES.length] * 5.3);

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = amplitude * 0.4;

  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);

  osc.connect(gain);
  gain.connect(destination);

  return { osc, gain, lfo, lfoGain };
}

// ─── Main Engine ────────────────────────────────────────────────────────────

export function createAmbientAudio(initialFieldSeed: FieldSeed): AmbientAudioEngine {
  // ── State ──
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let running = false;
  let volume = 0.16;
  let fieldSeed = { ...initialFieldSeed };
  let stopTimeout: ReturnType<typeof setTimeout> | null = null;

  // Field layer nodes
  let fieldVoices: DroneVoice[] = [];
  let fieldFilter: BiquadFilterNode | null = null;
  let fieldFilterLfo: OscillatorNode | null = null;
  let fieldFilterLfoGain: GainNode | null = null;
  let fieldNoiseSource: AudioBufferSourceNode | null = null;
  let fieldNoiseGain: GainNode | null = null;
  let reverbDispose: (() => void) | null = null;

  // Graph overlay layer nodes
  let graphBus: GainNode | null = null;
  let graphFilter: BiquadFilterNode | null = null;
  let graphShimmerVoices: ShimmerVoice[] = [];
  let graphActive = false;

  // ── Field parameter derivation ──
  function deriveFieldParams(s: FieldSeed) {
    // Root in the sub-bass: A1 (55Hz) base, nudged by entity count
    // Keep it low and warm — this is the foundation
    const rootHz = 48 + Math.min(s.entityCount, 800) * 0.035;

    // Just-intonation intervals for a deep, open voicing
    // Fundamental, octave, P5+8va, 2×octave, M3+2×8va
    const intervals: Array<{ ratio: number; type: OscillatorType; amp: number }> = [
      { ratio: 1.0, type: "sine", amp: 0.06 },       // fundamental
      { ratio: 2.0, type: "sine", amp: 0.04 },       // octave
      { ratio: 3.0, type: "sine", amp: 0.025 },      // P5 + 8va (=×3)
      { ratio: 4.0, type: "triangle", amp: 0.018 },   // 2 octaves
      { ratio: 5.0, type: "sine", amp: 0.012 },       // M3 + 2×8va (=×5)
      { ratio: 6.0, type: "triangle", amp: 0.008 },   // P5 + 2×8va
    ];

    // 2 KBs = 3 voices, 5+ KBs = all 6
    const count = Math.min(Math.max(3, s.kbCount + 1), intervals.length);
    const activeIntervals = intervals.slice(0, count);

    // Freshness → filter cutoff. Fresh = brighter, stale = darker
    const filterBase = 250 + s.freshness * 1200;
    const filterSweepOctaves = 1.0 + s.freshness * 1.5;

    return { rootHz, activeIntervals, filterBase, filterSweepOctaves };
  }

  // ── Graph overlay parameter derivation ──
  function deriveGraphParams(s: GraphSeed, fieldRoot: number) {
    // Graph shimmer voices sit 2-3 octaves above the field root
    // Each dominant entity type contributes a voice at its pitch offset
    const baseOctave = fieldRoot * 4; // 2 octaves up
    const pitchOffsets = s.dominantTypes.slice(0, 4).map(
      (t) => TYPE_PITCH_MAP[t] ?? 0,
    );

    const shimmerFreqs = pitchOffsets.map(
      (semitones) => baseOctave * Math.pow(2, semitones / 12),
    );

    // More relationships → slightly louder shimmer (busier graph = more presence)
    const shimmerAmp = Math.min(0.015, 0.006 + s.relationshipCount * 0.00003);

    // Graph freshness shifts the shimmer filter
    const shimmerFilterFreq = 600 + s.freshness * 2000;

    return { shimmerFreqs, shimmerAmp, shimmerFilterFreq };
  }

  // ── Start ──
  function start() {
    if (running) return;
    // If a delayed stop is pending, cancel it and reuse the context
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      stopTimeout = null;
      if (ctx && masterGain) {
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setTargetAtTime(volume * 0.18, now, 0.5);
        running = true;
        return;
      }
    }

    const AudioCtx = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    ctx = new AudioCtx();
    const now = ctx.currentTime;
    const fp = deriveFieldParams(fieldSeed);

    // ── Master output ──
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.connect(ctx.destination);

    // ── Reverb network ──
    const reverb = createReverbNetwork(ctx, masterGain, 0.55);
    reverbDispose = reverb.dispose;

    // ── Field layer filter: slow-sweeping low-pass ──
    fieldFilter = ctx.createBiquadFilter();
    fieldFilter.type = "lowpass";
    fieldFilter.frequency.value = fp.filterBase;
    fieldFilter.Q.value = 0.5; // very gentle resonance

    // Additional warmth: second-order high-shelf cut
    const warmthShelf = ctx.createBiquadFilter();
    warmthShelf.type = "highshelf";
    warmthShelf.frequency.value = 1800;
    warmthShelf.gain.value = -6; // cut highs by 6dB

    // Filter LFO: period ~41s (prime 19 × 2.15)
    fieldFilterLfo = ctx.createOscillator();
    fieldFilterLfo.type = "sine";
    fieldFilterLfo.frequency.value = 1 / (19 * 2.15);

    fieldFilterLfoGain = ctx.createGain();
    fieldFilterLfoGain.gain.value =
      fp.filterBase * (Math.pow(2, fp.filterSweepOctaves) - 1) * 0.4;

    fieldFilterLfo.connect(fieldFilterLfoGain);
    fieldFilterLfoGain.connect(fieldFilter.frequency);

    // Chain: voices → fieldFilter → warmthShelf → reverb
    fieldFilter.connect(warmthShelf);
    warmthShelf.connect(reverb.input);

    // ── Drone voices ──
    fieldVoices = fp.activeIntervals.map((iv, i) =>
      createDroneVoice(
        ctx!, fieldFilter!, fp.rootHz * iv.ratio, i, iv.type, iv.amp, 4.5,
      ),
    );

    // ── Pink noise bed (buffer-based, no ScriptProcessorNode) ──
    fieldNoiseSource = createPinkNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 500;
    noiseFilter.Q.value = 0.3;

    fieldNoiseGain = ctx.createGain();
    fieldNoiseGain.gain.value = 0.008;

    fieldNoiseSource.connect(noiseFilter);
    noiseFilter.connect(fieldNoiseGain);
    fieldNoiseGain.connect(reverb.input);

    // ── Graph overlay bus (initially silent) ──
    graphBus = ctx.createGain();
    graphBus.gain.value = 0;

    graphFilter = ctx.createBiquadFilter();
    graphFilter.type = "lowpass";
    graphFilter.frequency.value = 1200;
    graphFilter.Q.value = 0.4;

    graphBus.connect(graphFilter);
    graphFilter.connect(reverb.input);

    // ── Start everything ──
    for (const v of fieldVoices) startVoice(v, now);
    fieldFilterLfo.start(now);
    fieldNoiseSource.start(now);

    // Gentle 4-second fade in
    masterGain.gain.linearRampToValueAtTime(volume * 0.18, now + 4);

    running = true;
  }

  // ── Stop ──
  function stop() {
    if (!running || !ctx || !masterGain) return;
    running = false;

    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + 2.5);

    // Cleanup after fade
    stopTimeout = setTimeout(() => {
      stopTimeout = null;

      for (const v of fieldVoices) disposeVoice(v);
      fieldVoices = [];

      for (const sv of graphShimmerVoices) {
        try { sv.osc.stop(); } catch { /* noop */ }
        try { sv.lfo.stop(); } catch { /* noop */ }
        sv.osc.disconnect();
        sv.gain.disconnect();
        sv.lfo.disconnect();
        sv.lfoGain.disconnect();
      }
      graphShimmerVoices = [];
      graphActive = false;

      if (fieldNoiseSource) {
        try { fieldNoiseSource.stop(); } catch { /* noop */ }
        fieldNoiseSource.disconnect();
        fieldNoiseSource = null;
      }
      fieldNoiseGain?.disconnect();
      fieldNoiseGain = null;

      if (fieldFilterLfo) {
        try { fieldFilterLfo.stop(); } catch { /* noop */ }
        fieldFilterLfo.disconnect();
        fieldFilterLfo = null;
      }
      fieldFilterLfoGain?.disconnect();
      fieldFilterLfoGain = null;

      fieldFilter?.disconnect();
      fieldFilter = null;

      graphFilter?.disconnect();
      graphFilter = null;
      graphBus?.disconnect();
      graphBus = null;

      reverbDispose?.();
      reverbDispose = null;

      masterGain?.disconnect();
      masterGain = null;

      ctx?.close().catch(() => {});
      ctx = null;
    }, 2800);
  }

  // ── Volume ──
  function setVolumeFn(v: number) {
    volume = v;
    if (masterGain && ctx && running) {
      masterGain.gain.setTargetAtTime(v * 0.18, ctx.currentTime, 0.3);
    }
  }

  // ── Retune field layer ──
  function retuneField(newSeed: FieldSeed) {
    fieldSeed = { ...newSeed };
    if (!running || !ctx) return;

    const fp = deriveFieldParams(fieldSeed);
    const now = ctx.currentTime;

    fieldVoices.forEach((v, i) => {
      const interval = fp.activeIntervals[i];
      if (!interval) return;
      const targetFreq = fp.rootHz * interval.ratio;
      v.osc.frequency.setTargetAtTime(targetFreq, now, 2);
      v.pitchLfoGain.gain.setTargetAtTime(targetFreq * 0.00347, now, 2);
    });

    if (fieldFilter) {
      fieldFilter.frequency.setTargetAtTime(fp.filterBase, now, 3);
    }
    if (fieldFilterLfoGain) {
      fieldFilterLfoGain.gain.setTargetAtTime(
        fp.filterBase * (Math.pow(2, fp.filterSweepOctaves) - 1) * 0.4,
        now,
        3,
      );
    }
  }

  // ── Enter graph: fade in shimmer overlay ──
  function enterGraph(seed: GraphSeed) {
    if (!running || !ctx || !graphBus || !graphFilter) return;

    // If already in a graph, fade out existing shimmer first
    if (graphActive) {
      leaveGraphImmediate();
    }

    const fp = deriveFieldParams(fieldSeed);
    const gp = deriveGraphParams(seed, fp.rootHz);
    const now = ctx.currentTime;

    // Update graph filter for this graph's freshness
    graphFilter.frequency.setTargetAtTime(gp.shimmerFilterFreq, now, 1);

    // Create shimmer voices for this graph's dominant entity types
    graphShimmerVoices = gp.shimmerFreqs.map((freq, i) =>
      createShimmerVoice(ctx!, graphBus!, freq, i, gp.shimmerAmp),
    );

    // Start and fade in
    for (const sv of graphShimmerVoices) {
      sv.osc.start(now);
      sv.lfo.start(now);
      // Fade voice amplitude up over 3 seconds
      sv.gain.gain.setTargetAtTime(gp.shimmerAmp, now, 1.2);
    }

    // Fade the graph bus up
    graphBus.gain.setTargetAtTime(1, now, 1.5);
    graphActive = true;
  }

  // ── Leave graph: fade out shimmer overlay ──
  function leaveGraphImmediate() {
    if (!ctx || !graphBus) return;
    const now = ctx.currentTime;

    // Fade shimmer voices out
    for (const sv of graphShimmerVoices) {
      sv.gain.gain.setTargetAtTime(0, now, 0.8);
    }
    graphBus.gain.setTargetAtTime(0, now, 1);

    // Schedule cleanup
    const voices = [...graphShimmerVoices];
    graphShimmerVoices = [];

    setTimeout(() => {
      for (const sv of voices) {
        try { sv.osc.stop(); } catch { /* noop */ }
        try { sv.lfo.stop(); } catch { /* noop */ }
        sv.osc.disconnect();
        sv.gain.disconnect();
        sv.lfo.disconnect();
        sv.lfoGain.disconnect();
      }
    }, 3000);

    graphActive = false;
  }

  function leaveGraph() {
    if (!graphActive) return;
    leaveGraphImmediate();
  }

  // ── Dispose ──
  function dispose() {
    if (running) {
      stop();
    } else if (stopTimeout) {
      // Force immediate cleanup if stop is pending
      clearTimeout(stopTimeout);
      stopTimeout = null;
      for (const v of fieldVoices) {
        try { disposeVoice(v); } catch { /* noop */ }
      }
      fieldVoices = [];
      for (const sv of graphShimmerVoices) {
        try { sv.osc.stop(); } catch { /* noop */ }
        try { sv.lfo.stop(); } catch { /* noop */ }
      }
      graphShimmerVoices = [];
      ctx?.close().catch(() => {});
      ctx = null;
    }
  }

  return {
    start,
    stop,
    setVolume: setVolumeFn,
    retuneField,
    enterGraph,
    leaveGraph,
    dispose,
    isRunning: () => running,
  };
}
