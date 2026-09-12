/**
 * The browser-chrome colours, in one place.
 *
 * These are the sRGB values of `--background` in globals.css for each palette.
 * They are repeated as hex because the viewport metadata, the web manifest and
 * the runtime `meta[name=theme-color]` all need a literal colour rather than a
 * custom property, and three copies that drift apart is exactly how the
 * manifest came to claim a blue the app never paints.
 */
export const THEME_COLORS = {
  light: '#fafcff',
  dark: '#0a0d12',
} as const;
