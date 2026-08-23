import {
  elevenLabsBase,
  errorResponse,
  requireKey,
  toFriendlyError,
} from "@/lib/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SAMPLE_BYTES = 12 * 1024 * 1024; // per file
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

/**
 * Creates an Instant Voice Clone from recordings the parent made in the browser.
 *
 * The consent gate lives in the UI, but we re-check the affirmation here so the
 * endpoint cannot be driven without it.
 */
export async function POST(request: Request) {
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
        { error: "Those recordings are too large altogether." },
        { status: 413 },
      );
    }

    const outgoing = new FormData();
    outgoing.append("name", name);
    outgoing.append(
      "description",
      "A parent's voice, recorded for reading bedtime stories.",
    );
    // Background isolation helps more than it hurts on phone/laptop mics.
    outgoing.append("remove_background_noise", "true");
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

    return Response.json({
      voiceId: data.voice_id,
      name,
      requiresVerification: Boolean(data.requires_verification),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
