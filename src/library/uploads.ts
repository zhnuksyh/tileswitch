// Images the user adds at runtime (drag-drop or file-select) are stored as
// data URLs in localStorage so they persist across sessions and join the
// library pool alongside personal/public images.

export interface UploadedImage {
  id: string;
  title: string;
  /** data:image/...;base64,... — self-contained, survives reloads. */
  dataUrl: string;
  /** Epoch ms, for stable ordering (newest last). */
  addedAt: number;
}

const KEY = 'tileswitch:uploads:v1';

/** Read the uploaded-image list, tolerating a corrupt/absent store. */
export function loadUploads(): UploadedImage[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (u): u is UploadedImage =>
          u && typeof u.id === 'string' && typeof u.dataUrl === 'string',
      )
      .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
  } catch {
    return [];
  }
}

function saveUploads(list: UploadedImage[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (err) {
    // Most likely the localStorage quota (data URLs are large).
    console.warn('Could not save uploaded image — storage may be full.', err);
    throw err;
  }
}

// Derive a title from an uploaded file's name (same rules as the README).
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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Persist an image File as an upload and return its library entry data.
 * Non-images are rejected.
 */
export async function addUpload(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file.');
  }
  const dataUrl = await readAsDataUrl(file);
  const entry: UploadedImage = {
    id: `uploaded:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: titleFromFile(file.name),
    dataUrl,
    addedAt: Date.now(),
  };
  const list = loadUploads();
  list.push(entry);
  saveUploads(list);
  return entry;
}

/** Remove an uploaded image by id. Returns true if something was removed. */
export function removeUpload(id: string): boolean {
  const list = loadUploads();
  const next = list.filter((u) => u.id !== id);
  if (next.length === list.length) return false;
  saveUploads(next);
  return true;
}
