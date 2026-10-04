"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
/** Three settings, not a slider: at bedtime a tap beats a drag. */
const SPEEDS = [
  { label: "Slower", value: 0.85 },
  { label: "Normal", value: 1 },
  { label: "Faster", value: 1.12 },
] as const;

const PageText = memo(function PageText({
  text,
  active,
}: {
  text: string;
  active: number;
}) {
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
});

/**
 * The dot strip. Memoised because the reader above it re-renders several times
 * a second while a page is being spoken, and redrawing a dozen buttons on every
 * word is work nobody asked for.
 */
const Progress = memo(function Progress({
  count,
  current,
  onGo,
}: {
  count: number;
  current: number;
  onGo: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-center">
      {Array.from({ length: count }, (_, index) => (
        /*
         * The dot is the mark; the button around it is the target. Drawn alone
         * these were 6px tall and a few pixels wide, sitting directly above the
         * play control - far under the 44px a thumb needs, so the usual outcome
         * was jumping to the wrong page or hitting play by mistake. The padding
         * carries the touch area without changing how the strip looks.
         */
        <button
          key={index}
          type="button"
          aria-label={`Go to slide ${index + 1}`}
          aria-current={index === current ? "true" : undefined}
          onClick={() => onGo(index)}
          className="flex h-11 items-center justify-center px-1"
        >
          <span
            className="block h-1.5 rounded-full transition-all"
            style={{
              width: index === current ? 24 : 8,
              // The inactive dots were --card-strong, which is a translucent
              // wash barely a shade off the sky behind it.
              background: index === current ? "var(--accent)" : "var(--ink-soft)",
              opacity: index === current ? 1 : 0.5,
            }}
          />
        </button>
      ))}
    </div>
  );
});

