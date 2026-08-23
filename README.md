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
back as validated pages rather than prose to be parsed. Server-side fallbacks
are enabled, so a declined request routes to another model instead of
dead-ending.

The route answers with an event stream rather than one late JSON blob. A good
story is a couple of minutes of real thinking, and a still screen for two
minutes reads as broken, so the browser is told when the model stops planning
and starts writing, and gets a character count it can turn into an honest
progress bar. Keeping bytes moving also means nothing in between decides the
request has stalled.

The system prompt in [`src/lib/story.ts`](src/lib/story.ts) is the other half of
the quality. It covers the bedtime contract (nothing unresolved, the last two
pages decelerate), read-aloud craft, and writing text that a speech model can
actually speak — no parentheses, no symbols, numbers spelled out.

On mash-ups it evokes the genre rather than reproducing the property: ask for
Star Wars and you get space knights with humming blades and a wise mentor in a
desert, with original names. Same delight, no one else's characters.

### The voice

The voice studio records three passages - warm, playful, then slow and sleepy -
rather than one long read. This is the single biggest lever on how alive the
finished narration sounds, because a clone copies *performance*, not just
timbre: read the three flatly and every story afterwards comes back flat, no
matter what the model is asked to do with it. The on-screen directions say so,
and a **Hear it** button plays a sample line back through the real narration
route so a flat take is caught there rather than at bedtime.

The recordings go to ElevenLabs Instant Voice Cloning (`POST /v1/voices/add`)
and the returned voice id is stored locally.

Narration then uses **Eleven v3**, the expressive model, and two things follow
from that choice:

- **v3 takes direction through audio tags.** Every page already carries a mood
  from the story model, and [`src/lib/elevenlabs.ts`](src/lib/elevenlabs.ts)
  turns that into a tag - `[warmly]`, `[playfully]`, `[in awe]`, `[brightly]`,
  `[softly]` - plus a small change of pace. The tags are direction, not speech:
  measured against the API's own alignment, `[in awe]` occupies 0.13 s of
  silence rather than the ~0.6 s it would take to say. Tags come from a closed
  set chosen server-side, never from free text.
- **v3 rejects `previous_text` / `next_text`** with a 400. So continuity across
  a page turn cannot come from request stitching, and comes instead from
  narrating several pages in one generation.

That second point shapes the whole playback model. Stories are cut into
*segments* of whole pages by [`src/lib/narration.ts`](src/lib/narration.ts) -
the first one short so the first words arrive quickly, later ones longer since
they are fetched while the previous one is still playing, all of them well above
the ~250 characters below which v3 starts to drift. One generation per segment
means a sentence's energy carries over the page break instead of resetting.

### Following the words

Narration is requested from `/v1/text-to-speech/{voice}/with-timestamps`, which
returns character-level alignment alongside the audio.
[`src/app/api/voice/speak/route.ts`](src/app/api/voice/speak/route.ts) folds
that into per-word start and end times, expressed as character offsets into each
page's own text - which is also how the mood tags get dropped from the timings
without any string matching.

The reader then follows the audio's own clock on an animation frame: the word
being spoken lifts and warms, words already read stay legible, words still to
come sit back, and the page turns itself at the moment the voice reaches it.
Words are maximal runs of non-whitespace, tokenised by the same function on both
sides of the wire, so punctuation never gets orphaned.

It is deliberately not a karaoke bar. A filled block sliding through the text is
hard to read in a dark room and reads as a game rather than a book.

With no ElevenLabs key the device voice takes over, and where the browser fires
`onboundary` events it gets the same word-by-word highlighting.

Each segment - audio and timings together - is cached in IndexedDB keyed by
voice, so re-reads are free and work offline.

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
    api/voice/speak/    per-segment narration plus word timings
    api/voice/list/     list and delete cloned voices
  components/
    AgeDial             the 2-7 dial and what it implies
    ElementPicker       characters, worlds, mash-ups, free text
    ThemePicker         five palettes, applied live
    VoiceStudio         recording, consent, cloning
    StoryReader         the reader, lighting each word as it is spoken
  lib/
    age.ts              the age engine
    story.ts            schema, system prompt, prompt builder
    storyStream.ts      client side of the story event stream
    narration.ts        segments, word tokens, timings - shared by both sides
    elevenlabs.ts       server-side ElevenLabs wrapper, tags, voice settings
    audio.ts            base64 to Blob
    storage.ts          IndexedDB persistence
    useNarrator.ts      playback, word tracking, caching, prefetch, fallback
    themes.ts           theme definitions
```

## Cost

Roughly, per story: a few cents for the text. Narration on Eleven v3 runs about
$0.10 per 1,000 characters - the same rate as multilingual v2 - so a 700-word
story is around 40 cents the first time and free on every replay, since audio is
cached locally.

To cut narration cost roughly in half at some real expense to warmth, set
`ELEVENLABS_TTS_MODEL=eleven_flash_v2_5`. The app adapts: it drops the audio
tags that model would read out loud, and re-enables the `previous_text` /
`next_text` stitching that v3 refuses. Word timings work the same on every
model.

## Deploying

Set up for **Cloudflare Workers** via the OpenNext adapter - see
[DEPLOY.md](DEPLOY.md) for the steps.

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npm run deploy
```

Needs the Workers Paid plan: the free plan's 10 ms CPU ceiling is not enough to
render a Next.js response. Nothing in the app is Cloudflare-specific, so it
still deploys to Vercel unchanged.
