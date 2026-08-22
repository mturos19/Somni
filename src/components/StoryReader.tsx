"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNarrator } from "@/lib/useNarrator";
import type { SavedStory } from "@/lib/storage";

type Slide =
  | { kind: "cover" }
  | { kind: "page"; index: number }
  | { kind: "end" };

export function StoryReader({
  saved,
  voiceId,
  voiceName,
  onExit,
}: {
  saved: SavedStory;
  voiceId: string | null;
  voiceName: string | null;
  onExit: () => void;
}) {
  const { story } = saved;
  const [slideIndex, setSlideIndex] = useState(0);
  const [autoTurn, setAutoTurn] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const autoTurnRef = useRef(autoTurn);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    autoTurnRef.current = autoTurn;
  }, [autoTurn]);

  const slides = useMemo<Slide[]>(
    () => [
      { kind: "cover" },
      ...story.pages.map((_, index) => ({ kind: "page" as const, index })),
      { kind: "end" },
    ],
    [story.pages],
  );

  const slide = slides[slideIndex];
  const lastIndex = slides.length - 1;

  const handlePageFinished = useCallback(
    (finished: number) => {
      if (!autoTurnRef.current) return;
      // Slide n+1 holds page n, so the next slide is finished + 2.
      setSlideIndex(Math.min(finished + 2, lastIndex));
    },
    [lastIndex],
  );

  const narrator = useNarrator({
    storyId: saved.id,
    pages: story.pages,
    voiceId,
    onPageFinished: handlePageFinished,
  });

  const { play, stop, prefetch, state: narratorState } = narrator;

  // When auto-turn lands us on a new page, keep reading.
  useEffect(() => {
    if (!autoTurn) return;
    if (slide.kind !== "page") return;
    if (narratorState !== "idle") return;
    if (narrator.activePage === slide.index) return;
    void play(slide.index);
    // Deliberately narrow: this should fire on arrival at a page, not on every
    // narrator state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex, autoTurn]);

  // Warm the first page's audio as soon as the cover is on screen.
  useEffect(() => {
    if (slideIndex === 0 && voiceId) prefetch(0);
  }, [slideIndex, voiceId, prefetch]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, lastIndex));
      if (clamped === slideIndex) return;
      stop();
      setSlideIndex(clamped);
    },
    [lastIndex, slideIndex, stop],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") goTo(slideIndex + 1);
      if (event.key === "ArrowLeft") goTo(slideIndex - 1);
      if (event.key === "Escape") onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, slideIndex, onExit]);

  function onTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 60) goTo(slideIndex + (delta < 0 ? 1 : -1));
    touchStartX.current = null;
  }

  const isPlayingThisPage =
    slide.kind === "page" &&
    narrator.activePage === slide.index &&
    (narratorState === "playing" || narratorState === "loading");

  function togglePlayback() {
    if (slide.kind !== "page") {
      goTo(1);
      return;
    }
    if (narratorState === "playing" && narrator.activePage === slide.index) {
      narrator.pause();
    } else if (narratorState === "paused" && narrator.activePage === slide.index) {
      narrator.resume();
    } else {
      void play(slide.index);
    }
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col"
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-5 pt-5">
        <button
          type="button"
          onClick={onExit}
          className="glass rounded-full px-4 py-2 text-sm"
        >
          Close
        </button>
        <div className="ink-soft text-xs">
          {slide.kind === "page"
            ? `${slide.index + 1} of ${story.pages.length}`
            : slide.kind === "cover"
              ? "Cover"
              : "The end"}
        </div>
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          aria-expanded={showNotes}
          className="glass rounded-full px-4 py-2 text-sm"
        >
          For grown-ups
        </button>
      </header>

      {showNotes && (
        <div className="relative z-10 mx-auto mt-3 w-full max-w-2xl px-5">
          <div className="glass animate-rise rounded-2xl p-4 text-sm">
            <p>{story.parentNote}</p>
            {story.stretchWords.length > 0 && (
              <dl className="mt-3 space-y-1">
                {story.stretchWords.map((entry) => (
                  <div key={entry.word} className="flex gap-2">
                    <dt className="font-bold" style={{ color: "var(--accent)" }}>
                      {entry.word}
                    </dt>
                    <dd className="ink-soft">{entry.meaning}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {/* Slide */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-8">
        <div key={slideIndex} className="animate-rise w-full max-w-2xl text-center">
          {slide.kind === "cover" && (
            <>
              <p className="ink-soft text-xs uppercase tracking-[0.3em]">
                Tonight&apos;s story
              </p>
              <h1 className="story-text mt-5 text-4xl font-semibold sm:text-6xl">
                {story.title}
              </h1>
              <p
                className="story-text mt-6 text-lg italic"
                style={{ color: "var(--accent-2)" }}
              >
                {story.dedication}
              </p>
            </>
          )}

          {slide.kind === "page" && (
            <p className="story-text text-xl leading-relaxed sm:text-2xl md:text-3xl">
              {story.pages[slide.index].text}
            </p>
          )}

          {slide.kind === "end" && (
            <>
              <div className="animate-breathe text-5xl">{"\u{1F319}"}</div>
              <p className="story-text mt-6 text-2xl sm:text-3xl">
                {story.goodnightLine}
              </p>
              <p className="ink-soft mt-8 text-sm">The end.</p>
            </>
          )}
        </div>
      </main>

      {/* Controls */}
      <footer className="relative z-10 px-5 pb-7">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {/* Progress */}
          <div className="flex items-center justify-center gap-1.5">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                onClick={() => goTo(index)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: index === slideIndex ? 24 : 8,
                  background:
                    index === slideIndex ? "var(--accent)" : "var(--card-strong)",
                }}
              />
            ))}
          </div>

          {narrator.error && (
            <p className="text-center text-xs" style={{ color: "#ff9d9d" }}>
              {narrator.error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goTo(slideIndex - 1)}
              disabled={slideIndex === 0}
              className="glass rounded-full px-5 py-3 text-sm disabled:opacity-30"
            >
              Back
            </button>

            <button
              type="button"
              onClick={togglePlayback}
              className="flex h-16 w-16 items-center justify-center rounded-full text-2xl transition active:scale-95"
              style={{
                background: "var(--accent)",
                color: "var(--accent-ink)",
                boxShadow: isPlayingThisPage ? "0 0 0 10px var(--glow)" : undefined,
              }}
              aria-label={isPlayingThisPage ? "Pause narration" : "Read this page aloud"}
            >
              {narratorState === "loading" && narrator.activePage === (slide.kind === "page" ? slide.index : -1)
                ? "…"
                : isPlayingThisPage
                  ? "‖"
                  : "▶"}
            </button>

            <button
              type="button"
              onClick={() => goTo(slideIndex + 1)}
              disabled={slideIndex === lastIndex}
              className="glass rounded-full px-5 py-3 text-sm disabled:opacity-30"
            >
              Next
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoTurn}
                onChange={(e) => setAutoTurn(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="ink-soft">Turn pages automatically</span>
            </label>
            <span className="ink-soft">
              {voiceId ? `Read by ${voiceName ?? "your voice"}` : "Device voice"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
