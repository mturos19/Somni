"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeNarration } from "./audio";
import { clipKey, clips as clipStore, type SavedClip } from "./storage";
import {
  pageBoundary,
  pageIndexAt,
  planSegments,
  segmentOfPage,
  spokenText,
  tokenize,
  wordAt,
  type PageTiming,
  type SpeakRequest,
} from "./narration";
import type { StoryPage } from "./story";

export type NarratorState = "idle" | "loading" | "playing" | "paused" | "error";

type Options = {
  storyId: string;
  pages: StoryPage[];
  /** ElevenLabs voice id, or null to use the browser's built-in speech. */
  voiceId: string | null;
  /** How narration is read. See VoiceMode in elevenlabs.ts. */
  mode: "steady" | "natural" | "lively";
  /** The child's name, and how it should be said if the spelling misleads. */
  childName: string;
  saysLike: string;
  /**
   * Playback rate, 1 being the pace it was generated at. Applied to the audio
   * element rather than baked into the generation, so changing it is instant,
   * free, and does not invalidate a single cached clip. Browsers preserve pitch,
   * so slower still sounds like the same person.
   */
  rate: number;
  /** Keep reading into the next page when one ends. */
  autoAdvance: boolean;
  /** Called when narration moves to a page, so the book can turn itself. */
  onPage: (index: number) => void;
  onFinished?: () => void;
};

/**
 * How far ahead of the audio clock the word highlight runs.
 *
 * `currentTime` is the decode position, not the moment sound leaves the
 * speaker, and everything between - the output buffer, and Bluetooth most of
 * all - adds delay. Reading along also works better when the eye arrives a
 * fraction before the ear rather than chasing it. Small enough that it never
 * lands on the wrong word.
 */
const HIGHLIGHT_LEAD_SECONDS = 0.08;

type Ready = {
  index: number;
  el: HTMLAudioElement;
  url: string;
  clip: SavedClip;
};

/**
 * Segments decoded ahead of time, keyed by the reading they belong to.
 *
 * Deliberately not a ref. A prepared clip is a live audio element that has to
 * be seeked, wired up and played on adoption, and React's immutability rule
 * treats everything read out of a ref as off limits to mutation. Keeping it
 * here says the true thing anyway: this is a decoder cache, not state, and
 * nothing renders from it.
 */
const prepared = new Map<string, Ready>();

function releasePrepared(key: string) {
  const ready = prepared.get(key);
  if (!ready) return;
  prepared.delete(key);
  ready.el.onerror = null;
  ready.el.pause();
  ready.el.removeAttribute("src");
  URL.revokeObjectURL(ready.url);
}

/** An audio element with its metadata already loaded, ready to play at once. */
async function decodeClip(clip: SavedClip, rate: number): Promise<{ el: HTMLAudioElement; url: string }> {
  const url = URL.createObjectURL(clip.audio);
  const el = new Audio();
  el.preload = "auto";
  // Keep the voice's pitch when slowed down; Safari needs the prefix.
  el.preservesPitch = true;
  (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
  el.playbackRate = rate;
  el.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => reject(new Error("That narration would not play."));
    });
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }

  el.onloadedmetadata = null;
  el.onerror = null;
  return { el, url };
}

function scaleTimings(pages: PageTiming[], factor: number): PageTiming[] {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.02) return pages;
  return pages.map((page) => ({
    ...page,
    start: page.start * factor,
    end: page.end * factor,
    words: page.words.map((word) => ({
      ...word,
      start: word.start * factor,
      end: word.end * factor,
    })),
  }));
}

/**
 * Reads a story aloud.
 *
 * Narration is fetched a segment at a time - several whole pages in one
 * generation - because that is what lets a sentence's energy carry over a page
 * turn instead of resetting at every one. Playback then follows the word
 * timings that came back with the audio: the page turns itself when the voice
 * reaches it, and the reader always knows which word is being spoken.
 *
 * Segments are cached in IndexedDB per voice, so a second reading of the same
 * story costs nothing and works with the aeroplane mode on.
 */
