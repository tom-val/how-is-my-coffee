/**
 * Custom HTML shell for the web build (expo-router). Runs in Node during static rendering only —
 * no browser APIs here.
 *
 * Its job for dark mode: emit every palette token as a CSS custom property under `:root`, plus the
 * dark overrides, so the `var(--coffee-<token>)` values that `src/theme/index.ts` hands to
 * react-native-web resolve per appearance. Same source of truth as iOS (`DynamicColorIOS`) and
 * Android (frozen hex): `src/theme/palette.js`.
 *
 * Caveat: `app.json` sets `web.output: "single"`, and for that SPA output Expo builds `index.html`
 * from its own template and never renders this component. `theme/index.ts` therefore also injects
 * the same stylesheet into `document.head` at runtime (see `theme/css.js`) — idempotent, so if the
 * web output is ever switched to `static` this file takes over and the injection becomes a no-op.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { COFFEE_THEME_STYLE_ID, themeCss } from '@/theme/css';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Kavutė</title>

        {/* Disable body scrolling on web so <ScrollView> behaves like it does on native. */}
        <ScrollViewStyleReset />

        <style id={COFFEE_THEME_STYLE_ID} dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
