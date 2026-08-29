"use client";

import { THEMES } from "@/lib/themes";

/**
 * Picking a look. Themes are chosen directly rather than derived from anything
 * about the child, so a kid who wants rocket-blue or blossom-pink just picks it.
 * Selecting one repaints the whole app immediately.
 */
export function ThemePicker({
  themeId,
  onChange,
}: {
  themeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <section className="glass rounded-3xl p-6 sm:p-7">
      <h2 className="font-[family-name:var(--font-display)] text-xl">
        Pick your look
      </h2>
      <p className="ink-soft mt-1 text-sm">
        Let them choose. It changes the whole app.
      </p>

      {/* A grid, not a scroller: four themes all visible at once. */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        {THEMES.map((theme) => {
          const selected = theme.id === themeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              aria-pressed={selected}
              className="flex flex-col items-center gap-2 rounded-2xl p-3 transition active:scale-[0.98]"
              style={{
                background: selected ? "var(--card-strong)" : "transparent",
                border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                boxShadow: selected ? "0 0 0 3px var(--glow)" : undefined,
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
                style={{
                  background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[2]})`,
                }}
              >
                {theme.emoji}
              </span>
              <span className="text-sm font-semibold">{theme.name}</span>
              <span className="ink-soft text-center text-[11px] leading-tight">
                {theme.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
