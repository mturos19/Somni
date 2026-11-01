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

/**
 * A string that changes whenever what is deployed changes.
 *
 * The service worker names its caches after this, which is the only thing that
 * makes its `activate` handler able to collect the previous deploy's bundles -
 * see the note at the top of public/sw.js. It is inlined into the client bundle
 * through `env` below, because the registration happens in the browser.
 *
 * The deployment id is preferred over the commit so that redeploying the same
 * commit - after changing an environment variable, say - still counts as new.
 * Locally there is neither, and the build's own timestamp does the job.
 */
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  `local-${Date.now().toString(36)}`;

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
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  /*
   * Somni does not use next/image. Every image it has - the icons, the share
   * card - is a fixed asset served straight from /public at a size chosen by
   * hand, so the optimizer has nothing to do here.
   *
   * Turning it off closes /_next/image, which is otherwise a public,
   * unauthenticated endpoint that decodes attacker-chosen image bytes. Three of
   * the advisories fixed in the Next upgrade alongside this were exactly that.
   * An endpoint the app never calls should not be reachable at all.
   */
  images: {
    unoptimized: true,
  },
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
