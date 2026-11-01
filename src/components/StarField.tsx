"use client";

import { memo, useMemo } from "react";

/**
 * Decorative night sky. Positions come from a seeded generator rather than
 * Math.random so the server and client render identical markup.
 */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

/**
 * Every star is an independently animated element behind the whole app, so the
 * count is a direct trade against how smooth everything in front of it feels on
 * a phone. Forty-four reads as a sky; seventy read as a warm battery.
 *
 * What costs is the *animating*, not the drawing. Chrome declines to composite
 * this many small animations, so each one recalculates style on the main thread
 * every frame - and the glass panels above them carry backdrop-filter, so each
 * frame also invalidates the blur behind all six. Measured idle over four
 * seconds: 36ms with all forty-four twinkling, 7ms with twelve.
 *
 * So the sky keeps all of its stars and only a third of them twinkle. Real
 * skies do not pulse in unison either, and the ones holding still read as
 * further away.
 */
const ANIMATED_STARS = 14;
/**
 * Memoised, and the props are plain numbers so it genuinely never re-renders.
 * Without this the forty-four stars were reconciled on every keystroke in the
 * child's name - the most expensive thing on screen, redrawn for something it
 * knows nothing about.
 */
export const StarField = memo(function StarField({
  count = 44,
  seed = 7,
  /**
   * Whether anything in the sky moves.
   *
   * Set false behind the reader. That screen has the tightest frame budget in
   * the app - a requestAnimationFrame loop following the audio clock, a word
   * repainting its glow every few hundred milliseconds, and six backdrop-filter
   * panels stacked over this - and a decorative twinkle has no business taking
   * any of it. Held still, the whole field costs one paint and then nothing.
   */
  animate = true,
}: {
  count?: number;
  seed?: number;
  animate?: boolean;
}) {
  const stars = useMemo(() => {
    const rand = seeded(seed);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rand() * 100,
      top: rand() * 100,
      size: 1 + rand() * 2.2,
      delay: rand() * 6,
      duration: 3 + rand() * 4,
    }));
  }, [count, seed]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {stars.map((star) => {
        // Spread the animated ones through the field rather than clustering
        // them in whichever corner the generator happened to fill first.
        const twinkles =
          animate && star.id % 3 === 0 && star.id / 3 < ANIMATED_STARS;
        return (
          <span
            key={star.id}
            className={twinkles ? "animate-twinkle absolute rounded-full" : "absolute rounded-full"}
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              background: "var(--star)",
              // The still ones sit at a fixed brightness, varied by size so the
              // field does not read as a flat grid of identical dots.
              ...(twinkles
                ? {
                    ["--twinkle-delay" as string]: `${star.delay}s`,
                    ["--twinkle-duration" as string]: `${star.duration}s`,
                  }
                : { opacity: 0.25 + (star.size / 3.2) * 0.45 }),
            }}
          />
        );
      })}
      {/* A soft moon-glow anchoring the top corner. Promoted to its own layer
          so drifting it never repaints the blur underneath. */}
      <div
        className={
          animate
            ? "animate-drift absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
            : "absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        }
        style={{
          background: "var(--glow)",
          opacity: 0.5,
          // Only worth promoting while it actually moves. A still layer asking
          // for its own texture is memory spent on nothing.
          ...(animate ? { willChange: "transform" } : {}),
        }}
      />
    </div>
  );
});
