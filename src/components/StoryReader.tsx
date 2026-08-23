"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNarrator } from "@/lib/useNarrator";
import { tokenize } from "@/lib/narration";
import type { SavedStory } from "@/lib/storage";

type Slide =
  | { kind: "cover" }
  | { kind: "page"; index: number }
  | { kind: "end" };

/**
 * The page, word by word.
 *
 * Splitting the text into spans is only worth doing while there is a clock to
 * follow, so `active` of -1 renders every word in the same resting state and
 * the page reads exactly as it would have as a plain paragraph.
 */
function PageText({ text, active }: { text: string; active: number }) {
  const tokens = useMemo(() => tokenize(text), [text]);

  return (
    <p className="story-text text-xl leading-relaxed sm:text-2xl md:text-3xl">
      {tokens.map((token, index) => {
        const gap = text.slice(index === 0 ? 0 : tokens[index - 1].to, token.from);
        const state =
          active < 0 ? "resting" : index === active ? "now" : index < active ? "said" : "ahead";

        return (
          <span key={token.from}>
            {gap}
            <span className={`word word-${state}`}>{text.slice(token.from, token.to)}</span>
          </span>
        );
      })}
    </p>
  );
}

export function StoryReader({
  saved,
  voiceId,
  voiceName,
  expressive,
  onExit,
}: {
  saved: SavedStory;
  voiceId: string | null;
  voiceName: string | null;
  expressive: boolean;
  onExit: () => void;
}) {
  const { story } = saved;
  const [slideIndex, setSlideIndex] = useState(0);
  const [autoTurn, setAutoTurn] = useState(true);
  const [followWords, setFollowWords] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const touchStartX = useRef<number | null>(null);

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

  // Narration owns the page while it is reading: slide n+1 holds page n.
  const handleNarratedPage = useCallback((page: number) => {
    setSlideIndex(page + 1);
  }, []);

  const handleFinished = useCallback(() => {
    setSlideIndex(lastIndex);
  }, [lastIndex]);

  const narrator = useNarrator({
    storyId: saved.id,
    pages: story.pages,
    voiceId,
    expressive,
    autoAdvance: autoTurn,
    onPage: handleNarratedPage,
    onFinished: handleFinished,
  });

  const { play, stop, prefetch, state: narratorState, word, precise } = narrator;

  // Warm the opening pages while the cover is still on screen, so the first
  // words arrive as soon as the parent taps play.
  useEffect(() => {
    if (slideIndex === 0 && voiceId) prefetch(0);
  }, [slideIndex, voiceId, prefetch]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, lastIndex));
      if (clamped === slideIndex) return;

      stop();
      setSlideIndex(clamped);

      // Reading straight through means a page turned by hand keeps reading too.
      const target = slides[clamped];
      if (autoTurn && target.kind === "page") void play(target.index);
    },
    [autoTurn, lastIndex, play, slideIndex, slides, stop],
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

  const onThisPage = slide.kind === "page" && narrator.page === slide.index;
  const isLoadingHere = narratorState === "loading" && onThisPage;
  const isPlayingHere = narratorState === "playing" && onThisPage;

  function togglePlayback() {
    // From the cover or the end, start at page one. Narration moves the slide
    // itself, so this must not also navigate - that would fetch twice.
    if (slide.kind !== "page") {
      void play(0);
      return;
    }
    if (isPlayingHere) narrator.pause();
    else if (narratorState === "paused" && onThisPage) narrator.resume();
    else void play(slide.index);
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
            <PageText
              text={story.pages[slide.index].text}
              active={followWords && isPlayingHere && precise ? word : -1}
            />
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
                boxShadow: isPlayingHere ? "0 0 0 10px var(--glow)" : undefined,
              }}
              aria-label={isPlayingHere ? "Pause narration" : "Read this page aloud"}
            >
              {isLoadingHere ? "…" : isPlayingHere ? "‖" : "▶"}
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

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoTurn}
                onChange={(e) => setAutoTurn(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="ink-soft">Read straight through</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={followWords}
                onChange={(e) => setFollowWords(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="ink-soft">Follow the words</span>
            </label>
            <span className="ink-soft">
              {isLoadingHere
                ? "Warming up your voice..."
                : voiceId
                  ? `Read by ${voiceName ?? "your voice"}`
                  : "Device voice"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
