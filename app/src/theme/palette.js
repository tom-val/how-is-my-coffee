/**
 * "How is my coffee?" colour palette — the single source of truth for both schemes.
 *
 * Plain CommonJS on purpose: this file is `require`d from Node during the web build (`theme/css.js`,
 * itself required from `src/app/+html.tsx`) as well as from `src/theme/index.ts`. Keep it
 * dependency-free and free of TS/ESM syntax. Types live in `palette.d.ts`.
 *
 * Colours are `#RRGGBB` or `#RRGGBBAA` — the 8-digit form is understood by React Native and CSS.
 *
 * The palette is a cafe counter: espresso brown as the brand primary, cream/latte surfaces, and a
 * single amber accent reserved for stars and the "rate" affordance. Dark values are lifted so body
 * text (ink), muted text (inkSoft) and the primary button label clear WCAG AA on their own grounds
 * — a #6F4E37 button on near-black is unreadable, so dark mode uses a milk-tinted brown instead.
 */

/** @type {import('./palette').Palette} */
const light = {
  // surfaces
  bg: '#FBF6F0', // cream
  surface: '#FFFFFF',
  surfaceAlt: '#F3E9DE', // latte

  // ink
  ink: '#2A211B',
  inkSoft: '#6E5D51',
  inkFaint: '#9C8A7C',
  line: '#E7DACB',
  heading: '#4A3226', // dark roast — big titles & wordmark

  // brand primary (espresso)
  primary: '#6F4E37',
  primaryHover: '#5A3E2B',
  primaryInk: '#FFF8F1',
  primarySoft: '#F1E4D6',

  // status
  good: '#3F7D4E',
  goodSoft: '#E3F0E5',
  bad: '#C0503A',
  badSoft: '#F8E5DF',
  warn: '#8A5A00',
  warnSoft: '#FBEDD2',
  warnLine: '#E0B25C',

  // accents
  espresso: '#6F4E37',
  crema: '#C99B62',
  amber: '#E0A32E', // the one accent: stars, the rate button, "new" markers
  amberSoft: '#FBEED5',
  latte: '#F3E9DE',
  mocha: '#3D2B1F',

  // overlays (scheme-aware so dark mode can go heavier)
  overlay: '#00000059', // scrim over photos
  scrim: '#00000073', // modal / sheet backdrop
  scrimSoft: '#0000002E', // light dim behind popovers
  onMedia: '#FFFFFF', // text & icons sitting on a photo
  shadow: '#2A211B',
};

/** @type {import('./palette').Palette} */
const dark = {
  // surfaces — warm near-black, so the browns still read as "cafe after closing"
  bg: '#171210',
  surface: '#211A16',
  surfaceAlt: '#2B221C',

  // ink
  ink: '#F2E8DE',
  inkSoft: '#B7A597',
  inkFaint: '#8E7D70',
  line: '#3A2E26',
  heading: '#E9C9A3',

  // brand primary — milk stirred in, so it survives on a dark ground
  primary: '#C89B6E',
  primaryHover: '#D8AE83',
  primaryInk: '#241812',
  primarySoft: '#3A2A1F',

  // status
  good: '#7FBF8C',
  goodSoft: '#1F3223',
  bad: '#EE8F79',
  badSoft: '#3A1F1A',
  warn: '#F0C069',
  warnSoft: '#42310F',
  warnLine: '#7A5F28',

  // accents
  espresso: '#C89B6E',
  crema: '#E0B888',
  amber: '#F0B84A',
  amberSoft: '#3D2E14',
  latte: '#2B221C',
  mocha: '#E9C9A3',

  // overlays
  overlay: '#00000080',
  scrim: '#000000A6',
  scrimSoft: '#00000073',
  onMedia: '#FFFFFF',
  shadow: '#000000',
};

/** Token names, in declaration order. */
const tokens = /** @type {import('./palette').TokenName[]} */ (Object.keys(light));

/** `surfaceAlt` → `--coffee-surface-alt` — the CSS custom property emitted for the web build. */
const cssVarName = (token) => '--coffee-' + token.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

module.exports = { light, dark, tokens, cssVarName };
