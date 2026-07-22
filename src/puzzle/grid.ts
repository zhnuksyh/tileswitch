// Computes a rows x cols grid for a given difficulty preset, adapting to the
// image aspect ratio so pieces stay roughly square.

export interface GridSize {
  rows: number;
  cols: number;
}

export interface Difficulty {
  label: string;
  /** Target pieces along the shorter dimension. */
  base: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { label: 'Easy', base: 3 },
  { label: 'Medium', base: 4 },
  { label: 'Hard', base: 6 },
  { label: 'Expert', base: 8 },
];

/**
 * Given the natural image width/height and a difficulty base, pick a grid whose
 * pieces are close to square.
 */
export function computeGrid(
  imageWidth: number,
  imageHeight: number,
  base: number,
): GridSize {
  const aspect = imageWidth / imageHeight;

  if (aspect >= 1) {
    // Landscape (or square): base pieces vertically.
    const rows = base;
    const cols = Math.max(2, Math.round(base * aspect));
    return { rows, cols };
  }
  // Portrait: base pieces horizontally.
  const cols = base;
  const rows = Math.max(2, Math.round(base / aspect));
  return { rows, cols };
}
