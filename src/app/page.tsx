"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgeDial } from "@/components/AgeDial";
import { ElementPicker, EMPTY_SELECTION, type Selection } from "@/components/ElementPicker";
import { InstallPrompt } from "@/components/InstallPrompt";
import { StarField } from "@/components/StarField";
import { StoryReader } from "@/components/StoryReader";
import { ThemePicker } from "@/components/ThemePicker";
import { VoiceStudio } from "@/components/VoiceStudio";
import { randomSelection } from "@/lib/elements";
import { StoryError, writeStory } from "@/lib/storyStream";
import { DEFAULT_THEME, themeById, themeStyle } from "@/lib/themes";
import {
  newId,
  requestPersistence,
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

/** Shown after the rare generation that came back unreadable. */
const RETRY_LINES = ["That one came out tangled. Starting it again..."];

/** How many of the most recent stories the shelf shows before asking. */
const SHELF_PREVIEW = 8;

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
  const [showAllStories, setShowAllStories] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"thinking" | "writing">("thinking");
  const [retried, setRetried] = useState(false);
  /** 0 to 1, and only ever upward - a bar that slips backwards reads as broken. */
  const [ratio, setRatio] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const writtenRef = useRef(0);
  /** When the server told us it was starting over, so the note can fade. */
  const retriedAtRef = useRef(0);
  /** What a finished story of this size usually weighs, per the server. */
  const expectedRef = useRef(1);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  /** The control that opened the overlay, so focus can go back to it. */
  const writeButtonRef = useRef<HTMLButtonElement | null>(null);

  const theme = useMemo(() => themeById(profile.themeId), [profile.themeId]);

  /* ------------------------------- bootstrap ------------------------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [stored, storedStories, storedVoices] = await Promise.all([
        profileStore.load(),
        storyStore.all(),
        voiceStore.all(),
      ]);
      if (cancelled) return;
      setLibrary(storedStories);
      setSavedVoices(storedVoices);

      /*
       * Only start saving once we know what was there. A null read is a failed
       * read, not an empty one - marking the app hydrated on that would let the
       * effect below write this component's blank starting profile over a real
       * one, losing the child's name, their age and the voice they chose.
       */
      if (stored === null) return;
      if (stored.length > 0) setProfile(stored[0]);
      setHydrated(true);
    })();

    // Nothing depends on the answer; it only ever makes the shelf safer.
    void requestPersistence();

    void fetch("/api/config")
      .then((res) => res.json())
      .then((data) => !cancelled && setConfig(data))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Persist the profile once it settles, not on every change.
   *
   * "Settles" is the point: this effect depends on `profile`, and the child's
   * name is a controlled input, so without the delay every single keystroke
   * opened an IndexedDB transaction - five letters, five writes, each one
   * landing in the middle of the keypress after it. There is nothing to gain
   * from saving a half-typed name, and a parent typing on a phone feels every
   * one of those.
   */
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => void profileStore.save(profile), 400);
    return () => clearTimeout(id);
  }, [profile, hydrated]);

  /**
   * Drives the whole waiting overlay from one timer.
   *
   * The bar takes whichever is further along: the characters actually received,
   * or a curve that creeps toward ninety percent on its own. Planning the story
   * produces no output at all for a while, and a bar that sits at zero through
   * that looks like a bug rather than a model thinking.
   */
  useEffect(() => {
    if (!busy) return;

    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const creep = 0.9 * (1 - Math.exp(-elapsed / 40));
      const measured = writtenRef.current / expectedRef.current;

      setRatio((current) => Math.min(0.97, Math.max(current, creep, measured)));
      setLineIndex(Math.floor(elapsed / 2.8));

      // Say what happened, then get out of the way.
      const since = retriedAtRef.current;
      setRetried(since !== 0 && Date.now() - since < 7000);
    }, 200);

    return () => clearInterval(id);
  }, [busy]);

  /**
   * Hold focus inside the writing overlay while it is up, and hand it back when
   * it comes down. Without this a parent tabbing during the wait edits the form
   * underneath a backdrop they cannot see through.
   */
  useEffect(() => {
    if (busy) {
      overlayRef.current?.focus();
      return;
    }
    // Only reclaim focus if it was left nowhere, so this never steals it from
    // the reader that has just opened.
    if (document.activeElement === document.body) writeButtonRef.current?.focus();
  }, [busy]);

  /* -------------------------------- actions -------------------------------- */

  const updateProfile = useCallback(
    (patch: Partial<ChildProfile>) => setProfile((p) => ({ ...p, ...patch })),
    [],
  );

  // Stable identities, so the memoised pickers below actually stay put.
  const setAge = useCallback((age: number) => updateProfile({ age }), [updateProfile]);
  const setThemeId = useCallback(
    (themeId: string) => updateProfile({ themeId }),
    [updateProfile],
  );
  const surprise = useCallback(() => setSelection(randomSelection()), []);

  async function createStory() {
    setBusy(true);
    setError(null);
    setPhase("thinking");
    setRetried(false);
    setRatio(0);
    retriedAtRef.current = 0;
    setLineIndex(0);
    writtenRef.current = 0;
    expectedRef.current = 1;

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
          if (event.type === "start") expectedRef.current = Math.max(1, event.expectedChars);
          else if (event.type === "phase") setPhase(event.phase);
          else if (event.type === "progress") writtenRef.current = event.chars;
          else if (event.type === "retry") {
            // The bar keeps whatever ground it has: from here the wait is the
            // same length again, and rewinding it would read as a failure.
            writtenRef.current = 0;
            retriedAtRef.current = Date.now();
          }
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

      // Open it first. Saving and re-reading the shelf are housekeeping, and
      // making a parent wait on two IndexedDB round trips after a minute of
      // waiting already is the wrong order.
      setReading(saved);
      const kept = await storyStore.save(saved);
      setLibrary(await storyStore.all());

      // Said here rather than over the reader: the story is open and readable
      // right now, and this only matters when they come back for it.
      if (!kept) {
        setError({
          message: "This story could not be saved on this device.",
          hint: "Storage may be full, or site data may be switched off. It will read fine tonight, but it will not be on the shelf tomorrow.",
        });
      }
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
    const story = library.find((s) => s.id === id);
    // Small target, thumb's edge, and the only copy in existence - the story
    // was never on a server and cannot be written again the same way.
    if (
      !window.confirm(
        story ? `Delete "${story.title}"? This cannot be undone.` : "Delete this story?",
      )
    ) {
      return;
    }
    await storyStore.remove(id);
    setLibrary(await storyStore.all());
  }

  const activeVoiceName =
    savedVoices.find((v) => v.voiceId === profile.voiceId)?.name ?? null;

  /* --------------------------------- render -------------------------------- */

  if (reading) {
    return (
      <div className="sky min-h-dvh" style={themeStyle(themeById(reading.themeId))}>
        {/*
          Held still. See the `animate` note in StarField: the reader is the one
          screen whose frames are already spoken for, and it is also the screen
          with the most glass stacked over this.
        */}
        <StarField seed={11} count={36} animate={false} />
        <StoryReader
          saved={reading}
          voiceId={profile.voiceId}
          voiceName={activeVoiceName}
          mode={profile.voiceMode ?? "natural"}
          childName={profile.name}
          saysLike={profile.saysLike ?? ""}
          rate={profile.readingSpeed ?? 1}
          onRateChange={(readingSpeed) => updateProfile({ readingSpeed })}
          onProgress={(page) => void storyStore.saveProgress(reading.id, page)}
          onExit={async () => {
            setReading(null);
            setLibrary(await storyStore.all());
          }}
        />
      </div>
    );
  }

  return (
    <div className="sky min-h-dvh" style={themeStyle(theme)}>
      {/*
        Still while something is covering it.

        Both overlays are full-screen scrims, so every star under one is both
        invisible and expensive: it goes on recalculating its own style each
        frame, and on anything that can afford the blur it invalidates the whole
        viewport's worth of it as well. The writing overlay is up for the entire
        minute or two a story takes, which makes this the longest stretch of
        wasted work anywhere in the app.
      */}
      <StarField animate={!busy && !studioOpen} />

      {/*
        Bottom clearance has to cover the sticky write button and, when it is
        showing, the install card above it - plus the home indicator once this
        is installed and drawing edge to edge.
      */}
      <div
        className="pad-sides-safe pad-top-safe relative z-10 mx-auto w-full max-w-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12rem)" }}
      >
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
            {process.env.NODE_ENV === "production" ? (
              <>
                Somni cannot write new stories just now. Anything already on
                your shelf still opens and still reads aloud.
              </>
            ) : (
              <>
                No <code>ANTHROPIC_API_KEY</code> found. Add one to{" "}
                <code>.env.local</code> and restart the dev server to start
                writing stories.
              </>
            )}
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

            {/*
              Said before they tap, not discovered afterwards. Skipping the name
              is allowed and the story still works - it just calls the hero "the
              child" throughout, which is a poor first impression of an app
              whose whole point is that the story is about *them*.
            */}
            {profile.name.trim().length === 0 && (
              <p className="ink-soft mt-2 text-[11px]">
                Left blank, the story will just say &ldquo;the child&rdquo;.
              </p>
            )}

            {/*
              Only worth asking once there is a name to ask about. A story that
              mispronounces the child it was written for is worse than one that
              never used their name at all.
            */}
            {profile.name.trim().length > 0 && (
              <div className="mt-3">
                <label htmlFor="says-like" className="ink-soft text-xs">
                  Said differently to how it is spelled? Write how it sounds.
                </label>
                <input
                  id="says-like"
                  value={profile.saysLike ?? ""}
                  onChange={(e) => updateProfile({ saysLike: e.target.value })}
                  maxLength={40}
                  placeholder={`How to say "${profile.name.trim()}" out loud`}
                  className="mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm outline-none placeholder:opacity-40"
                  style={{
                    background: "var(--card-strong)",
                    border: "1px solid var(--border)",
                    color: "var(--ink)",
                  }}
                />
                <p className="ink-soft mt-1 text-[11px]">
                  Only the voice sees this. The page still shows{" "}
                  {profile.name.trim()}.
                </p>
              </div>
            )}
          </section>

          {/*
            The handlers below are all useCallback'd. An inline arrow here
            would be a new prop on every render and would defeat the memo on
            each of these components entirely - which is the whole point, since
            none of them care about the name being typed above.
          */}
          <AgeDial age={profile.age} onChange={setAge} />

          <ThemePicker themeId={profile.themeId} onChange={setThemeId} />

          <ElementPicker
            selection={selection}
            onChange={setSelection}
            custom={custom}
            onCustomChange={setCustom}
            onSurprise={surprise}
          />
        </div>

        {error && (
          <div
            /*
             * Announced, because it is the only thing that distinguishes a
             * failure from a success: on either outcome the overlay simply
             * disappears, and this banner sits far up a scrolled page where
             * nobody is looking.
             */
            role="alert"
            aria-atomic="true"
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
              {(showAllStories ? library : library.slice(0, SHELF_PREVIEW)).map((item) => (
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
                      {item.lastPage !== undefined &&
                      item.lastPage > 0 &&
                      item.lastPage < item.story.pages.length ? (
                        <span style={{ color: "var(--accent-2)" }}>
                          stopped at page {item.lastPage + 1}
                        </span>
                      ) : (
                        new Date(item.createdAt).toLocaleDateString()
                      )}
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

            {/*
              Without this the shelf showed its first eight and quietly hid the
              rest - and a story you cannot see is a story you cannot delete,
              while its narration audio stays on the device for good.
            */}
            {library.length > SHELF_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllStories((v) => !v)}
                className="ink-soft mt-3 w-full rounded-2xl py-2.5 text-xs font-semibold"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                {showAllStories
                  ? "Show fewer"
                  : `Show all ${library.length} stories`}
              </button>
            )}
          </section>
        )}
      </div>

      {/* Sticky write button */}
      <div className="pad-sides-safe pad-bottom-safe fixed inset-x-0 bottom-0 z-20">
        <div className="mx-auto max-w-2xl">
          <button
            ref={writeButtonRef}
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
          /*
           * The button that opened this becomes disabled on the same render, so
           * the browser blurs it and focus falls to the body - the next Tab
           * would land in the form behind an opaque backdrop. Taking focus here
           * keeps it where the only thing happening actually is.
           */
          ref={overlayRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Writing your story"
          className="scrim fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 px-6 outline-none"
        >
          <div className="animate-breathe text-6xl">{"\u{2728}"}</div>
          {/*
            A minute or two of silence is indistinguishable from a tap that
            never registered, so the status line is spoken as it changes.
          */}
          <p role="status" className="story-text max-w-sm text-center text-xl">
            {(() => {
              const lines = retried
                ? RETRY_LINES
                : phase === "thinking"
                  ? THINKING_LINES
                  : WRITING_LINES;
              return lines[lineIndex % lines.length];
            })()}
          </p>

          <div className="w-64 max-w-[80vw]">
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--card-strong)" }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
              aria-label="Writing your story"
            >
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-linear"
                style={{
                  width: `${Math.max(2, ratio * 100)}%`,
                  background: "var(--accent)",
                  boxShadow: "0 0 12px var(--glow)",
                }}
              />
            </div>
            <div className="ink-soft mt-2 text-center text-xs tabular-nums">
              {Math.round(ratio * 100)}%
            </div>
          </div>
        </div>
      )}

      {/*
        Inside the themed wrapper rather than in the layout, because the palette
        lives on this element - mounted any higher it would be stuck on the
        fallback theme no matter which one the family chose.
      */}
      <InstallPrompt />

      {studioOpen && (
        <VoiceStudio
          available={config.voice}
          selectedVoiceId={profile.voiceId}
          mode={profile.voiceMode ?? "natural"}
          onModeChange={(voiceMode) => updateProfile({ voiceMode })}
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
