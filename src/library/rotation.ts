// Non-repeating shuffle across the library. The idea: every image gets played
// once before any image repeats. We track which image ids have already been
// served in the current cycle; when the cycle is exhausted (or the pool
// changes), we start a fresh cycle.
//
// State is persisted so the rotation stays fair across reloads.

import type { LibraryImage } from './manifest';

const KEY = 'tileswitch:rotation:v1';

interface RotationState {
  /** Ids served in the current cycle. */
  seen: string[];
}

function load(): RotationState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.seen)) {
        return { seen: parsed.seen.filter((s: unknown) => typeof s === 'string') };
      }
    }
  } catch {
    /* fall through to empty */
  }
  return { seen: [] };
}

function save(state: RotationState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* rotation is best-effort; ignore storage failures */
  }
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Pick the next image from `pool`, avoiding any image already served in the
 * current cycle. When every image has been served, the cycle resets and starts
 * over (so the very next pick may repeat only if the pool has one image).
 *
 * Optionally pass `avoidId` to steer away from repeating a specific image on a
 * cycle boundary (e.g. the one currently on screen).
 *
 * Returns null only if the pool is empty.
 */
export function nextImage(
  pool: LibraryImage[],
  avoidId?: string,
): LibraryImage | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) {
    markSeen(pool, pool[0].id);
    return pool[0];
  }

  const state = load();
  const poolIds = new Set(pool.map((i) => i.id));
  // Drop ids no longer in the pool (removed uploads, source switch, etc.).
  let seen = new Set(state.seen.filter((id) => poolIds.has(id)));

  let remaining = pool.filter((i) => !seen.has(i.id));

  // Cycle complete → start a new one.
  if (remaining.length === 0) {
    seen = new Set();
    remaining = pool.slice();
  }

  // On a fresh cycle, don't immediately repeat the just-shown image.
  if (avoidId && remaining.length > 1) {
    const filtered = remaining.filter((i) => i.id !== avoidId);
    if (filtered.length > 0) remaining = filtered;
  }

  const chosen = pickRandom(remaining);
  seen.add(chosen.id);
  save({ seen: [...seen] });
  return chosen;
}

/** Record that an image was played (used when the user hand-picks one). */
export function markSeen(pool: LibraryImage[], id: string): void {
  const poolIds = new Set(pool.map((i) => i.id));
  const state = load();
  let seen = new Set(state.seen.filter((sid) => poolIds.has(sid)));
  seen.add(id);
  // If that completed the cycle, reset so the next auto-pick starts fresh.
  if (pool.length > 0 && seen.size >= pool.length) seen = new Set();
  save({ seen: [...seen] });
}

/** How many images remain unseen in the current cycle, for UI hints. */
export function remainingInCycle(pool: LibraryImage[]): number {
  if (pool.length === 0) return 0;
  const poolIds = new Set(pool.map((i) => i.id));
  const state = load();
  const seen = state.seen.filter((id) => poolIds.has(id));
  const left = pool.length - seen.length;
  return left <= 0 ? pool.length : left;
}
