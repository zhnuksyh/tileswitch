// Uploads are capped by *pixel dimensions*, not file size. The decoded bitmap
// costs width x height x 4 bytes in RAM regardless of how well the source
// compressed, so a 48MP photo is ~192MB live and can exceed the GPU's max
// texture size (commonly 4096px), forcing a slow CPU raster path. That is what
// makes very large uploads stutter — not their byte count.
//
// The board is capped at 1000 CSS px (see ui/game.ts), so anything beyond
// ~3072px is detail the screen can never show. Images already under the cap are
// stored byte-identical: no re-encode, no generation loss. Only oversized ones
// are resized, and those go to WebP at high quality.

/** Max longest-edge in px for stored uploads. Clear of the 4096 texture limit. */
const MAX_EDGE = 3072;
/** Quality for the re-encode of oversized images. */
const WEBP_QUALITY = 0.9;
/** Longest edge for the library-grid thumbnail. */
const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.8;

export interface EncodedImage {
  blob: Blob;
  type: string;
  /** Dimensions of `blob` (post-resize when the image was oversized). */
  width: number;
  height: number;
  /** Small preview for library grids; undefined if it could not be produced. */
  thumb?: Blob;
}

/** Scale (w,h) so the longest edge is at most `maxEdge`. Never upscales. */
function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: scale < 1,
  };
}

/**
 * Decode to an ImageBitmap, optionally resizing during decode. Passing
 * resizeWidth/Height lets the browser downsample as it decodes, so the full-size
 * bitmap is never materialised — the difference between ~26MB and ~192MB peak.
 */
async function decode(
  file: Blob,
  target?: { width: number; height: number },
): Promise<ImageBitmap> {
  if (target) {
    return createImageBitmap(file, {
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: 'high',
    });
  }
  return createImageBitmap(file);
}

/** Draw a bitmap to a canvas and encode it. Prefers OffscreenCanvas. */
async function toBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/webp', quality });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', quality),
  );
}

/** Fallback dimension read for browsers without createImageBitmap. */
function readDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

/**
 * Prepare a file for storage: resize only if it exceeds MAX_EDGE, and build a
 * thumbnail. Any failure along the way falls back to storing the original
 * untouched — a stored image always beats a rejected one.
 */
export async function encodeForStorage(file: File): Promise<EncodedImage> {
  const original = { blob: file, type: file.type || 'image/*' };

  if (typeof createImageBitmap !== 'function') {
    const { width, height } = await readDimensions(file);
    return { ...original, width, height };
  }

  // Animated sources would lose their animation through a canvas round-trip.
  if (file.type === 'image/gif' || file.type === 'image/apng') {
    const { width, height } = await readDimensions(file);
    return { ...original, width, height };
  }

  let probe: ImageBitmap | undefined;
  try {
    probe = await decode(file);
    const target = fit(probe.width, probe.height, MAX_EDGE);

    let main: Omit<EncodedImage, 'thumb'> = {
      ...original,
      width: probe.width,
      height: probe.height,
    };
    if (target.scaled) {
      // Re-decode at the target size so the oversized bitmap isn't held.
      probe.close();
      probe = await decode(file, target);
      const resized = await toBlob(probe, target.width, target.height, WEBP_QUALITY);
      // Keep the original if the "optimised" version somehow came out larger.
      if (resized && resized.size < file.size) {
        main = {
          blob: resized,
          type: 'image/webp',
          width: target.width,
          height: target.height,
        };
      }
    }

    const t = fit(probe.width, probe.height, THUMB_EDGE);
    const thumb = (await toBlob(probe, t.width, t.height, THUMB_QUALITY)) ?? undefined;
    return { ...main, thumb };
  } catch (err) {
    console.warn('Could not process image; storing the original.', err);
    const { width, height } = await readDimensions(file);
    return { ...original, width, height };
  } finally {
    probe?.close();
  }
}
