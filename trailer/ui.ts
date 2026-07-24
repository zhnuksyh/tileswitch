// Faithful, static recreations of the app's real menu surfaces (main menu,
// library grid + add-your-own, history, difficulty selector), built with the
// EXACT class strings from src/ui/setup.ts so they're pixel-accurate to the
// product. They're rebuilt here (rather than importing renderSetup) because the
// real setup is stateful and wired to IndexedDB; the trailer needs lightweight,
// scripted surfaces it can drive from the scene clock. The recipe sanctions a
// trailer-folder variant when scripted control is needed.

import { icon, icons } from '../src/ui/icons';
import { DIFFICULTIES } from '../src/game/difficulty';

import heroUrl from './hero.jpg';
import libAstro from './lib-astronauts-at-sunset.jpg';
import libJungle from './lib-jungle-treehouse.jpg';
import libCastle from './lib-moonlit-castle.jpg';
import libPlanets from './lib-planets-and-stars.jpg';

export const LIB = [
  { src: heroUrl, title: 'Cosmic Vortex' },
  { src: libAstro, title: 'Astronauts at Sunset' },
  { src: libPlanets, title: 'Planets & Stars' },
  { src: libCastle, title: 'Moonlit Castle' },
  { src: libJungle, title: 'Jungle Treehouse' },
];

// --- Shared class strings, lifted verbatim from src/ui/setup.ts -------------
const CARD = 'flex flex-col gap-4 p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';
const CARD_TITLE = 'text-sm font-semibold text-slate-200';

function thumbClass(selected: boolean): string {
  const base =
    'relative aspect-video rounded-xl overflow-hidden bg-base-900 ring-1 transition-all duration-200 ease-out group';
  return selected ? `${base} ring-2 ring-accent` : `${base} ring-base-700`;
}

function diffClass(active: boolean): string {
  const base =
    'flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-xl transition-colors';
  return active
    ? `${base} bg-accent text-base-900`
    : `${base} bg-base-700 text-slate-200`;
}

/** A single library thumbnail (image + gradient title bar). */
export function thumb(src: string, title: string, selected = false): HTMLElement {
  const btn = document.createElement('div');
  btn.className = thumbClass(selected);
  const img = document.createElement('img');
  img.className = 'w-full h-full object-cover';
  img.src = src;
  img.alt = title;
  btn.appendChild(img);
  const label = document.createElement('span');
  label.className =
    'absolute inset-x-0 bottom-0 px-2 py-1 text-[11px] font-medium text-white text-left bg-gradient-to-t from-black/70 to-transparent truncate';
  label.textContent = title;
  btn.appendChild(label);
  return btn;
}

/** The dashed "Add image" tile from the placeholder grid. */
export function addTile(): HTMLElement {
  const btn = document.createElement('div');
  btn.className =
    'flex flex-col items-center justify-center gap-1 aspect-video rounded-xl bg-base-900 border-2 border-dashed border-base-600 text-slate-300 transition-all duration-200 ease-out';
  btn.appendChild(icon(icons.upload, 'w-6 h-6'));
  const label = document.createElement('span');
  label.className = 'text-xs font-semibold';
  label.textContent = 'Add image';
  btn.appendChild(label);
  return btn;
}

export interface MenuHandle {
  el: HTMLElement;
  /** The Add-image tile, so a scene can swap in a real photo mid-shot. */
  addCell: HTMLElement;
  grid: HTMLElement;
  previewImg: HTMLImageElement;
  startBtn: HTMLElement;
  diffButtons: HTMLElement[];
}

/**
 * A compact recreation of the main menu: title, preview, a library grid with an
 * Add-image tile, a difficulty selector, and the Start button. Sized to sit in
 * the cinema frame. The caller drives selection/highlights from the clock.
 */
