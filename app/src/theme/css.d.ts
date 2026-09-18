/** Types for the CommonJS web-variable emitter (see `css.js`). */

/** `id` of the injected `<style>` element, so injection stays idempotent. */
export declare const COFFEE_THEME_STYLE_ID: string;

/** The `<style>` body: light tokens on `:root`; dark ones under `prefers-color-scheme: dark`
 *  (unless `[data-theme="light"]`) and under `[data-theme="dark"]` (the explicit user choice). */
export declare function themeCss(): string;

/** Idempotently add the variables to `document.head`. No-op outside a browser. */
export declare function injectThemeCss(): void;
