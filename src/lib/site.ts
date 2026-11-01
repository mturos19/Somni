/**
 * Where this copy of Somni actually lives.
 *
 * Social scrapers will not follow a relative image path, and neither robots.txt
 * nor a sitemap may contain one at all - so without an absolute base the share
 * card silently resolves to nothing and the sitemap is invalid, exactly at the
 * moment either matters most.
 *
 * On Vercel this needs no configuration: VERCEL_PROJECT_PRODUCTION_URL is
 * always set, at build time as well as at runtime, and holds the project's
 * production domain - the shortest custom domain if there is one, otherwise the
 * vercel.app name. Preview deployments get it too, so a share card previewed
 * from a branch still points at production rather than at a URL that will be
 * gone next week.
 *
 * NEXT_PUBLIC_SITE_URL overrides it, for self-hosting or for a domain that is
 * not yet the project's production one.
 *
 * It lives in its own module because three separate things need to agree on it:
 * the metadata in layout.tsx, robots.txt and sitemap.xml.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * True once this is a real deployment rather than a local build.
 *
 * Used to keep preview and local builds out of search results: a crawler that
 * finds a preview domain will happily index it, and then the same app competes
 * with itself for its own name.
 */
export const isPublicSite =
  process.env.VERCEL_ENV === "production" ||
  Boolean(process.env.NEXT_PUBLIC_SITE_URL);
