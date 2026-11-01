// Renders the app and tray icons into resources/icons without image tooling:
// signed-distance shapes, 4x4 supersampling and a hand-written PNG encoder.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const out = new URL('../resources/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 4;
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy += 1) for (let sx = 0; sx < S; sx += 1) {
        const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = a ? Math.round(r / a) : 0;
      raw[i + 1] = a ? Math.round(g / a) : 0;
      raw[i + 2] = a ? Math.round(b / a) : 0;
      raw[i + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const roundedBox = (x, y, half, radius) => {
  const qx = Math.abs(x - 0.5) - half + radius;
  const qy = Math.abs(y - 0.5) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const INDIGO = [79, 70, 229];
const VIOLET = [147, 51, 234];
const WHITE = [255, 255, 255];
const RED = [239, 68, 68];

/** App icon: indigo-violet squircle, white "lens" ring and a red recording dot. */
function app(x, y) {
  if (roundedBox(x, y, 0.42, 0.2) > 0) return [0, 0, 0, 0];
  const base = mix(INDIGO, VIOLET, (x + y) / 2);
  const d = dist(x, y, 0.5, 0.5);
  if (d < 0.13) return [...RED, 1];
  if (d > 0.2 && d < 0.27) return [...WHITE, 1];
  return [...base, 1];
}
/** Tray: the same mark without the plate, so it reads on light and dark panels. */
function tray(recording) {
  return (x, y) => {
    const d = dist(x, y, 0.5, 0.5);
    if (d < (recording ? 0.24 : 0.16)) return [...(recording ? RED : INDIGO), 1];
    if (d > 0.32 && d < 0.46) return [...(recording ? RED : INDIGO), 1];
    return [0, 0, 0, 0];
  };
}
function template(x, y) {
  const d = dist(x, y, 0.5, 0.5);
  return d < 0.16 || (d > 0.32 && d < 0.46) ? [0, 0, 0, 1] : [0, 0, 0, 0];
}

const files = {
  'icon.png': png(1024, app),
  '512x512.png': png(512, app),
  '256x256.png': png(256, app),
  'tray.png': png(32, tray(false)),
  'tray@2x.png': png(64, tray(false)),
  'tray-recording.png': png(32, tray(true)),
  'tray-recording@2x.png': png(64, tray(true)),
  'trayTemplate.png': png(16, template),
  'trayTemplate@2x.png': png(32, template),
};
for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, out), data);
console.log(`icons: ${Object.keys(files).join(', ')}`);
