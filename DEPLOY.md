# Deploying Somni to Vercel

Somni is a stock Next.js 16 app. There is no adapter and no platform SDK —
`src/` imports nothing from any host. It runs under `next dev` locally and
deploys to Vercel as-is.

Everything below assumes you are in the project root.

---

## Before you start

**The free Hobby plan is enough to run it.** See
[What this costs](#what-this-costs) for the one thing that would push you to
Pro.

You need:

- A Vercel account
- `ANTHROPIC_API_KEY` — https://console.anthropic.com/settings/keys
- `ELEVENLABS_API_KEY` — https://elevenlabs.io/app/settings/api-keys
  (optional; without it stories are narrated by the device's built-in voice)

---

## 1. Push the repo

Vercel deploys from Git. Push this repository to GitHub, GitLab or Bitbucket if
it is not there already.

## 2. Import the project

Go to [vercel.com/new](https://vercel.com/new) and import the repository.
Vercel detects Next.js and fills in the build settings itself — there is nothing
to change.

Do not deploy yet. Add the environment variables first, or the first build will
ship without the keys.

## 3. Add the environment variables

In the import screen (or later under **Settings → Environment Variables**):

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `ELEVENLABS_API_KEY` | your ElevenLabs key, if you have one |
| `SOMNI_SIGNING_SECRET` | any long random string — `openssl rand -base64 32` |

That is the whole list. `SOMNI_SIGNING_SECRET` signs the cookie that records
which cloned voices a browser made, so one visitor cannot delete another
family's voice.

> **You do not need to set a site URL.** Vercel always provides
> `VERCEL_PROJECT_PRODUCTION_URL`, and the app uses it as the base for the
> share card. Set `NEXT_PUBLIC_SITE_URL` only if you are serving from a domain
> that is not the project's production domain, or hosting somewhere else.

Leave all three applied to Production, Preview and Development.

## 4. Deploy

Press Deploy. Vercel prints the live URL when it finishes — something like
`somni-xxxx.vercel.app`.

Every push to the default branch redeploys from here on.

## 5. Put it on your own domain (optional)

**Settings → Domains → Add.** Vercel issues the certificate itself.

Do this **before** anyone installs the app. An installed PWA is tied to its
origin: moving domains later means every family's installs, saved stories,
cached narration and voice-ownership cookies start from scratch. Adding the
custom domain also updates `VERCEL_PROJECT_PRODUCTION_URL`, so the share card
follows automatically on the next deploy.

---

## Running it locally

```bash
cp .env.example .env.local   # then fill in the keys
npm run dev
```

To test the installable-app behaviour, build and serve it properly — the
service worker is only registered in production builds:

```bash
npm run build && npm start
```

`localhost` counts as a secure context, so the install prompt behaves exactly as
it will in production.

---

## What this costs

**The Hobby plan covers it.** Two things make that comfortable rather than
tight.

**Most requests never run a function.** The app shell, fonts, CSS, JS and icons
are static files served from the CDN. Only `/api/*` invokes a function, which is
a handful of calls per story.

**Waiting is not billed as compute.** Vercel bills active CPU time, and
explicitly excludes time spent waiting on I/O — which is almost the whole of a
story request, since Anthropic is doing the work. Measured on a real three-page
narration segment, the heaviest route spends about **1 ms** of actual CPU
assembling its response.

**Function duration fits.** Writing a story with Opus takes two to three
minutes. Hobby allows **300 seconds**, which is both its default and its
maximum, and `src/app/api/story/route.ts` sets `maxDuration = 300` to use all of
it. Pro raises the ceiling to 800s if you ever need it.

The one thing that would move you to Pro: **Hobby is for non-commercial use.**
If Somni ever charges anyone, that is the line.

---

## Configuration reference

| Name | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Writes the stories. Required. |
| `ELEVENLABS_API_KEY` | Voice cloning and narration. Optional. |
| `SOMNI_SIGNING_SECRET` | Signs the voice-ownership cookie. Falls back to the ElevenLabs key if unset. |
| `NEXT_PUBLIC_SITE_URL` | Overrides the share-card base URL. Not needed on Vercel. |
| `ELEVENLABS_TTS_MODEL` | Pin one voice model, overriding the app's Steady/Natural/Lively control. |
| `ELEVENLABS_BASE_URL` | Regional endpoint, for EU/India/Singapore data residency. |

---

## Things worth knowing

**Nothing is stored server-side — with one exception.** Profiles, stories and
narrated audio live in each visitor's own IndexedDB. There is no database to
provision. It also means the app is per-browser: the same person on a phone and
a laptop has two separate shelves.

The exception is **cloned voices**, which live on your ElevenLabs account. Every
visitor's clone lands on that one account, so a voice is only as private as that
account is — worth knowing before the link goes anywhere public. Deleting a
voice in the app deletes it at ElevenLabs too.

**Request and response bodies are capped at 4.5 MB.** This shapes two routes:
voice recordings are limited to 4 MB in total on upload, and a narration segment
is checked against the ceiling before it is returned. Both answer with a plain
sentence rather than a platform error if they ever hit it.

---

## After the first deploy: check the install prompt

The app is a PWA, so phones offer to install it. Confirm it is working:

```bash
curl -i https://<your-domain>/manifest.webmanifest   # 200, application/manifest+json
curl -i https://<your-domain>/sw.js                  # 200, and no long-lived cache
```

Then open the site on a phone, or in Chrome DevTools:

- **DevTools → Application → Manifest** lists installability problems
  explicitly. It should list none.
- **Application → Service Workers** should show `sw.js` as *activated and
  running*.
- Android Chrome shows Somni's own install card a few seconds after the first
  visit. iOS has no install API at all, so Safari gets a short instruction to
  use Share → Add to Home Screen instead.

Two things that will waste an hour if you do not know them:

- **A LAN address will not work.** `http://192.168.x.x:3000` is not a secure
  context, so there is no manifest, no service worker and no prompt. Use
  `npm run build && npm start`, or test on the deployed URL.
- **It will not prompt twice.** Once Somni is installed on a device, the prompt
  is gone. Uninstall it, or use a fresh browser profile, before testing again.

---

## Before sharing the link widely

The API routes spend real money and are open to anyone who finds them. Nothing
in the app limits that, so put the limits around it:

1. **Spend caps at the providers.** Set a monthly budget in the Anthropic
   console and a credit limit in ElevenLabs. This is the backstop that cannot be
   argued with, and it takes five minutes.
2. **A rate limit on `/api/*`.** Vercel's [Firewall](https://vercel.com/docs/vercel-firewall)
   includes rate-limiting rules; a per-IP limit on `/api/*` is the one control
   that stops a script before it reaches a function.
3. **Watch the first few days.** Deployment → Logs shows requests live, and
   Settings → Usage shows what they cost.

For a private trial with family and friends,
[Deployment Protection](https://vercel.com/docs/deployment-protection) in front
of the project is simpler and stricter than any of the above.
