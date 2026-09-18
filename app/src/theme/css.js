/**
 * The web half of the theme: every palette token as a CSS custom property, so the
 * `var(--coffee-<token>)` values that `theme/index.ts` gives react-native-web resolve, and flip
 * with `prefers-color-scheme`.
 *
 * CommonJS like `palette.js` so it can be required from Node during static rendering.
 *
 * Two consumers, on purpose:
 *  - `src/app/+html.tsx` inlines it in `<head>` — the right place, but expo-router only renders
 *    `+html` for the static/server web output.
 *  - `theme/index.ts` injects the same block into `document.head` at module load on web, which is
 *    what actually covers this app: `app.json` sets `web.output: "single"`, and for that SPA output
 *    Expo builds `index.html` from its own template and never touches `+html.tsx`.
 * The `COFFEE_THEME_STYLE_ID` guard makes the second a no-op when the first already ran.
 */
const { cssVarName, dark, light, tokens } = require('./palette');

const COFFEE_THEME_STYLE_ID = 'coffee-theme-vars';

const block = (palette, indent) =>
  tokens.map((token) => `${indent}${cssVarName(token)}: ${palette[token]};`).join('\n');

/**
 * The full `<style>` body.
 *
 * Light tokens sit on `:root`; the dark ones are applied twice, because the scheme has two inputs:
 *  - the OS (`prefers-color-scheme: dark`), but only while the user has not picked Light —
 *    hence the `:root:not([data-theme="light"])` guard;
 *  - the explicit choice, `:root[data-theme="dark"]`, which must also win when the OS is light.
 * `theme/appearance.ts` writes/removes `document.documentElement.dataset.theme`; no attribute at
 * all means "follow the system", which is the media query above on its own.
 */
function themeCss() {
  return `:root {
${block(light, '  ')}
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${block(dark, '    ')}
  }
}

:root[data-theme="dark"] {
${block(dark, '  ')}
  color-scheme: dark;
}

:root[data-theme="light"] {
  color-scheme: light;
}

body {
  background-color: var(--coffee-surface-alt);
}
`;
}

/** Idempotently add the variables to `document.head`. No-op outside a browser. */
function injectThemeCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(COFFEE_THEME_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = COFFEE_THEME_STYLE_ID;
  style.textContent = themeCss();
  // Prepend so anything else in <head> can still win a specificity fight.
  document.head.insertBefore(style, document.head.firstChild);
}

module.exports = { COFFEE_THEME_STYLE_ID, themeCss, injectThemeCss };
