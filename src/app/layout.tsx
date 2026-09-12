import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { ThemeColorMeta } from '@/components/pwa/theme-color-meta';
import { THEME_COLORS } from '@/components/pwa/theme-colors';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PrepTracker',
    template: '%s · PrepTracker',
  },
  description: 'Meal planning, prep, supplements, hydration and groceries in one place.',
  applicationName: 'PrepTracker',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'PrepTracker',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch zoom stays enabled (WCAG 1.4.4). Double-tap zoom on controls is
  // prevented with `touch-action: manipulation` in globals.css instead.
  viewportFit: 'cover',
  // Lets the iOS keyboard shrink the layout viewport instead of covering it, so
  // a sheet's footer buttons stay above the keys while a field in that sheet is
  // being typed into.
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 3500 }} />
          <ServiceWorkerRegistrar />
          <ThemeColorMeta />
        </ThemeProvider>
      </body>
    </html>
  );
}
