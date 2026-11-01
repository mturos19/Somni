/**
 * Per-client rate limiting for the routes that cost money.
 *
 * Three of Somni's routes spend real currency on someone else's platform:
 * `/api/story` runs a reasoning model, `/api/voice/speak` is billed per
 * character, and `/api/voice/clone` creates a resource on the ElevenLabs
 * account. None of them sit behind a login, so without something here a single
 * loop with `curl` is an unbounded bill.
 *
 * What this is honest about: it is a speed bump, not a gate. The counters live
 * in the memory of one serverless instance, so a platform running several
 * instances enforces the limit several times over, a cold start forgets
 * everything, and anything spread across addresses walks straight past it. The
 * real control is a platform firewall rule and a spend cap at each provider.
 * This is what the application itself can do, and it is what stops the ordinary
 * case - one script, one address, hammering one warm instance.
 *
 * It fails open, always. A limiter that breaks bedtime because its own
 * bookkeeping went wrong is worse than no limiter.
 */

/** One window's allowance. */
export type Window = { limit: number; seconds: number };

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Ceiling on tracked clients, so the limiter cannot become the thing that
 * exhausts the instance. Every entry is two numbers and a short string, so this
 * is a few hundred kilobytes at worst.
 */
const MAX_TRACKED = 20_000;

/**
 * Who is asking, as well as this can be known behind a proxy.
 *
 * `x-forwarded-for` is a list that each hop appends to, so the *last* entry is
 * the one written by the proxy nearest to us - the only one a client cannot
 * forge by sending the header itself. `x-real-ip` is a single value set by the
 * platform and is preferred where it exists.
 */
export function clientKey(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",");
    const nearest = hops[hops.length - 1]?.trim();
    if (nearest) return nearest;
  }

  // Locally there is no proxy and no header. Everything shares one bucket,
  // which is correct: it is all the same machine.
  return "local";
}

/** Drops everything expired, and gives up entirely rather than lock anyone out. */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_TRACKED) buckets.clear();
}

export type Verdict = { ok: true } | { ok: false; retryAfter: number };

/**
 * Counts this request against every window, and reports the first one it broke.
 *
 * Several windows per route on purpose: a long one caps the day's spend, and a
 * short one stops a tight loop from spending it all in the first ten seconds.
 */
export function rateLimit(
  request: Request,
  route: string,
  windows: Window[],
): Verdict {
  try {
    const now = Date.now();
    const client = clientKey(request);
    let verdict: Verdict = { ok: true };

    for (const window of windows) {
      const key = `${route}:${window.seconds}:${client}`;
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        if (buckets.size >= MAX_TRACKED) sweep(now);
        buckets.set(key, { count: 1, resetAt: now + window.seconds * 1000 });
        continue;
      }

      if (bucket.count >= window.limit) {
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        // Keep counting the other windows so a client sitting on the limit of a
        // short one still has its hourly total go up.
        if (verdict.ok || retryAfter < verdict.retryAfter) {
          verdict = { ok: false, retryAfter };
        }
        continue;
      }

      bucket.count += 1;
    }

    return verdict;
  } catch (err) {
    console.warn("[ratelimit] failing open", err);
    return { ok: true };
  }
}

/** Minutes, rounded up, for a sentence a parent reads rather than a header. */
function humanWait(seconds: number): string {
  if (seconds <= 90) return "in a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in about ${minutes} minutes`;
  return "in a little while";
}

/**
 * The 429.
 *
 * Shaped like every other error these routes return - `error` and `hint` - so
 * the client's existing handling shows it without knowing this exists.
 */
export function tooManyRequests(retryAfter: number, error: string): Response {
  return new Response(
    JSON.stringify({ error, hint: `Please try again ${humanWait(retryAfter)}.` }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        // Never let a shared cache keep this and serve it to someone else.
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * The allowances themselves, in one place so the cost of the app is readable.
 *
 * Sized for a generous family evening, not for a demo: four or five stories,
 * each re-read and re-narrated a few times, is comfortably inside these.
 */
export const LIMITS = {
  /** A reasoning model with a long thinking budget. The expensive one. */
  story: [
    { limit: 3, seconds: 60 },
    { limit: 12, seconds: 3600 },
  ] satisfies Window[],
  /** Billed per character. A ten-page story is four or five of these. */
  speak: [
    { limit: 12, seconds: 60 },
    { limit: 60, seconds: 3600 },
  ] satisfies Window[],
  /** Creates a voice on the account, and the account has a voice ceiling. */
  clone: [
    { limit: 2, seconds: 60 },
    { limit: 6, seconds: 3600 },
  ] satisfies Window[],
  /** Cheap, but it deletes things. */
  voiceDelete: [{ limit: 20, seconds: 3600 }] satisfies Window[],
};
