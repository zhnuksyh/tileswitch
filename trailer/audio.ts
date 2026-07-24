// Trailer audio: reuse the app's existing SFX engine (fired on beat boundaries)
// and lay a low synthesized music bed underneath. No new audio files — the bed
// is generated through the SAME shared AudioContext the app uses, so a tab
// screen-capture records both the Web-Audio SFX and the music together.
//
// Mix: keep the bed low so it's a *bed*; push SFX above it via the app's opt-in
// setSfxBoost() (defaults to 1 for the app — this is the only caller).

import { play, getAudioContext, setSfxBoost } from '../src/audio/sfx';

export type SoundName = 'select' | 'swap' | 'place' | 'invalid' | 'win';

let musicGain: GainNode | null = null;
let padOscs: OscillatorNode[] = [];
let seqTimer: number | null = null;
let started = false;

// Upbeat, major-key track — the classic feel-good I–V–vi–IV loop in C major.
// Each chord is a set of voice frequencies (Hz); a plucky arpeggio melody and a
// soft bass note ride on top so the bed feels bouncy rather than droney.
const BPM = 120;
const BEAT = 60 / BPM; // 0.5s
const BAR = BEAT * 4; // one chord per bar

// I – V – vi – IV (C – G – Am – F). Bright and forward-moving.
const PROG: { bass: number; chord: number[]; arp: number[] }[] = [
  { bass: 130.81, chord: [261.63, 329.63, 392.0], arp: [523.25, 659.25, 783.99, 659.25] }, // C
  { bass: 196.0, chord: [293.66, 392.0, 493.88], arp: [587.33, 739.99, 987.77, 739.99] }, // G
  { bass: 220.0, chord: [261.63, 329.63, 440.0], arp: [523.25, 659.25, 880.0, 659.25] }, // Am
  { bass: 174.61, chord: [261.63, 349.23, 440.0], arp: [523.25, 698.46, 880.0, 698.46] }, // F
];

/** A short plucked note (triangle for the melody, sine for warmth). */
function pluck(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  at: number,
  dur: number,
  peak: number,
  type: OscillatorType,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}

/** Boost SFX above the bed, and start the upbeat sequenced music. Idempotent. */
export function startMusic(): void {
  if (started) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  started = true;
  setSfxBoost(1.9);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.0001;
  musicGain.connect(ctx.destination);
  // Quick, cheerful fade-in.
  musicGain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.8);

  // A quiet sustained pad (the three chord voices) that we retune each bar, so
  // there's a warm harmonic floor under the plucks.
  const padBus = ctx.createGain();
  padBus.gain.value = 0.22;
  padBus.connect(musicGain);
  for (let v = 0; v < 3; v++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = PROG[0].chord[v];
    osc.connect(padBus);
    osc.start();
    padOscs.push(osc);
  }

  const arpBus = ctx.createGain();
  arpBus.gain.value = 0.5;
  arpBus.connect(musicGain);
  const bassBus = ctx.createGain();
  bassBus.gain.value = 0.6;
  bassBus.connect(musicGain);

  // Schedule ~2 bars ahead on a rolling timer so the loop never gaps.
  let bar = 0;
  let nextTime = ctx.currentTime + 0.15;
  const scheduleAhead = () => {
    if (!started) return;
    while (nextTime < ctx.currentTime + 2 * BAR) {
      const step = PROG[bar % PROG.length];
      // Retune the pad to this bar's chord.
      padOscs.forEach((osc, v) => {
        osc.frequency.linearRampToValueAtTime(step.chord[v], nextTime + 0.05);
      });
      // Bass on the downbeat, plus a bounce on beat 3.
      pluck(ctx, bassBus, step.bass, nextTime, 0.5, 0.5, 'sine');
      pluck(ctx, bassBus, step.bass, nextTime + BEAT * 2, 0.4, 0.4, 'sine');
      // Arpeggio: one note per eighth across the bar for a lively, hopeful run.
      for (let i = 0; i < 8; i++) {
        const note = step.arp[i % step.arp.length];
        pluck(ctx, arpBus, note, nextTime + i * (BEAT / 2), 0.26, 0.32, 'triangle');
      }
      nextTime += BAR;
      bar++;
    }
  };
  scheduleAhead();
  seqTimer = window.setInterval(scheduleAhead, (BAR * 1000) / 2);
}

/** Fade the music out and free the oscillators. */
export function stopMusic(): void {
  const ctx = getAudioContext();
  if (seqTimer !== null) {
    window.clearInterval(seqTimer);
    seqTimer = null;
  }
  if (musicGain && ctx) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  }
  const kill = () => {
    for (const osc of padOscs) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    padOscs = [];
    musicGain = null;
    started = false;
    setSfxBoost(1);
  };
  window.setTimeout(kill, 700);
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
