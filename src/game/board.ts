import { createPuzzle } from '../puzzle/model';
import type { Piece, Puzzle } from '../puzzle/model';
import { renderPieceSVG } from '../puzzle/render';
import type { GridSize } from '../puzzle/grid';

// The playable board: a target grid on the left/top where pieces snap into
// place, and a shuffled tray of loose pieces. Pieces are dragged (mouse or
// touch) from the tray onto the grid; a piece dropped near its home cell snaps
// in and locks.

export interface BoardCallbacks {
  onProgress: (placed: number, total: number) => void;
  onWin: () => void;
}

interface DragState {
  piece: Piece;
  el: HTMLElement;
  fromTray: boolean;
  offsetX: number;
  offsetY: number;
}

export class Board {
  private puzzle: Puzzle;
  private root: HTMLElement;
  private gridEl!: HTMLElement;
  private trayEl!: HTMLElement;
  private layer!: HTMLElement;
  private pieceEls = new Map<number, HTMLElement>();
  private drag: DragState | null = null;
  private placedCount = 0;

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
    const { boardWidth, boardHeight, cellSize } = this.puzzle;
    this.root.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-6 w-full';

    // --- Target grid ---
    const gridEl = document.createElement('div');
    gridEl.className =
      'relative rounded-2xl bg-base-800/60 ring-1 ring-base-700 shadow-2xl';
    gridEl.style.width = `${boardWidth}px`;
    gridEl.style.height = `${boardHeight}px`;
    gridEl.style.backgroundImage =
      'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)';
    gridEl.style.backgroundSize = `${cellSize}px ${cellSize}px`;
    this.gridEl = gridEl;
    wrap.appendChild(gridEl);

    // Drag layer sits above everything so dragged pieces float.
    const layer = document.createElement('div');
    layer.className = 'pointer-events-none fixed inset-0 z-50';
    this.layer = layer;

    // --- Tray ---
    // Fixed-height, scrollable tray. A fixed height is important: it keeps the
    // board from reflowing as pieces leave the tray, so a piece's home position
    // is stable between pick-up and drop.
    const tray = document.createElement('div');
    tray.className =
      'no-scrollbar flex flex-wrap justify-center content-start gap-3 w-full max-w-full p-4 rounded-2xl bg-base-800/40 ring-1 ring-base-700 overflow-y-auto';
    tray.style.height = '11rem';
    this.trayEl = tray;
    wrap.appendChild(tray);

    this.root.appendChild(wrap);
    document.body.appendChild(layer);

    // Create pieces in shuffled order in the tray.
    const shuffled = [...this.puzzle.pieces];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const piece of shuffled) {
      const el = this.createPieceEl(piece);
      this.pieceEls.set(piece.id, el);
      tray.appendChild(el);
    }

    this.cb.onProgress(0, this.total);
  }

  private createPieceEl(piece: Piece): HTMLElement {
    const el = document.createElement('div');
    el.className =
      'cursor-grab active:cursor-grabbing touch-none select-none transition-transform hover:scale-105';
    el.style.width = 'fit-content';
    el.dataset.pieceId = String(piece.id);
    el.dataset.row = String(piece.row);
    el.dataset.col = String(piece.col);
    const svg = renderPieceSVG(this.puzzle, piece);
    el.appendChild(svg);
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e, piece, el));
    return el;
  }

  private onPointerDown(e: PointerEvent, piece: Piece, el: HTMLElement): void {
    if (piece.placed) return;
    e.preventDefault();

    const rect = el.getBoundingClientRect();
    this.drag = {
      piece,
      el,
      fromTray: el.parentElement === this.trayEl,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };

    // Float the element on the drag layer.
    el.style.position = 'fixed';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.zIndex = '60';
    el.style.pointerEvents = 'none';
    el.classList.remove('hover:scale-105');
    this.layer.appendChild(el);

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    this.drag.el.style.left = `${e.clientX - this.drag.offsetX}px`;
    this.drag.el.style.top = `${e.clientY - this.drag.offsetY}px`;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.drag) return;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    const { piece, el } = this.drag;
    const { cellSize } = this.puzzle;
    const overhang = piece.overhang;

    // Target position of piece's top-left (including overhang) on the grid.
    const gridRect = this.gridEl.getBoundingClientRect();
    const homeX = gridRect.left + piece.col * cellSize - overhang;
    const homeY = gridRect.top + piece.row * cellSize - overhang;

    // Current piece top-left in viewport.
    const curX = e.clientX - this.drag.offsetX;
    const curY = e.clientY - this.drag.offsetY;

    const dist = Math.hypot(curX - homeX, curY - homeY);
    const snapThreshold = cellSize * 0.5;

    if (dist <= snapThreshold) {
      this.placePiece(piece, el);
    } else {
      this.returnToTray(el);
    }

    this.drag = null;
  };

  private placePiece(piece: Piece, el: HTMLElement): void {
    const { cellSize } = this.puzzle;
    const overhang = piece.overhang;
    piece.placed = true;

    // Anchor the piece absolutely inside the grid element.
    el.style.position = 'absolute';
    el.style.left = `${piece.col * cellSize - overhang}px`;
    el.style.top = `${piece.row * cellSize - overhang}px`;
    el.style.zIndex = '10';
    el.style.pointerEvents = 'none';
    el.classList.remove('cursor-grab', 'active:cursor-grabbing');
    this.gridEl.appendChild(el);

    // Little snap pop.
    el.animate(
      [
        { transform: 'scale(1.08)' },
        { transform: 'scale(1)' },
      ],
      { duration: 180, easing: 'ease-out' },
    );

    this.placedCount++;
    this.cb.onProgress(this.placedCount, this.total);
    if (this.placedCount === this.total) {
      this.cb.onWin();
    }
  }

  private returnToTray(el: HTMLElement): void {
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.zIndex = '';
    el.style.pointerEvents = '';
    el.classList.add('hover:scale-105');
    this.trayEl.appendChild(el);
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.layer.remove();
  }
}
