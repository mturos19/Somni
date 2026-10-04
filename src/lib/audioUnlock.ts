"use client";

/**
 * Keeping iOS able to play.
 *
 * Safari refuses to start an audio element that has never been played from a
 * user gesture, and it counts that per element, not per page. Both halves of
 * that rule are a problem for this app.
 *
 * The tap on play is the only gesture there is, and it is spent the moment
 * anything is awaited - and reaching playable audio means awaiting IndexedDB,
 * very often the network, and always `loadedmetadata`. Worse, a story is read
 * in several segments, and every seam after the first starts a new element
 * from an `onended` handler, where there is no gesture at all. A parent on an
 * iPhone would hear nothing on the first tap, or silence thirty seconds in.
 *
 * So elements are unlocked up front, while the tap is still live: each is
 * played against a fraction of a second of silence and immediately paused,
 * which is enough for WebKit to mark it playable for the rest of its life.
 * They are then handed out and reused rather than created on demand.
 *
 * On every other platform this is simply a small element pool and costs
 * nothing.
 */

const POOL_SIZE = 3;
const pool: HTMLAudioElement[] = [];
let silenceUrl: string | null = null;

/**
 * Sixty bytes of silent PCM, as a blob rather than a data: URI - the app's
 * content security policy allows `blob:` media and deliberately does not allow
 * `data:`.
 */
function silence(): string {
  if (silenceUrl) return silenceUrl;

  const bytes = new Uint8Array(60);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i);
  };

  ascii(0, "RIFF");
  view.setUint32(4, 52, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, 16, true);

  silenceUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  return silenceUrl;
}

/**
 * Must be called synchronously from the gesture, before anything is awaited.
 * Cheap and idempotent: it only tops the pool back up to size.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;

  while (pool.length < POOL_SIZE) {
    const el = new Audio();
    el.preload = "auto";
    el.src = silence();
    // The rejection is expected anywhere a gesture is not required - nothing
    // depends on this resolving, only on the attempt having been made.
    void el.play().then(
      () => el.pause(),
      () => {},
    );
    pool.push(el);
  }
}

/**
 * Every handler a caller may have attached.
 *
 * Elements are reused, so anything left behind would fire for the next clip -
 * and `onpause` in particular is attached during playback and would otherwise
 * run while this element is being put away, pushing the narrator into a paused
 * state for a clip it no longer owns.
 */
function clearHandlers(el: HTMLAudioElement) {
  el.onended = null;
  el.onerror = null;
  el.onloadedmetadata = null;
  el.onpause = null;
  el.onplaying = null;
  el.onplay = null;
  el.ontimeupdate = null;
}

/** An already-unlocked element if one is spare, otherwise a new one. */
export function takeAudioElement(): HTMLAudioElement {
  const el = pool.pop();
  if (!el) return new Audio();

  clearHandlers(el);
  el.removeAttribute("src");
  el.currentTime = 0;
  el.playbackRate = 1;
  el.volume = 1;
  el.muted = false;
  el.loop = false;
  return el;
}

/** Returns a finished element to the pool so its unlocked status is not lost. */
export function recycleAudioElement(el: HTMLAudioElement | null | undefined) {
  if (!el) return;

  // Cleared before the pause, so putting the element away cannot fire the very
  // handlers that were watching it play.
  clearHandlers(el);
  try {
    el.pause();
  } catch {
    /* Already detached; nothing to stop. */
  }
  el.removeAttribute("src");
  /*
   * Dropping the attribute is not enough on its own: the element goes on
   * holding the resource it last loaded, so every element in the pool would pin
   * one segment's mp3 in memory for the life of the page. load() against an
   * absent src is what actually releases it.
   */
  try {
    el.load();
  } catch {
    /* Nothing loaded to release. */
  }
  if (pool.length < POOL_SIZE) pool.push(el);
}
