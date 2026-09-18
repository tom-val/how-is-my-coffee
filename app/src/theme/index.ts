/**
 * "How is my coffee?" design tokens — espresso brown, cream surfaces, one amber accent.
 * Fonts: Fraunces (headings — a warm, slightly bookish serif) and DM Sans (body/interface).
 *
 * Dark mode: the hex values live in `palette.js` (one source of truth, shared with `theme/css.js`
 * and `src/app/+html.tsx`); `colors` below turns each token into whatever the platform needs, so
 * `StyleSheet.create({ x: { color: colors.ink } })` at module scope keeps working everywhere:
 *   iOS      `DynamicColorIOS({ light, dark })` — re-resolves live when the appearance changes.
 *   Android  a PLAIN HEX string, frozen at bundle load for the scheme resolved then (see
 *            `./appearance` for why nothing else is possible there).
 *   web      `var(--coffee-<token>)` (react-native-web passes `var(...)` through).
 * Tokens whose two schemes are identical stay plain strings.
 *
 * Need an actual string (status bar, image tint math, a third-party prop that rejects platform
 * colours)? Use `useColors()` / `lightColors` / `darkColors`.
 */
import { DynamicColorIOS, Platform, type ColorValue } from 'react-native';

// Side-effect import, and it must come first: `./appearance` reads the stored preference
// synchronously and pushes it at the platform at module load, so `schemeAware()` below (and the
// first render) already sees the scheme the user picked — no flash of the wrong theme.
import { loadTimeScheme, useResolvedScheme } from './appearance';
import { injectThemeCss } from './css';
import {
  cssVarName,
  dark as darkPalette,
  light as lightPalette,
  tokens,
  type Palette,
  type TokenName,
} from './palette';

// Web: `app.json` uses `web.output: "single"`, and for that SPA output Expo builds `index.html`
// from its own template rather than from `src/app/+html.tsx`, so put the custom properties in the
// document ourselves. Idempotent — a no-op if `+html.tsx` already emitted them, and outside a
// browser (native, SSR).
if (Platform.OS === 'web') injectThemeCss();

/** The raw hex palettes — plain strings, safe to hand to anything that demands a string. */
export const lightColors: Palette = lightPalette;
export const darkColors: Palette = darkPalette;

/** Every design token, resolved by the OS appearance at draw time. */
export type Colors = { readonly [K in TokenName]: ColorValue };

function schemeAware(token: TokenName): ColorValue {
  const lightValue = lightPalette[token];
  const darkValue = darkPalette[token];
  if (lightValue === darkValue) return lightValue; // no need to pay for a dynamic colour
  // Branch lazily, never via Platform.select: its object literal would *call* DynamicColorIOS on
  // Android, where it throws.
  if (Platform.OS === 'ios') return DynamicColorIOS({ light: lightValue, dark: darkValue });
  if (Platform.OS === 'android') return loadTimeScheme === 'dark' ? darkValue : lightValue;
  return `var(${cssVarName(token)})`;
}

export const colors = Object.freeze(
  Object.fromEntries(tokens.map((token) => [token, schemeAware(token)])),
) as Colors;

/** The plain hex palette for the active scheme — the user's Appearance choice, else the OS. */
export function useColors(): Palette {
  return useResolvedScheme() === 'dark' ? darkColors : lightColors;
}

/** True when the app is drawing dark — the user's Appearance choice, else the OS. */
export function useIsDark(): boolean {
  return useResolvedScheme() === 'dark';
}

/** The appearance preference lives next door; re-exported so screens import it from `@/theme`. */
export {
  APPEARANCE_PREFERENCES,
  getAppearancePreference,
  liveSchemeSwitching,
  setAppearancePreference,
  useAppearancePreference,
  useResolvedScheme,
  type AppearancePreference,
  type ApplyOutcome,
} from './appearance';

/** Brand fonts — Fraunces for headings/wordmark, DM Sans for body and interface. */
export const fonts = {
  heading: 'Fraunces_700Bold',
  headingSemi: 'Fraunces_600SemiBold',
  body: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

/** 4-point grid. Name steps by size, never by use. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Named text styles. Screens use these instead of raw font sizes. */
export const type = {
  display: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36 },
  title: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28 },
  section: { fontFamily: fonts.headingSemi, fontSize: 17, lineHeight: 22 },
  headline: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
} as const;

export const shadows = {
  card: '0 1px 2px rgba(42, 33, 27, 0.06)',
  raised: '0 6px 16px rgba(42, 33, 27, 0.12)',
  overlay: '0 10px 30px rgba(42, 33, 27, 0.22)',
} as const;

export const motion = { fast: 140, base: 220, slow: 360 } as const;

/** Max width of the app column — keeps it phone-shaped and centred on web/tablet. */
export const maxContentWidth = 500;

export const theme = { colors, fonts, spacing, radius, type, shadows, motion, maxContentWidth };
export default theme;
