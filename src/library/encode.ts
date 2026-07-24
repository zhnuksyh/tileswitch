// Re-encode an uploaded image to WebP to keep storage light. Resolution is
// preserved (no downscaling) — only the codec changes. WebP at high quality is
// visually lossless for photos while typically 25-50% smaller than the source.
//
// Safety net: if WebP encoding isn't supported, fails, or somehow produces a
// *larger* file than the original, we keep the original bytes untouched. That
// way an upload is never worse than what the user picked.

const WEBP_QUALITY = 0.92;
/** Cap on either dimension. Canvas has hard limits (~16k), and nothing in a
 *  puzzle needs more; only images beyond this are scaled down to fit. */
const MAX_EDGE = 8192;

export interface EncodedImage {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}

function loadBitmap(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Return the bytes to store for `file`: a WebP re-encode when that's smaller
 * and supported, otherwise the original. Always reports final dimensions.
 */
export async function encodeForStorage(file: File): Promise<EncodedImage> {
  const original: EncodedImage = {
    blob: file,
    type: file.type || 'image/*',
    width: 0,
    height: 0,
  };

  let img: HTMLImageElement;
  try {
    img = await loadBitmap(file);
  } catch {
    return original; // Undecodable here; store as-is and let display try.
  }

  let { naturalWidth: w, naturalHeight: h } = img;
  original.width = w;
  original.height = h;

  // Only scale if a dimension exceeds the canvas cap.
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, tw, th);

  const webp = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
  // toBlob may yield null, or a browser without WebP falls back to PNG (which
  // would be huge). Accept WebP only if it's genuinely a WebP and smaller.
  if (
    webp &&
    webp.type === 'image/webp' &&
    (scale < 1 || webp.size < file.size)
  ) {
    return { blob: webp, type: 'image/webp', width: tw, height: th };
  }

  return original;
}
