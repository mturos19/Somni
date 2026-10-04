"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The offer to put Somni on the home screen.
 *
 * Two different mechanisms behind one card. Chromium hands the page a
 * `beforeinstallprompt` event it can replay at a moment of its choosing, which
 * is a real OS install dialog. Safari has no such API at all, so iOS gets the
 * only thing that works there: a short instruction for the Share menu.
 *
 * Everything here is written to fail closed. If we cannot tell whether the app
 * is already installed, or storage is blocked, or the browser is an in-app
 * webview that physically cannot install anything, the card does not render.
 * A nudge a parent cannot act on is worse than no nudge.
 */

/** Not in lib.dom - Chromium ships it, the standard does not describe it. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
  interface Window {
    /** Parked by the capture script in layout.tsx, before React exists. */
    __somniInstallEvent?: BeforeInstallPromptEvent | null;
  }
}

const SNOOZE_KEY = "somni.install.dismissed";
/** Long enough not to nag, short enough that a change of mind is met. */
const SNOOZE_DAYS = 14;
/** Let the first screen land before asking for anything. */
const APPEAR_AFTER_MS = 3500;

function snoozedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    if (raw === "installed") return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // A blocked store is not a reason to show the card twice as often, but it
    // is also not a reason to hide it. Treat it as "never dismissed".
    return false;
  }
}

function remember(value: string) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, value);
  } catch {
    /* Private window, or site data blocked. The card simply returns next time. */
  }
}

/** True when Somni is already running from the home screen. */
function runningStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  // Safari's own, pre-dating the media query and still the only one it sets.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iPadOS 13 and later report a desktop Mac user agent, so the `/iPad/` test
 * that most snippets use - including the one in Next's own PWA guide - misses
 * every modern iPad. A real Mac reports no touch points.
 */
