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
dead-ending. An output that will not read back as a story is retried once,
automatically - it is a bad roll rather than a broken request, and a parent
should never see the JSON complaint underneath.

`effort` is set to `medium`, which was measured rather than assumed. Against
`high` on identical briefs: 23 s and 1.2k output tokens at age four versus 51 s
and 3.3k; 101 s versus 178 s at age seven. Every run of both stayed inside the
age spec for page count and words per page. `high` spent three to four times the
tokens deliberating and bought nothing measurable while a child sat waiting -
the craft here comes from the system prompt, not the effort dial.

The schema carries nothing that is not displayed, for the same reason. Output
tokens are the whole of the wait, so a field nobody reads is latency charged to
the parent for free.

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

Narration is one control with three settings, in the voice studio:

| | Model | What it is for |
| --- | --- | --- |
| **Steady** | multilingual v2, stability 0.6 | The plainest read. Safest, flattest. |
| **Natural** | multilingual v2, stability 0.4 | Real intonation, still unmistakably the person. The default. |
| **Lively** | Eleven v3, directed with audio tags | Acts the story out. Livelier, and further from the recording. |

They are one dial rather than several settings because model and stability
interact, and separate knobs can be set against each other. Stability is the
lever that matters: high holds the voice steady and flattens it into a monotone,
low lets it move at the risk of wandering.

The point of the dial is that this is not a judgement anyone can make from a
description. **Hear it** in the studio reads a sample line under the current
setting, so comparing all three takes half a minute. An Instant Voice Clone is
two minutes of audio, and how well it survives each mode varies by voice.

Two things follow from v3 when **Lively** is on:

- **v3 takes direction through audio tags.** Every page already carries a mood
  from the story model, and [`src/lib/elevenlabs.ts`](src/lib/elevenlabs.ts)
  turns that into a tag - `[warmly]`, `[playfully]`, `[in awe]`, `[brightly]`,
  `[softly]` - plus a small change of pace. The tags are direction, not speech:
  measured against the API's own alignment, `[in awe]` occupies 0.13 s of
  silence rather than the ~0.6 s it would take to say. Tags come from a closed
  set chosen server-side, never from free text. The v2 modes get neither tags
  nor mood pacing, both of which read as edited rather than read.
- **v3 rejects `previous_text` / `next_text`** with a 400. So on v3 continuity
  across a page turn cannot come from request stitching.

Which is why narration is generated in *segments* of whole pages, planned by
[`src/lib/narration.ts`](src/lib/narration.ts) - the first one short so the
first words arrive quickly, later ones longer since they are fetched while the
previous is still playing. One generation per segment means a sentence's energy
carries over the page break instead of resetting, in every mode. On the v2 modes
the neighbouring pages are also passed as stitching context.

Pace is set twice, on purpose. Generation runs at 0.88 because reading to a
sleepy child is slower than talking, and the reader's **Speed** control changes
`playbackRate` on top of that - instant, free, needing no regeneration, and
pitch-preserved so slower still sounds like the same person.

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

Two details are what make it feel locked to the voice rather than to a timer.
The highlight **arrives instantly and only fades out** - at speech rate most
words last under a fifth of a second, so any cross-fade on the way in smears one
word into the next and the whole line reads as a sweep. And it runs a fixed
80 ms *ahead* of `currentTime`, which is the decode position rather than the
moment sound leaves the speaker; the gap between those two is real, worst on
Bluetooth, and reading along works better when the eye arrives a fraction before
the ear anyway.

It is deliberately not a karaoke bar - a filled block sliding through text is
hard to read in a dark room and reads as a game rather than a book - and
**Follow the words** in the reader turns it off entirely.

With no ElevenLabs key the device voice takes over, and where the browser fires
`onboundary` events it gets the same word-by-word highlighting.

### Saying the name right

A speech model reads an unfamiliar name phonetically and gets it wrong, and a
story that mispronounces the child it was written for is worse than one that
never used their name. So a parent can write how it actually sounds - `Sur sha`
for Saoirse - and that spelling is what reaches the voice while the page still
shows the real one.

The catch is that word timings are matched to the displayed text by position, so
the substitution must not change the word count. `normaliseSaysLike` in
[`src/lib/narration.ts`](src/lib/narration.ts) collapses whitespace to hyphens
for exactly that reason, the match is whole-word so `Amara` never fires inside
`Amaranth`, and possessives survive. If the counts ever did diverge, the page
keeps its start and end and quietly loses only the highlighting.

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
    ThemePicker         four palettes, applied live
    VoiceStudio         recording, consent, cloning
    StoryReader         the reader, lighting each word as it is spoken
                        and remembering where it stopped
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

Roughly, per story: a few cents for the text. Narration runs about $0.10 per
1,000 characters on multilingual v2 and on v3 alike, so a 700-word story is
around 40 cents the first time and free on every replay, since audio is cached
locally. Changing how it reads re-generates a story once, because the cache is
keyed by mode; changing the speed does not, because that happens at playback.

To cut narration cost roughly in half at some real expense to warmth, set
`ELEVENLABS_TTS_MODEL=eleven_flash_v2_5`, which overrides all three modes.
Word timings work the same on every model.

## Deploying

Set up for **Cloudflare Workers** via the OpenNext adapter - see
[DEPLOY.md](DEPLOY.md) for the steps.

```bash
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npm run deploy
```

The free Workers plan is enough — the app shell is static assets, which never
invoke the Worker, and the API routes are almost entirely waiting on Anthropic
and ElevenLabs rather than burning CPU. [DEPLOY.md](DEPLOY.md) has the numbers,
plus why Cloudflare Pages is not the free alternative it looks like.

Nothing in the app is Cloudflare-specific, so it still deploys to Vercel
unchanged.
