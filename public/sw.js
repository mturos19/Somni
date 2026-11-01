/*
 * Somni's service worker.
 *
 * Two jobs, in this order of importance:
 *
 *   1. Make the app installable. Chromium still requires a registered worker
 *      with a real fetch handler before it will fire `beforeinstallprompt`,
 *      which is the install card parents see.
 *   2. Make a story readable with no signal. Stories and their narration
 *      already live in this browser's IndexedDB, so once the shell is cached
 *      the whole library works on a plane or in a basement.
 *
 * What it must never do is get between the app and its two long-running API
 * calls. `/api/story` is a server-sent event stream the client reads chunk by
 * chunk for up to five minutes; `/api/voice/speak` returns a length-prefixed
 * binary frame. Both are destroyed by a handler that buffers or clones a
 * response, so `/api/*` is passed through untouched - see `shouldHandle`.
 */

/*
 * The version comes from the URL this worker was registered at - the page asks
 * for `/sw.js?v=<build id>`; see ServiceWorkerManager.tsx.
 *
 * It used to be the hardcoded string "somni-v1", which quietly broke the one
 * thing `activate` exists to do. That handler deletes every cache whose name
 * does not start with VERSION, so with VERSION never changing it never deleted
 * anything - while `cacheFirst` kept adding each deploy's content-hashed
 * bundles under new URLs. Twenty deploys meant twenty builds of the app sitting
 * on a parent's phone, none of them reachable, none of them ever collected.
 *
 * Keyed to the build, the caches are wiped on the first load after each deploy.
 * That does cost one network fetch for assets that may not have changed, which
 * is the right trade: almost everything under /_next/static is content-hashed,
 * so a new build has new URLs for it anyway.
 */
const VERSION =
  new URL(self.location.href).searchParams.get("v") || "unversioned";
const PREFIX = `somni-${VERSION}`;
const SHELL = `${PREFIX}-shell`;
const RUNTIME = `${PREFIX}-runtime`;

/** The least that has to be present for the app to open with no network. */
const PRECACHE = ["/", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one 404 cannot fail the whole install and leave the
      // app permanently uninstallable.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !name.startsWith(PREFIX)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Lets a new worker take over without waiting for every tab to close. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});

/**
 * Everything this worker refuses to touch.
 *
 * Beyond `/api/*`, React Server Component payloads are skipped too: they are
 * negotiated per build, and serving a cached one against a newer build hands
 * React a payload it cannot reconcile.
 */
function shouldHandle(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.searchParams.has("_rsc")) return false;
  if (request.headers.get("Accept") === "text/x-component") return false;
  // Range requests (audio seeking) must reach the network to be answered properly.
  if (request.headers.has("range")) return false;

  return true;
}

/** Hashed by the build, so the URL changes whenever the bytes do. */
function isImmutable(url) {
  return url.pathname.startsWith("/_next/static/");
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME);
    void cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network first, cache as the safety net.
 *
 * Used for the page itself, so a deploy is picked up the moment there is a
 * connection rather than being pinned to whatever was cached first.
 */
async function networkFirst(request, fallbackToRoot) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL);
      void cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackToRoot) {
      const root = await caches.match("/");
      if (root) return root;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldHandle(request)) return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, true));
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Fonts, icons and anything else static: serve what is cached, but refresh it
  // in the background so it is never more than one visit out of date.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(RUNTIME);
            void cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);

      const response = cached ?? (await network);
      if (response) return response;
      return new Response("", { status: 504, statusText: "Offline" });
    })(),
  );
});
