import './trailer.css';
import { SCENES, STARTS, TOTAL, type SceneInstance } from './scenes';
import { CueScheduler, startMusic, stopMusic } from './audio';
import { initAudio, isMuted, toggleMuted } from '../src/audio/sfx';
import { burstConfetti } from '../src/ui/confetti';

// Kinetic-typography trailer for TileSwitch. A single requestAnimationFrame
// clock walks the SCENES timeline; the active scene is remounted (replaying its
// CSS entrances) whenever the scene index changes or on restart/seek. Audio,
// controls and an HD screen-capture export hang off the same clock.

const rootHost = document.getElementById('trailer');
if (!rootHost) throw new Error('#trailer not found');

// Unlock the app's audio engine on first gesture (the play gate provides it).
initAudio();

// --- Stage + layers ---------------------------------------------------------
const stage = document.createElement('div');
stage.className = 'stage relative overflow-hidden bg-base-900';
rootHost.appendChild(stage);

const sceneLayer = document.createElement('div');
sceneLayer.className = 'absolute inset-0';
stage.appendChild(sceneLayer);

const flash = document.createElement('div');
flash.className = 'k-flash';
stage.appendChild(flash);

// --- Clock / playback state -------------------------------------------------
let elapsed = 0;
let playing = false;
let run = 0; // increments on restart/seek to key remounts
let activeIndex = -1;
let current: SceneInstance | null = null;
let lastTs = 0;
let recording = false;

const cues = new CueScheduler();
let stopConfetti: (() => void) | null = null;

function mountScene(index: number): void {
  if (current?.destroy) current.destroy();
  sceneLayer.innerHTML = '';
  if (stopConfetti) {
    stopConfetti();
    stopConfetti = null;
  }
  const scene = SCENES[index];
  const mount = document.createElement('div');
  mount.className = 'absolute inset-0';
  // Keyed identity: id + run number. Reassigning innerHTML already gives fresh
  // nodes, so CSS entrance animations replay from their delays every mount.
  mount.dataset.scene = `${scene.id}:${run}`;
  sceneLayer.appendChild(mount);
  current = scene.build(mount);
  activeIndex = index;

  // Reuse the app's real confetti on the win beat.
  if (scene.id === 'win') stopConfetti = burstConfetti();

  // Between-scene white flash (skip the very first mount at t=0).
  if (elapsed > 0.01) {
    flash.classList.remove('run');
    // Force reflow so re-adding the class restarts the animation.
    void flash.offsetWidth;
    flash.classList.add('run');
  }
}

function indexForElapsed(t: number): number {
  let idx = 0;
  for (let i = 0; i < STARTS.length; i++) {
    if (t >= STARTS[i]) idx = i;
  }
  return idx;
}

function fireSceneCues(sceneT: number): void {
  // Translate the active scene's relative cues into absolute ones for the
  // one-time scheduler.
  const scene = SCENES[activeIndex];
  if (!current?.cues || current.cues.length === 0) return;
  const abs = current.cues.map((c) => ({ t: STARTS[activeIndex] + c.t, sound: c.sound }));
  cues.tick(STARTS[activeIndex] + sceneT, abs);
  void scene;
}

// --- The rAF loop -----------------------------------------------------------
function frame(ts: number): void {
  if (!playing) return;
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  elapsed += dt;

  const idx = indexForElapsed(elapsed);
  if (idx !== activeIndex) {
    mountScene(idx);
    // Reset the cue previous-marker to this scene's start so its cues fire.
    cues.setPrev(STARTS[idx]);
  }
  const sceneT = elapsed - STARTS[activeIndex];
  current?.update?.(sceneT);
  fireSceneCues(sceneT);

  updateProgressBar();

  if (elapsed >= TOTAL) {
    if (recording) {
      finishRecording();
    } else {
      pause();
      elapsed = TOTAL;
    }
    return;
  }
  requestAnimationFrame(frame);
}

function play(): void {
  if (playing) return;
  if (elapsed >= TOTAL) restart();
  playing = true;
  lastTs = 0;
  stage.classList.remove('paused');
  startMusic();
  requestAnimationFrame(frame);
  syncPlayIcon();
}

function pause(): void {
  playing = false;
  stage.classList.add('paused');
  syncPlayIcon();
}

function togglePlay(): void {
  playing ? pause() : play();
}

function restart(): void {
  elapsed = 0;
  run += 1;
  cues.reset(0);
  lastTs = 0;
  mountScene(0);
  updateProgressBar();
}

function seekScene(delta: number): void {
  const target = Math.max(0, Math.min(SCENES.length - 1, activeIndex + delta));
  elapsed = STARTS[target] + 0.0001;
  run += 1;
  cues.reset(elapsed);
  lastTs = 0;
  mountScene(target);
  updateProgressBar();
  syncSeekButtons();
}

// --- Chrome: progress bar + control cluster ---------------------------------
const chrome = document.createElement('div');
chrome.className = 'chrome';
stage.appendChild(chrome);

const bar = document.createElement('div');
bar.className = 'absolute left-0 bottom-0 h-1 bg-base-700 w-full';
const barFill = document.createElement('div');
barFill.className = 'h-full bg-accent';
barFill.style.width = '0%';
bar.appendChild(barFill);
chrome.appendChild(bar);

