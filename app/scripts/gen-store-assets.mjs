// Store graphics that are not screenshots, into ../store/graphics/:
//   play-icon-512.png        Google Play hi-res icon (512×512, 32-bit PNG, no alpha in the corners)
//   .feature-background.png  textless feature graphic background (finished by store/make_graphics.py)
// Run via: python3 store/make_graphics.py
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

import sharp from 'sharp';

const out = join(root, '..', 'store', 'graphics');

const ESPRESSO = '#6F4E37';
const CREAM = '#F3E9DE';
const AMBER = '#C9962B';

// Same mark as scripts/gen-icons.mjs (0..64 space).
const cup = (c, steam) => `
  <path d="M15 27 H41 V41 A10 10 0 0 1 31 51 H25 A10 10 0 0 1 15 41 Z" fill="${c}"/>
  <path d="M41 31 H45.5 A5.5 5.5 0 0 1 45.5 42 H41" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
  <path d="M12 56 H48" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M22.5 21 C20 17.5 25 15.5 22.5 12 M30 21 C27.5 17.5 32.5 15.5 30 12" fill="none" stroke="${steam}" stroke-width="2.6" stroke-linecap="round"/>`;

await mkdir(out, { recursive: true });

// 512 icon: same art as the app icon, full-bleed square (Play applies its own mask).
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-4 -4 72 72">
  <rect x="-4" y="-4" width="72" height="72" fill="${ESPRESSO}"/>${cup(CREAM, AMBER)}</svg>`))
  .png().toFile(join(out, 'play-icon-512.png'));

// Feature graphic: espresso field, cream disc with the cup on the left, wordmark + tagline right.
const W = 1024, H = 500;
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${ESPRESSO}"/>
  <circle cx="250" cy="250" r="165" fill="${CREAM}"/>
  <svg x="125" y="125" width="250" height="250" viewBox="0 0 64 64">${cup(ESPRESSO, AMBER)}</svg>
</svg>`);
// Text is added by store/make_graphics.py (Pillow reads the bundled TTFs directly; libvips' text
// renderer ignores fontconfig settings on macOS and falls back to a generic sans).
await sharp(bg).flatten({ background: ESPRESSO }).png().toFile(join(out, '.feature-background.png'));

console.log(`Store graphics written to ${out}`);
