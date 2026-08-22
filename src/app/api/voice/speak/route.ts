import {
  BEDTIME_VOICE_SETTINGS,
  ELEVENLABS_BASE,
  TTS_MODEL,
  errorResponse,
  requireKey,
  toFriendlyError,
} from "@/lib/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_CHARS = 5000;

type SpeakBody = {
  voiceId?: string;
  text?: string;
  previousText?: string;
  nextText?: string;
};

/**
 * Narrates one page. Audio is streamed straight through so the first sound
 * arrives while the rest is still being generated.
 *
 * `previous_text` / `next_text` are what stop each page from sounding like an
 * isolated clip - ElevenLabs uses them to carry prosody across the page turn.
 */
export async function POST(request: Request) {
  try {
    const key = requireKey();

    const body = (await request.json()) as SpeakBody;
    const voiceId = body.voiceId?.trim();
    const text = body.text?.trim();

    if (!voiceId) {
      return Response.json({ error: "No voice chosen." }, { status: 400 });
    }
    if (!text) {
      return Response.json({ error: "There is nothing to read." }, { status: 400 });
    }
    if (text.length > MAX_CHARS) {
      return Response.json(
        { error: "That page is too long to narrate in one go." },
        { status: 413 },
      );
    }

    const url = new URL(
      `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
    );
    url.searchParams.set("output_format", "mp3_44100_128");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        voice_settings: BEDTIME_VOICE_SETTINGS,
        apply_text_normalization: "on",
        previous_text: body.previousText?.slice(-600) || undefined,
        next_text: body.nextText?.slice(0, 600) || undefined,
      }),
    });

    if (!res.ok || !res.body) throw await toFriendlyError(res);

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
