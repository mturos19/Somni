import {
  elevenLabsBase,
  errorResponse,
  requireKey,
  toFriendlyError,
} from "@/lib/elevenlabs";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { grantVoice } from "@/lib/voiceOwnership";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Sized to fit under the host's request body limit, not to ElevenLabs'.
 *
 * Vercel refuses a request body over 4.5 MB with its own 413 before this route
 * is ever invoked, so limits above that are unenforceable here: the parent
 * would see an opaque platform error instead of the explanation below. Three
 * passages of ninety seconds come to well under a megabyte in Opus and about
 * one and a half in the AAC that Safari records, so this is generous in
 * practice while still landing inside the ceiling.
 */
const MAX_SAMPLE_BYTES = 2 * 1024 * 1024; // per file
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/**
 * Above this, the quiet between sentences is audible enough to be worth
 * removing. Below it, isolating would cost more in dynamics than it recovers.
 * Measured on the same 0-1 scale the recording meter uses.
 */
const NOISE_FLOOR_LIMIT = 0.02;

/**
 * Creates an Instant Voice Clone from recordings the parent made in the browser.
 *
 * The consent gate lives in the UI, but we re-check the affirmation here so the
 * endpoint cannot be driven without it.
 */
export async function POST(request: Request) {
  // Before the multipart body is parsed: these requests carry megabytes, and
  // each one that succeeds leaves a voice on an account with a voice ceiling.
  const quota = rateLimit(request, "clone", LIMITS.clone);
  if (!quota.ok) {
    return tooManyRequests(quota.retryAfter, "That is a lot of voices at once.");
  }

  try {
    const key = requireKey();

    const incoming = await request.formData();
    const name = String(incoming.get("name") ?? "").trim();
    const consent = String(incoming.get("consent") ?? "");
    const samples = incoming.getAll("samples").filter((s): s is File => s instanceof File);

    if (!name) {
      return Response.json({ error: "Give the voice a name first." }, { status: 400 });
    }
    if (consent !== "own-voice-confirmed") {
      return Response.json(
        {
          error: "Consent is required before a voice can be cloned.",
          hint: "Confirm that the recording is your own voice, or that you have the speaker's permission.",
        },
        { status: 403 },
      );
    }
    if (samples.length === 0) {
      return Response.json(
        { error: "No recordings arrived.", hint: "Record at least one passage." },
        { status: 400 },
      );
    }

    let total = 0;
    for (const s of samples) {
      if (s.size > MAX_SAMPLE_BYTES) {
        return Response.json(
          { error: "One of those recordings is too large.", hint: "Keep each passage under about two minutes." },
          { status: 413 },
        );
      }
      total += s.size;
    }
    if (total > MAX_TOTAL_BYTES) {
      return Response.json(
        {
          error: "Those recordings are too large altogether.",
          hint: "Re-record the longest passage a little shorter, then try again.",
        },
        { status: 413 },
      );
    }

    /**
     * The isolation model is applied only when the room warranted it.
     *
     * ElevenLabs are explicit that on a clean sample it makes the result worse,
     * and it is not free either way - it is another pass of processing over the
     * dynamics a clone learns delivery from. The browser measures the quietest
     * moment of each take, which is the room rather than the speaker, and sends
     * it here. A hush stays untouched; a kitchen gets cleaned up.
     */
    const noiseFloor = Number(incoming.get("noiseFloor") ?? "0");
    const noisy = Number.isFinite(noiseFloor) && noiseFloor > NOISE_FLOOR_LIMIT;

    const outgoing = new FormData();
    outgoing.append("name", name);
    outgoing.append(
      "description",
      "A parent's voice, recorded for reading bedtime stories.",
    );
    // Appended only when wanted. A multipart "false" is a string, and whether
    // an upstream parser reads that as false or merely as present is not worth
    // betting the clone on - the API's own default is off.
    if (noisy) outgoing.append("remove_background_noise", "true");
    for (const sample of samples) {
      outgoing.append("files", sample, sample.name || "sample.webm");
    }

    const res = await fetch(`${elevenLabsBase()}/v1/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: outgoing,
    });

    if (!res.ok) throw await toFriendlyError(res);

    const data = (await res.json()) as {
      voice_id: string;
      requires_verification?: boolean;
    };

    /**
     * Record the voice as this browser's. It is the only thing that later
     * distinguishes the parent who made it from a stranger who learned its id,
     * and it is what the delete route checks.
     */
    const headers = new Headers({ "Content-Type": "application/json" });
    const cookie = await grantVoice(request, data.voice_id);
    if (cookie) headers.append("Set-Cookie", cookie);

    return new Response(
      JSON.stringify({
        voiceId: data.voice_id,
        name,
        requiresVerification: Boolean(data.requires_verification),
        isolated: noisy,
      }),
      { headers },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
