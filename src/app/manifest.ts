import type { MetadataRoute } from 'next';
import { THEME_COLORS } from '@/components/pwa/theme-colors';

/** Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    /*
     * The identity of the installed app, fixed independently of start_url.
     * Without it the browser derives one from start_url, so moving the landing
     * screen would read as a different application and install a second icon
     * beside the first.
     */
    id: '/',
    name: 'PrepTracker',
    short_name: 'PrepTracker',
    description:
      'Meal planning, meal prep, supplements, hydration, groceries and daily adherence — self-hosted.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    /*
     * Ordered by preference: a chromeless window if the platform offers one,
     * otherwise a minimal one that at least keeps a reload control. `display`
     * above remains for browsers that do not read this list.
     */
    display_override: ['standalone', 'minimal-ui'],
    /*
     * No `orientation` lock. It was set to portrait, which is how the app is
     * held on a phone but not how it is read on a tablet, and the layout has no
     * trouble in landscape.
     *
     * The colours are the light palette's `--background`, which is what the app
     * actually paints; the previous value was a blue that appears nowhere in
     * the design, so the splash screen and the app switcher disagreed with the
     * first frame of the app.
     */
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    categories: ['health', 'lifestyle', 'food'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Today', short_name: 'Today', url: '/today' },
      { name: 'Groceries', short_name: 'Groceries', url: '/groceries' },
      { name: 'Prep', short_name: 'Prep', url: '/prep' },
    ],
  };
}
