// A self-solving recreation of the real puzzle board, driven by the trailer
// clock instead of pointer events. It reuses the app's REAL puzzle model and
// tile renderer (createPuzzle / paintTile / computeGrid) so tiles are
// pixel-accurate to the product, and fires the app's REAL SFX on each beat.
//
// Why a variant instead of the app's Board: the shipped Board shuffles randomly
// and only swaps in response to real pointer/drag events. The trailer needs a
// deterministic, clock-driven solve (select A → swap with B → lock, repeat →
// win) that always lands cleanly on the beat. The recipe explicitly allows a
// trailer-folder variant when you need scripted control; the visual language
// (grid ring, selected outline, settle ring + glow, win ripple) is copied
// faithfully from src/game/board.ts.

import { createPuzzle, type Piece, type Puzzle } from '../src/puzzle/model';
import { paintTile } from '../src/puzzle/render';
import { computeGrid } from '../src/puzzle/grid';
import { sfx } from './audio';

interface Slot {
  index: number;
  row: number;
  col: number;
  piece: Piece;
  el: HTMLElement;
  locked: boolean;
}

export interface SelfBoardHandle {
  el: HTMLElement;
  /** Advance the scripted solve to scene-relative time `sceneT` (seconds). */
  update: (sceneT: number) => void;
  destroy: () => void;
  readonly solved: boolean;
  /** Count of tiles currently locked in their correct cell. */
  readonly placed: number;
  /** Total tiles. */
  readonly total: number;
}

/**
 * Build a board that solves itself over `solveWindow` seconds. `onCue` lets the
 * caller fire audio through the trailer's one-time scheduler if desired; here we
 * fire SFX directly since the solve steps are internally timed.
 */
