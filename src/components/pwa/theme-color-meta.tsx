'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { THEME_COLORS } from '@/components/pwa/theme-colors';

/**
 * Keeps the browser chrome in step with a theme the user chose by hand.
 *
 * The viewport metadata declares two `theme-color` tags selected by
 * `prefers-color-scheme`, which is right until someone picks Dark on a phone
 * set to Light: next-themes swaps a class on `<html>` and the page turns dark
 * while the status bar and the app switcher stay white. In standalone mode that
 * band of white above the header is the whole top of the screen.
 *
 * Every matching tag is rewritten rather than one being appended, because the
 * browser uses the first `theme-color` whose media query matches, so a tag
 * added at the end of `<head>` would never win.
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    const colour = resolvedTheme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light;
    for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
      tag.setAttribute('content', colour);
    }
  }, [resolvedTheme]);

  return null;
}
