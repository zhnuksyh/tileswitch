// Computes a rows x cols grid for a puzzle, adapting to the image aspect ratio
// so tiles stay roughly square. Library images are 16:9, which lands on a clean
// 4 x 7 grid; other aspect ratios still work.

export interface GridSize {
  rows: number;
  cols: number;
}

/** Target number of tiles along the shorter dimension. */
export const BASE_TILES = 4;

/**
 * Given the natural image width/height, pick a grid whose tiles are close to
 * square, using BASE_TILES along the shorter side.
 */
export function computeGrid(imageWidth: number, imageHeight: number): GridSize {
  const aspect = imageWidth / imageHeight;

  if (aspect >= 1) {
    // Landscape (or square): base tiles vertically.
    const rows = BASE_TILES;
    const cols = Math.max(2, Math.round(BASE_TILES * aspect));
    return { rows, cols };
  }
  // Portrait: base tiles horizontally.
  const cols = BASE_TILES;
  const rows = Math.max(2, Math.round(BASE_TILES / aspect));
  return { rows, cols };
}
