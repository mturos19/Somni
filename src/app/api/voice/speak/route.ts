import {
  elevenLabsBase,
  ttsModel,
  errorResponse,
  maxCharsFor,
  requireKey,
  supportsStitching,
  tagFor,
  timingsFromAlignment,
  toFriendlyError,
  voiceSettingsFor,
  type Alignment,
  type SpokenPiece,
} from "@/lib/elevenlabs";
import {
  NARRATION_PREFIX_BYTES,
  proportionalTimings,
  type SpeakHeader,
  type SpeakRequest,
} from "@/lib/narration";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Rough read-aloud rate, only ever used when alignment is missing. */
const CHARS_PER_SECOND = 12.5;

const MOODS = new Set(["calm", "playful", "wonder", "brave", "sleepy"]);

/** Header length, then the header, then the audio. See SpeakHeader. */
function frame(header: SpeakHeader, audio: Uint8Array): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(header));
  const buffer = new ArrayBuffer(
    NARRATION_PREFIX_BYTES + encoded.length + audio.length,
  );

  new DataView(buffer).setUint32(0, encoded.length, false);
  const bytes = new Uint8Array(buffer);
  bytes.set(encoded, NARRATION_PREFIX_BYTES);
  bytes.set(audio, NARRATION_PREFIX_BYTES + encoded.length);

  return buffer;
}

/**
 * Narrates one segment - a run of whole pages - and returns the audio together
 * with the time every word is spoken.
 *
 * Several pages go out in a single generation on purpose. It is what lets the
 * voice carry a sentence's energy over a page turn, and on Eleven v3 it is the
 * only way to get continuity at all, since that model rejects the request
 * stitching the v2 models accept.
 */
export async function POST(request: Request) {
  try {
    const key = requireKey();

    const body = (await request.json()) as Partial<SpeakRequest>;
    const model = ttsModel(body.mode === "expressive" ? "expressive" : "faithful");
    const voiceId = body.voiceId?.trim();
    const pages = Array.isArray(body.pages) ? body.pages : [];

    if (!voiceId) {
      return Response.json({ error: "No voice chosen." }, { status: 400 });
    }
    if (pages.length === 0) {
      return Response.json({ error: "There is nothing to read." }, { status: 400 });
    }

    // Assemble the text and remember where each page's own words begin, so the
    // mood tags can be dropped from the timings without guessing.
    const pieces: SpokenPiece[] = [];
    const moods: string[] = [];
    let speech = "";

    for (const page of pages) {
      const text = typeof page?.text === "string" ? page.text.trim() : "";
      if (!text) continue;

      const mood = MOODS.has(page.mood) ? page.mood : "calm";
      moods.push(mood);

      if (speech) speech += "\n\n";
      const tag = tagFor(mood, model);
      if (tag) speech += `${tag} `;

      pieces.push({ page: page.page, text, offset: speech.length });
      speech += text;
    }

    if (pieces.length === 0) {
      return Response.json({ error: "There is nothing to read." }, { status: 400 });
    }
    if (speech.length > maxCharsFor(model)) {
      return Response.json(
        { error: "That much story is too long to narrate in one go." },
        { status: 413 },
      );
    }

    const url = new URL(
      `${elevenLabsBase()}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    );
    url.searchParams.set("output_format", "mp3_44100_128");

    const payload: Record<string, unknown> = {
      text: speech,
      model_id: model,
      voice_settings: voiceSettingsFor(moods, model),
      apply_text_normalization: "on",
    };

    // Carrying the neighbouring pages softens the seam between segments. Only
    // the v2 models accept it; v3 answers 400 unsupported_model.
    if (supportsStitching(model)) {
      payload.previous_text = body.previousText?.slice(-600) || undefined;
      payload.next_text = body.nextText?.slice(0, 600) || undefined;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw await toFriendlyError(res);

    const data = (await res.json()) as {
      audio_base64?: string;
      alignment?: Alignment | null;
    };

    if (!data.audio_base64) {
      return Response.json({ error: "The narration came back empty." }, { status: 502 });
    }

    const aligned = timingsFromAlignment(speech, pieces, data.alignment);
    const estimated = speech.length / CHARS_PER_SECOND;

    const header: SpeakHeader = aligned
      ? { duration: aligned.duration, precise: true, pages: aligned.pages }
      : {
          duration: estimated,
          precise: false,
          pages: proportionalTimings(pieces, estimated),
        };

    return new Response(frame(header, Buffer.from(data.audio_base64, "base64")), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
