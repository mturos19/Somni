"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgeDial } from "@/components/AgeDial";
import { ElementPicker, EMPTY_SELECTION, type Selection } from "@/components/ElementPicker";
import { StarField } from "@/components/StarField";
import { StoryReader } from "@/components/StoryReader";
import { ThemePicker } from "@/components/ThemePicker";
import { VoiceStudio } from "@/components/VoiceStudio";
import { randomSelection } from "@/lib/elements";
import { StoryError, writeStory } from "@/lib/storyStream";
import { DEFAULT_THEME, themeById, themeStyle } from "@/lib/themes";
import {
  newId,
  profiles as profileStore,
  stories as storyStore,
  voices as voiceStore,
  type ChildProfile,
  type SavedStory,
  type SavedVoice,
} from "@/lib/storage";

/**
 * Two sets, because the two halves of the wait are genuinely different: first
 * the model plans the story, which takes a while and shows nothing, then it
 * writes it, which we can measure.
 */
const THINKING_LINES = [
  "Thinking of somewhere to begin...",
  "Choosing who your child will meet...",
  "Working out what goes wrong, gently...",
];

const WRITING_LINES = [
  "Writing it down...",
  "Making sure it ends somewhere safe...",
  "Slowing down the last few pages...",
];

export default function Home() {
  const [profile, setProfile] = useState<ChildProfile>(() => ({
    id: "primary",
    name: "",
    age: 4,
    themeId: DEFAULT_THEME.id,
    voiceId: null,
    createdAt: Date.now(),
  }));
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [custom, setCustom] = useState("");
  const [library, setLibrary] = useState<SavedStory[]>([]);
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([]);
  const [config, setConfig] = useState({ story: true, voice: true });
  const [reading, setReading] = useState<SavedStory | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"thinking" | "writing">("thinking");
  const [written, setWritten] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  /** What a finished story of this size usually weighs, per the server. */
  const [expected, setExpected] = useState(1);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const theme = useMemo(() => themeById(profile.themeId), [profile.themeId]);

  /* ------------------------------- bootstrap ------------------------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [stored, storedStories, storedVoices] = await Promise.all([
        profileStore.all(),
        storyStore.all(),
        voiceStore.all(),
      ]);
      if (cancelled) return;
      if (stored.length > 0) setProfile(stored[0]);
      setLibrary(storedStories);
      setSavedVoices(storedVoices);
      setHydrated(true);
    })();

    void fetch("/api/config")
      .then((res) => res.json())
      .then((data) => !cancelled && setConfig(data))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the profile whenever it settles, but not before it has loaded.
  useEffect(() => {
    if (!hydrated) return;
    void profileStore.save(profile);
  }, [profile, hydrated]);

  // Cycle the reassuring messages while Claude works.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setLineIndex((i) => i + 1), 2600);
    return () => clearInterval(id);
  }, [busy]);

  /* -------------------------------- actions -------------------------------- */

  const updateProfile = useCallback(
    (patch: Partial<ChildProfile>) => setProfile((p) => ({ ...p, ...patch })),
    [],
  );

  async function createStory() {
    setBusy(true);
    setError(null);
    setPhase("thinking");
    setWritten(0);
    setExpected(1);
    setLineIndex(0);

    try {
      const story = await writeStory(
        {
          childName: profile.name,
          age: profile.age,
          hero: selection.hero,
          world: selection.world,
          twist: selection.twist,
          vibe: selection.vibe,
          custom,
          themeName: theme.name,
        },
        (event) => {
          if (event.type === "start") setExpected(Math.max(1, event.expectedChars));
          else if (event.type === "phase") setPhase(event.phase);
          else if (event.type === "progress") setWritten(event.chars);
        },
      );

      const saved: SavedStory = {
        id: newId(),
        profileId: profile.id,
        title: story.title,
        story,
        themeId: profile.themeId,
        age: profile.age,
        selection,
        custom,
        createdAt: Date.now(),
      };

      await storyStore.save(saved);
      setLibrary(await storyStore.all());
      setReading(saved);
    } catch (err) {
      if (err instanceof StoryError) setError({ message: err.message, hint: err.hint });
      else {
        setError({
          message: "Could not reach the story writer.",
          hint: "Check your connection.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeStory(id: string) {
    await storyStore.remove(id);
    setLibrary(await storyStore.all());
  }

  const activeVoiceName =
    savedVoices.find((v) => v.voiceId === profile.voiceId)?.name ?? null;

  /* --------------------------------- render -------------------------------- */

  if (reading) {
    return (
      <div className="sky min-h-dvh" style={themeStyle(themeById(reading.themeId))}>
        <StarField seed={11} count={50} />
        <StoryReader
          saved={reading}
          voiceId={profile.voiceId}
          voiceName={activeVoiceName}
          onExit={() => setReading(null)}
        />
      </div>
    );
  }

  return (
    <div className="sky min-h-dvh" style={themeStyle(theme)}>
      <StarField />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-24 pt-8">
        {/* Masthead */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1
              className="font-[family-name:var(--font-display)] text-3xl font-semibold"
              style={{ color: "var(--accent)" }}
            >
              Somni
            </h1>
            <p className="ink-soft text-sm">A new bedtime story, every night.</p>
          </div>
          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="glass flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold"
          >
            <span aria-hidden>{"\u{1F399}"}</span>
            {profile.voiceId ? activeVoiceName ?? "Your voice" : "Add your voice"}
          </button>
        </header>

        {!config.story && (
          <div
            className="mt-6 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: "var(--card-strong)",
              borderLeft: "3px solid var(--accent-2)",
            }}
          >
            No <code>ANTHROPIC_API_KEY</code> found. Add one to{" "}
            <code>.env.local</code> and restart the dev server to start writing
            stories.
          </div>
        )}

        <div className="mt-7 space-y-5">
          {/* Child */}
          <section className="glass rounded-3xl p-6 sm:p-7">
            <label
              htmlFor="child-name"
              className="font-[family-name:var(--font-display)] text-xl"
            >
              Who is this story for?
            </label>
            <p className="ink-soft mt-1 text-sm">
              They will be the hero of it.
            </p>
            <input
              id="child-name"
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              maxLength={40}
              placeholder="Maya"
              className="mt-4 w-full rounded-2xl px-4 py-3.5 text-lg outline-none placeholder:opacity-40"
              style={{
                background: "var(--card-strong)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
              }}
            />
          </section>

          <AgeDial age={profile.age} onChange={(age) => updateProfile({ age })} />

          <ThemePicker
            themeId={profile.themeId}
            onChange={(themeId) => updateProfile({ themeId })}
          />

          <ElementPicker
            selection={selection}
            onChange={setSelection}
            custom={custom}
            onCustomChange={setCustom}
            onSurprise={() => setSelection(randomSelection())}
          />
        </div>

        {error && (
          <div
            className="mt-5 rounded-2xl px-4 py-3 text-sm"
            style={{ background: "var(--card-strong)", borderLeft: "3px solid #ff8a8a" }}
          >
            <strong>{error.message}</strong>
            {error.hint && <span className="ink-soft block text-xs">{error.hint}</span>}
          </div>
        )}

        {/* Library */}
        {library.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Story shelf
            </h2>
            <div className="mt-3 space-y-2">
              {library.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="glass flex items-center gap-3 rounded-2xl px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => setReading(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm font-semibold">{item.title}</div>
                    <div className="ink-soft text-xs">
                      age {item.age} · {item.story.pages.length} pages ·{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeStory(item.id)}
                    aria-label={`Delete ${item.title}`}
                    className="ink-soft px-2 text-xs"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky write button */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-5 pb-5">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => void createStory()}
            disabled={busy || !config.story}
            className="w-full rounded-full py-4 text-base font-bold shadow-lg transition active:scale-[0.99] disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "var(--accent-ink)",
              boxShadow: "0 10px 40px var(--glow)",
            }}
          >
            {busy ? "Writing..." : "Write tonight's story"}
          </button>
        </div>
      </div>

      {/* Writing overlay */}
      {busy && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 px-6 backdrop-blur-md"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="animate-breathe text-6xl">{"\u{2728}"}</div>
          <p className="story-text max-w-sm text-center text-xl">
            {(phase === "thinking" ? THINKING_LINES : WRITING_LINES)[
              lineIndex % (phase === "thinking" ? THINKING_LINES : WRITING_LINES).length
            ]}
          </p>

          {/*
            While the model is planning there is nothing honest to measure, so
            the bar shimmers. Once words start arriving it fills for real.
          */}
          {phase === "thinking" ? (
            <div
              className="shimmer h-1 w-48 rounded-full"
              style={{ background: "var(--card-strong)" }}
            />
          ) : (
            <div
              className="h-1 w-48 overflow-hidden rounded-full"
              style={{ background: "var(--card-strong)" }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(0.97, written / expected) * 100)}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.min(97, (written / expected) * 100)}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          )}
        </div>
      )}

      {studioOpen && (
        <VoiceStudio
          available={config.voice}
          selectedVoiceId={profile.voiceId}
          onSelectVoice={async (voiceId) => {
            updateProfile({ voiceId });
            setSavedVoices(await voiceStore.all());
          }}
          onClose={async () => {
            setStudioOpen(false);
            setSavedVoices(await voiceStore.all());
          }}
        />
      )}
    </div>
  );
}
