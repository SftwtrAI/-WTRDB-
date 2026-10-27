const nextra = require("nextra");

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.jsx",
  defaultShowCopyCode: true,
});

const isProd = process.env.NODE_ENV === "production";

module.exports = withNextra({
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  experimental: {
    optimisticClientCache: true,
  },

  // Disable image optimization for Nextra
  images: {
    unoptimized: true,
  },

  // Force polling-based file watching — resolves hot-update 404s on
  // external drives and paths with spaces (e.g. /Volumes/Seagate /...)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000, // check for changes every 1s
        aggregateTimeout: 300,
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: "/videos/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Only apply immutable caching to static assets in production.
      // In dev, hot-update chunks change every compile — an immutable
      // cache header causes the browser to serve stale hashes → 404 → full reload.
      ...(isProd
        ? [
            {
              source: "/_next/static/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
          ]
        : []),
    ];
  },

  devIndicators: {
    buildActivity: false,
  },
});
