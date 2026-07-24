// The trailer's scene timeline. Each scene is a factory that builds its DOM
// subtree into `mount` (CSS entrance animations play on mount) and may return an
// `update(sceneT)` for clock-driven scenes and a `cues` list of absolute-less,
// scene-relative SFX beats. The runtime keys each scene on id + run number so it
// remounts (replaying entrances) on every scene change and on restart/seek.

import { K, TypeLine, Center } from './kinetic';
import { createSelfBoard, type SelfBoardHandle } from './SelfBoard';
import type { SoundName } from './audio';
import heroUrl from './hero.jpg';

export interface SceneCue {
  /** Scene-relative time (seconds). */
  t: number;
  sound: SoundName;
}

export interface SceneInstance {
  update?: (sceneT: number) => void;
  cues?: SceneCue[];
  destroy?: () => void;
}

export interface Scene {
  id: string;
  dur: number;
  build: (mount: HTMLElement) => SceneInstance;
}

// A shared, preloaded hero image so the board scene can mount instantly.
const heroImage = new Image();
heroImage.src = heroUrl;

const H1 =
  'text-white font-semibold tracking-tight leading-[0.95] text-[10vw] sm:text-[9vw]';
const H2 = 'font-semibold tracking-tight leading-tight text-[6vw] sm:text-[5vw]';
const SUB = 'text-slate-400 font-medium text-[3.2vw] sm:text-[2.4vw]';

// --- Scene 1: cold open — "Any picture." ------------------------------------
const sceneOpen: Scene = {
  id: 'open',
  dur: 2.6,
  build(mount) {
    const c = Center();
    c.appendChild(K('Any picture.', { at: 0.1, kind: 'slam', className: H1 }));
    c.appendChild(
      K('becomes a puzzle.', {
        at: 0.9,
        kind: 'rise',
        className: `${H2} text-slate-300 mt-2`,
      }),
    );
    mount.appendChild(c);
    return { cues: [{ t: 0.1, sound: 'select' }, { t: 0.9, sound: 'swap' }] };
  },
};

// --- Scene 2: the mechanic — "Shuffled. / Swap. / Rebuild." -----------------
const sceneMechanic: Scene = {
  id: 'mechanic',
  dur: 3.0,
  build(mount) {
    const c = Center('gap-1');
    c.appendChild(K('Shuffled in place.', { at: 0.05, kind: 'drop', className: H2 }));
    c.appendChild(
      K('Swap two tiles…', {
        at: 0.85,
        until: 2.7,
        kind: 'slam',
        className: `${H2} text-accent`,
      }),
    );
    c.appendChild(
      K('…rebuild the picture.', {
        at: 1.7,
        kind: 'rise',
        className: `${H2} text-slate-200`,
      }),
    );
    mount.appendChild(c);
    return {
      cues: [
        { t: 0.05, sound: 'swap' },
        { t: 0.85, sound: 'select' },
        { t: 1.7, sound: 'place' },
      ],
    };
  },
};

