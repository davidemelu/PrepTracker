import type { MetadataRoute } from 'next';

/** Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PrepTracker',
    short_name: 'PrepTracker',
    description:
      'Meal planning, meal prep, supplements, hydration, groceries and daily adherence — self-hosted.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#3a5cd6',
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
