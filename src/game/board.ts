import { createPuzzle } from '../puzzle/model';
import type { Piece, Puzzle } from '../puzzle/model';
import { paintTile } from '../puzzle/render';
import type { GridSize } from '../puzzle/grid';

// The playable board: the image is chopped into a grid of square tiles, all
// shuffled in place so they fill the grid. Players swap tiles to sort them:
// tap tile A then tile B to swap, or drag one tile onto another. A tile sitting
// in its correct cell gets a subtle accent ring.
//
// Each slot is a fixed cell in the grid with its own element. Swapping two
// slots exchanges which piece each shows — the elements never move, we just
// repaint their image region. This keeps the DOM stable and simple.

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
      el.className = 'absolute cursor-pointer rounded-md transition-shadow duration-150';
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
    this.cb.onProgress(this.correctCount(), this.total);
  }

  private correctCount(): number {
    return this.slots.filter((s) => s.piece.id === s.index).length;
  }

  private paintSlots(): void {
    for (const slot of this.slots) {
      const correct = slot.piece.id === slot.index;
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
      }
      this.selected = null;
      this.paintSlots();
      return;
    }

    // Tap-to-swap: first tap selects, second tap swaps.
    if (!this.selected) {
      this.selected = source;
    } else if (this.selected === source) {
      this.selected = null;
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

  /** Exchange the pieces shown by two slots and repaint them. */
  private swap(a: Slot, b: Slot): void {
    const tmp = a.piece;
    a.piece = b.piece;
    b.piece = tmp;
    paintTile(a.el, this.puzzle, a.piece);
    paintTile(b.el, this.puzzle, b.piece);

    // Brief pop on both tiles.
    for (const el of [a.el, b.el]) {
      el.animate(
        [{ transform: 'scale(0.94)' }, { transform: 'scale(1)' }],
        { duration: 150, easing: 'ease-out' },
      );
    }

    this.cb.onProgress(this.correctCount(), this.total);
    if (this.correctCount() === this.total) {
      this.solved = true;
      setTimeout(() => this.cb.onWin(), 250);
    }
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    if (this.ghost) this.ghost.remove();
  }
}
