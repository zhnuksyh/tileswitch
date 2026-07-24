// Social-style share: compose the picture with its note into a framed image
// card (not a playable puzzle) that the user can save or share to social media.
// Everything is drawn on a canvas and exported as a PNG.

const CARD_W = 1080; // square-ish social card
const PAD = 64;
const BG = '#0f172a'; // base-900
const CARD_BG = '#1e293b'; // base-800
const ACCENT = '#38bdf8';
const TEXT = '#e2e8f0';
const MUTED = '#94a3b8';

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}

// Draw a rounded rectangle path.
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Word-wrap text to a max width, returning the lines.
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface ShareCardInput {
  title: string;
  note: string;
  src: string;
}

/**
 * Render a share card to a PNG Blob: the image on top (16:9, rounded), then the
 * title, the note, and a small TileSwitch footer, on a framed dark background.
 */
export async function buildShareCard(input: ShareCardInput): Promise<Blob> {
  const img = await loadImg(input.src);

  const font =
    "600 40px Fredoka, system-ui, sans-serif";
  const noteFont = "400 34px Fredoka, system-ui, sans-serif";

  // Measure note height first so the card grows to fit it.
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = noteFont;
  const innerW = CARD_W - PAD * 2;
  const imgH = Math.round((innerW * 9) / 16);
  const noteLines = input.note ? wrapLines(measure, input.note, innerW - 48) : [];
  const noteBlockH = noteLines.length
    ? 48 /*pad*/ + noteLines.length * 46 + 24
    : 0;

  const cardH = PAD + imgH + 36 + 56 /*title*/ + noteBlockH + 72 /*footer*/ + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = cardH;
  const ctx = canvas.getContext('2d')!;

  // Background.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_W, cardH);

  // Card panel.
  roundRect(ctx, PAD / 2, PAD / 2, CARD_W - PAD, cardH - PAD, 40);
  ctx.fillStyle = CARD_BG;
  ctx.fill();

  // Image, cover-cropped into a 16:9 rounded frame.
  const ix = PAD;
  const iy = PAD;
  roundRect(ctx, ix, iy, innerW, imgH, 28);
  ctx.save();
  ctx.clip();
  const scale = Math.max(innerW / img.naturalWidth, imgH / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, ix + (innerW - dw) / 2, iy + (imgH - dh) / 2, dw, dh);
  ctx.restore();

  // Title.
  let y = iy + imgH + 36 + 40;
  ctx.fillStyle = TEXT;
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(truncateToWidth(ctx, input.title, innerW), PAD, y);

  // Note block.
  if (noteLines.length) {
    const boxY = y + 24;
    roundRect(ctx, PAD, boxY, innerW, noteBlockH, 24);
    ctx.fillStyle = 'rgba(15,23,42,0.6)';
    ctx.fill();
    // Accent quote bar.
    ctx.fillStyle = ACCENT;
    roundRect(ctx, PAD + 20, boxY + 22, 6, noteBlockH - 44, 3);
    ctx.fill();

    ctx.fillStyle = TEXT;
    ctx.font = noteFont;
    let ny = boxY + 48;
    for (const line of noteLines) {
      ctx.fillText(line, PAD + 44, ny);
      ny += 46;
    }
    y = boxY + noteBlockH;
  }

  // Footer.
  ctx.fillStyle = MUTED;
  ctx.font = "500 28px Fredoka, system-ui, sans-serif";
  ctx.fillText('Made with TileSwitch', PAD, cardH - PAD + 4);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not render the card.'));
    }, 'image/png');
  });
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function safeName(title: string): string {
  return title.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'tileswitch';
}

/** Download the card as a PNG. */
export function downloadCard(blob: Blob, title: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(title)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Whether the native share sheet can share files (mainly mobile). */
export function canNativeShareFiles(): boolean {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (!nav.share || !nav.canShare) return false;
  try {
    const probe = new File([new Blob()], 'x.png', { type: 'image/png' });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Share the card via the OS share sheet. Returns false if unavailable/cancelled. */
export async function nativeShareCard(blob: Blob, title: string): Promise<boolean> {
  if (!canNativeShareFiles()) return false;
  const file = new File([blob], `${safeName(title)}.png`, { type: 'image/png' });
  try {
    await (navigator as Navigator).share({ files: [file], title });
    return true;
  } catch {
    return false; // user cancelled or share failed
  }
}
