// Generates the Kavutė app icons (the cup mark) into assets/.
// Requires `sharp` (a devDependency), then: node scripts/gen-icons.mjs
//
// The same mark is drawn by <CupIcon/> in src/components/icons.tsx; keep the two in step if the
// silhouette changes. Colours are the theme's brand tokens (see src/theme/palette.js).
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets');

const ESPRESSO = '#6F4E37'; // primary
const CREAM = '#F3E9DE'; // splash / surface
const AMBER = '#C9962B'; // accent (steam)

// The mark in a 0..64 coordinate space: cup body, handle, saucer, two curls of steam. The group is
// visually centred once the handle is included (body 15..41, handle to 51, saucer 12..48).
function cup(variant) {
  const c =
    variant === 'cream'
      ? { cup: CREAM, steam: AMBER, saucer: CREAM }
      : variant === 'solid'
        ? { cup: '#fff', steam: '#fff', saucer: '#fff' }
        : { cup: ESPRESSO, steam: AMBER, saucer: ESPRESSO };
  return `
    <path d="M15 27 H41 V41 A10 10 0 0 1 31 51 H25 A10 10 0 0 1 15 41 Z" fill="${c.cup}"/>
    <path d="M41 31 H45.5 A5.5 5.5 0 0 1 45.5 42 H41" fill="none" stroke="${c.cup}" stroke-width="4" stroke-linecap="round"/>
    <path d="M12 56 H48" stroke="${c.saucer}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M22.5 21 C20 17.5 25 15.5 22.5 12 M30 21 C27.5 17.5 32.5 15.5 30 12"
          fill="none" stroke="${c.steam}" stroke-width="2.6" stroke-linecap="round"/>`;
}

// Full-bleed square tile + mark, slightly inset so the iOS corner mask never touches the saucer.
const iconSvg = (bg, variant, rx = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-4 -4 72 72">
  <rect x="-4" y="-4" width="72" height="72" rx="${rx}" fill="${bg}"/>
  ${cup(variant)}
</svg>`;

// Mark on transparent, padded into the safe zone (splash / adaptive foreground / monochrome).
const markSvg = (variant, pad = 14) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${-pad} ${-pad} ${64 + 2 * pad} ${64 + 2 * pad}">
  ${cup(variant)}
</svg>`;

// Splash: the espresso cup on a cream disc, so it reads on both the light and the dark splash.
const splashSvg = () => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-4 -4 72 72">
  <circle cx="32" cy="32" r="34" fill="${CREAM}"/>
  ${cup('espresso')}
</svg>`;

const solidSvg = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${bg}"/>
</svg>`;

const png = (markup, size, file) =>
  sharp(Buffer.from(markup)).resize(size, size).png().toFile(join(out, file));

await mkdir(out, { recursive: true });

await Promise.all([
  png(iconSvg(ESPRESSO, 'cream'), 1024, 'icon.png'), // iOS / web: espresso tile, cream cup
  png(iconSvg(ESPRESSO, 'cream', 14), 196, 'favicon.png'),
  png(splashSvg(), 1024, 'splash-icon.png'),
  png(markSvg('cream'), 1024, 'android-icon-foreground.png'), // over adaptiveIcon.backgroundColor
  png(solidSvg(ESPRESSO), 1024, 'android-icon-background.png'),
  png(markSvg('solid'), 1024, 'android-icon-monochrome.png'),
]);

console.log('Generated Kavutė icons in assets/');
