import { createPuzzle } from '../puzzle/model';
import type { Piece, Puzzle } from '../puzzle/model';
import { paintTile } from '../puzzle/render';
import type { GridSize } from '../puzzle/grid';
import { animate, prefersReducedMotion } from '../ui/motion';
import { play } from '../audio/sfx';

// The playable board: the image is chopped into a grid of square tiles, all
// shuffled in place so they fill the grid. Players swap tiles to sort them:
// tap tile A then tile B to swap, or drag one tile onto another.
//
// When a tile lands in its correct cell it LOCKS: it settles with an animation,
// sheds its grid styling (rounding/border) so it visually merges into the
// picture, and can no longer be moved or selected. The remaining loose tiles
// keep their grid look. The puzzle is solved when every tile is locked.
//
// Each slot is a fixed cell in the grid with its own element. Swapping two
// slots exchanges which piece each shows — the elements never move, we just
// repaint their image region. Swaps animate with a FLIP-style glide.

export interface BoardCallbacks {
  onProgress: (correct: number, total: number) => void;
  onWin: () => void;
  /** Fired each time the player completes a swap (for move counting). */
  onMove?: (moves: number) => void;
  /** Fired once the reveal ends and the shuffled puzzle becomes playable. */
  onReady?: () => void;
}

interface Slot {
  /** Grid cell index this slot represents (row-major). */
  index: number;
  row: number;
  col: number;
  /** The piece currently shown in this slot. */
  piece: Piece;
  el: HTMLElement;
  /** True once the correct piece is placed here — frozen and merged in. */
  locked: boolean;
}

const LOOSE_CLASS =
  'absolute cursor-pointer rounded-md transition-shadow duration-150';
const LOCKED_CLASS = 'absolute cursor-default';

export class Board {
  private puzzle: Puzzle;
  private root: HTMLElement;
  private gridEl!: HTMLElement;
  private slots: Slot[] = [];
  private selected: Slot | null = null;
  private solved = false;
  private started = false;
  private moves = 0;
  /** Reveal "breathe" animations, cancelled before the scramble travel runs. */
  private revealAnims: Animation[] = [];
  /** True while a peek overlay is showing, to block overlapping peeks. */
  private peeking = false;

  // Drag state (drag-to-swap).
  private dragging: Slot | null = null;
  private ghost: HTMLElement | null = null;
  private dragMoved = false;
  private startX = 0;
  private startY = 0;

  constructor(
    root: HTMLElement,
    image: HTMLImageElement,
    grid: GridSize,
    cellSize: number,
    private cb: BoardCallbacks,
  ) {
    this.root = root;
    this.puzzle = createPuzzle(image, grid, cellSize);
    this.build();
  }

  get total(): number {
    return this.puzzle.pieces.length;
  }

  private build(): void {
    const { boardWidth, boardHeight, cellSize, grid } = this.puzzle;
    this.root.innerHTML = '';

    const gridEl = document.createElement('div');
    gridEl.className =
      'relative rounded-xl overflow-hidden ring-1 ring-base-700 shadow-2xl select-none touch-none';
    gridEl.style.width = `${boardWidth}px`;
    gridEl.style.height = `${boardHeight}px`;
    this.gridEl = gridEl;
    this.root.appendChild(gridEl);

    // Build in SOLVED order first: piece i sits in cell i. We reveal this
    // finished picture briefly in start() before scrambling, so the player sees
    // the goal. Interaction stays disabled until the shuffle completes.
    for (let index = 0; index < this.puzzle.pieces.length; index++) {
      const row = Math.floor(index / grid.cols);
      const col = index % grid.cols;
      const el = document.createElement('div');
      el.className = LOCKED_CLASS; // no grid styling during the reveal
      el.style.width = `${cellSize}px`;
      el.style.height = `${cellSize}px`;
      el.style.left = `${col * cellSize}px`;
      el.style.top = `${row * cellSize}px`;

      const slot: Slot = {
        index,
        row,
        col,
        piece: this.puzzle.pieces[index],
        el,
        locked: false,
      };
      paintTile(el, this.puzzle, slot.piece);
      el.addEventListener('pointerdown', (e) => this.onPointerDown(e, slot));
      gridEl.appendChild(el);
      this.slots.push(slot);
    }

    this.cb.onProgress(0, this.total);
  }

