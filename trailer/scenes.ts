// The trailer's scene timeline. Each scene is a factory that builds its DOM
// subtree into `mount` (CSS entrance animations play on mount) and may return an
// `update(sceneT)` for clock-driven scenes and a `cues` list of absolute-less,
// scene-relative SFX beats. The runtime keys each scene on id + run number so it
// remounts (replaying entrances) on every scene change and on restart/seek.

import { K, TypeLine, Center } from './kinetic';
import { createSelfBoard, type SelfBoardHandle } from './SelfBoard';
import { buildMenu, buildHistoryGrid, buildDiffBoard, thumb, LIB } from './ui';
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

// --- Scene: the real main menu appears --------------------------------------
const sceneMenu: Scene = {
  id: 'menu',
  dur: 3.6,
  build(mount) {
    const wrap = document.createElement('div');
    wrap.className = 'absolute inset-0 flex flex-col items-center justify-center gap-4 px-6';

    const label = K('This is the menu.', {
      at: 0.0,
      until: 1.4,
      kind: 'drop',
      className: `${H2} text-white absolute z-10`,
    });
    wrap.appendChild(label);

    const menu = buildMenu();
    // The whole menu rises in and settles behind the fading label.
    menu.el.style.animation = 'k-rise 0.6s var(--k-ease-out) 0.55s both';
    wrap.appendChild(menu.el);
    mount.appendChild(wrap);

    return {
      cues: [
        { t: 0.0, sound: 'select' },
        { t: 0.55, sound: 'swap' },
        { t: 1.9, sound: 'place' },
      ],
    };
  },
};

// --- Scene: add your own picture to the library -----------------------------
const sceneAdd: Scene = {
  id: 'add',
  dur: 4.0,
  build(mount) {
    const wrap = document.createElement('div');
    wrap.className = 'absolute inset-0 flex flex-col items-center justify-center gap-5 px-6';

    const caption = K('Add your own photos.', {
      at: 0.0,
      kind: 'drop',
      className: `${H2} text-white`,
    });
    wrap.appendChild(caption);

    const menu = buildMenu();
    menu.el.style.animation = 'k-rise 0.5s var(--k-ease-out) 0.2s both';
    wrap.appendChild(menu.el);
    mount.appendChild(wrap);

    // A floating photo that drops into the "Add image" tile, then becomes a new
    // library thumbnail — the "adding your own picture" beat.
    const flyer = document.createElement('div');
    flyer.className =
      'fixed z-40 rounded-xl overflow-hidden ring-2 ring-accent shadow-2xl pointer-events-none';
    flyer.style.width = '150px';
    flyer.style.aspectRatio = '16 / 9';
    const flyImg = document.createElement('img');
    flyImg.className = 'w-full h-full object-cover';
    flyImg.src = LIB[4].src; // jungle treehouse — the "new" upload
    flyer.appendChild(flyImg);
    flyer.style.opacity = '0';
    mount.appendChild(flyer);

    let dropped = false;
    let addedThumb = false;

    return {
      update(sceneT) {
        // Animate the flyer from top-center down onto the Add tile between
        // t≈1.2s and t≈2.2s using the tile's live rect.
        const rect = menu.addCell.getBoundingClientRect();
        if (rect.width === 0) return; // not laid out yet
        const startY = window.innerHeight * 0.12;
        const startX = window.innerWidth / 2 - 75;
        const endX = rect.left + rect.width / 2 - 75;
        const endY = rect.top + rect.height / 2 - (150 * 9) / 16 / 2;

        const t0 = 1.2;
        const t1 = 2.2;
        if (sceneT < t0) {
          flyer.style.opacity = '0';
        } else if (sceneT <= t1) {
          const p = (sceneT - t0) / (t1 - t0);
          const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
          flyer.style.opacity = '1';
          flyer.style.left = `${startX + (endX - startX) * e}px`;
          flyer.style.top = `${startY + (endY - startY) * e}px`;
          flyer.style.transform = `scale(${1 - 0.35 * e})`;
        } else {
          // Landed: hide the flyer, turn the Add tile into the real thumbnail.
          if (!dropped) {
            dropped = true;
            flyer.style.opacity = '0';
          }
          if (!addedThumb && sceneT > t1 + 0.05) {
            addedThumb = true;
            const newThumb = thumb(LIB[4].src, LIB[4].title, true);
            newThumb.style.animation = 'k-drop 0.4s var(--k-ease-pop) both';
            menu.addCell.replaceWith(newThumb);
          }
        }
      },
      cues: [
        { t: 0.0, sound: 'select' },
        { t: 1.2, sound: 'swap' },
        { t: 2.2, sound: 'place' },
      ],
    };
  },
};