export function useNarrator({
  storyId,
  pages,
  voiceId,
  mode,
  childName,
  saysLike,
  rate,
  autoAdvance,
  onPage,
  onFinished,
}: Options) {
  const [state, setState] = useState<NarratorState>("idle");
  const [page, setPageState] = useState<number | null>(null);
  const [word, setWord] = useState(-1);
  const [precise, setPrecise] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const segments = useMemo(() => planSegments(pages), [pages]);
  /** Identifies this reading's decoded-ahead segment. See `prepared`. */
  const readyKey = `${storyId}::${voiceId}::${mode}::${saysLike}`;

  const elementRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const timingRef = useRef<PageTiming[] | null>(null);
  const segmentRef = useRef(-1);
  /** Last page handed to the reader, so a frame that changes nothing costs nothing. */
  const shownRef = useRef(-1);

  const rafRef = useRef<number | null>(null);
  /**
   * One request per segment, shared by everyone who asks for it. Narration is
   * billed per character, so a parent tapping Next four times must not buy the
   * same audio four times.
   */
  const inflightRef = useRef(new Map<string, Promise<SavedClip>>());
  /** Guards a slow fetch for segment two landing after we jumped to segment five. */
  const runRef = useRef(0);

  /**
   * Both playback paths continue themselves when a clip ends, so they reach
   * their own latest version through a ref rather than closing over a stale one.
   */
  const playSegmentRef = useRef<
    (index: number, fromPage: number, run: number) => Promise<void>
  >(async () => {});
  const speakRef = useRef<(index: number, run: number) => void>(() => {});

  const rateRef = useRef(rate);
  const autoRef = useRef(autoAdvance);
  const onPageRef = useRef(onPage);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    autoRef.current = autoAdvance;
  }, [autoAdvance]);

  // Takes effect on the current page, not just the next one.
  useEffect(() => {
    rateRef.current = rate;
    if (elementRef.current) elementRef.current.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    onPageRef.current = onPage;
  }, [onPage]);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const cancelFrame = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    cancelFrame();
    releasePrepared(readyKey);

    if (elementRef.current) {
      elementRef.current.onended = null;
      elementRef.current.onerror = null;
      elementRef.current.pause();
      elementRef.current.removeAttribute("src");
      elementRef.current.load();
      elementRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    timingRef.current = null;
    segmentRef.current = -1;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, [cancelFrame, readyKey]);

  const stop = useCallback(() => {
    runRef.current += 1;
    teardown();
    shownRef.current = -1;
    setState("idle");
    setPageState(null);
    setWord(-1);
  }, [teardown]);

  /* --------------------------------- fetch --------------------------------- */

  /**
   * A segment's audio and word timings, from the cache if we have them.
   *
   * Deliberately not abortable. Once ElevenLabs has started generating, the
   * characters are paid for whether or not we keep the result, so a request
   * that is no longer wanted is better finished and cached than thrown away.
   * Staleness is handled by the run counter at the call site instead.
   */
  const fetchClip = useCallback(
    (index: number): Promise<SavedClip> => {
      if (!voiceId) return Promise.reject(new Error("No voice selected."));

      const key = clipKey(storyId, index, voiceId, `${mode}:${saysLike}`);
      const existing = inflightRef.current.get(key);
      if (existing) return existing;

      const work = (async () => {
        const cached = await clipStore.get(key);
        if (cached) return cached;

        const plan = segments[index];
        const first = plan.pages[0];
        const last = plan.pages[plan.pages.length - 1];

        const body: SpeakRequest = {
          voiceId,
          mode,
          childName,
          saysLike,
          pages: plan.pages.map((p) => ({
            page: p,
            text: pages[p].text,
            mood: pages[p].mood,
          })),
          previousText: first > 0 ? pages[first - 1].text : undefined,
          nextText: last < pages.length - 1 ? pages[last + 1].text : undefined,
        };

        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.hint || detail.error || "Could not narrate that.");
        }

        const clip: SavedClip = decodeNarration(await res.arrayBuffer());

        void clipStore.put(key, clip);
        return clip;
      })();

      inflightRef.current.set(key, work);
      void work.catch(() => {}).finally(() => inflightRef.current.delete(key));
      return work;
    },
    [childName, mode, pages, saysLike, segments, storyId, voiceId],
  );

  const prefetch = useCallback(
    (pageIndex: number) => {
      if (!voiceId || pageIndex < 0 || pageIndex >= pages.length) return;
      fetchClip(segmentOfPage(segments, pageIndex)).catch(() => {
        /* a failed warm-up is not worth telling anyone about */
      });
    },
    [fetchClip, pages.length, segments, voiceId],
  );

  /* ------------------------------- playback -------------------------------- */

  /** Called every animation frame, so it must be free when nothing has moved. */
  const showPage = useCallback((index: number) => {
    if (shownRef.current === index) return;
    shownRef.current = index;
    setPageState(index);
    onPageRef.current(index);
  }, []);

  /** Follows the clock: lights the spoken word, turns the page, knows where to stop. */
  const follow = useCallback(
    (run: number) => {
      const step = () => {
        if (runRef.current !== run) return;
        const el = elementRef.current;
        const timing = timingRef.current;
        if (!el || !timing || timing.length === 0) return;

        const now = el.currentTime;
        const at = pageIndexAt(timing, now);
        const current = timing[at];

        showPage(current.page);

        const index =
          current.words.length > 0
            ? wordAt(current.words, now + HIGHLIGHT_LEAD_SECONDS)
            : -1;
        setWord((previous) => (previous === index ? previous : index));

        if (!autoRef.current) {
          // A quarter second of tail so the last word is not clipped.
          const limit = Math.min(
            current.end + 0.25,
            pageBoundary(timing, at, el.duration || current.end),
          );
          if (now >= limit) {
            el.pause();
            setState("idle");
            setWord(-1);
            return;
          }
        }

        rafRef.current = requestAnimationFrame(step);
      };

      cancelFrame();
      rafRef.current = requestAnimationFrame(step);
    },
    [cancelFrame, showPage],
  );

  const playSegment = useCallback(
    async (index: number, fromPage: number, run: number) => {
      // Warmed while the previous segment was still playing: nothing to fetch,
      // nothing to decode, so the seam between them is silent.
      const candidate = prepared.get(readyKey);
      const warm = candidate?.index === index ? candidate : null;
      if (warm) prepared.delete(readyKey);

      const clip = warm ? warm.clip : await fetchClip(index);
      if (runRef.current !== run) return;

      const decoded = warm ?? (await decodeClip(clip, rateRef.current));
      if (runRef.current !== run) {
        if (!warm) URL.revokeObjectURL(decoded.url);
        return;
      }

      const el = decoded.el;
      const url = decoded.url;

      // Chaining into the next segment replaces the element, so let go of the
      // last one rather than leaving its blob URL alive for the whole story.
      if (elementRef.current) {
        elementRef.current.onended = null;
        elementRef.current.onerror = null;
        elementRef.current.pause();
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);

      urlRef.current = url;
      elementRef.current = el;
      segmentRef.current = index;
      // A warmed element was decoded at whatever rate was set then; the reader
      // may have changed it since.
      elementRef.current.playbackRate = rateRef.current;

      // Estimated timings get stretched onto the real duration; exact ones are
      // already on the audio's own clock.
      timingRef.current = clip.precise
        ? clip.pages
        : scaleTimings(clip.pages, (el.duration || clip.duration) / (clip.duration || 1));
      setPrecise(clip.precise);

      const timing = timingRef.current;
      const found = timing.findIndex((entry) => entry.page === fromPage);
      const at = found === -1 ? 0 : found;
      el.currentTime = timing[at].start;

      el.onended = () => {
        if (runRef.current !== run) return;
        cancelFrame();
        setWord(-1);

        const next = index + 1;
        if (autoRef.current && next < segments.length) {
          void playSegmentRef.current(next, segments[next].pages[0], run).catch(
            (err: unknown) => {
              if (runRef.current !== run) return;
              setState("error");
              setError(err instanceof Error ? err.message : "Could not keep reading.");
            },
          );
          return;
        }

        setState("idle");
        // Reached the end only if there is nothing after this segment; with
        // straight-through reading off, running out of clip is not the end.
        if (next >= segments.length) onFinishedRef.current?.();
      };

      // Metadata has loaded, so from here an error is a playback failure.
      el.onerror = () => {
        if (runRef.current !== run) return;
        cancelFrame();
        setState("error");
        setError("That narration would not play.");
      };

      await el.play();
      if (runRef.current !== run) return;

      setState("playing");
      follow(run);

      // Fetch *and* decode the next segment while this one plays.
      const next = index + 1;
      if (next < segments.length && prepared.get(readyKey)?.index !== next) {
        void (async () => {
          try {
            const upcoming = await fetchClip(next);
            if (runRef.current !== run || prepared.has(readyKey)) return;
            const decoded = await decodeClip(upcoming, rateRef.current);
            if (runRef.current !== run) {
              URL.revokeObjectURL(decoded.url);
              return;
            }
            prepared.set(readyKey, { index: next, clip: upcoming, ...decoded });
          } catch {
            /* a failed warm-up just means the normal path runs at the seam */
          }
        })();
      }
    },
    [cancelFrame, fetchClip, follow, readyKey, segments],
  );

  useEffect(() => {
    playSegmentRef.current = playSegment;
  }, [playSegment]);

  /* ------------------------------ device voice ----------------------------- */

  const speakWithBrowser = useCallback(
    (index: number, run: number) => {
      if (typeof speechSynthesis === "undefined") {
        setError("This browser cannot read aloud.");
        setState("error");
        return;
      }
      speechSynthesis.cancel();

      const text = pages[index].text;
      const tokens = tokenize(text);

      // Word count is preserved by the respelling, so boundary events still
      // map onto the tokens of the text actually on screen.
      const utterance = new SpeechSynthesisUtterance(
        spokenText(text, childName, saysLike),
      );
      utterance.rate = Math.max(0.1, 0.9 * rateRef.current);
      utterance.pitch = 1.05;

      const preferred = speechSynthesis
        .getVoices()
        .find((v) => v.lang.startsWith("en") && /natural|premium|enhanced/i.test(v.name));
      if (preferred) utterance.voice = preferred;

      // Not every engine fires these. Where they do, the device voice gets the
      // same word-by-word highlighting as a cloned one.
      utterance.onboundary = (event) => {
        if (runRef.current !== run || event.name === "sentence") return;
        const found = tokens.findIndex(
          (token) => event.charIndex >= token.from && event.charIndex < token.to,
        );
        if (found !== -1) setWord(found);
      };

      utterance.onend = () => {
        if (runRef.current !== run) return;
        setWord(-1);

        if (autoRef.current && index + 1 < pages.length) {
          showPage(index + 1);
          speakRef.current(index + 1, run);
          return;
        }

        setState("idle");
        if (index + 1 >= pages.length) onFinishedRef.current?.();
      };

      utterance.onerror = () => {
        if (runRef.current !== run) return;
        setState("error");
        setError("The browser voice stopped unexpectedly.");
      };

      setState("playing");
      showPage(index);
      speechSynthesis.speak(utterance);
    },
    [childName, pages, saysLike, showPage],
  );

  useEffect(() => {
    speakRef.current = speakWithBrowser;
  }, [speakWithBrowser]);

  /* -------------------------------- controls ------------------------------- */

  const play = useCallback(
    async (index: number) => {
      if (index < 0 || index >= pages.length) return;
      setError(null);

      if (!voiceId) {
        runRef.current += 1;
        teardown();
        setPrecise(true);
        speakWithBrowser(index, runRef.current);
        return;
      }

      const wanted = segmentOfPage(segments, index);
      const el = elementRef.current;
      const timing = timingRef.current;

      // Already holding the right segment: seek rather than fetch it again.
      if (el && timing && segmentRef.current === wanted) {
        const at = timing.findIndex((entry) => entry.page === index);
        if (at !== -1) {
          el.currentTime = timing[at].start;
          setWord(-1);
          showPage(index);
          await el.play();
          setState("playing");
          follow(runRef.current);
          return;
        }
      }

      runRef.current += 1;
      teardown();
      const run = runRef.current;

      setState("loading");
      showPage(index);

      try {
        await playSegment(wanted, index, run);
      } catch (err) {
        if (runRef.current !== run) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Could not narrate that page.");
      }
    },
    [
      follow,
      pages.length,
      playSegment,
      segments,
      showPage,
      speakWithBrowser,
      teardown,
      voiceId,
    ],
  );

  const pause = useCallback(() => {
    if (elementRef.current && !elementRef.current.paused) {
      cancelFrame();
      elementRef.current.pause();
      setState("paused");
      return;
    }
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking) {
      speechSynthesis.pause();
      setState("paused");
    }
  }, [cancelFrame]);

  const resume = useCallback(() => {
    if (elementRef.current?.paused) {
      void elementRef.current.play();
      setState("playing");
      follow(runRef.current);
      return;
    }
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.paused) {
      speechSynthesis.resume();
      setState("playing");
    }
  }, [follow]);

  // Tear everything down if the story or the voice changes, or on unmount.
  useEffect(() => stop, [stop, storyId, voiceId, mode, saysLike]);

  return {
    state,
    page,
    word,
    /** False when timings were estimated; the reader hides highlighting then. */
    precise,
    error,
    play,
    pause,
    resume,
    stop,
    prefetch,
    isBusy: state === "loading" || state === "playing",
  };
}
