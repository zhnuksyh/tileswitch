// Soft, minimal sound effects synthesized with the Web Audio API — no asset
// files, so the bundle stays tiny and everything works offline. Sounds are
// short sine/triangle blips with quick envelopes.
//
// Browsers block audio until a user gesture, so the context is created lazily
// and resumed on the first interaction. Mute state persists to localStorage.

const STORAGE_KEY = 'tileswitch:muted';

type SoundName = 'select' | 'swap' | 'place' | 'invalid' | 'win';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Wire up first-gesture unlock. Call once at startup. */
export function initAudio(): void {
  const unlock = () => {
    ensureContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

interface Tone {
  freq: number;
  /** Seconds from now to start. */
  delay?: number;
  /** Note length in seconds. */
  dur?: number;
  type?: OscillatorType;
  /** Peak gain (0..1) before the master gain. */
  gain?: number;
}

function playTones(tones: Tone[]): void {
  if (muted) return;
  const audio = ensureContext();
  if (!audio || !master) return;

  const now = audio.currentTime;
  for (const t of tones) {
    const start = now + (t.delay ?? 0);
    const dur = t.dur ?? 0.12;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);

    const peak = t.gain ?? 0.3;
    // Fast attack, smooth exponential decay for a soft blip.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}

const RECIPES: Record<SoundName, () => Tone[]> = {
  // Tap-to-select: single soft mid blip.
  select: () => [{ freq: 523.25, dur: 0.09, gain: 0.22 }],
  // Swap: two quick descending-then-rising notes, like tiles trading.
  swap: () => [
    { freq: 440, dur: 0.08, gain: 0.24 },
    { freq: 587.33, delay: 0.06, dur: 0.1, gain: 0.24 },
  ],
  // Correct placement: a soft, rounded "plink" — a warm sine note with a
  // gentle octave shimmer on top. Mellower and less shrill than a bright
  // triangle chirp, so it stays pleasant over a long solve.
  place: () => [
    { freq: 587.33, dur: 0.14, gain: 0.24, type: 'sine' },
    { freq: 1174.66, delay: 0.02, dur: 0.09, gain: 0.08, type: 'sine' },
  ],
  // Invalid / no-op: low soft thud.
  invalid: () => [{ freq: 174.61, dur: 0.12, gain: 0.2, type: 'triangle' }],
  // Win: a short 4-note ascending arpeggio.
  win: () => [
    { freq: 523.25, dur: 0.16, gain: 0.28 },
    { freq: 659.25, delay: 0.12, dur: 0.16, gain: 0.28 },
    { freq: 783.99, delay: 0.24, dur: 0.16, gain: 0.28 },
    { freq: 1046.5, delay: 0.36, dur: 0.34, gain: 0.3, type: 'triangle' },
  ],
};

export function play(name: SoundName): void {
  playTones(RECIPES[name]());
}
