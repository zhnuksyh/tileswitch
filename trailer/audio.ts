// Trailer audio: reuse the app's existing SFX engine (fired on beat boundaries)
// and lay a low synthesized music bed underneath. No new audio files — the bed
// is generated through the SAME shared AudioContext the app uses, so a tab
// screen-capture records both the Web-Audio SFX and the music together.
//
// Mix: keep the bed low so it's a *bed*; push SFX above it via the app's opt-in
// setSfxBoost() (defaults to 1 for the app — this is the only caller).

import { play, getAudioContext, setSfxBoost } from '../src/audio/sfx';

export type SoundName = 'select' | 'swap' | 'place' | 'invalid' | 'win';

let bedNodes: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode }[] = [];
let bedGain: GainNode | null = null;
let started = false;

// A calm two-chord pad loop in a minor-pentatonic-ish space — roots that sit
// under the UI blips without clashing. Frequencies (Hz) per voice.
const CHORD_A = [130.81, 196.0, 261.63, 392.0]; // C3 G3 C4 G4
const CHORD_B = [146.83, 220.0, 293.66, 440.0]; // D3 A3 D4 A4
const CHORD_LEN = 4.2; // seconds per chord

/** Boost SFX above the bed, and build the pad. Idempotent. */
export function startMusic(): void {
  if (started) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  started = true;
  setSfxBoost(1.9);

  bedGain = ctx.createGain();
  bedGain.gain.value = 0.0001;
  bedGain.connect(ctx.destination);
  // Gentle fade-in of the bed.
  bedGain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 1.4);

  const build = (freqs: number[]) => {
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 1 / freqs.length;
      // Slow tremolo so the pad breathes rather than sitting static.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12 + Math.random() * 0.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.18;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(bedGain!);
      osc.start();
      lfo.start();
      bedNodes.push({ osc, lfo, gain: g });
    }
  };
  build(CHORD_A);

  // Crossfade between the two chords on a loop by retuning the oscillators.
  let toB = true;
  const swing = () => {
    if (!started) return;
    const now = ctx.currentTime;
    const target = toB ? CHORD_B : CHORD_A;
    bedNodes.forEach((n, i) => {
      n.osc.frequency.linearRampToValueAtTime(target[i % target.length], now + 1.6);
    });
    toB = !toB;
  };
  window.setInterval(swing, CHORD_LEN * 1000);
}

/** Fade the bed out and free the oscillators. */
export function stopMusic(): void {
  const ctx = getAudioContext();
  if (bedGain && ctx) {
    bedGain.gain.cancelScheduledValues(ctx.currentTime);
    bedGain.gain.setValueAtTime(bedGain.gain.value, ctx.currentTime);
    bedGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
  }
  const kill = () => {
    for (const n of bedNodes) {
      try {
        n.osc.stop();
        n.lfo.stop();
      } catch {
        /* already stopped */
      }
    }
    bedNodes = [];
    bedGain = null;
    started = false;
    setSfxBoost(1);
  };
  window.setTimeout(kill, 900);
}

/** Fire one of the app's real SFX. */
export function sfx(name: SoundName): void {
  play(name);
}

// --- One-time cue scheduler --------------------------------------------------
// Compare previous vs current absolute elapsed each frame and fire any cue whose
// time was crossed, keyed by run:scene:cue so each plays exactly once and resets
// on restart / seek.

export interface Cue {
  /** Absolute time (s) from the trailer start. */
  t: number;
  sound: SoundName;
}

export class CueScheduler {
  private fired = new Set<string>();
  private prev = 0;
  private run = 0;

  /** Called on restart or seek: forget fired cues and reset the marker. */
  reset(elapsed: number): void {
    this.fired.clear();
    this.prev = elapsed;
    this.run += 1;
  }

  setPrev(elapsed: number): void {
    this.prev = elapsed;
  }

  /** Fire any cue crossed between prev and current elapsed. */
  tick(elapsed: number, cues: Cue[]): void {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (cue.t > this.prev && cue.t <= elapsed) {
        const key = `${this.run}:${i}:${cue.t}`;
        if (!this.fired.has(key)) {
          this.fired.add(key);
          sfx(cue.sound);
        }
      }
    }
    this.prev = elapsed;
  }
}
