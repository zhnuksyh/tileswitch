// The image library the puzzle draws from. Two sources, merged into one flat
// pool:
//
//   1. public   — 5 bundled placeholder images under /public/library. These are
//                 the starter set everyone begins with.
//   2. uploaded — images the user adds at runtime (drag-drop / file-select),
//                 re-encoded to WebP and stored as Blobs in IndexedDB
//                 (see uploads.ts / db.ts).
//
// The public set shows only while the user has no uploads of their own; once
// they add images, the library becomes theirs.

import { loadUploads, type UploadedImage } from './uploads';

export type ImageSource = 'public' | 'uploaded';

export interface LibraryImage {
  /** Stable identity, unique across the whole pool. */
  id: string;
  title: string;
  /** Resolvable URL: bundled asset URL, or an object URL for uploads. */
  src: string;
  source: ImageSource;
}

/** Prefix a public-asset path with Vite's base URL (handles subpath deploys). */
function asset(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}

// --- Source 1: public placeholders (starter set) ---------------------------
// Reuses 5 of the bundled library PNGs. Only shown while the user has no
// uploads of their own.
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

function uploadToImage(u: UploadedImage): LibraryImage {
  return { id: u.id, title: u.title, src: u.url, source: 'uploaded' };
}

/**
 * The full library pool, freshly assembled. Uploaded images always appear; the
 * public starter set is included only while the user has no uploads.
 *
 * Async because uploads live in IndexedDB. Call this rather than caching — the
 * upload set can change while the app is open.
 */
export async function getLibrary(): Promise<LibraryImage[]> {
  const uploaded = (await loadUploads()).map(uploadToImage);
  return uploaded.length ? uploaded : publicImages;
}
