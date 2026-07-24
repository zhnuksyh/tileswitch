// Images the user adds at runtime (drag-drop or file-select). Stored as Blobs
// in IndexedDB (see db.ts) and re-encoded to WebP on the way in (see encode.ts)
// so a large personal library stays light. Each stored Blob is exposed to the
// UI as an object URL, cached by id so repeated reads don't leak URLs.

import { getAllUploads, putUpload, deleteUpload, type StoredUpload } from './db';
import { encodeForStorage } from './encode';

export interface UploadedImage {
  id: string;
  title: string;
  /** Object URL for display, valid for the page's lifetime. */
  url: string;
  addedAt: number;
}

// id -> { blob, url } so we reuse one object URL per image and can revoke it.
const urlCache = new Map<string, { blob: Blob; url: string }>();

function urlFor(id: string, blob: Blob): string {
  const cached = urlCache.get(id);
  if (cached && cached.blob === blob) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(blob);
  urlCache.set(id, { blob, url });
  return url;
}

function toUploaded(s: StoredUpload): UploadedImage {
  return { id: s.id, title: s.title, url: urlFor(s.id, s.blob), addedAt: s.addedAt };
}

/** Read all uploaded images, oldest first. */
export async function loadUploads(): Promise<UploadedImage[]> {
  try {
    const rows = await getAllUploads();
    return rows.map(toUploaded);
  } catch (err) {
    console.warn('Could not read uploaded images.', err);
    return [];
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
  const encoded = await encodeForStorage(file);
  const entry: StoredUpload = {
    id: `uploaded:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: titleFromFile(file.name),
    blob: encoded.blob,
    type: encoded.type,
    addedAt: Date.now(),
  };
  await putUpload(entry);
  return toUploaded(entry);
}

/** Remove an uploaded image by id. */
export async function removeUpload(id: string): Promise<void> {
  await deleteUpload(id);
  const cached = urlCache.get(id);
  if (cached) {
    URL.revokeObjectURL(cached.url);
    urlCache.delete(id);
  }
}