  /**
   * Show the completed picture for a beat, then scramble into the playable
   * shuffled state. Returns once the puzzle is live. `revealMs` is how long the
   * solved image is held before shuffling.
   */
  start(revealMs = 1200): void {
    if (this.started) return;
    this.started = true;

    const scramble = () => this.scramble();
    if (prefersReducedMotion()) {
      // No hold animation, but still give a brief glimpse.
      window.setTimeout(scramble, Math.min(revealMs, 600));
      return;
    }
    // Gentle "breathe" on the finished image so the reveal reads as intentional.
    // Ends a hair before the scramble so it can't overlap the travel animation.
    const breatheMs = Math.max(0, revealMs - 60);
    this.revealAnims = this.slots.map((slot) =>
      slot.el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }],
        { duration: breatheMs, easing: 'ease-in-out' },
      ),
    );
    window.setTimeout(scramble, revealMs);
  }

  /** Shuffle the pieces across slots and hand control to the player. */
  private scramble(): void {
    const { cellSize } = this.puzzle;

    // Stop the reveal breathe so it can't fight the travel animation below
    // (overlapping transforms on the same element are what made it stutter).
    for (const anim of this.revealAnims) anim.cancel();
    this.revealAnims = [];

    // Remember where each piece sits now (its solved cell) so we can animate
    // it travelling to wherever it lands after the shuffle.
    const fromCell = new Map<number, { row: number; col: number }>();
    for (const slot of this.slots) {
      fromCell.set(slot.piece.id, { row: slot.row, col: slot.col });
    }

    const order = this.slots.map((s) => s.piece);
    do {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    } while (order.every((p, i) => p.id === i) && order.length > 1);

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.piece = order[i];
      slot.locked = false;
      slot.el.className = LOOSE_CLASS;
      slot.el.style.width = `${cellSize}px`;
      slot.el.style.height = `${cellSize}px`;
      paintTile(slot.el, this.puzzle, slot.piece);
    }

    // Lock any tile that happens to land correctly (no animation).
    for (const slot of this.slots) {
      if (this.isCorrect(slot)) this.lock(slot, false);
    }

    this.paintSlots();
    this.playScramble(fromCell);
    play('swap');
    this.cb.onProgress(this.lockedCount(), this.total);
    this.cb.onReady?.();
  }

  /**
   * FLIP travel: every tile now shows a piece that belonged to some other cell.
   * Animate each from that origin cell to its new home so the solved picture
   * visibly flies apart into the shuffled layout. Distance drives a subtle
   * stagger + lift so far-travelling tiles read as sweeping across the board.
   */
  private playScramble(fromCell: Map<number, { row: number; col: number }>): void {
    if (prefersReducedMotion()) return;
    const { cellSize } = this.puzzle;
    for (const slot of this.slots) {
      const from = fromCell.get(slot.piece.id);
      if (!from) continue;
      const dx = (from.col - slot.col) * cellSize;
      const dy = (from.row - slot.row) * cellSize;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;
      // Farther tiles start a touch later, for a sweeping cascade.
      const delay = Math.min(140, dist * 0.28);
      // Lift moving tiles above their neighbours so they glide cleanly over,
      // then drop back to the base stacking once settled.
      slot.el.style.zIndex = '20';
      const anim = slot.el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 460,
          delay,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'backwards',
        },
      );
      anim.onfinish = () => {
        if (!slot.locked) slot.el.style.zIndex = '1';
      };
    }
  }

  /** Moves made so far — 0 means the player hasn't touched the puzzle yet. */
  get progress(): number {
    return this.moves;
  }

  private lockedCount(): number {
    return this.slots.filter((s) => s.locked).length;
  }

  private isCorrect(slot: Slot): boolean {
    return slot.piece.id === slot.index;
  }

  /** Only loose (unlocked) slots participate in selection and swapping. */
  private paintSlots(): void {
    for (const slot of this.slots) {
      if (slot.locked) continue;
      const isSel = this.selected === slot;
      // Selected tiles get a thick bright outline; loose tiles keep a faint
      // separating border so they read as movable pieces.
      slot.el.style.boxShadow = isSel
        ? 'inset 0 0 0 4px #fbbf24, 0 8px 20px rgba(0,0,0,0.5)'
        : 'inset 0 0 0 1px rgba(15,23,42,0.55)';
      slot.el.style.transform = 'scale(1)';
      slot.el.style.zIndex = isSel ? '30' : '1';
    }
  }

  /**
   * Freeze a correctly-placed slot: strip its grid styling so it merges into
   * the picture, disable interaction, and (optionally) play a settle animation.
   */
  private lock(slot: Slot, celebrate: boolean): void {
    slot.locked = true;
    slot.el.className = LOCKED_CLASS;
    slot.el.style.boxShadow = 'none';
    slot.el.style.transform = 'scale(1)';
    slot.el.style.zIndex = '2';

    if (celebrate) this.settle(slot);
  }

  /** Satisfying "click into place" when a piece locks. */
  private settle(slot: Slot): void {
    play('place');
    // Quick press-down then settle, so it feels like it snaps into the image.
    animate(
      slot.el,
      [
        { transform: 'scale(1.14)' },
        { transform: 'scale(0.97)' },
        { transform: 'scale(1)' },
      ],
      { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );

    // Confirmation ring: a bright outline that grows from the centre outward to
    // the tile edge, then fades — a "sealed into place" beat.
    const ring = document.createElement('div');
    ring.className = 'absolute inset-0 pointer-events-none rounded-md';
    ring.style.boxShadow =
      'inset 0 0 0 3px rgba(56,189,248,0.9), 0 0 14px 2px rgba(56,189,248,0.55)';
    ring.style.zIndex = '5';
    slot.el.appendChild(ring);
    const ringAnim = animate(
      ring,
      [
        { opacity: 0, transform: 'scale(0.2)', offset: 0 },
        { opacity: 1, transform: 'scale(0.75)', offset: 0.45 },
        { opacity: 0, transform: 'scale(1)', offset: 1 },
      ],
      { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    if (ringAnim) ringAnim.onfinish = () => ring.remove();
    else ring.remove();

    // A soft glow that blooms from the centre and fades as it becomes image.
    const flash = document.createElement('div');
    flash.className = 'absolute inset-0 pointer-events-none';
    flash.style.background =
      'radial-gradient(circle, rgba(255,255,255,0.5), rgba(56,189,248,0.3) 55%, transparent 75%)';
    slot.el.appendChild(flash);
    const anim = animate(
      flash,
      [
        { opacity: 0.85, transform: 'scale(0.4)' },
        { opacity: 0, transform: 'scale(1.2)' },
      ],
      { duration: 500, easing: 'ease-out' },
    );
    if (anim) anim.onfinish = () => flash.remove();
    else flash.remove();
  }

  private onPointerDown(e: PointerEvent, slot: Slot): void {
    if (!this.started || this.solved || slot.locked) return;
    e.preventDefault();
    this.dragging = slot;
    this.dragMoved = false;
    this.startX = e.clientX;
    this.startY = e.clientY;
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (!this.dragMoved && Math.hypot(dx, dy) < 6) return;

    const { cellSize } = this.puzzle;
    if (!this.dragMoved) {
      this.dragMoved = true;
      // Create a floating ghost that mirrors the dragged tile.
      const ghost = this.dragging.el.cloneNode(true) as HTMLElement;
      ghost.style.position = 'fixed';
      ghost.style.margin = '0';
      ghost.style.width = `${cellSize}px`;
      ghost.style.height = `${cellSize}px`;
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '80';
      ghost.style.transform = 'scale(1.08)';
      ghost.style.borderRadius = '8px';
      ghost.style.boxShadow =
        '0 16px 30px rgba(0,0,0,0.6), 0 0 20px rgba(56,189,248,0.5)';
      document.body.appendChild(ghost);
      this.ghost = ghost;
      this.dragging.el.style.opacity = '0.25';
    }
    if (this.ghost) {
      const rect = this.gridEl.getBoundingClientRect();
      this.ghost.style.left = `${rect.left + this.dragging.col * cellSize + dx}px`;
      this.ghost.style.top = `${rect.top + this.dragging.row * cellSize + dy}px`;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    const source = this.dragging;
    this.dragging = null;
    if (!source) return;

    if (this.dragMoved) {
      // Drag-to-swap: swap with whatever loose slot we dropped onto.
      if (this.ghost) {
        this.ghost.remove();
        this.ghost = null;
      }
      source.el.style.opacity = '';
      const target = this.slotAtPoint(e.clientX, e.clientY);
      if (target && target !== source && !target.locked) {
        this.swap(source, target);
      } else {
        play('invalid');
      }
      this.selected = null;
      this.paintSlots();
      return;
    }

    // Tap-to-swap: first tap selects, second tap swaps.
    if (!this.selected) {
      this.selected = source;
      play('select');
      this.nudge(source);
    } else if (this.selected === source) {
      this.selected = null;
      play('select');
      this.nudge(source);
    } else {
      this.swap(this.selected, source);
      this.selected = null;
    }
    this.paintSlots();
  };

  /** Small springy bob when a tile is tapped, for tactile feedback. */
  private nudge(slot: Slot): void {
    if (prefersReducedMotion()) return;
    slot.el.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.09)' },
        { transform: 'scale(0.98)' },
        { transform: 'scale(1)' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  }

  private slotAtPoint(x: number, y: number): Slot | null {
    const rect = this.gridEl.getBoundingClientRect();
    const { cellSize, grid } = this.puzzle;
    const col = Math.floor((x - rect.left) / cellSize);
    const row = Math.floor((y - rect.top) / cellSize);
    if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) return null;
    const index = row * grid.cols + col;
    return this.slots.find((s) => s.index === index) ?? null;
  }

  /** Exchange the pieces shown by two slots, animate the glide, and repaint. */
  private swap(a: Slot, b: Slot): void {
    this.moves += 1;
    this.cb.onMove?.(this.moves);
    const tmp = a.piece;
    a.piece = b.piece;
    b.piece = tmp;
    paintTile(a.el, this.puzzle, a.piece);
    paintTile(b.el, this.puzzle, b.piece);

    // FLIP glide: each tile now shows the other's old image; animate its
    // transform from the other cell's offset back to zero so the picture
    // appears to slide into place. A tiny lift mid-glide adds physicality.
    const { cellSize } = this.puzzle;
    const ax = (b.col - a.col) * cellSize;
    const ay = (b.row - a.row) * cellSize;
    this.glide(a.el, ax, ay);
    this.glide(b.el, -ax, -ay);

    play('swap');

    // Lock any tile that just landed correctly (after the glide settles).
    const newlyCorrect = [a, b].filter((s) => this.isCorrect(s));
    if (newlyCorrect.length > 0) {
      window.setTimeout(() => {
        for (const slot of newlyCorrect) {
          if (!slot.locked) this.lock(slot, true);
        }
        this.afterLockChange();
      }, 200);
    }

    this.cb.onProgress(this.lockedCount(), this.total);
  }

  private afterLockChange(): void {
    this.cb.onProgress(this.lockedCount(), this.total);
    if (!this.solved && this.lockedCount() === this.total) {
      this.solved = true;
      play('win');
      this.playWinRipple();
      window.setTimeout(() => this.cb.onWin(), 700);
    }
  }

  private glide(el: HTMLElement, fromX: number, fromY: number): void {
    animate(
      el,
      [
        { transform: `translate(${fromX}px, ${fromY}px) scale(1)` },
        { transform: `translate(${fromX * 0.4}px, ${fromY * 0.4}px) scale(1.08)`, offset: 0.5 },
        { transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }

  /** Celebratory diagonal ripple across all tiles on win. */
  private playWinRipple(): void {
    if (prefersReducedMotion()) return;
    for (const slot of this.slots) {
      const wave = slot.row + slot.col;
      slot.el.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.12)' },
          { transform: 'scale(1)' },
        ],
        {
          duration: 460,
          delay: wave * 45,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        },
      );
    }
  }

  /**
   * Briefly reveal the fully solved image over the current board (the "peek"
   * hint). The overlay scales/fades in from the centre, holds, then scales
   * back out — and the loose tiles give a gentle wave underneath so the board
   * feels like it breathes into the solution and back.
   */
  peek(durationMs = 1400): void {
    // Guard against overlapping peeks (which caused stuck-shrunk tiles before).
    if (this.peeking) return;
    this.peeking = true;

    const { boardWidth, boardHeight, image } = this.puzzle;
    const layer = document.createElement('div');
    layer.dataset.peek = '1';
    layer.className = 'absolute inset-0 pointer-events-none';
    layer.style.backgroundImage = `url(${image.src})`;
    layer.style.backgroundSize = `${boardWidth}px ${boardHeight}px`;
    layer.style.backgroundPosition = '0 0';
    layer.style.zIndex = '40';
    layer.style.transformOrigin = 'center';
    this.gridEl.appendChild(layer);

    const done = () => {
      layer.remove();
      this.peeking = false;
    };

    if (prefersReducedMotion()) {
      layer.style.opacity = '1';
      window.setTimeout(done, durationMs);
      return;
    }

    // The tile wave uses transient animations only (no fill) so nothing stays
    // stuck if a tile locks or is tapped mid-peek — the elements always return
    // to their own inline transform on their own.
    const midRow = (this.puzzle.grid.rows - 1) / 2;
    const midCol = (this.puzzle.grid.cols - 1) / 2;
    const waveTiles = (to: number) => {
      for (const slot of this.slots) {
        const d = Math.hypot(slot.row - midRow, slot.col - midCol);
        slot.el.animate(
          [{ transform: `scale(${to === 1 ? 0.9 : 1})` }, { transform: `scale(${to})` }],
          { duration: 300, delay: d * 20, easing: 'ease-out' },
        );
      }
    };

    layer.animate(
      [
        { opacity: 0, transform: 'scale(1.06)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
    waveTiles(0.9);

    window.setTimeout(() => {
      const out = layer.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(1.06)' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
      );
      out.addEventListener('finish', done);
      // Safety: if the finish event is missed, still clean up.
      window.setTimeout(done, 400);
      waveTiles(1);
    }, durationMs);
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    if (this.ghost) this.ghost.remove();
  }
}