function isIOS(ua: string): boolean {
  if (/iPhone|iPod/.test(ua)) return true;
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Browsers on iOS that cannot add to the home screen, so telling them to tap
 * Share would be a lie. Social in-app webviews are the important case: traffic
 * from an Instagram or Facebook link never reaches Safari at all. Chrome,
 * Firefox and Edge on iOS have a Share menu with no "Add to Home Screen" item.
 */
const IOS_CANNOT_INSTALL =
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Threads|Line\/|MicroMessenger|Snapchat|TikTok|Pinterest|LinkedInApp|GSA\/|DuckDuckGo|CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/;

type Offer = "none" | "prompt" | "ios";

export function InstallPrompt() {
  const [offer, setOffer] = useState<Offer>("none");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (runningStandalone() || snoozedRecently()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const show = (next: Offer) => {
      if (cancelled || next === "none") return;
      setOffer(next);
      timer = setTimeout(() => !cancelled && setVisible(true), APPEAR_AFTER_MS);
    };

    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      // Suppress Chromium's own mini-infobar; two competing asks stacked at the
      // bottom of the screen is the whole first impression on a first visit.
      event.preventDefault();
      window.__somniInstallEvent = event;
      show("prompt");
    };

    const onInstalled = () => {
      remember("installed");
      window.__somniInstallEvent = null;
      if (!cancelled) {
        setVisible(false);
        setOffer("none");
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    void (async () => {
      /**
       * Catches the parent who installed Somni last week and today opened the
       * old browser tab instead of the icon. Nothing else detects that: the
       * install happened in a different browsing context, so `display-mode` is
       * `browser` and `appinstalled` never fires here.
       */
      type WithRelated = Navigator & {
        getInstalledRelatedApps?: () => Promise<unknown[]>;
      };
      const getRelated = (navigator as WithRelated).getInstalledRelatedApps;
      if (getRelated) {
        try {
          const related = await getRelated.call(navigator);
          if (related.length > 0) return;
        } catch {
          /* Not permitted here; fall through and use the other signals. */
        }
      }
      if (cancelled) return;

      // The event may already have been captured before React mounted.
      if (window.__somniInstallEvent) {
        show("prompt");
        return;
      }

      const ua = navigator.userAgent;
      if (isIOS(ua) && !IOS_CANNOT_INSTALL.test(ua)) show("ios");
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    remember(String(Date.now()));
    setVisible(false);
    setOffer("none");
  }, []);

  /**
   * Note what is *not* awaited before `prompt()`. Any await between the tap and
   * the call spends the browser's transient activation, and Chromium then
   * refuses it with nothing visible happening at all.
   */
  const install = useCallback(() => {
    const event = window.__somniInstallEvent;
    if (!event) {
      dismiss();
      return;
    }

    let pending: Promise<void>;
    try {
      pending = event.prompt();
    } catch {
      // Already used, or activation has expired. The event is spent either way.
      window.__somniInstallEvent = null;
      setVisible(false);
      setOffer("none");
      return;
    }

    // Single use: a second prompt() on the same instance throws, and Chromium
    // will not issue a replacement in this page load. Retire it immediately.
    window.__somniInstallEvent = null;
    setVisible(false);
    setOffer("none");

    void pending
      .then(() => event.userChoice)
      .then(({ outcome }) => remember(outcome === "accepted" ? "installed" : String(Date.now())))
      .catch(() => remember(String(Date.now())));
  }, [dismiss]);

  if (offer === "none") return null;

  return (
    <div
      /*
       * Clear of the sticky "Write tonight's story" button (z-20) and of the
       * home indicator, but under the writing overlay (z-40) and the voice
       * studio (z-50). The positioner ignores taps so the gap beside the card
       * still reaches the page.
       */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-5"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.75rem)",
      }}
    >
      <div
        role="region"
        aria-label="Install Somni"
        className="glass-strong pointer-events-auto mx-auto flex max-w-2xl items-start gap-3 rounded-2xl px-4 py-3.5 shadow-lg transition-all duration-500"
        style={{
          /*
           * The translucent card colour composited over an opaque sky, rather
           * than left transparent. This floats over the page, and where
           * backdrop-filter is unsupported or disabled the text would otherwise
           * sit on top of whatever happens to be behind it.
           */
          background:
            "linear-gradient(var(--card-strong), var(--card-strong)), var(--sky-2)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          opacity: visible ? 1 : 0,
          /*
           * Not opacity alone. A transparent element is still focusable and
           * still takes taps, so for the few seconds before the card appears
           * there would be an invisible "Add to home screen" button sitting
           * above the Write button - and a parent who happened to tap there
           * would get the install dialog from nowhere. `visibility` removes it
           * from hit-testing and the tab order, and still animates.
           */
          visibility: visible ? "visible" : "hidden",
          transform: visible ? "translate3d(0,0,0)" : "translate3d(0,14px,0)",
        }}
      >
        <span aria-hidden className="mt-0.5 text-2xl leading-none">
          {"\u{1F319}"}
        </span>

        <div className="min-w-0 flex-1">
          {offer === "prompt" ? (
            <>
              <p className="text-sm font-semibold">Keep Somni on your home screen</p>
              <p className="ink-soft mt-0.5 text-xs">
                Opens straight to tonight&rsquo;s story, and your shelf still works
                with no signal.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="rounded-full px-4 py-2 text-sm font-bold transition active:scale-[0.98]"
                  style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                >
                  Add to home screen
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="ink-soft whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold"
                >
                  Not now
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Add Somni to your home screen</p>
              <p className="ink-soft mt-1 text-xs">
                Tap{" "}
                <span
                  aria-label="the Share button"
                  className="mx-0.5 inline-flex translate-y-[2px] items-center"
                >
                  <svg
                    width="13"
                    height="16"
                    viewBox="0 0 13 16"
                    fill="none"
                    aria-hidden
                    focusable="false"
                  >
                    <path
                      d="M6.5 1v9M3.2 4.1 6.5 1l3.3 3.1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 7.2H1v7.3h11V7.2h-1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>{" "}
                in the Safari toolbar, then{" "}
                <strong style={{ color: "var(--accent-2)" }}>Add to Home Screen</strong>.
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="ink-soft -mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-lg leading-none"
        >
          {"×"}
        </button>
      </div>
    </div>
  );
}
