/** Types for the CommonJS palette (see `palette.js`). */

/** Every design token, as a `#RRGGBB` / `#RRGGBBAA` string. */
export interface Palette {
  // surfaces
  bg: string;
  surface: string;
  surfaceAlt: string;

  // ink
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  heading: string;

  // brand primary
  primary: string;
  primaryHover: string;
  primaryInk: string;
  primarySoft: string;

  // status
  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;
  warn: string;
  warnSoft: string;
  warnLine: string;

  // accents
  espresso: string;
  crema: string;
  amber: string;
  amberSoft: string;
  latte: string;
  mocha: string;

  // overlays
  overlay: string;
  scrim: string;
  scrimSoft: string;
  onMedia: string;
  shadow: string;
}

export type TokenName = keyof Palette;

export declare const light: Palette;
export declare const dark: Palette;
export declare const tokens: TokenName[];
/** `surfaceAlt` → `--coffee-surface-alt`. */
export declare function cssVarName(token: TokenName): string;
