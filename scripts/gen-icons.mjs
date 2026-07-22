// Generates PWA PNG icons from a simple canvas drawing (no external deps).
// Draws a rounded dark tile with an accent puzzle-piece glyph.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal PNG encoder via zlib for a solid-color rounded icon with a puzzle
// glyph is complex; instead we rasterize a small pixel buffer.
import zlib from 'node:zlib';

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

function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const bg = [15, 23, 42]; // base-900
  const accent = [56, 189, 248];
  const r = size * 0.18; // corner radius
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded rect mask
      let inside = true;
      const corners = [
        [r, r],
        [size - r, r],
        [r, size - r],
        [size - r, size - r],
      ];
      for (const [ccx, ccy] of corners) {
        const outX = (ccx === r && x < r) || (ccx !== r && x > size - r);
        const outY = (ccy === r && y < r) || (ccy !== r && y > size - r);
        if (outX && outY) {
          if (Math.hypot(x - ccx, y - ccy) > r) inside = false;
        }
      }
      let col = bg;
      if (inside) {
        // simple puzzle glyph: a plus/knob motif — accent circle in center.
        const d = Math.hypot(x - cx, y - cy);
        if (d < size * 0.26) col = accent;
        // knobs
        const knob = size * 0.1;
        const kb = [
          [cx, cy - size * 0.26],
          [cx + size * 0.26, cy],
        ];
        for (const [kx, ky] of kb) {
          if (Math.hypot(x - kx, y - ky) < knob) col = accent;
        }
        px[i + 3] = 255;
      } else {
        px[i + 3] = 0;
      }
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
    }
  }
  return px;
}

for (const size of [192, 512]) {
  const buf = encodePNG(size, draw(size));
  writeFileSync(join(__dirname, '..', 'public', `icon-${size}.png`), buf);
  console.log(`wrote icon-${size}.png`);
}

void readFileSync;
