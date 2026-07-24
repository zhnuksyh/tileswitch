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
const MAX_HISTORY = 24;

export interface HistoryEntry {
  id: string;
  title: string;
  source: ImageSource;
  /** When it was last played (ms epoch). */
  playedAt: number;
}

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
 * Recently-played images, most-recent first, resolved against the current
 * library so each has a live `src`. Entries whose image is gone are dropped.
 */
export function getHistory(library: LibraryImage[]): LibraryImage[] {
  const byId = new Map(library.map((i) => [i.id, i]));
  const result: LibraryImage[] = [];
  for (const entry of load()) {
    const live = byId.get(entry.id);
    if (live) result.push(live);
  }
  return result;
}
