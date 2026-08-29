"use client";

import { ELEMENT_GROUPS, type GroupId } from "@/lib/elements";

export type Selection = Record<GroupId, string[]>;

export const EMPTY_SELECTION: Selection = {
  hero: [],
  world: [],
  twist: [],
  vibe: [],
};

/**
 * The story builder. Chips are suggestions; the free-text box underneath is
 * treated by the prompt as the most important instruction of all, so a parent
 * is never boxed in by the catalogue.
 */
export function ElementPicker({
  selection,
  onChange,
  custom,
  onCustomChange,
  onSurprise,
}: {
  selection: Selection;
  onChange: (next: Selection) => void;
  custom: string;
  onCustomChange: (value: string) => void;
  onSurprise: () => void;
}) {
  function toggle(groupId: GroupId, optionId: string, max: number) {
    const current = selection[groupId];
    const has = current.includes(optionId);

    let next: string[];
    if (has) {
      next = current.filter((id) => id !== optionId);
    } else if (max === 1) {
      // A single-choice group swaps rather than blocking - there is nothing to
      // deselect first when only one can ever be on.
      next = [optionId];
    } else if (current.length >= max) {
      // Full. The chip is disabled in the UI, so this is only a guard.
      return;
    } else {
      next = [...current, optionId];
    }

    onChange({ ...selection, [groupId]: next });
  }

  return (
    <section className="glass rounded-3xl p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            What is it about?
          </h2>
          <p className="ink-soft mt-1 text-sm">
            Mix anything with anything. That is the fun part.
          </p>
        </div>
        <button
          type="button"
          onClick={onSurprise}
          className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition hover:opacity-85"
          style={{ background: "var(--card-strong)", border: "1px solid var(--border)" }}
        >
          Surprise us
        </button>
      </div>

      <div className="mt-6 space-y-6">
        {ELEMENT_GROUPS.map((group) => {
          const chosen = selection[group.id];
          // Single-choice groups swap on tap, so nothing is ever unavailable.
          const full = group.max > 1 && chosen.length >= group.max;

          return (
            <div key={group.id}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {group.title}
                </h3>
                <span className="ink-soft text-xs">{group.hint}</span>
                {group.max > 1 && (
                  <span
                    className="ml-auto text-xs tabular-nums"
                    style={{ color: full ? "var(--accent)" : "var(--ink-soft)" }}
                  >
                    {chosen.length}/{group.max}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const selected = chosen.includes(option.id);
                  // Full means the rest go quiet rather than disappearing, so
                  // the shape of the choice on screen never jumps around.
                  const locked = full && !selected;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={locked}
                      onClick={() => toggle(group.id, option.id, group.max)}
                      aria-pressed={selected}
                      title={locked ? `Deselect one to change this` : undefined}
                      className="rounded-full px-3.5 py-2 text-sm transition active:scale-95 disabled:cursor-not-allowed"
                      style={{
                        background: selected ? "var(--accent)" : "var(--card-strong)",
                        color: selected ? "var(--accent-ink)" : "var(--ink)",
                        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                        fontWeight: selected ? 700 : 500,
                        opacity: locked ? 0.3 : 1,
                      }}
                    >
                      <span aria-hidden className="mr-1.5">
                        {option.emoji}
                      </span>
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div>
          <label
            htmlFor="custom-brief"
            className="text-sm font-bold uppercase tracking-wider"
          >
            Anything else?
          </label>
          <p className="ink-soft mt-1 text-xs">
            Their favourite toy, a worry about starting school, a joke only your
            family gets. Written here, it shapes the whole story.
          </p>
          <textarea
            id="custom-brief"
            value={custom}
            onChange={(e) => onCustomChange(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Include her rabbit Biscuit, who is very brave but pretends not to be."
            className="mt-2 w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none placeholder:opacity-40"
            style={{
              background: "var(--card-strong)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
          />
          <div className="ink-soft mt-1 text-right text-[11px]">
            {custom.length}/600
          </div>
        </div>
      </div>
    </section>
  );
}
