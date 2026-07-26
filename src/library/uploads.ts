// Images the user adds at runtime (drag-drop or file-select). Stored as Blobs
// in IndexedDB (see db.ts), capped to a sane pixel size on the way in (see
// encode.ts) so oversized photos don't stall rendering. Each stored Blob is
// exposed to the UI as an object URL, cached by id so repeated reads don't leak
// URLs.

import { getAllUploads, putUpload, deleteUpload, requestPersistence, type StoredUpload } from './db';
import { encodeForStorage } from './encode';

export interface UploadedImage {
  id: string;
  title: string;
  /** Object URL for display, valid for the page's lifetime. */
  url: string;
  /** Object URL for a small preview. Falls back to `url` when none is stored. */
  thumbUrl: string;
  /** Object URL for the mid-size preview. Falls back to `url`. */
  previewUrl: string;
  addedAt: number;
}

// cacheKey -> { blob, url } so we reuse one object URL per blob and can revoke
// it. Full image and thumbnail are cached under separate keys for one id.
const urlCache = new Map<string, { blob: Blob; url: string }>();

function urlFor(key: string, blob: Blob): string {
  const cached = urlCache.get(key);
  if (cached && cached.blob === blob) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(blob);
  urlCache.set(key, { blob, url });
  return url;
}

function toUploaded(s: StoredUpload): UploadedImage {
  const url = urlFor(s.id, s.blob);
  return {
    id: s.id,
    title: s.title,
    url,
    thumbUrl: s.thumb ? urlFor(`thumb:${s.id}`, s.thumb) : url,
    previewUrl: s.preview ? urlFor(`preview:${s.id}`, s.preview) : url,
    addedAt: s.addedAt,
  };
}

/** Read all uploaded images in library order (see getAllUploads). */
export async function loadUploads(): Promise<UploadedImage[]> {
  try {
    const rows = await getAllUploads();
    return rows.map(toUploaded);
  } catch (err) {
    console.warn('Could not read uploaded images.', err);
    return [];
  }
}

/**
 * Persist a new library order. `orderedIds` is the full list of upload ids in
 * the desired order; each row's `order` is rewritten to its index so the
 * sequence sticks across reloads. Ids not present are appended after, keeping
 * their relative order.
 */
export async function reorderUploads(orderedIds: string[]): Promise<void> {
  try {
    const rows = await getAllUploads();
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    // Unlisted rows go after listed ones, preserving current order.
    let tail = orderedIds.length;
    const withRank = rows.map((row) => ({
      row,
      rank: rank.has(row.id) ? rank.get(row.id)! : tail++,
    }));
    await Promise.all(
      withRank.map(({ row, rank }) => putUpload({ ...row, order: rank })),
    );
  } catch (err) {
    console.warn('Could not save library order.', err);
  }
}

// Derive a title from an uploaded file's name: drop extension and an optional
// leading "NN-" ordering prefix, swap separators for spaces, title-case.
function titleFromFile(fileName: string): string {
  const noExt = fileName.replace(/\.[^.]+$/, '');
  const noOrder = noExt.replace(/^\d+[-_ ]+/, '');
  const t = noOrder
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return t || 'Untitled';
}

/**
 * Encode, store, and return an uploaded image. Non-images are rejected. May
 * throw if IndexedDB is unavailable or storage is full.
 */
export async function addUpload(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file.');
  }
  requestPersistence();
  const encoded = await encodeForStorage(file);
  const entry: StoredUpload = {
    id: `uploaded:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: titleFromFile(file.name),
    blob: encoded.blob,
    type: encoded.type,
    addedAt: Date.now(),
    thumb: encoded.thumb,
    preview: encoded.preview,
  };
  await putUpload(entry);
  return toUploaded(entry);
}

export interface BatchResult {
  added: UploadedImage[];
  failed: number;
}

/**
 * Add many files, encoding up to `concurrency` at once so a batch finishes far
 * faster than strictly one-by-one. `onProgress(done, total)` fires as each file
 * settles, for a live indicator. Results preserve input order.
 */
export async function addUploads(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 3,
): Promise<BatchResult> {
  const total = files.length;
  const results: (UploadedImage | null)[] = new Array(total).fill(null);
  let done = 0;
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      try {
        results[i] = await addUpload(files[i]);
      } catch (err) {
        console.warn('Skipped a file:', err);
      }
      done++;
      onProgress?.(done, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, worker),
  );

  const added = results.filter((r): r is UploadedImage => r !== null);
  return { added, failed: total - added.length };
}

/** Remove an uploaded image by id. */
export async function removeUpload(id: string): Promise<void> {
  await deleteUpload(id);
  for (const key of [id, `thumb:${id}`, `preview:${id}`]) {
    const cached = urlCache.get(key);
    if (cached) {
      URL.revokeObjectURL(cached.url);
      urlCache.delete(key);
    }
  }
}
