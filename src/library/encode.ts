// Uploaded images are stored at full original quality — no compression, no
// downscaling. IndexedDB's quota is browser-managed (typically hundreds of MB
// to GBs), so 60 originals fit comfortably; there's no need to trade away
// fidelity. We keep the exact bytes the user picked.
//
// The only processing is an optional decode to record dimensions for metadata;
// if that fails we still store the original as-is.

export interface EncodedImage {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}

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

/** Store the original file untouched, tagging it with its dimensions. */
export async function encodeForStorage(file: File): Promise<EncodedImage> {
  const { width, height } = await readDimensions(file);
  return { blob: file, type: file.type || 'image/*', width, height };
}
