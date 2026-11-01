import type { MetadataRoute } from "next";
import { isPublicSite, siteUrl } from "@/lib/site";

/**
 * robots.txt.
 *
 * Only the production domain invites crawlers. Preview deployments and local
 * builds say no to everything, because a preview URL that gets indexed turns
 * the app into a competitor for its own name - and the preview will be gone in
 * a week, leaving a dead result behind.
 *
 * `/api/` is disallowed regardless. Nothing under it renders anything a person
 * would read, and every route there either costs money or needs a POST.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isPublicSite) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