// --- Scene: difficulty changes the grid -------------------------------------
const sceneDifficulty: Scene = {
  id: 'difficulty',
  dur: 4.2,
  build(mount) {
    const wrap = document.createElement('div');
    wrap.className = 'absolute inset-0 flex flex-col items-center justify-center gap-6';

    wrap.appendChild(
      K('Pick your difficulty.', { at: 0.0, kind: 'drop', className: `${H2} text-white` }),
    );

    const boardPx = Math.min(360, window.innerHeight * 0.46);
    const compare = document.createElement('div');
    compare.className = 'flex items-end justify-center gap-8 sm:gap-14';

    const makeCol = (baseTiles: number, label: string, hint: string, at: number) => {
      const col = document.createElement('div');
      col.className = 'flex flex-col items-center gap-2 opacity-0';
      col.style.animation = `k-drop 0.55s var(--k-ease-pop) ${at}s both`;
      col.appendChild(buildDiffBoard(baseTiles, boardPx));
      const cap = document.createElement('div');
      cap.className = 'flex items-center gap-2';
      const name = document.createElement('span');
      name.className = 'px-3 py-1 rounded-full bg-accent text-base-900 text-sm font-semibold';
      name.textContent = label;
      const h = document.createElement('span');
      h.className = 'text-slate-400 text-sm tabular-nums font-medium';
      h.textContent = hint;
      cap.appendChild(name);
      cap.appendChild(h);
      col.appendChild(cap);
      return col;
    };

    compare.appendChild(makeCol(4, 'Easy', '4 × 7', 0.5));
    compare.appendChild(makeCol(8, 'Expert', '8 × 14', 1.1));
    wrap.appendChild(compare);
    mount.appendChild(wrap);

    return {
      cues: [
        { t: 0.0, sound: 'select' },
        { t: 0.5, sound: 'place' },
        { t: 1.1, sound: 'place' },
      ],
    };
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
        kind: 'drop',
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

// --- Scene: history — every solve is kept -----------------------------------
const sceneHistory: Scene = {
  id: 'history',
  dur: 3.8,
  build(mount) {
    const wrap = document.createElement('div');
    wrap.className = 'absolute inset-0 flex flex-col items-center justify-center gap-6 px-6';
    wrap.appendChild(
      K('Every solve, remembered.', { at: 0.0, kind: 'drop', className: `${H2} text-white` }),
    );
    const grid = buildHistoryGrid([
      { src: LIB[0].src, title: 'Cosmic Vortex', time: '1:12', difficulty: 'Easy' },
      { src: LIB[2].src, title: 'Planets & Stars', time: '2:47', difficulty: 'Medium' },
      { src: LIB[3].src, title: 'Moonlit Castle', time: '4:03', difficulty: 'Hard' },
    ]);
    wrap.appendChild(grid);
    wrap.appendChild(
      K('Times, notes, and difficulty — saved to each image.', {
        at: 1.9,
        kind: 'rise',
        className: `${SUB} text-slate-400`,
      }),
    );
    mount.appendChild(wrap);
    return {
      cues: [
        { t: 0.0, sound: 'select' },
        { t: 0.27, sound: 'place' },
        { t: 0.39, sound: 'place' },
        { t: 0.51, sound: 'place' },
      ],
    };
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
      'mt-4 flex items-center gap-2.5 px-6 py-3 rounded-full bg-accent text-base-900 font-semibold text-[2.4vw] sm:text-[1.6vw] opacity-0';
    cta.style.animation = 'k-drop 0.55s var(--k-ease-pop) 1.5s both';
    // GitHub mark, inline (lucide has no brand glyph). Sized in em so it tracks
    // the CTA's responsive font-size; currentColor matches the base-900 text.
    cta.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="w-[1.4em] h-[1.4em] shrink-0"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.15 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/></svg>' +
      '<span>github.com/zhnuksyh/tileswitch</span>';
    c.appendChild(cta);
    mount.appendChild(c);
    return { cues: [{ t: 0.1, sound: 'swap' }, { t: 0.8, sound: 'place' }, { t: 1.5, sound: 'win' }] };
  },
};

export const SCENES: Scene[] = [
  sceneOpen, // "Any picture."
  sceneMenu, // the real main menu
  sceneAdd, // add your own photo to the library
  sceneDifficulty, // Easy vs Expert grid fineness
  sceneMechanic, // shuffle / swap / rebuild
  sceneBoard, // the board solving itself (centerpiece)
  sceneWin, // "Solved."
  sceneHistory, // recently-played history with times
  scenePersonal, // offline / installs
  sceneEnd, // wordmark + CTA
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
