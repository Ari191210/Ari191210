// Generates PWA icons (no image deps): sky-blue tile with a white notebook + drone-rotor mark.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for smooth edges
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const p = pixel((x + (sx + 0.5) / 2) / size, (y + (sy + 0.5) / 2) / size);
          r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = a / 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [2, 132, 199, 255];
const WHITE = [255, 255, 255, 255];
const INK = [12, 74, 110, 255];
const CLEAR = [0, 0, 0, 0];

function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** scale < 1 shrinks the mark into the maskable safe zone. */
function mark(x, y, scale) {
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  if (roundRect(u, v, 0.27, 0.2, 0.73, 0.8, 0.05)) {
    if (u > 0.35 && u < 0.65) {
      for (const ly of [0.58, 0.66]) if (Math.abs(v - ly) < 0.018) return INK;
    }
    // rotor: 4 circles around a hub
    const d = (px, py) => Math.hypot(u - px, v - py);
    if (d(0.5, 0.4) < 0.035) return INK;
    for (const [px, py] of [[0.41, 0.31], [0.59, 0.31], [0.41, 0.49], [0.59, 0.49]]) {
      const dd = d(px, py);
      if (dd < 0.055 && dd > 0.035) return INK;
    }
    if (Math.abs(Math.abs(u - 0.5) - Math.abs(v - 0.4)) < 0.012 && Math.abs(u - 0.5) < 0.09) return INK;
    return WHITE;
  }
  return null;
}

const icon = (scale, rounded) => (x, y) => {
  if (rounded && !roundRect(x, y, 0, 0, 1, 1, 0.2)) return CLEAR;
  return mark(x, y, scale) ?? BG;
};

writeFileSync(join(out, 'pwa-192x192.png'), png(192, icon(1, true)));
writeFileSync(join(out, 'pwa-512x512.png'), png(512, icon(1, true)));
writeFileSync(join(out, 'maskable-512x512.png'), png(512, icon(0.75, false)));
writeFileSync(join(out, 'apple-touch-icon-180x180.png'), png(180, icon(0.9, false)));
writeFileSync(
  join(out, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="#0284c7"/><rect x="17" y="13" width="30" height="38" rx="3" fill="#fff"/><circle cx="32" cy="26" r="3" fill="#0c4a6e"/><g fill="none" stroke="#0c4a6e" stroke-width="1.5"><circle cx="26" cy="20" r="3"/><circle cx="38" cy="20" r="3"/><circle cx="26" cy="32" r="3"/><circle cx="38" cy="32" r="3"/></g><path d="M23 37h18M23 42h18" stroke="#0c4a6e" stroke-width="1.5"/></svg>`,
);
console.log('icons written');
