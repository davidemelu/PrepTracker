/**
 * Generates the PWA icon set.
 *
 * Writes real PNGs with Node's built-in zlib rather than committing binaries or
 * pulling in an image library, so the icons can be regenerated or restyled by
 * editing this file. Replace it with your own artwork whenever you like — the
 * filenames are all that matter.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'public', 'icons');

/** PrepTracker blue, matching --primary in the light theme. */
const BG = [58, 92, 214];
const FG = [255, 255, 255];

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is prefixed with a filter byte; filter 0 means "none".
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draws a rounded square with a plate-and-fork glyph: a filled circle with a
 * vertical bar to its left and three tines to its right.
 */
function drawIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = maskable ? size / 2 : size * 0.22;
  // Maskable icons must keep their content inside the safe zone (80%).
  const scale = maskable ? 0.62 : 0.8;

  const cx = size / 2;
  const cy = size / 2;

  const set = (x, y, [r, g, b], a = 255) => {
    const i = (y * size + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  };

  const insideRoundedSquare = (x, y) => {
    const left = 0;
    const top = 0;
    const right = size - 1;
    const bottom = size - 1;
    const nearestX = Math.min(Math.max(x, left + radius), right - radius);
    const nearestY = Math.min(Math.max(y, top + radius), bottom - radius);
    const dx = x - nearestX;
    const dy = y - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (insideRoundedSquare(x, y)) set(x, y, BG);
      else set(x, y, [0, 0, 0], 0);
    }
  }

  // Plate: a ring, offset slightly right of centre.
  const plateCx = cx + size * 0.06 * scale;
  const plateR = size * 0.2 * scale;
  const plateInner = plateR * 0.62;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - plateCx, y - cy);
      if (d <= plateR && d >= plateInner) set(x, y, FG);
    }
  }

  // Fork: a handle plus three tines, to the left of the plate.
  const forkX = cx - size * 0.24 * scale;
  const barW = Math.max(2, Math.round(size * 0.035 * scale));
  const handleTop = cy - size * 0.02 * scale;
  const handleBottom = cy + size * 0.26 * scale;

  for (let y = Math.round(handleTop); y <= Math.round(handleBottom); y += 1) {
    for (let x = Math.round(forkX - barW / 2); x <= Math.round(forkX + barW / 2); x += 1) {
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, FG);
    }
  }

  const tineTop = cy - size * 0.26 * scale;
  for (const offset of [-1, 0, 1]) {
    const tx = forkX + offset * barW * 1.9;
    for (let y = Math.round(tineTop); y <= Math.round(handleTop); y += 1) {
      for (let x = Math.round(tx - barW / 2); x <= Math.round(tx + barW / 2); x += 1) {
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, FG);
      }
    }
  }

  return encodePng(size, size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-192.png', 192, { maskable: true }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
  ['favicon-32.png', 32, {}],
];

for (const [name, size, options] of targets) {
  writeFileSync(path.join(OUT_DIR, name), drawIcon(size, options));
  console.log(`wrote public/icons/${name} (${size}×${size})`);
}
