# Somni

A bedtime story app. You pick who is in it and where it happens, set your
child's age, and Claude writes an original story tuned to that age. Then it is
read aloud in your own cloned voice.

Everything a family makes — profiles, stories, and the narrated audio — is
stored in their own browser. There is no account, no database, and nothing
leaves the device except the story brief and the voice recordings you
explicitly submit.

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev
```

Open http://localhost:3000.

You need an `ANTHROPIC_API_KEY` to write stories. `ELEVENLABS_API_KEY` is
optional — without it the app narrates with the device's built-in speech voice
and the rest works unchanged.

## How it works

### The age dial

The dial from 2 to 7 is the core of the thing. It does not just swap
vocabulary; each notch carries its own spec for page count, words per page,
maximum sentence length, plot shape, how much tension is allowed, which
narrative devices to use, and what to avoid. All of it lands in the prompt.

A two-year-old gets six to eight pages of fifteen-word sentences built around a
repeated refrain, with no villain anywhere. A seven-year-old gets a subplot,
foreshadowing, and a morally interesting choice. Retuning that lives in one
place: [`src/lib/age.ts`](src/lib/age.ts).

### The story

[`src/app/api/story/route.ts`](src/app/api/story/route.ts) calls Claude Opus 5
with adaptive thinking and a Zod-typed structured output, so the response comes
back as validated pages rather than prose to be parsed. Requests are streamed
so a long generation cannot hit an HTTP timeout, and server-side fallbacks are
enabled so a declined request routes to another model instead of dead-ending.

The system prompt in [`src/lib/story.ts`](src/lib/story.ts) is the other half of
the quality. It covers the bedtime contract (nothing unresolved, the last two
pages decelerate), read-aloud craft, and writing text that a speech model can
actually speak — no parentheses, no symbols, numbers spelled out.

On mash-ups it evokes the genre rather than reproducing the property: ask for
Star Wars and you get space knights with humming blades and a wise mentor in a
desert, with original names. Same delight, no one else's characters.

### The voice

The voice studio records three passages — warm, playful, then slow and sleepy —
rather than one long read, because varied prosody clones far better than a
minute of flat narration. They go to ElevenLabs Instant Voice Cloning
(`POST /v1/voices/add`) and the returned voice id is stored locally.

Narration is generated per page, not per story, so playback starts in a few
seconds instead of a minute, and stopping after page three does not mean paying
to generate pages four through twelve. Each clip is cached in IndexedDB keyed by
voice, so re-reads are free and work offline. Consecutive pages are stitched
with `previous_text` / `next_text` so the prosody carries across a page turn
instead of restarting flat.

**On consent.** Cloning a voice requires affirming it is your own or that you
have the speaker's explicit permission, and the API route rejects the request
without it — the gate is not only in the UI. ElevenLabs independently runs a
voice-captcha check and may return `requires_verification`, which the app
surfaces rather than hides.

## Layout

```
src/
  app/
    api/config/         which providers are configured (no secrets exposed)
    api/story/          Claude Opus 5, structured output
    api/voice/clone/    ElevenLabs Instant Voice Cloning
    api/voice/speak/    per-page narration, streamed
    api/voice/list/     list and delete cloned voices
  components/
    AgeDial             the 2-7 dial and what it implies
    ElementPicker       characters, worlds, mash-ups, free text
    ThemePicker         five palettes, applied live
    VoiceStudio         recording, consent, cloning
    StoryReader         page-by-page reader with synced narration
  lib/
    age.ts              the age engine
    story.ts            schema, system prompt, prompt builder
    elevenlabs.ts       server-side ElevenLabs wrapper
    storage.ts          IndexedDB persistence
    useNarrator.ts      playback, caching, prefetch, fallback
    themes.ts           theme definitions
```

## Cost

Roughly, per story: a few cents for the text. Narration at the default
multilingual model runs about $0.10 per 1,000 characters, so a 700-word story
is around 40 cents the first time and free on every replay, since audio is
cached locally.

To cut narration cost roughly in half, set
`ELEVENLABS_TTS_MODEL=eleven_turbo_v2_5`.

## Deploying

Works on Vercel as-is. Set `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` as
environment variables. The story route declares `maxDuration = 300`, which needs
a plan that allows long function execution; drop `output_config.effort` to
`"medium"` in the story route if you need it to finish faster.
