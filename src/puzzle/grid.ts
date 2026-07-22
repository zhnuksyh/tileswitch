// Computes a rows x cols grid for a puzzle, adapting to the image aspect ratio
// so tiles stay roughly square. The `baseTiles` count (tiles along the shorter
// side) sets difficulty — higher means more, smaller tiles.

export interface GridSize {
  rows: number;
  cols: number;
}

/** Default tiles along the shorter dimension (Easy). */
export const BASE_TILES = 4;

/**
 * Given the natural image width/height, pick a grid whose tiles are close to
 * square, using `baseTiles` along the shorter side.
 */
export function computeGrid(
  imageWidth: number,
  imageHeight: number,
  baseTiles: number = BASE_TILES,
): GridSize {
  const aspect = imageWidth / imageHeight;

  if (aspect >= 1) {
    // Landscape (or square): base tiles vertically.
    const rows = baseTiles;
    const cols = Math.max(2, Math.round(baseTiles * aspect));
    return { rows, cols };
  }
  // Portrait: base tiles horizontally.
  const cols = baseTiles;
  const rows = Math.max(2, Math.round(baseTiles / aspect));
  return { rows, cols };
}
