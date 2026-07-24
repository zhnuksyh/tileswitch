// Difficulty levels drive how fine the tile grid is: more, smaller tiles are
// harder. `baseTiles` is the count along the image's shorter side (see
// computeGrid). 16:9 tile counts are shown for reference.

export interface Difficulty {
  id: string;
  label: string;
  /** Tiles along the shorter side. */
  baseTiles: number;
  /** Approximate tile count on a 16:9 image, for the UI. */
  hint: string;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Easy', baseTiles: 4, hint: '4 × 7' },
  { id: 'medium', label: 'Medium', baseTiles: 5, hint: '5 × 9' },
  { id: 'hard', label: 'Hard', baseTiles: 6, hint: '6 × 11' },
  { id: 'expert', label: 'Expert', baseTiles: 8, hint: '8 × 14' },
];

export const DEFAULT_DIFFICULTY = DIFFICULTIES[0];