export function StoryReader({
  saved,
  voiceId,
  voiceName,
  mode,
  childName,
  saysLike,
  rate,
  onRateChange,
  onProgress,
  onExit,
}: {
  saved: SavedStory;
  voiceId: string | null;
  voiceName: string | null;
  mode: "steady" | "natural" | "lively";
  childName: string;
  saysLike: string;
  rate: number;
  onRateChange: (rate: number) => void;
  onProgress: (page: number) => void;
  onExit: () => void;
}) {
  const { story } = saved;
  const [slideIndex, setSlideIndex] = useState(0);
  const [autoTurn, setAutoTurn] = useState(true);
  const [followWords, setFollowWords] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const slideRef = useRef<HTMLDivElement | null>(null);

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

  /** Where a previous reading got to, if it stopped part-way through. */
  const resumeAt =
    saved.lastPage !== undefined &&
    saved.lastPage > 0 &&
    saved.lastPage < story.pages.length
      ? saved.lastPage
      : null;

  // Remember the page while it is being read, not only when the reader closes.
  const progressRef = useRef(onProgress);
  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    if (slide.kind === "page") progressRef.current(slide.index);
    if (slide.kind === "end") progressRef.current(0);
  }, [slide]);

  /**
   * Move focus onto each page as it arrives.
   *
   * On the first render this also pulls focus out of the page behind, which the
   * reader has replaced entirely - otherwise opening a story from the shelf
   * leaves focus on a button that no longer exists.
   */
  useEffect(() => {
    slideRef.current?.focus({ preventScroll: true });
  }, [slideIndex]);

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
    mode,
    childName,
    saysLike,
    rate,
    autoAdvance: autoTurn,
    onPage: handleNarratedPage,
    onFinished: handleFinished,
  });

  const { play, stop, reread, prefetch, state: narratorState, word, precise } = narrator;

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
    if (touchStartX.current === null || touchStartY.current === null) return;

    const dx = event.changedTouches[0].clientX - touchStartX.current;
    const dy = event.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    /*
     * The vertical component decides it. A long page scrolls, and a thumb
     * dragging down a page of text almost never travels straight: without this
     * check any scroll that wandered sixty pixels sideways turned the page,
     * which reads as the book flipping itself at random.
     */
    if (Math.abs(dx) <= 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    goTo(slideIndex + (dx < 0 ? 1 : -1));
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
      /* Exactly the viewport, so the controls below cannot be pushed off it. */
      className="relative flex h-dvh flex-col"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <header
        className="pad-sides-safe relative z-10 flex items-center justify-between gap-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)" }}
      >
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
            {/* Reading settings live here rather than under the story, so the
                page itself stays quiet while a child is looking at it. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pb-4">
              <div className="flex items-center gap-2">
                <span className="ink-soft text-xs">Speed</span>
                <div
                  className="flex rounded-full p-0.5"
                  style={{ background: "var(--card-strong)" }}
                >
                  {SPEEDS.map((option) => {
                    const on = Math.abs(rate - option.value) < 0.01;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => onRateChange(option.value)}
                        aria-pressed={on}
                        className="rounded-full px-3 py-1 text-xs font-semibold transition"
                        style={{
                          background: on ? "var(--accent)" : "transparent",
                          color: on ? "var(--accent-ink)" : "var(--ink)",
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={autoTurn}
                  onChange={(e) => setAutoTurn(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="ink-soft">Read straight through</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={followWords}
                  onChange={(e) => setFollowWords(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="ink-soft">Follow the words</span>
              </label>
            </div>

            <div className="mb-4 h-px" style={{ background: "var(--border)" }} />

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
      {/*
        The page itself scrolls, not the screen. An age-7 story runs to a few
        hundred words, and with the whole reader growing to fit it the play,
        Back and Next controls ended up below the fold - on a surface whose
        only other way forward is a swipe. `min-h-0` is what lets this flex
        child shrink instead of pushing the footer away.
      */}
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="flex min-h-full items-center justify-center">
        {/*
          Focus follows the page. Every way of turning one - the Next button, a
          swipe, or the narration reaching the end of a page - swaps this
          subtree via `key`, and without moving focus a screen reader says
          nothing at all and stays wherever it was. Reading a story aloud is the
          whole product, so it has to be announced.
        */}
        <div
          key={slideIndex}
          ref={slideRef}
          tabIndex={-1}
          aria-label={
            slide.kind === "cover"
              ? `Cover: ${story.title}`
              : slide.kind === "end"
                ? "The end"
                : `Page ${slide.index + 1} of ${story.pages.length}`
          }
          className="animate-rise w-full max-w-2xl text-center outline-none"
        >
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

              {resumeAt !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setSlideIndex(resumeAt + 1);
                    void play(resumeAt);
                  }}
                  className="glass animate-rise mt-8 rounded-full px-5 py-3 text-sm font-semibold"
                >
                  Carry on from page {resumeAt + 1}
                </button>
              )}
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
        </div>
      </main>

      {/* Controls */}
      {/* Clear of the home indicator once installed; 1.75rem anywhere without one. */}
      <footer
        className="pad-sides-safe relative z-10"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <Progress count={slides.length} current={slideIndex} onGo={goTo} />

          {narrator.error && (
            /* The only sign that the voice failed rather than simply not started. */
            <p
              role="alert"
              aria-atomic="true"
              className="text-center text-xs"
              style={{ color: "#ff9d9d" }}
            >
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
              aria-label={
                isLoadingHere
                  ? "Loading narration"
                  : isPlayingHere
                    ? "Pause narration"
                    : "Read this page aloud"
              }
              // The glyph alone is "…" with no spoken equivalent, so the wait
              // between tapping play and hearing anything was silent.
              aria-busy={isLoadingHere || undefined}
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

          <div className="flex items-center justify-center gap-4 text-xs">
            {/* Narration is not deterministic. When a page comes out garbled,
                asking again almost always fixes it, and a parent should not
                have to know that to get out of it. */}
            {slide.kind === "page" && voiceId && (
              <button
                type="button"
                onClick={() => void reread(slide.index)}
                disabled={isLoadingHere}
                className="ink-soft rounded-full px-3 py-1.5 disabled:opacity-40"
                style={{ border: "1px solid var(--border)" }}
              >
                Read that again
              </button>
            )}
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
