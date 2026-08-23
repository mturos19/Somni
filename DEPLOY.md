# Deploying Somni to Cloudflare

Somni runs on **Cloudflare Workers** through the
[OpenNext](https://opennext.js.org/cloudflare) adapter, which turns a normal
`next build` into a Worker. Nothing in the app is Cloudflare-specific — the same
code still runs under `next dev` and would still deploy to Vercel.

Everything below assumes you are in the project root.

---

## Before you start

**You need the Workers Paid plan ($5/month).** This is not optional for Somni.
The free plan allows 10 ms of CPU per request, which is not enough to render a
Next.js response, and `wrangler.jsonc` raises the CPU ceiling to 60 s — a
setting the free plan rejects. Writing a story and generating narration are
mostly *waiting* on Anthropic and ElevenLabs, and waiting is not billed as CPU,
so the actual cost stays near the $5 minimum.

You also need:

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

## Configuration reference

| Name | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | secret | Writes the stories. Required. |
| `ELEVENLABS_API_KEY` | secret | Voice cloning and narration. Optional. |
| `ELEVENLABS_TTS_MODEL` | plain var | Override the voice model. Defaults to `eleven_v3`. |
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

**Bundle size.** Workers cap the compressed Worker at 10 MiB on the paid plan.
Somni is currently around 1.1 MiB, so there is a lot of room.

---

## Troubleshooting

**`limits.cpu_ms is not supported on your plan`** — you are on the free plan.
Upgrade to Workers Paid, or delete the `limits` block and accept that rendering
will fail on anything but a trivial request.

**Stories fail with a 503 saying the story writer is not connected** — the
`ANTHROPIC_API_KEY` secret is missing on the deployed Worker. `.env.local` is a
local-only file and is never uploaded. Run step 3.

**Voice cloning returns 403** — Instant Voice Cloning needs at least the
ElevenLabs Starter plan. The app reports this rather than failing silently.

**Logs** — `observability` is enabled in `wrangler.jsonc`, so requests and
`console.error` output are visible under **Workers & Pages → somni → Logs**.
For a live tail: `npx wrangler tail`.
