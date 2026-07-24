// Persisted records: best score, best time, and streaks. The streak counts
// consecutive solves; it resets when the player exits or restarts a puzzle
// mid-game (i.e. gives up on the current one).

export interface Stats {
  bestScore: number;
  /** Fastest solve in ms (0 = none yet). */
  bestTimeMs: number;
  currentStreak: number;
  longestStreak: number;
}

const KEY = 'tileswitch:stats:v1';

const EMPTY: Stats = { bestScore: 0, bestTimeMs: 0, currentStreak: 0, longestStreak: 0 };

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        bestScore: Number(p.bestScore) || 0,
        bestTimeMs: Number(p.bestTimeMs) || 0,
        currentStreak: Number(p.currentStreak) || 0,
        longestStreak: Number(p.longestStreak) || 0,
      };
    }
  } catch {
    /* fall through */
  }
  return { ...EMPTY };
}

function save(stats: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* best-effort */
  }
}

/**
 * Score a solve. Higher is better. Base reward scales with puzzle size (more
 * tiles = harder), then we subtract penalties for time taken and wasted moves
 * (moves beyond the minimum). Floored at a small positive number so a solve is
 * always worth something.
 *
 * @param tiles  total tiles in the puzzle
 * @param timeMs time taken to solve
 * @param moves  swaps made
 */
export function computeScore(tiles: number, timeMs: number, moves: number): number {
  const base = tiles * 100;
  const timePenalty = Math.floor(timeMs / 1000) * 2;
  // A perfect solve needs at least ~tiles-1 swaps; only charge for the excess.
  const wasted = Math.max(0, moves - (tiles - 1));
  const movePenalty = wasted * 8;
  return Math.max(50, base - timePenalty - movePenalty);
}

export interface SolveResult {
  score: number;
  timeMs: number;
  tiles: number;
  moves: number;
}

/**
 * Record a completed solve. Bumps the streak and updates bests. Returns the
 * updated stats plus flags for whether this solve set a new record.
 */
export function recordSolve(
  result: SolveResult,
  countStreak: boolean,
): { stats: Stats; newBestScore: boolean; newBestTime: boolean } {
  const stats = loadStats();

  const newBestScore = result.score > stats.bestScore;
  if (newBestScore) stats.bestScore = result.score;

  const newBestTime = stats.bestTimeMs === 0 || result.timeMs < stats.bestTimeMs;
  if (newBestTime) stats.bestTimeMs = result.timeMs;

  if (countStreak) {
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.longestStreak) {
      stats.longestStreak = stats.currentStreak;
    }
  }

  save(stats);
  return { stats, newBestScore, newBestTime };
}

/** Reset the current streak (player gave up / exited a puzzle mid-solve). */
export function breakStreak(): void {
  const stats = loadStats();
  if (stats.currentStreak !== 0) {
    stats.currentStreak = 0;
    save(stats);
  }
}
