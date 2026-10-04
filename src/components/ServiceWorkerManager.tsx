"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, and makes sure a new deploy actually lands.
 *
 * Renders nothing. It is only here because registration has to happen from the
 * client, and doing it from a component keeps it out of the render path of the
 * page itself.
 *
 * Development is deliberately excluded: `next dev` serves modules that are not
 * content-hashed the way a build's are, and a worker caching those fights hot
 * reloading. To try the install card locally, run `npm run preview` - that is
 * the real Worker build, and `localhost` counts as a secure context, so the
 * prompt behaves exactly as it will in production.
 */
export function ServiceWorkerManager() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;

    /**
     * Fires when the worker controlling this page is replaced. Reloading here
     * is what stops a parent sitting on last week's bundle all evening. The
     * guard matters: without it, two tabs can bounce reloads off each other.
     */
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // A worker already waiting from a previous visit: let it through now
        // rather than on some future tab close.
        if (registration.waiting && navigator.serviceWorker.controller) {
          registration.waiting.postMessage("SKIP_WAITING");
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // `controller` being set means this is an update rather than the
            // very first install - on a first install there is nothing stale
            // to replace and reloading would be gratuitous.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage("SKIP_WAITING");
            }
          });
        });
      } catch (err) {
        // Registration fails in private windows and wherever site data is
        // blocked. The app works without it; only installing and offline do not.
        console.warn("[sw] registration failed", err);
      }
    })();

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
