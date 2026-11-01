import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * sitemap.xml.
 *
 * Somni is one page. Every story, every voice and every profile lives in the
 * browser that made it, so there is nothing else here that a crawler could
 * reach or that would mean anything to anyone else - and listing one honest URL
 * is worth more than inventing routes to pad it out.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
