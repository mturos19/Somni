"use client";

import { MAX_AGE, MIN_AGE, ageSpec, estimatedMinutes } from "@/lib/age";

const AGES = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => MIN_AGE + i);

/**
 * The age dial. Every notch changes vocabulary, sentence length, page count and
 * how much tension the story is allowed to carry, so the summary underneath
 * shows the parent what they are actually choosing.
 */
export function AgeDial({
  age,
  onChange,
}: {
  age: number;
  onChange: (age: number) => void;
}) {
  const spec = ageSpec(age);
  const minutes = estimatedMinutes(age);
  const percent = ((age - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100;

  return (
    <section className="glass rounded-3xl p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            How old is your listener?
          </h2>
          <p className="ink-soft mt-1 text-sm">
            This retunes the whole story, not just the words.
          </p>
        </div>
        <div className="text-right">
          <div
            className="font-[family-name:var(--font-display)] text-5xl leading-none"
            style={{ color: "var(--accent)" }}
          >
            {age}
          </div>
          <div className="ink-soft text-xs uppercase tracking-widest">years</div>
        </div>
      </div>

      <div className="relative mt-7">
        <input
          type="range"
          min={MIN_AGE}
          max={MAX_AGE}
          step={1}
          value={age}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Child's age"
          aria-valuetext={`${age} years old, ${spec.stage}`}
          className="h-8 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full
            [&::-webkit-slider-runnable-track]:bg-[var(--card-strong)]
            [&::-webkit-slider-thumb]:mt-[-11px] [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[var(--accent)]
            [&::-webkit-slider-thumb]:shadow-[0_0_0_6px_var(--glow)]
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:active:scale-110
            [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full
            [&::-moz-range-track]:bg-[var(--card-strong)]
            [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--accent)]"
        />
        {/* Filled portion of the track, drawn under the native thumb. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-[11px] h-2 rounded-full transition-all duration-300"
          style={{
            width: `calc(${percent}% - ${percent * 0.24}px + 12px)`,
            background: "linear-gradient(90deg, var(--accent-2), var(--accent))",
          }}
        />
      </div>

      <div className="mt-1 flex justify-between px-1">
        {AGES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-label={`Set age to ${value}`}
            className={`h-8 w-8 rounded-full text-sm transition ${
              value === age ? "font-bold" : "ink-soft hover:opacity-100"
            }`}
            style={value === age ? { color: "var(--accent)" } : undefined}
          >
            {value}
          </button>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
        <Stat label="Stage" value={spec.stage} />
        <Stat label="Pages" value={`${spec.pageCount[0]}-${spec.pageCount[1]}`} />
        <Stat label="Read time" value={`~${minutes} min`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-2 py-3"
      style={{ background: "var(--card-strong)" }}
    >
      <dt className="ink-soft text-[10px] uppercase tracking-widest">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
