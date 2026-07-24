// Per-image notes. One note per library image (keyed by image id), written on
// the win screen and read back in History. Stored in localStorage as a small
// id -> text map; image bytes never live here.

const KEY = 'tileswitch:notes:v1';

const MAX_LEN = 500;

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function save(map: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* best-effort */
  }
}

/** The note for an image, or '' if none. */
export function getNote(id: string): string {
  return load()[id] ?? '';
}

/** Save (or clear, when text is blank) the note for an image. */
export function setNote(id: string, text: string): void {
  const map = load();
  const trimmed = text.trim().slice(0, MAX_LEN);
  if (trimmed) map[id] = trimmed;
  else delete map[id];
  save(map);
}

export function hasNote(id: string): boolean {
  return getNote(id).length > 0;
}

export const NOTE_MAX_LEN = MAX_LEN;
