// Generates the tab/blank shapes for each internal edge of the puzzle grid.
// Each internal edge is shared by two pieces; one gets a tab (+1), the other a
// blank (-1). Flat borders are 0. Edges are stored per piece as
// [top, right, bottom, left].

export type EdgeType = -1 | 0 | 1;

export interface PieceEdges {
  top: EdgeType;
  right: EdgeType;
  bottom: EdgeType;
  left: EdgeType;
}

/**
 * Build the edge matrix for a rows x cols grid. Shared edges between adjacent
 * pieces are complementary (one tab, one blank), with a random orientation.
 */
export function buildEdges(rows: number, cols: number): PieceEdges[][] {
  const grid: PieceEdges[][] = [];

  // Pre-compute vertical seams (between column c and c+1) and horizontal seams
  // (between row r and r+1). true means the left/top piece has the tab.
  const vertical: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols - 1 }, () => Math.random() < 0.5),
  );
  const horizontal: boolean[][] = Array.from({ length: rows - 1 }, () =>
    Array.from({ length: cols }, () => Math.random() < 0.5),
  );

  for (let r = 0; r < rows; r++) {
    const row: PieceEdges[] = [];
    for (let c = 0; c < cols; c++) {
      const edges: PieceEdges = { top: 0, right: 0, bottom: 0, left: 0 };

      // Left edge
      if (c > 0) {
        edges.left = vertical[r][c - 1] ? -1 : 1;
      }
      // Right edge
      if (c < cols - 1) {
        edges.right = vertical[r][c] ? 1 : -1;
      }
      // Top edge
      if (r > 0) {
        edges.top = horizontal[r - 1][c] ? -1 : 1;
      }
      // Bottom edge
      if (r < rows - 1) {
        edges.bottom = horizontal[r][c] ? 1 : -1;
      }

      row.push(edges);
    }
    grid.push(row);
  }

  return grid;
}
