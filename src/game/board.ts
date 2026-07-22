import { createPuzzle } from '../puzzle/model';
import type { Piece, Puzzle } from '../puzzle/model';
import { paintTile } from '../puzzle/render';
import type { GridSize } from '../puzzle/grid';
import { animate, prefersReducedMotion } from '../ui/motion';
import { play } from '../audio/sfx';

// The playable board: the image is chopped into a grid of square tiles, all
// shuffled in place so they fill the grid. Players swap tiles to sort them:
// tap tile A then tile B to swap, or drag one tile onto another. A tile sitting
// in its correct cell gets a subtle accent ring.
//
// Each slot is a fixed cell in the grid with its own element. Swapping two
// slots exchanges which piece each shows — the elements never move, we just
// repaint their image region. Swaps animate with a FLIP-style glide so the two
// images appear to slide past each other.

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
}

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
      el.className =
        'absolute cursor-pointer rounded-md transition-shadow duration-150';
      el.style.width = `${cellSize}px`;
      el.style.height = `${cellSize}px`;
      el.style.left = `${col * cellSize}px`;
      el.style.top = `${row * cellSize}px`;

      const slot: Slot = { index, row, col, piece: pieces[index], el };
      paintTile(el, this.puzzle, slot.piece);
      el.addEventListener('pointerdown', (e) => this.onPointerDown(e, slot));
      gridEl.appendChild(el);
      this.slots.push(slot);
    }

    this.paintSlots();
    this.playIntro();
    this.cb.onProgress(this.correctCount(), this.total);
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

  private correctCount(): number {
    return this.slots.filter((s) => s.piece.id === s.index).length;
  }

  private isCorrect(slot: Slot): boolean {
    return slot.piece.id === slot.index;
  }

  private paintSlots(): void {
    for (const slot of this.slots) {
      const correct = this.isCorrect(slot);
      const isSel = this.selected === slot;
      slot.el.style.boxShadow = isSel
        ? '0 0 0 3px #38bdf8, 0 8px 20px rgba(0,0,0,0.5)'
        : correct
          ? 'inset 0 0 0 2px rgba(56,189,248,0.6)'
          : 'inset 0 0 0 1px rgba(15,23,42,0.55)';
      slot.el.style.zIndex = isSel ? '20' : '1';
    }
  }

  private onPointerDown(e: PointerEvent, slot: Slot): void {
    if (this.solved) return;
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
      ghost.style.transform = 'scale(1.06)';
      ghost.style.boxShadow = '0 0 0 3px #38bdf8, 0 12px 28px rgba(0,0,0,0.6)';
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
      // Drag-to-swap: swap with whatever slot we dropped onto.
      if (this.ghost) {
        this.ghost.remove();
        this.ghost = null;
      }
      source.el.style.opacity = '';
      const target = this.slotAtPoint(e.clientX, e.clientY);
      if (target && target !== source) {
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
    const wasCorrect = new Set(
      [a, b].filter((s) => this.isCorrect(s)).map((s) => s.index),
    );

    const tmp = a.piece;
    a.piece = b.piece;
    b.piece = tmp;
    paintTile(a.el, this.puzzle, a.piece);
    paintTile(b.el, this.puzzle, b.piece);

    // FLIP glide: each tile now shows the other's old image; animate its
    // transform from the other cell's offset back to zero so the picture
    // appears to slide into place.
    const { cellSize } = this.puzzle;
    const ax = (b.col - a.col) * cellSize;
    const ay = (b.row - a.row) * cellSize;
    this.glide(a.el, ax, ay);
    this.glide(b.el, -ax, -ay);

    play('swap');

    // Celebrate any tile that just became correct (and wasn't before).
    for (const slot of [a, b]) {
      if (this.isCorrect(slot) && !wasCorrect.has(slot.index)) {
        this.pulseCorrect(slot);
      }
    }

    this.cb.onProgress(this.correctCount(), this.total);
    if (this.correctCount() === this.total) {
      this.solved = true;
      play('win');
      this.playWinRipple();
      setTimeout(() => this.cb.onWin(), 650);
    }
  }

  private glide(el: HTMLElement, fromX: number, fromY: number): void {
    animate(
      el,
      [
        { transform: `translate(${fromX}px, ${fromY}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }

  /** A brief glow + pop when a tile lands in its correct cell. */
  private pulseCorrect(slot: Slot): void {
    play('place');
    animate(
      slot.el,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.08)' },
        { transform: 'scale(1)' },
      ],
      { duration: 300, easing: 'ease-out', delay: 120 },
    );
    animate(
      slot.el,
      [
        { boxShadow: '0 0 0 0px rgba(56,189,248,0.9)' },
        { boxShadow: '0 0 0 6px rgba(56,189,248,0)' },
      ],
      { duration: 420, easing: 'ease-out', delay: 120 },
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

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    if (this.ghost) this.ghost.remove();
  }
}
