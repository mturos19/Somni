# Deploying Somni to Cloudflare

Somni runs on **Cloudflare Workers** through the
[OpenNext](https://opennext.js.org/cloudflare) adapter, which turns a normal
`next build` into a Worker. Nothing in the app is Cloudflare-specific — the same
code still runs under `next dev` and would still deploy to Vercel.

Everything below assumes you are in the project root.

---

## Before you start

**The free Workers plan is enough.** See [Running this for free](#running-this-for-free)
below for why, and for the two things that would push you onto a paid plan.

You need:

- A Cloudflare account
- `ANTHROPIC_API_KEY` — https://console.anthropic.com/settings/keys
- `ELEVENLABS_API_KEY` — https://elevenlabs.io/app/settings/api-keys
  (optional; without it stories are narrated by the device's built-in voice)

---

## 1. Log in

```bash
npx wrangler login
```

This opens a browser and authorises Wrangler against your account.

## 2. Name the Worker

`somni` is the default in [`wrangler.jsonc`](wrangler.jsonc). Worker names are
unique per account, so change `"name"` if you already have one called that. The
name becomes part of the free subdomain you get:
`somni.<your-subdomain>.workers.dev`.

## 3. Upload the API keys as secrets

Secrets are encrypted at rest and never appear in the build output or in
`wrangler.jsonc`. Run each command and paste the key when prompted:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
```

> The first deploy has to exist before secrets can attach to it. If Wrangler
> complains that the Worker is not found, run step 5 first, then come back and
> run these two commands, then deploy once more.

## 4. Try it locally as a real Worker (optional, recommended)

`next dev` runs under Node. This runs the actual Worker build under `workerd`,
which is what catches anything that only breaks in production.

```bash
cp .dev.vars.example .dev.vars   # then fill in the same two keys
npm run preview
```

`.dev.vars` is the Worker equivalent of `.env.local` and is gitignored.

## 5. Deploy

```bash
npm run deploy
```

That builds Next, transforms it into a Worker, and uploads it. When it finishes
Wrangler prints the live URL.

## 6. Put it on your own domain (optional)

If the domain is already on Cloudflare, add a route in the dashboard:

**Workers & Pages → somni → Settings → Domains & Routes → Add → Custom domain**

Cloudflare creates the DNS record and issues the certificate itself.

---

## Redeploying

```bash
npm run deploy
```

Secrets persist across deploys; you only set them once.

---

## Running this for free

Somni fits the **Workers Free** plan: 100,000 Worker requests a day, 10 ms of
CPU per request. Two things make that comfortable rather than tight.

**Most requests never reach the Worker.** The app shell, fonts, CSS and JS are
static assets, and Cloudflare states that "requests to static assets are free
and unlimited" — they do not invoke the Worker or count against the request
limit. Only `/api/*` calls do, which is a handful per story.

**The API routes are almost entirely waiting, and waiting is not CPU.** Writing
a story is minutes of Anthropic doing the work; narration is seconds of
ElevenLabs doing it. Measured on a real three-page segment, the heaviest route
spends about **1 ms** of actual CPU assembling its response. The 10 ms ceiling
also has give: Cloudflare terminates a Worker that hits it *consistently*, not
one that occasionally runs over.

Two things would move you to Workers Paid ($5/month):

- **Sharing it widely.** 100,000 requests a day is generous for a family and
  irrelevant for a hobby project, but it is a real ceiling.
- **A cold start that will not fit.** Workers cap Worker *startup* at 400 ms,
  and a Next.js bundle is not small. If a deploy is rejected for startup time,
  that is the message you will see, and it applies on both plans equally.

If you do upgrade later, the one setting worth adding back is the CPU ceiling —
`wrangler.jsonc` has it commented with the value.

### What about Cloudflare Pages?

Pages will not help. Pages Functions run on the same runtime with the same 10 ms
CPU limit on the free plan, so there is nothing to gain, and Cloudflare is
folding Pages' features into Workers rather than the other way round — Workers
with static assets is now the recommended path for a full-stack app like this
one. Existing Pages projects stay supported, but this is not one.

`@cloudflare/next-on-pages`, the old Next.js-on-Pages adapter, is superseded by
`@opennextjs/cloudflare`, which is what this project uses.

### If you would rather not use Cloudflare at all

Somni is plain Next.js, so **Vercel's Hobby plan** is free too and needs no
adapter — push the repo, set the two environment variables, done. It suits the
story route slightly better: Hobby allows the full 300 s function duration this
app declares, and bills no per-request CPU limit at all. Two caveats: Hobby is
licensed for non-commercial use only, and Vercel caps request bodies at 4.5 MB,
which the voice-cloning upload could exceed if you record several long passages.

---

## Configuration reference

| Name | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | secret | Writes the stories. Required. |
| `ELEVENLABS_API_KEY` | secret | Voice cloning and narration. Optional. |
| `ELEVENLABS_TTS_MODEL` | plain var | Pin one voice model, ignoring the app's expressive setting. |
| `ELEVENLABS_BASE_URL` | plain var | Regional endpoint, for EU/India/Singapore data residency. |

Plain (non-secret) variables go in `wrangler.jsonc` under a `vars` block:

```jsonc
"vars": {
  "ELEVENLABS_TTS_MODEL": "eleven_multilingual_v2"
}
```

---

## Things worth knowing

**Nothing is stored server-side.** Profiles, stories and narrated audio live in
each visitor's own IndexedDB. There is no database to provision, which is why
this deploy has no bindings beyond static assets. It also means the app is
per-browser: the same person on a phone and a laptop has two separate shelves.

**The Worker is public.** Anyone who finds the URL can spend your Anthropic and
ElevenLabs credit. If it is going anywhere beyond your own devices, put
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
in front of it — it sits at the edge and needs no application code.

**Story generation streams.** The route answers with a `text/event-stream`
immediately and keeps sending progress while Opus works, so the response never
looks stalled to anything in between. Workers place no wall-clock limit on a
request while the client stays connected.

**If you later add a server-rendered, revalidating route,** configure an
incremental cache in [`open-next.config.ts`](open-next.config.ts) and create the
R2 bucket it points at. Nothing in Somni needs one today. Adding any Cloudflare
binding (R2, KV, D1) is also the point at which you want
`initOpenNextCloudflareForDev()` in `next.config.ts`, so `next dev` can see the
bindings too.

**Bundle size.** Workers cap the compressed Worker at 3 MiB on the free plan and
10 MiB on paid. Somni is currently around 1.1 MiB, so there is room on either.

**Narration is sent as bytes, not JSON.** `/api/voice/speak` answers with a
length-prefixed header followed by the raw mp3, rather than base64 inside JSON.
That is a third less data over the wire, no base64 decoding on the phone, and
about half the server CPU — which is part of what keeps this inside the free
plan's budget.

---

## Troubleshooting

**`limits.cpu_ms is not supported on your plan`** — you have uncommented the
`limits` block in `wrangler.jsonc` while on the free plan. Comment it out again;
the defaults are fine.

**`Worker exceeded CPU time limit` in the logs** — if this is occasional,
Cloudflare tolerates it. If it is every request, upgrade to Workers Paid and
uncomment the `limits` block.

**Stories fail with a 503 saying the story writer is not connected** — the
`ANTHROPIC_API_KEY` secret is missing on the deployed Worker. `.env.local` is a
local-only file and is never uploaded. Run step 3.

**Voice cloning returns 403** — Instant Voice Cloning needs at least the
ElevenLabs Starter plan. The app reports this rather than failing silently.

**Logs** — `observability` is enabled in `wrangler.jsonc`, so requests and
`console.error` output are visible under **Workers & Pages → somni → Logs**.
For a live tail: `npx wrangler tail`.