export function createSelfBoard(
  image: HTMLImageElement,
  cellSize: number,
  solveWindow: number,
): SelfBoardHandle {
  const grid = computeGrid(image.naturalWidth, image.naturalHeight, 3);
  const puzzle: Puzzle = createPuzzle(image, grid, cellSize);
  const { boardWidth, boardHeight } = puzzle;

  const el = document.createElement('div');
  el.className =
    'relative rounded-xl overflow-hidden ring-1 ring-base-700 shadow-2xl select-none';
  el.style.width = `${boardWidth}px`;
  el.style.height = `${boardHeight}px`;

  const slots: Slot[] = [];
  for (let index = 0; index < puzzle.pieces.length; index++) {
    const row = Math.floor(index / grid.cols);
    const col = index % grid.cols;
    const cell = document.createElement('div');
    cell.className = 'absolute rounded-md';
    cell.style.width = `${cellSize}px`;
    cell.style.height = `${cellSize}px`;
    cell.style.left = `${col * cellSize}px`;
    cell.style.top = `${row * cellSize}px`;
    const slot: Slot = { index, row, col, piece: puzzle.pieces[index], el: cell, locked: false };
    paintTile(cell, puzzle, slot.piece);
    el.appendChild(cell);
    slots.push(slot);
  }

  // A fixed, good-looking scramble (deterministic so the trailer is identical
  // every run). Derangement via a fixed swap chain, then a couple of pairs.
  const order = slots.map((s) => s.piece);
  const n = order.length;
  const rot: Piece[] = order.map((_, i) => order[(i + 3) % n]);
  for (let i = 0; i + 1 < n; i += 2) {
    if (Math.floor(i / 2) % 2 === 0) [rot[i], rot[i + 1]] = [rot[i + 1], rot[i]];
  }
  slots.forEach((s, i) => {
    s.piece = rot[i];
    s.locked = false;
    paintTile(s.el, puzzle, s.piece);
  });

  const isCorrect = (s: Slot) => s.piece.id === s.index;

  const paint = (selected: Slot | null) => {
    for (const s of slots) {
      if (s.locked) continue;
      const sel = s === selected;
      s.el.style.boxShadow = sel
        ? 'inset 0 0 0 4px #fbbf24, 0 8px 20px rgba(0,0,0,0.5)'
        : 'inset 0 0 0 1px rgba(15,23,42,0.55)';
      s.el.style.zIndex = sel ? '30' : '1';
    }
  };
  paint(null);

  const settle = (slot: Slot) => {
    slot.el.style.boxShadow = 'none';
    slot.el.animate(
      [
        { transform: 'scale(1.14)' },
        { transform: 'scale(0.97)' },
        { transform: 'scale(1)' },
      ],
      { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
    const ring = document.createElement('div');
    ring.className = 'absolute inset-0 pointer-events-none rounded-md';
    ring.style.boxShadow =
      'inset 0 0 0 3px rgba(56,189,248,0.9), 0 0 14px 2px rgba(56,189,248,0.55)';
    slot.el.appendChild(ring);
    const a = ring.animate(
      [
        { opacity: 0, transform: 'scale(0.2)', offset: 0 },
        { opacity: 1, transform: 'scale(0.75)', offset: 0.45 },
        { opacity: 0, transform: 'scale(1)', offset: 1 },
      ],
      { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    a.onfinish = () => ring.remove();

    const flash = document.createElement('div');
    flash.className = 'absolute inset-0 pointer-events-none';
    flash.style.background =
      'radial-gradient(circle, rgba(255,255,255,0.5), rgba(56,189,248,0.3) 55%, transparent 75%)';
    slot.el.appendChild(flash);
    const f = flash.animate(
      [
        { opacity: 0.85, transform: 'scale(0.4)' },
        { opacity: 0, transform: 'scale(1.2)' },
      ],
      { duration: 500, easing: 'ease-out' },
    );
    f.onfinish = () => flash.remove();
  };

  const glide = (elm: HTMLElement, fromX: number, fromY: number) => {
    elm.animate(
      [
        { transform: `translate(${fromX}px, ${fromY}px) scale(1)` },
        {
          transform: `translate(${fromX * 0.4}px, ${fromY * 0.4}px) scale(1.08)`,
          offset: 0.5,
        },
        { transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  };

  const swap = (a: Slot, b: Slot) => {
    const tmp = a.piece;
    a.piece = b.piece;
    b.piece = tmp;
    paintTile(a.el, puzzle, a.piece);
    paintTile(b.el, puzzle, b.piece);
    const dx = (b.col - a.col) * cellSize;
    const dy = (b.row - a.row) * cellSize;
    glide(a.el, dx, dy);
    glide(b.el, -dx, -dy);
    sfx('swap');
    for (const s of [a, b]) {
      if (isCorrect(s) && !s.locked) {
        window.setTimeout(() => {
          if (s.locked) return;
          s.locked = true;
          s.el.style.zIndex = '2';
          sfx('place');
          settle(s);
        }, 210);
      }
    }
  };

  // Precompute a solve script: an ordered list of {select, swap} steps that
  // each place at least one tile correctly, ending fully solved. We simulate the
  // swaps on a scratch layout so timings are known ahead of the clock.
  type Step = { a: number; b: number };
  const script: Step[] = [];
  {
    const cur = slots.map((s) => s.piece.id); // piece id at each slot index
    for (let target = 0; target < n; target++) {
      if (cur[target] === target) continue;
      // find where the piece that belongs at `target` currently sits
      const src = cur.indexOf(target);
      if (src === -1) continue;
      script.push({ a: target, b: src });
      [cur[target], cur[src]] = [cur[src], cur[target]];
    }
  }

  let done = 0; // steps completed
  let selectedShownFor = -1; // which step's "select" beat we've played
  let solvedFlag = false;

  // Distribute steps across the solve window with a short select→swap gap.
  const nSteps = Math.max(1, script.length);
  const stepDur = solveWindow / nSteps;
  const SELECT_LEAD = Math.min(0.28, stepDur * 0.45);

  const winRipple = () => {
    for (const s of slots) {
      const wave = s.row + s.col;
      s.el.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.12)' },
          { transform: 'scale(1)' },
        ],
        { duration: 460, delay: wave * 45, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      );
    }
  };

  const update = (sceneT: number) => {
    if (solvedFlag) return;
    // Which step are we on?
    const idx = Math.min(nSteps - 1, Math.floor(sceneT / stepDur));
    const within = sceneT - idx * stepDur;

    // Fire the "select" highlight a beat before the swap.
    if (idx < script.length && within >= SELECT_LEAD && selectedShownFor < idx) {
      selectedShownFor = idx;
      const sel = slots[script[idx].b];
      if (!sel.locked) {
        sfx('select');
        paint(sel);
      }
    }
    // Perform the swap when we cross past the select lead + a small gap.
    while (done < script.length && sceneT >= done * stepDur + stepDur * 0.7) {
      const step = script[done];
      swap(slots[step.a], slots[step.b]);
      done++;
      paint(null);
    }

    if (done >= script.length && !solvedFlag) {
      solvedFlag = true;
      sfx('win');
      winRipple();
    }
  };

  return {
    el,
    update,
    destroy: () => el.remove(),
    get solved() {
      return solvedFlag;
    },
    get placed() {
      return slots.filter((s) => s.locked).length;
    },
    get total() {
      return n;
    },
  };
}
