import type { GridSize } from './grid';

// A fully materialised puzzle: the source image, the grid, and per-piece data
// needed to render square tiles and check placement.

export interface Piece {
  id: number;
  row: number;
  col: number;
  /** Whether the piece is currently placed correctly. */
  placed: boolean;
}

export interface Puzzle {
  image: HTMLImageElement;
  grid: GridSize;
  /** Rendered cell size in px (square). */
  cellSize: number;
  /** Board pixel dimensions. */
  boardWidth: number;
  boardHeight: number;
  pieces: Piece[];
}

/**
 * Build a puzzle model. `cellSize` is chosen by the caller based on available
 * space; the image is stretched to a grid of square cells.
 */
export function createPuzzle(
  image: HTMLImageElement,
  grid: GridSize,
  cellSize: number,
): Puzzle {
  const pieces: Piece[] = [];

  let id = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      pieces.push({ id: id++, row: r, col: c, placed: false });
    }
  }

  return {
    image,
    grid,
    cellSize,
    boardWidth: grid.cols * cellSize,
    boardHeight: grid.rows * cellSize,
    pieces,
  };
}
