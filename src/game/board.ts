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

    // Shuffle piece order across the cells until it isn't already solved.
    const pieces = [...this.puzzle.pieces];
    do {
      for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
      }
    } while (pieces.every((p, i) => p.id === i) && pieces.length > 1);

    for (let index = 0; index < pieces.length; index++) {
      const row = Math.floor(index / grid.cols);
      const col = index % grid.cols;
      const el = document.createElement('div');
      el.className = LOOSE_CLASS;
      el.style.width = `${cellSize}px`;
      el.style.height = `${cellSize}px`;
      el.style.left = `${col * cellSize}px`;
      el.style.top = `${row * cellSize}px`;

      const slot: Slot = {
        index,
        row,
        col,
        piece: pieces[index],
        el,
        locked: false,
      };
      paintTile(el, this.puzzle, slot.piece);
      el.addEventListener('pointerdown', (e) => this.onPointerDown(e, slot));
      gridEl.appendChild(el);
      this.slots.push(slot);
    }

    // Lock any tiles that happen to start in the right place (no animation).
    for (const slot of this.slots) {
      if (this.isCorrect(slot)) this.lock(slot, false);
    }

    this.paintSlots();
    this.playIntro();
    this.cb.onProgress(this.lockedCount(), this.total);
  }

  /** Staggered scale/fade-in of tiles when the board first appears. */
  private playIntro(): void {
    if (prefersReducedMotion()) return;
    for (const slot of this.slots) {
      // Diagonal wave: cells further from the top-left start slightly later.
      const wave = slot.row + slot.col;
      slot.el.animate(
        [
          { opacity: 0, transform: 'scale(0.6)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        {
          duration: 340,
          delay: wave * 28,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          fill: 'backwards',
        },
      );
    }
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
      // Selected tiles lift with a shadow + accent glow; loose tiles get a
      // faint separating border so they read as movable pieces.
      slot.el.style.boxShadow = isSel
        ? '0 10px 24px rgba(0,0,0,0.55), 0 0 18px rgba(56,189,248,0.55)'
        : 'inset 0 0 0 1px rgba(15,23,42,0.55)';
      slot.el.style.transform = isSel ? 'scale(1.06)' : 'scale(1)';
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
    // A bright flash that fades as it becomes "part of the image".
    const flash = document.createElement('div');
    flash.className = 'absolute inset-0 pointer-events-none';
    flash.style.background =
      'radial-gradient(circle, rgba(255,255,255,0.55), rgba(56,189,248,0.35) 55%, transparent 75%)';
    slot.el.appendChild(flash);
    const anim = animate(
      flash,
      [
        { opacity: 0.9, transform: 'scale(0.6)' },
        { opacity: 0, transform: 'scale(1.25)' },
      ],
      { duration: 500, easing: 'ease-out' },
    );
    if (anim) anim.onfinish = () => flash.remove();
    else flash.remove();
  }

  private onPointerDown(e: PointerEvent, slot: Slot): void {
    if (this.solved || slot.locked) return;
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
    } else if (this.selected === source) {
      this.selected = null;
      play('select');
    } else {
      this.swap(this.selected, source);
      this.selected = null;
    }
    this.paintSlots();
  };

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
   * hint). The overlay fades in, holds, and fades out.
   */
  peek(durationMs = 1400): void {
    if (this.gridEl.querySelector('[data-peek]')) return;
    const { boardWidth, boardHeight, image } = this.puzzle;
    const layer = document.createElement('div');
    layer.dataset.peek = '1';
    layer.className = 'absolute inset-0 pointer-events-none';
    layer.style.backgroundImage = `url(${image.src})`;
    layer.style.backgroundSize = `${boardWidth}px ${boardHeight}px`;
    layer.style.backgroundPosition = '0 0';
    layer.style.zIndex = '40';
    this.gridEl.appendChild(layer);

    const fadeIn = layer.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 220, easing: 'ease-out', fill: 'forwards' },
    );
    const remove = () => {
      layer
        .animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 300,
          easing: 'ease-in',
        })
        .addEventListener('finish', () => layer.remove());
    };
    if (prefersReducedMotion()) {
      layer.style.opacity = '1';
      fadeIn.cancel();
    }
    window.setTimeout(remove, durationMs);
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    if (this.ghost) this.ghost.remove();
  }
}
