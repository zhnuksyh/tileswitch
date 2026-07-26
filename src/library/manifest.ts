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
  /**
   * Small preview URL for library grids. Falls back to `src` when no separate
   * thumbnail exists (bundled images, and uploads stored before thumbnails).
   * The board always uses `src`.
   */
  thumb: string;
  source: ImageSource;
}

/** Prefix a public-asset path with Vite's base URL (handles subpath deploys). */
function asset(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}

// --- Source 1: public placeholders (starter set) ---------------------------
// Five bundled illustrations — the placeholder grid shown while the user has no
// uploads of their own, so the setup screen is never empty. Five (not six) so
// the grid's sixth cell is free for the "add image" tile.
const PUBLIC_FILES: { file: string; title: string }[] = [
  { file: 'placeholders/cosmic-vortex.jpg', title: 'Cosmic Vortex' },
  { file: 'placeholders/astronauts-at-sunset.jpg', title: 'Astronauts at Sunset' },
  { file: 'placeholders/planets-and-stars.jpg', title: 'Planets & Stars' },
  { file: 'placeholders/moonlit-castle.jpg', title: 'Moonlit Castle' },
  { file: 'placeholders/jungle-treehouse.jpg', title: 'Jungle Treehouse' },
];

const publicImages: LibraryImage[] = PUBLIC_FILES.map(({ file, title }) => ({
  id: `public:${file}`,
  title,
  src: asset(`/library/${file}`),
  thumb: asset(`/library/${file}`),
  source: 'public' as const,
}));

function uploadToImage(u: UploadedImage): LibraryImage {
  return { id: u.id, title: u.title, src: u.url, thumb: u.thumbUrl, source: 'uploaded' };
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