export function buildMenu(): MenuHandle {
  const wrap = document.createElement('div');
  wrap.className =
    'w-full max-w-5xl mx-auto flex flex-col gap-5 scale-[0.92] origin-center';

  // Title
  const header = document.createElement('div');
  header.className = 'flex flex-col items-center gap-1 text-center';
  const h1 = document.createElement('h1');
  h1.className = 'text-3xl font-semibold tracking-tight text-white';
  h1.textContent = 'TileSwitch';
  const sub = document.createElement('p');
  sub.className = 'text-slate-400 text-sm';
  sub.textContent = 'Swap the tiles to rebuild the picture.';
  header.appendChild(h1);
  header.appendChild(sub);
  wrap.appendChild(header);

  const row1 = document.createElement('div');
  row1.className = 'grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-stretch';
  wrap.appendChild(row1);

  // Preview card
  const previewCard = document.createElement('div');
  previewCard.className = 'flex flex-col p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';
  const preview = document.createElement('div');
  preview.className =
    'relative w-full flex-1 min-h-[10rem] rounded-2xl overflow-hidden bg-base-900 ring-1 ring-base-700';
  const previewImg = document.createElement('img');
  previewImg.className = 'absolute inset-0 w-full h-full object-cover';
  previewImg.src = LIB[0].src;
  preview.appendChild(previewImg);
  previewCard.appendChild(preview);
  row1.appendChild(previewCard);

  // Library card
  const libraryCard = document.createElement('div');
  libraryCard.className = CARD;
  const libHead = document.createElement('div');
  libHead.className = 'flex items-center justify-between gap-3';
  const libTitle = document.createElement('span');
  libTitle.className = CARD_TITLE;
  libTitle.textContent = 'Choose an image';
  const shuffleBtn = document.createElement('div');
  shuffleBtn.className =
    'flex items-center gap-2 px-4 py-2 rounded-full bg-base-700 text-xs font-semibold';
  shuffleBtn.appendChild(icon(icons.shuffle, 'w-4 h-4'));
  shuffleBtn.appendChild(document.createTextNode('Shuffle'));
  libHead.appendChild(libTitle);
  libHead.appendChild(shuffleBtn);
  libraryCard.appendChild(libHead);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-3';
  LIB.forEach((im, i) => grid.appendChild(thumb(im.src, im.title, i === 0)));
  const addCell = addTile();
  grid.appendChild(addCell);
  libraryCard.appendChild(grid);

  const note = document.createElement('p');
  note.className = 'text-[11px] text-slate-500';
  note.textContent = 'Placeholder set — add your own images to make it yours';
  libraryCard.appendChild(note);
  row1.appendChild(libraryCard);

  // Row 2: difficulty + start
  const row2 = document.createElement('div');
  row2.className = 'grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-stretch';
  wrap.appendChild(row2);

  // (left) a small history teaser card so the menu reads complete
  const histCard = document.createElement('div');
  histCard.className = 'flex flex-col gap-3 p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';
  const histTitle = document.createElement('span');
  histTitle.className = CARD_TITLE;
  histTitle.textContent = 'History';
  histCard.appendChild(histTitle);
  const histGrid = document.createElement('div');
  histGrid.className = 'grid grid-cols-3 gap-3';
  [LIB[1], LIB[2], LIB[3]].forEach((im) => histGrid.appendChild(thumb(im.src, im.title)));
  histCard.appendChild(histGrid);
  row2.appendChild(histCard);

  const rightCol = document.createElement('div');
  rightCol.className = 'flex flex-col gap-5';

  const diffSection = document.createElement('div');
  diffSection.className = 'flex flex-col gap-2 p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';
  const diffLabel = document.createElement('span');
  diffLabel.className = CARD_TITLE;
  diffLabel.textContent = 'Difficulty';
  diffSection.appendChild(diffLabel);
  const diffRow = document.createElement('div');
  diffRow.className = 'grid grid-cols-4 gap-2';
  const diffButtons: HTMLElement[] = [];
  DIFFICULTIES.forEach((d, i) => {
    const b = document.createElement('div');
    b.className = diffClass(i === 0);
    const name = document.createElement('span');
    name.className = 'text-sm font-semibold';
    name.textContent = d.label;
    const hint = document.createElement('span');
    hint.className = 'text-[11px] opacity-70 tabular-nums';
    hint.textContent = d.hint;
    b.appendChild(name);
    b.appendChild(hint);
    diffButtons.push(b);
    diffRow.appendChild(b);
  });
  diffSection.appendChild(diffRow);
  rightCol.appendChild(diffSection);

  const startBtn = document.createElement('div');
  startBtn.className =
    'flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-accent text-base-900 font-semibold shadow-lg shadow-black/40';
  startBtn.appendChild(icon(icons.puzzle, 'w-5 h-5'));
  startBtn.appendChild(document.createTextNode('Start Puzzle'));
  rightCol.appendChild(startBtn);
  row2.appendChild(rightCol);

  return { el: wrap, addCell, grid, previewImg, startBtn, diffButtons };
}

