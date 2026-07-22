import { buildEdges } from './edges';
import { buildPiecePath } from './path';
import type { GridSize } from './grid';

// A fully materialised puzzle: the source image, the grid, and per-piece data
// needed to render tabbed pieces and check placement.

export interface Piece {
  id: number;
  row: number;
  col: number;
  /** SVG path `d` for the piece outline (in cell-local coords). */
  path: string;
  /** How far bumps overhang the cell, in px (at `cellSize`). */
  overhang: number;
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
 * space; pieces are square in cell space and the image is stretched to a square
 * grid of that many cells.
 */
export function createPuzzle(
  image: HTMLImageElement,
  grid: GridSize,
  cellSize: number,
): Puzzle {
  const edges = buildEdges(grid.rows, grid.cols);
  const pieces: Piece[] = [];

  let id = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const geom = buildPiecePath(edges[r][c], cellSize);
      pieces.push({
        id: id++,
        row: r,
        col: c,
        path: geom.d,
        overhang: geom.overhang,
        placed: false,
      });
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
