import type { EdgeType, PieceEdges } from './edges';

// Builds an SVG path string for a single jigsaw piece. The piece body occupies
// a `size` x `size` cell, and the tab/blank bumps extend `tab` beyond each
// edge. The path is drawn in a coordinate space where (0,0) is the top-left of
// the *cell* (not counting the bump overhang).

export interface PieceGeometry {
  /** SVG path `d` string. */
  d: string;
  /** How far a bump extends past the cell edge, in px. */
  overhang: number;
}

// Classic jigsaw bump described as a cubic-bezier sequence along one edge.
// Control points are expressed as fractions of the edge length. Positive
// `dir` pushes the bump outward (tab), negative pulls inward (blank).
function edgeCurve(
  length: number,
  neck: number,
  type: EdgeType,
): string {
  if (type === 0) {
    // Flat edge — straight line to the end.
    return `l ${length} 0`;
  }

  const dir = type; // +1 tab, -1 blank
  const bump = neck * 1.6 * dir; // how far the bump pops out
  const l = length;

  // A symmetric bump centred on the edge. Coordinates are relative (SVG `c`).
  return [
    `c ${l * 0.2} 0 ${l * 0.35} ${-bump * 0.2} ${l * 0.35} ${-bump * 0.35}`,
    `c 0 ${-bump * 0.3} ${-l * 0.1} ${-bump * 0.55} ${l * 0.15} ${-bump * 0.75}`,
    `c ${l * 0.2} ${-bump * 0.15} ${l * 0.4} ${bump * 0.15} ${l * 0.15} ${bump * 0.75}`,
    `c ${l * 0.1} ${bump * 0.2} 0 ${bump * 0.3} ${l * 0.35} ${bump * 0.35}`,
    `c 0 ${bump * 0.15} ${l * 0.15} 0 ${l * 0.35} 0`,
  ].join(' ');
}

/**
 * Generate the path for a piece with the given edge types.
 * @param size length of one cell edge in px
 */
export function buildPiecePath(edges: PieceEdges, size: number): PieceGeometry {
  const neck = size * 0.2;
  const overhang = neck * 1.6;

  // Start at top-left corner of the cell, offset by overhang so bumps fit.
  const start = overhang;

  const top = edgeCurve(size, neck, edges.top);
  // Right edge goes downward: rotate the horizontal curve by treating dx/dy swapped.
  const right = edgeCurveVertical(size, neck, edges.right, 1);
  const bottom = edgeCurveReversed(size, neck, edges.bottom);
  const left = edgeCurveVertical(size, neck, edges.left, -1);

  const d = [
    `M ${start} ${start}`,
    top,
    right,
    bottom,
    left,
    'Z',
  ].join(' ');

  return { d, overhang };
}

// Right/left edges are vertical. `sign` = +1 for right (top->bottom), the bump
// pops to the right for a tab; -1 for left (bottom->top).
function edgeCurveVertical(
  length: number,
  neck: number,
  type: EdgeType,
  sign: number,
): string {
  if (type === 0) {
    return `l 0 ${length * sign}`;
  }
  const dir = type * sign;
  const bump = neck * 1.6 * dir;
  const l = length * sign;

  return [
    `c 0 ${l * 0.2} ${bump * 0.2} ${l * 0.35} ${bump * 0.35} ${l * 0.35}`,
    `c ${bump * 0.3} 0 ${bump * 0.55} ${-l * 0.1} ${bump * 0.75} ${l * 0.15}`,
    `c ${bump * 0.15} ${l * 0.2} ${-bump * 0.15} ${l * 0.4} ${-bump * 0.75} ${l * 0.15}`,
    `c ${-bump * 0.2} ${l * 0.1} ${-bump * 0.3} 0 ${-bump * 0.35} ${l * 0.35}`,
    `c ${-bump * 0.15} 0 0 ${l * 0.15} 0 ${l * 0.35}`,
  ].join(' ');
}

// Bottom edge goes right->left (reversed x direction).
function edgeCurveReversed(
  length: number,
  neck: number,
  type: EdgeType,
): string {
  if (type === 0) {
    return `l ${-length} 0`;
  }
  const dir = type;
  const bump = neck * 1.6 * dir;
  const l = length;

  return [
    `c ${-l * 0.2} 0 ${-l * 0.35} ${bump * 0.2} ${-l * 0.35} ${bump * 0.35}`,
    `c 0 ${bump * 0.3} ${l * 0.1} ${bump * 0.55} ${-l * 0.15} ${bump * 0.75}`,
    `c ${-l * 0.2} ${bump * 0.15} ${-l * 0.4} ${-bump * 0.15} ${-l * 0.15} ${-bump * 0.75}`,
    `c ${-l * 0.1} ${-bump * 0.2} 0 ${-bump * 0.3} ${-l * 0.35} ${-bump * 0.35}`,
    `c 0 ${-bump * 0.15} ${-l * 0.15} 0 ${-l * 0.35} 0`,
  ].join(' ');
}