/** Set the active difficulty button (repaints all four). */
export function setActiveDiff(buttons: HTMLElement[], index: number): void {
  buttons.forEach((b, i) => {
    b.className = diffClass(i === index);
  });
}

// --- History surface ---------------------------------------------------------
// A recently-played grid where each card carries a solve-time + difficulty
// footer, mirroring the app's History card.
export interface HistoryEntry {
  src: string;
  title: string;
  time: string;
  difficulty: string;
}

export function buildHistoryGrid(entries: HistoryEntry[]): HTMLElement {
  const card = document.createElement('div');
  card.className = CARD + ' w-full max-w-3xl mx-auto';
  const title = document.createElement('span');
  title.className = CARD_TITLE;
  title.textContent = 'History';
  card.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-3';
  entries.forEach((e, i) => {
    const cell = document.createElement('div');
    cell.className =
      'flex flex-col rounded-xl overflow-hidden bg-base-900 ring-1 ring-base-700 opacity-0';
    cell.style.animation = `k-drop 0.5s var(--k-ease-pop) ${0.15 + i * 0.12}s both`;

    const imgWrap = document.createElement('div');
    imgWrap.className = 'relative aspect-video';
    const img = document.createElement('img');
    img.className = 'absolute inset-0 w-full h-full object-cover';
    img.src = e.src;
    img.alt = e.title;
    imgWrap.appendChild(img);
    const cap = document.createElement('span');
    cap.className =
      'absolute inset-x-0 bottom-0 px-2 py-1 text-[11px] font-medium text-white text-left bg-gradient-to-t from-black/70 to-transparent truncate';
    cap.textContent = e.title;
    imgWrap.appendChild(cap);
    cell.appendChild(imgWrap);

    const footer = document.createElement('div');
    footer.className =
      'flex items-center justify-between gap-2 px-2.5 py-2 text-[11px] text-slate-400 tabular-nums';
    const t = document.createElement('span');
    t.className = 'flex items-center gap-1 text-slate-200 font-semibold';
    t.appendChild(icon(icons.timer, 'w-3 h-3'));
    t.appendChild(document.createTextNode(e.time));
    const d = document.createElement('span');
    d.textContent = e.difficulty;
    footer.appendChild(t);
    footer.appendChild(d);
    cell.appendChild(footer);
    grid.appendChild(cell);
  });
  card.appendChild(grid);
  return card;
}

// --- Difficulty-difference board: a bare grid overlay for a given base tiles --
// Reuses computeGrid semantics: base tiles along the shorter side. We draw the
// hero image with a grid of gaps so the tile fineness is obvious at a glance.
export function buildDiffBoard(baseTiles: number, boardPx: number): HTMLElement {
  // Hero is landscape 16:9-ish; base along shorter (vertical) side.
  const rows = baseTiles;
  const cols = Math.round(baseTiles * (16 / 9));
  const cellH = boardPx / rows;
  const cellW = cellH; // square tiles
  const el = document.createElement('div');
  el.className = 'relative rounded-xl overflow-hidden ring-1 ring-base-700 shadow-2xl';
  el.style.width = `${cols * cellW}px`;
  el.style.height = `${rows * cellH}px`;
  el.style.backgroundImage = `url(${heroUrl})`;
  el.style.backgroundSize = `${cols * cellW}px ${rows * cellH}px`;

  // Grid lines overlay.
  const overlay = document.createElement('div');
  overlay.className = 'absolute inset-0';
  overlay.style.backgroundImage =
    'linear-gradient(to right, rgba(10,10,10,0.85) 2px, transparent 2px),' +
    'linear-gradient(to bottom, rgba(10,10,10,0.85) 2px, transparent 2px)';
  overlay.style.backgroundSize = `${cellW}px ${cellH}px`;
  el.appendChild(overlay);
  return el;
}
