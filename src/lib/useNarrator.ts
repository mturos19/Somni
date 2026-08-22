"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audio as audioStore } from "./storage";
import type { StoryPage } from "./story";

export type NarratorState = "idle" | "loading" | "playing" | "paused" | "error";

type Options = {
  storyId: string;
  pages: StoryPage[];
  /** ElevenLabs voice id, or null to use the browser's built-in speech. */
  voiceId: string | null;
  onPageFinished?: (index: number) => void;
};

/**
 * Narrates a story one page at a time.
 *
 * Audio is fetched per page rather than per story so playback can start after
 * a few seconds instead of a minute, and so a parent who stops after page three
 * has not paid to generate pages four through twelve. Each clip is cached in
 * IndexedDB, keyed by voice, so re-reads and re-listens are free and offline.
 */
export function useNarrator({ storyId, pages, voiceId, onPageFinished }: Options) {
  const [state, setState] = useState<NarratorState>("idle");
  const [activePage, setActivePage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elementRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Guards against a slow fetch for page 2 landing after we moved to page 5. */
  const runRef = useRef(0);
  const finishedRef = useRef(onPageFinished);

  useEffect(() => {
    finishedRef.current = onPageFinished;
  }, [onPageFinished]);

  const releaseUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;

    if (elementRef.current) {
      elementRef.current.pause();
      elementRef.current.src = "";
      elementRef.current = null;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();

    releaseUrl();
    setState("idle");
    setActivePage(null);
  }, [releaseUrl]);

  /** Downloads one page of narration, using the cache when we already have it. */
  const fetchClip = useCallback(
    async (index: number, signal: AbortSignal): Promise<Blob> => {
      if (!voiceId) throw new Error("No voice selected.");

      const cached = await audioStore.get(storyId, index, voiceId);
      if (cached) return cached;

      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          voiceId,
          text: pages[index].text,
          previousText: index > 0 ? pages[index - 1].text : "",
          nextText: index < pages.length - 1 ? pages[index + 1].text : "",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.hint || body.error || "Could not narrate that page.");
      }

      const blob = await res.blob();
      void audioStore.put(storyId, index, voiceId, blob);
      return blob;
    },
    [pages, storyId, voiceId],
  );

  /** Warms the next page while the current one is still playing. */
  const prefetch = useCallback(
    (index: number) => {
      if (!voiceId || index < 0 || index >= pages.length) return;
      const controller = new AbortController();
      fetchClip(index, controller.signal).catch(() => {
        /* a failed prefetch is not worth surfacing */
      });
    },
    [fetchClip, pages.length, voiceId],
  );

  const speakWithBrowser = useCallback((index: number, run: number) => {
    if (typeof speechSynthesis === "undefined") {
      setError("This browser cannot read aloud.");
      setState("error");
      return;
    }
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(pages[index].text);
    utterance.rate = 0.9;
    utterance.pitch = 1.05;

    const preferred = speechSynthesis
      .getVoices()
      .find((v) => v.lang.startsWith("en") && /natural|premium|enhanced/i.test(v.name));
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      if (runRef.current !== run) return;
      setState("idle");
      setActivePage(null);
      finishedRef.current?.(index);
    };
    utterance.onerror = () => {
      if (runRef.current !== run) return;
      setState("error");
      setError("The browser voice stopped unexpectedly.");
    };

    setState("playing");
    setActivePage(index);
    speechSynthesis.speak(utterance);
  }, [pages]);

  const play = useCallback(
    async (index: number) => {
      if (index < 0 || index >= pages.length) return;

      stop();
      const run = runRef.current;
      setError(null);

      if (!voiceId) {
        speakWithBrowser(index, run);
        return;
      }

      setState("loading");
      setActivePage(index);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const blob = await fetchClip(index, controller.signal);
        if (runRef.current !== run) return;

        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const el = new Audio(url);
        elementRef.current = el;

        el.onended = () => {
          if (runRef.current !== run) return;
          releaseUrl();
          setState("idle");
          setActivePage(null);
          finishedRef.current?.(index);
        };
        el.onerror = () => {
          if (runRef.current !== run) return;
          setState("error");
          setError("That narration would not play.");
        };

        await el.play();
        if (runRef.current !== run) return;
        setState("playing");
        prefetch(index + 1);
      } catch (err) {
        if (controller.signal.aborted || runRef.current !== run) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Could not narrate that page.");
      }
    },
    [fetchClip, pages.length, prefetch, releaseUrl, speakWithBrowser, stop, voiceId],
  );

  const pause = useCallback(() => {
    if (elementRef.current && !elementRef.current.paused) {
      elementRef.current.pause();
      setState("paused");
      return;
    }
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking) {
      speechSynthesis.pause();
      setState("paused");
    }
  }, []);

  const resume = useCallback(() => {
    if (elementRef.current?.paused) {
      void elementRef.current.play();
      setState("playing");
      return;
    }
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.paused) {
      speechSynthesis.resume();
      setState("playing");
    }
  }, []);

  // Tear everything down if the story or voice changes, or on unmount.
  useEffect(() => stop, [stop, storyId, voiceId]);

  return {
    state,
    activePage,
    error,
    play,
    pause,
    resume,
    stop,
    prefetch,
    isBusy: state === "loading" || state === "playing",
  };
}