// --- Scene 3: THE CENTERPIECE — the real board solving itself ---------------
const sceneBoard: Scene = {
  id: 'board',
  dur: 7.0,
  build(mount) {
    const wrap = document.createElement('div');
    wrap.className =
      'absolute inset-0 flex flex-col items-center justify-center gap-5';

    // A faux app header (the real control chips), so it reads as the product.
    const header = document.createElement('div');
    header.className =
      'flex items-center gap-2 text-sm font-medium opacity-0';
    header.style.animation = 'k-rise 0.5s var(--k-ease-out) 0.15s both';
    const chip = (txt: string, cls = '') => {
      const d = document.createElement('div');
      d.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-800 tabular-nums ${cls}`;
      d.textContent = txt;
      return d;
    };
    const progressChip = chip('0 / 9', 'text-slate-200');
    header.appendChild(progressChip);
    header.appendChild(chip('0:00', 'text-slate-200'));
    wrap.appendChild(header);

    // Size the board to fill the cinema frame comfortably.
    const cell = Math.min(150, Math.floor(window.innerHeight * 0.62 / 3));
    const board: SelfBoardHandle = createSelfBoard(heroImage, cell, 5.2);
    // Board entrance: rise + slight scale, mirroring the app's reveal feel.
    board.el.style.animation = 'k-drop 0.6s var(--k-ease-pop) 0.25s both';
    wrap.appendChild(board.el);

    const caption = K('Tap. Swap. Solved.', {
      at: 0.4,
      kind: 'rise',
      className: `${SUB} text-slate-400`,
    });
    wrap.appendChild(caption);

    mount.appendChild(wrap);

    let solvedShown = false;
    return {
      update(sceneT) {
        // Start solving after the entrance settles (~0.85s in).
        const solveT = sceneT - 0.85;
        if (solveT >= 0) board.update(solveT);
        // Live progress chip, derived from locked tiles.
        progressChip.textContent = `${board.placed} / ${board.total}`;
        if (board.solved && !solvedShown) {
          solvedShown = true;
          progressChip.className =
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 tabular-nums';
        }
      },
      destroy: () => board.destroy(),
      // The board fires its own SFX internally; no external cues needed.
      cues: [],
    };
  },
};

// --- Scene 4: the win beat — "Solved!" with a flash of celebration ----------
const sceneWin: Scene = {
  id: 'win',
  dur: 2.4,
  build(mount) {
    const c = Center();
    c.appendChild(
      K('Solved.', {
        at: 0.0,
        kind: 'slam',
        className: `${H1} text-white`,
      }),
    );
    c.appendChild(
      K('Timer. Streak. Score.', {
        at: 0.7,
        kind: 'rise',
        className: `${SUB} text-slate-400 mt-3`,
      }),
    );
    mount.appendChild(c);
    return { cues: [{ t: 0.0, sound: 'win' }] };
  },
};

// --- Scene 5: personal — "Your photos." -------------------------------------
const scenePersonal: Scene = {
  id: 'personal',
  dur: 3.0,
  build(mount) {
    const c = Center('gap-2');
    const line = document.createElement('div');
    line.className = H2 + ' text-slate-200';
    line.appendChild(
      TypeLine('Your photos. Your library.', { at: 0.15, cps: 22 }),
    );
    c.appendChild(line);
    c.appendChild(
      K('Works offline. Installs like an app.', {
        at: 1.9,
        kind: 'rise',
        className: `${SUB} text-slate-400`,
      }),
    );
    mount.appendChild(c);
    return {
      cues: [
        { t: 0.15, sound: 'select' },
        { t: 1.0, sound: 'select' },
        { t: 1.9, sound: 'place' },
      ],
    };
  },
};

// --- Scene 6: end card — wordmark + tagline + CTA ---------------------------
const sceneEnd: Scene = {
  id: 'end',
  dur: 3.4,
  build(mount) {
    const c = Center('gap-4');
    c.appendChild(
      K('TileSwitch', {
        at: 0.1,
        kind: 'drop',
        className: `${H1} text-white`,
      }),
    );
    c.appendChild(
      K('Swap the tiles. Rebuild the picture.', {
        at: 0.8,
        kind: 'rise',
        className: `${SUB} text-slate-300`,
      }),
    );
    const cta = document.createElement('div');
    cta.className =
      'mt-4 px-6 py-3 rounded-full bg-accent text-base-900 font-semibold text-[2.4vw] sm:text-[1.6vw] opacity-0';
    cta.style.animation = 'k-drop 0.55s var(--k-ease-pop) 1.5s both';
    cta.textContent = 'github.com/zhnuksyh/tileswitch';
    c.appendChild(cta);
    mount.appendChild(c);
    return { cues: [{ t: 0.1, sound: 'swap' }, { t: 0.8, sound: 'place' }, { t: 1.5, sound: 'win' }] };
  },
};

export const SCENES: Scene[] = [
  sceneOpen,
  sceneMechanic,
  sceneBoard,
  sceneWin,
  scenePersonal,
  sceneEnd,
];

// Derived timeline: absolute start of each scene, and total duration.
export const STARTS: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const s of SCENES) {
    out.push(acc);
    acc += s.dur;
  }
  return out;
})();

export const TOTAL = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].dur;
