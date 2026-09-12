import type { NextConfig } from 'next';

/**
 * Hosts allowed to load dev-server resources (HMR, the error overlay).
 *
 * Next blocks these cross-origin by default, which breaks development when you
 * open the dev server from your phone over Tailscale or the LAN. Set
 * DEV_ORIGINS in .env to a comma-separated list to add your own; `*.ts.net`
 * covers Tailscale MagicDNS names, and the 100.x addresses below are the
 * Tailscale CGNAT range.
 *
 * This only affects `next dev`. It has no effect on a production build.
 */
const devOrigins = [
  ...(process.env.DEV_ORIGINS?.split(',').map((h) => h.trim()).filter(Boolean) ?? []),

  // Matching is segment-by-segment: `*` matches exactly one segment, `**`
  // matches any number, and the pattern has to consume the whole hostname.
  // So `*.ts.net` would only match `host.ts.net`, never `host.tailnet.ts.net`.
  '**.ts.net', // Tailscale MagicDNS
  '**.local', // mDNS / Bonjour
  '100.*.*.*', // Tailscale CGNAT addresses
  '192.168.*.*',
  '10.*.*.*',
  '172.*.*.*',
];

const nextConfig: NextConfig = {
  // Produces .next/standalone so the Docker image can ship without node_modules.
  output: 'standalone',
  allowedDevOrigins: devOrigins,
  reactStrictMode: true,
  poweredByHeader: false,
  // Next 16 writes AGENTS.md / CLAUDE.md on dev start; keep the repo tidy.
  agentRules: false,
  serverExternalPackages: ['pg'],
  experimental: {
    serverActions: {
      // Import/restore uploads a JSON backup through a server action.
      bodySizeLimit: '25mb',
    },
  },
  async headers() {
    return [
      {
        // The service worker must never be served from a stale HTTP cache or it
        // becomes impossible to ship an update.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
