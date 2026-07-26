// Generates the PWA PNG icons from a hand-rasterized drawing (no external
// deps). Keep in sync with public/favicon.svg: a rounded dark-grey tile with
// lucide's `grid-2x2` glyph — the tile grid the game is played on — stroked in
// the accent grey.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, pixels) {
  // pixels: Uint8Array RGBA length size*size*4
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    for (let x = 0; x < size * 4; x++) {
      raw[y * (size * 4 + 1) + 1 + x] = pixels[y * size * 4 + x];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance to a rounded rectangle centred on (cx, cy); negative inside.
function sdRoundRect(x, y, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(x - cx) - (halfW - r);
  const qy = Math.abs(y - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

// Signed distance to an axis-aligned segment from (x0, y0) to (x1, y1).
function sdSegment(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

// Coverage of a distance field edge, smoothed over roughly one pixel so the
// curves and strokes do not alias at 192px.
function coverage(d) {
  return Math.min(1, Math.max(0, 0.5 - d));
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const bg = [38, 38, 38]; // base-700 — the grey the icon sits on
  const accent = [212, 212, 212]; // accent.DEFAULT
  const s = size / 24; // scale from the 24x24 lucide viewBox
  const c = size / 2;
  // Glyph geometry mirrors favicon.svg: an 11x11 grid inset in the 24x24 box.
  const half = 5.5 * s;
  const stroke = s; // lucide's stroke-width: 2 → 1 unit either side of centre

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px5 = x + 0.5;
      const py5 = y + 0.5;

      // Backplate: rounded square filling the canvas.
      const plate = sdRoundRect(px5, py5, c, c, size / 2, size / 2, 5 * s);
      const plateA = coverage(plate);

      // Glyph: the grid outline plus its centre cross, stroked.
      const outline = Math.abs(sdRoundRect(px5, py5, c, c, half, half, 1.5 * s));
      const vert = sdSegment(px5, py5, c, c - half, c, c + half);
      const horiz = sdSegment(px5, py5, c - half, c, c + half, c);
      const glyph = Math.min(outline, vert, horiz) - stroke;
      const glyphA = coverage(glyph);

      const col = mix(bg, accent, glyphA);
      px[i] = Math.round(col[0]);
      px[i + 1] = Math.round(col[1]);
      px[i + 2] = Math.round(col[2]);
      px[i + 3] = Math.round(plateA * 255);
    }
  }
  return px;
}

for (const size of [192, 512]) {
  const buf = encodePNG(size, draw(size));
  writeFileSync(join(__dirname, '..', 'public', `icon-${size}.png`), buf);
  console.log(`wrote icon-${size}.png`);
}
