// The image library the puzzle draws from. Images come from three sources,
// merged into one flat pool:
//
//   1. personal  — files you drop into /my-library (git-ignored, private),
//                  auto-discovered at build/dev time via import.meta.glob.
//   2. public    — 5 bundled placeholder images under /public/library, used as
//                  a fallback so the app is never empty for a fresh visitor.
//   3. uploaded  — images added at runtime via drag-drop / file-select, stored
//                  as data URLs in localStorage (see uploads.ts).
//
// The public set is only surfaced when there are no personal images, so once
// you populate /my-library it becomes *your* library.

import { loadUploads, type UploadedImage } from './uploads';

export type ImageSource = 'personal' | 'public' | 'uploaded';

export interface LibraryImage {
  /** Stable identity, unique across the whole pool. */
  id: string;
  title: string;
  /** Resolvable URL: bundled asset URL, or a data: URL for uploads. */
  src: string;
  source: ImageSource;
}

/** Prefix a public-asset path with Vite's base URL (handles subpath deploys). */
function asset(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}

// Derive a display title from a file name: strip extension and an optional
// leading "NN-" / "NN_" ordering prefix, swap separators for spaces, title-case.
function titleFromFile(fileName: string): string {
  const noExt = fileName.replace(/\.[^.]+$/, '');
  const noOrder = noExt.replace(/^\d+[-_ ]+/, '');
  return noOrder
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// --- Source 1: personal /my-library, discovered at build time --------------
// Eager glob so URLs are ready synchronously. Vite resolves each match to a
// hashed asset URL. Keys are absolute module paths; we sort them so a numeric
// filename prefix controls order.
const personalModules = import.meta.glob(
  '/my-library/*.{png,jpg,jpeg,webp,gif,avif}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

const personalImages: LibraryImage[] = Object.keys(personalModules)
  .sort()
  .map((path) => {
    const file = path.split('/').pop() ?? path;
    return {
      id: `personal:${file}`,
      title: titleFromFile(file),
      src: personalModules[path],
      source: 'personal' as const,
    };
  });

// --- Source 2: public placeholders (fallback only) -------------------------
// Reuses 5 of the bundled library PNGs. Swap the files (same names) or edit
// this list freely — these only appear when /my-library is empty.
const PUBLIC_FILES: { file: string; title: string }[] = [
  { file: 'anime/spirited-away.png', title: 'Spirited Away' },
  { file: 'anime/your-name.png', title: 'Your Name' },
  { file: 'cartoon/spongebob.png', title: 'SpongeBob' },
  { file: 'vector/mountain-sunrise.png', title: 'Mountain Sunrise' },
  { file: 'vector/tropical-beach.png', title: 'Tropical Beach' },
];

const publicImages: LibraryImage[] = PUBLIC_FILES.map(({ file, title }) => ({
  id: `public:${file}`,
  title,
  src: asset(`/library/${file}`),
  source: 'public' as const,
}));

/** Whether any personal images were discovered in /my-library. */
export const hasPersonalLibrary = personalImages.length > 0;

function uploadToImage(u: UploadedImage): LibraryImage {
  return { id: u.id, title: u.title, src: u.dataUrl, source: 'uploaded' };
}

/**
 * The full library pool, freshly assembled. Personal + uploaded images always
 * appear; the public placeholders are included only when there are no personal
 * images (a fresh visitor with an empty /my-library).
 *
 * Call this rather than caching — uploads live in localStorage and can change
 * while the app is open.
 */
export function getLibrary(): LibraryImage[] {
  const uploaded = loadUploads().map(uploadToImage);
  const base = hasPersonalLibrary ? personalImages : publicImages;
  return [...base, ...uploaded];
}