function updateProgressBar(): void {
  barFill.style.width = `${Math.min(100, (elapsed / TOTAL) * 100)}%`;
}

const controls = document.createElement('div');
controls.className =
  'absolute top-4 right-4 flex items-center gap-2 z-50';
chrome.appendChild(controls);

function ctrlBtn(label: string, glyph: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className =
    'flex items-center justify-center w-10 h-10 rounded-full bg-base-800/80 hover:bg-base-700 ring-1 ring-base-700 backdrop-blur-sm transition-colors text-sm';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.textContent = glyph;
  return b;
}

const muteBtn = ctrlBtn('Toggle sound', '🔊');
const prevBtn = ctrlBtn('Previous scene', '⏮');
const playBtn = ctrlBtn('Play / pause', '⏸');
const nextBtn = ctrlBtn('Next scene', '⏭');
const restartBtn = ctrlBtn('Restart', '↺');
const exportBtn = ctrlBtn('Export HD video', '⤓');
[muteBtn, prevBtn, playBtn, nextBtn, restartBtn, exportBtn].forEach((b) =>
  controls.appendChild(b),
);

function syncPlayIcon(): void {
  playBtn.textContent = playing ? '⏸' : '▶';
}
function syncMuteIcon(): void {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
}
function syncSeekButtons(): void {
  prevBtn.disabled = activeIndex <= 0;
  nextBtn.disabled = activeIndex >= SCENES.length - 1;
  prevBtn.style.opacity = prevBtn.disabled ? '0.4' : '1';
  nextBtn.style.opacity = nextBtn.disabled ? '0.4' : '1';
}
syncMuteIcon();

muteBtn.addEventListener('click', () => {
  toggleMuted();
  syncMuteIcon();
});
prevBtn.addEventListener('click', () => seekScene(-1));
nextBtn.addEventListener('click', () => seekScene(1));
playBtn.addEventListener('click', togglePlay);
restartBtn.addEventListener('click', () => {
  restart();
  play();
});
exportBtn.addEventListener('click', () => void startExport());

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'r' || e.key === 'R') {
    restart();
    play();
  } else if (e.key === 'm' || e.key === 'M') {
    toggleMuted();
    syncMuteIcon();
  } else if (e.key === 'ArrowRight') {
    seekScene(1);
  } else if (e.key === 'ArrowLeft') {
    seekScene(-1);
  }
});

// --- Click-to-play gate (autoplay + audio unlock) ---------------------------
const gate = document.createElement('div');
gate.className =
  'absolute inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-base-900 cursor-pointer text-center px-8';
const gateTitle = document.createElement('div');
gateTitle.className = 'text-white font-semibold text-[7vw] sm:text-[4vw] tracking-tight';
gateTitle.textContent = 'TileSwitch';
const gateHint = document.createElement('div');
gateHint.className =
  'flex items-center gap-3 text-slate-300 text-[3.2vw] sm:text-[1.6vw] font-medium';
gateHint.innerHTML =
  '<span class="flex items-center justify-center w-14 h-14 rounded-full bg-accent text-base-900 text-2xl">▶</span> Play trailer';
gate.appendChild(gateTitle);
gate.appendChild(gateHint);
stage.appendChild(gate);

gate.addEventListener('click', () => {
  gate.remove();
  restart();
  play();
});

// Mount the first scene paused behind the gate so the frame isn't empty.
mountScene(0);
pause();
syncSeekButtons();

// --- HD video export (browser-native, zero libraries) -----------------------
let recorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let captureStream: MediaStream | null = null;

async function startExport(): Promise<void> {
  const md = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
  if (!md?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
    alert(
      'Your browser cannot capture the tab. Use a manual screen recorder, or try a recent Chromium browser.',
    );
    return;
  }

  try {
    captureStream = await md.getDisplayMedia({
      video: { width: 1920, height: 1080, frameRate: 60 },
      // Capture tab audio, but disable the speech-tuned processing that
      // otherwise pumps the level and chews on music/SFX.
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
        channelCount: 2,
        sampleRate: 48000,
      } as MediaTrackConstraints,
      // @ts-expect-error non-standard but honoured by Chromium
      preferCurrentTab: true,
    });
  } catch {
    return; // user cancelled the share dialog
  }

  recordedChunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  recorder = new MediaRecorder(captureStream, {
    mimeType: mime,
    videoBitsPerSecond: 16_000_000,
    audioBitsPerSecond: 192_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  recorder.onstop = onRecorderStop;

  // Clean frame: fullscreen, hide chrome + cursor.
  recording = true;
  stage.classList.add('recording');
  try {
    await stage.requestFullscreen?.();
  } catch {
    /* fullscreen optional */
  }

  recorder.start();
  restart();
  play();
}

function finishRecording(): void {
  // Called from the loop once elapsed >= TOTAL while recording. Give a beat of
  // tail so the last frame + audio flush, then stop.
  pause();
  window.setTimeout(() => {
    recorder?.stop();
    captureStream?.getTracks().forEach((t) => t.stop());
  }, 400);
}

function onRecorderStop(): void {
  recording = false;
  stage.classList.remove('recording');
  if (document.fullscreenElement) void document.exitFullscreen();
  stopMusic();

  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tileswitch-trailer.webm';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  recorder = null;
  captureStream = null;
}
