"use client";

import { useMemo } from "react";

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
 */
export function StarField({ count = 44, seed = 7 }: { count?: number; seed?: number }) {
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
      {stars.map((star) => (
        <span
          key={star.id}
          className="animate-twinkle absolute rounded-full"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            background: "var(--star)",
            ["--twinkle-delay" as string]: `${star.delay}s`,
            ["--twinkle-duration" as string]: `${star.duration}s`,
          }}
        />
      ))}
      {/* A soft moon-glow anchoring the top corner. Promoted to its own layer
          so drifting it never repaints the blur underneath. */}
      <div
        className="animate-drift absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{
          background: "var(--glow)",
          opacity: 0.5,
          willChange: "transform",
        }}
      />
    </div>
  );
}
