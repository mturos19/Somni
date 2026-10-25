import type { NextConfig } from "next";

/**
 * Security headers for every response.
 *
 * Next's own `headers()` is the portable place for these: it is part of the
 * build output, so it applies the same whichever platform serves the app.
 */

/**
 * React's development build uses eval() - for hot reloading, and to rebuild
 * callstacks that crossed the server/client boundary. Under `next dev` a policy
 * without 'unsafe-eval' breaks those outright, which is a console error on
 * every page load and no working error overlay.
 *
 * It is scoped strictly to development. React never uses eval() in a production
 * build, so the shipped policy stays tight.
 */
const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  // The app is never meant to be framed; an embedded copy is someone else's
  // page wearing Somni's face. `frame-ancestors` is the modern form and is
  // what browsers honour when both are present.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send an origin to third parties, never the full URL.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app needs the microphone for voice cloning, and nothing else.
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next inlines a small bootstrap and React injects style attributes;
      // both need 'unsafe-inline' here, and neither accepts a nonce without
      // making every response dynamic.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      // next/font/google downloads Fraunces and Nunito at build time and serves
      // them from /_next/static/media, so nothing is fetched from Google at
      // runtime and no Google origin belongs in this policy.
      "font-src 'self' data:",
      // Narration arrives as a blob and is played from an object URL.
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      // `ws:` is the dev server's hot-reload socket, and nothing else.
      `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      /*
       * Never cache the service worker. It is the one file that decides how
       * everything else is cached, so a stale copy strands a parent on an old
       * build with no way to recover. Browsers revalidate worker scripts
       * anyway; this makes it certain.
       *
       * Files under /_next/static are content-hashed and the platform already
       * serves them immutable, so they need nothing here.
       */
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // The brand assets change only when the brand does.
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
      {
        source: "/og.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
