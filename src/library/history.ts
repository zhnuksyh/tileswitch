// "Recently played" history — the images the player has actually started a
// puzzle with, most-recent first. Shown as a grid on the setup screen.
//
// We store only lightweight references (id, title, source, timestamp) in
// localStorage, never image bytes: uploaded images live in IndexedDB as object
// URLs that don't survive a reload, so history entries are re-matched against
// the live library at render time and resolve their current `src` from there.
// An entry whose image no longer exists is simply skipped when displayed.

import type { ImageSource, LibraryImage } from './manifest';

const KEY = 'tileswitch:history:v1';

// Cap the stored history so localStorage stays small and the grid stays
// meaningful. Older entries fall off the end.
const MAX_HISTORY = 10;

export interface HistoryEntry {
  id: string;
  title: string;
  source: ImageSource;
  /** When it was last played (ms epoch). */
  playedAt: number;
  /** Solve result, filled in on completion (absent until then). */
  solvedAt?: number;
  /** Fastest solve time in ms for this image (best of its plays). */
  bestTimeMs?: number;
  /** Difficulty label of the last solve (e.g. 'Easy'). */
  difficulty?: string;
}

/** History entries carry their solve metadata alongside the resolved image. */
export type HistoryItem = LibraryImage & {
  solvedAt?: number;
  bestTimeMs?: number;
  difficulty?: string;
};

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (e): e is HistoryEntry =>
            e && typeof e.id === 'string' && typeof e.playedAt === 'number',
        );
      }
    }
  } catch {
    /* fall through to empty */
  }
  return [];
}

function save(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* best-effort */
  }
}

/**
 * Record that `image` was played. Moves it to the front (most recent), removing
 * any earlier entry for the same image so each appears once.
 */
export function recordPlayed(image: LibraryImage): void {
  const entries = load().filter((e) => e.id !== image.id);
  entries.unshift({
    id: image.id,
    title: image.title,
    source: image.source,
    playedAt: Date.now(),
  });
  save(entries.slice(0, MAX_HISTORY));
}

/**
 * Record that the puzzle for `id` was solved: stamps the solve time, keeps the
 * best (fastest) time, and stores the difficulty label. No-op if the image
 * isn't in history (it always should be, since play() records it first).
 */
export function recordSolved(
  id: string,
  timeMs: number,
  difficulty: string,
): void {
  const entries = load();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.solvedAt = Date.now();
  entry.difficulty = difficulty;
  entry.bestTimeMs =
    entry.bestTimeMs === undefined ? timeMs : Math.min(entry.bestTimeMs, timeMs);
  save(entries);
}

/** Remove the history entry for `id` (e.g. the user deletes a card). */
export function removeFromHistory(id: string): void {
  const entries = load();
  const next = entries.filter((e) => e.id !== id);
  if (next.length !== entries.length) save(next);
}

/**
 * Recently-played images, most-recent first, resolved against the current
 * library so each has a live `src`. Solve metadata (time, date, difficulty)
 * rides along. Entries whose image is gone are dropped.
 */
export function getHistory(library: LibraryImage[]): HistoryItem[] {
  const byId = new Map(library.map((i) => [i.id, i]));
  const result: HistoryItem[] = [];
  for (const entry of load()) {
    const live = byId.get(entry.id);
    if (live) {
      result.push({
        ...live,
        solvedAt: entry.solvedAt,
        bestTimeMs: entry.bestTimeMs,
        difficulty: entry.difficulty,
      });
    }
  }
  return result;
}
