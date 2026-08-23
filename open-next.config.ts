import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Somni has nothing to cache on the server: every screen is client rendered,
 * stories and narration live in the browser's own IndexedDB, and no route
 * revalidates. So no incremental cache is configured, which also means no R2
 * bucket to create before the first deploy.
 *
 * If a server-rendered, revalidating route is ever added, wire up
 * `incrementalCache` here - see https://opennext.js.org/cloudflare/caching.
 */
export default defineCloudflareConfig();
