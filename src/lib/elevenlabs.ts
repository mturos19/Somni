/**
 * Thin server-side wrapper around the ElevenLabs REST API. The API key never
 * leaves the server; the browser only ever talks to our own /api/voice/* routes.
 */

import { tokenize, type PageTiming, type WordTiming } from "./narration";

/**
 * Read on demand rather than at module scope: on Cloudflare Workers the
 * environment is attached to the isolate, and a constant captured while the
 * module first evaluates can miss it.
 */
export function elevenLabsBase(): string {
  return (
    process.env.ELEVENLABS_BASE_URL?.replace(/\/$/, "") ?? "https://api.elevenlabs.io"
  );
}

/**
 * Three ways to read a story, in one dial rather than several.
 *
 * The two things that decide whether a cloned parent sounds like a person are
 * the model and how much freedom it is given, and they interact - so they are a
 * single choice here instead of separate settings that can be set against each
 * other.
 *
 * - `steady`   eleven_multilingual_v2, held tight. The safest, plainest read.
 * - `natural`  the same model with room to move. Real intonation without
 *              drifting away from the recording. The default.
 * - `lively`   eleven_v3, directed page by page with audio tags. Much more
 *              alive, and noticeably further from the source recording - some
 *              clones carry that beautifully and some come back processed.
 *
 * Which is why this is a control in the app rather than a decision made here.
 * ELEVENLABS_TTS_MODEL still overrides the model for all three.
 */
export type VoiceMode = "steady" | "natural" | "lively";

export const VOICE_MODES: VoiceMode[] = ["steady", "natural", "lively"];

export function isVoiceMode(value: unknown): value is VoiceMode {
  return typeof value === "string" && (VOICE_MODES as string[]).includes(value);
}

export function ttsModel(mode: VoiceMode): string {
  const override = process.env.ELEVENLABS_TTS_MODEL;
  if (override) return override;
  return mode === "lively" ? "eleven_v3" : "eleven_multilingual_v2";
}

export const isV3 = (model: string) => model.startsWith("eleven_v3");

/** v3 is directed with tags; v2 models would simply read them out loud. */
export const supportsAudioTags = isV3;

/** Verified against the API: v3 returns 400 `unsupported_model` for stitching. */
export const supportsStitching = (model: string) => !isV3(model);

/** v3 caps at 5,000 characters per request; the v2 models allow 10,000. */
export const maxCharsFor = (model: string) => (isV3(model) ? 5000 : 10000);

/**
 * One tag per page, chosen from the page's mood. Deliberately a closed set
 * derived server-side rather than free text from the model: a tag is an
 * instruction to a voice, and this is a voice a child recognises.
 */
const MOOD_TAGS: Record<string, string> = {
  calm: "[warmly]",
  playful: "[playfully]",
  wonder: "[in awe]",
  brave: "[brightly]",
  sleepy: "[softly]",
};

export function tagFor(mood: string, model: string): string {
  if (!supportsAudioTags(model)) return "";
  return MOOD_TAGS[mood] ?? MOOD_TAGS.calm;
}

/** Pace, by mood. Only applied in expressive mode. */
const MOOD_SPEED: Record<string, number> = {
  calm: 0.9,
  playful: 0.95,
  wonder: 0.9,
  brave: 0.95,
  sleepy: 0.85,
};

/**
 * Settings for one generation.
 *
 * Stability is the lever that decides whether a clone sounds like a person or a
 * public address system. High values hold the voice steady and flatten it into
 * a monotone; low values let it move, at the risk of wandering. The three modes
 * are really three points on that line.
 *
 * Speed is baked in below conversational pace because reading to a sleepy child
 * is slower than talking. The reader can slow it further at playback time, which
 * costs nothing and needs no regeneration.
 */
export function voiceSettingsFor(mode: VoiceMode, moods: string[], model: string) {
  if (!isV3(model)) {
    const steady = mode === "steady";
    return {
      /**
       * Expressiveness and coherence are the same dial, and it is short.
       *
       * Lower stability means more intonation; it also means, in ElevenLabs'
       * own words, that the voice "can sound erratic" - which at the bottom of
       * the range is heard as invented syllables and words that are not on the
       * page. Their published presets bracket it: narration 0.7, conversational
       * 0.4, character voices 0.3. This app sat at 0.3 with style 0.35 - the
       * character-voice corner - and produced exactly the gibberish that corner
       * is known for.
       *
       * So 0.4 for Natural: as much movement as an instant clone reliably
       * sustains. Real warmth beyond this comes from a better clone - more
       * audio, cleanly captured - not from a smaller number here. Anything that
       * still slips through is caught by the overrun check in useNarrator, or
       * by Read that again in the reader.
       */
      stability: steady ? 0.65 : 0.4,
      similarity_boost: 0.75,
      // Style is documented to reduce stability, and it was the other half of
      // the gibberish. A little on Natural, none on Steady.
      style: steady ? 0 : 0.1,
      speed: 0.88,
      use_speaker_boost: true,
    };
  }

  const speeds = moods.map((mood) => MOOD_SPEED[mood] ?? 0.9);
  const speed = speeds.length
    ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length
    : 0.9;

  return {
    // v3's "Natural" - the setting that stays closest to the source recording.
    stability: 0.5,
    similarity_boost: 0.8,
    // Expression comes from the tags on v3; exaggeration on top of a
    // two-minute clone mostly buys artefacts.
    style: 0,
    speed: Math.round(speed * 100) / 100,
    use_speaker_boost: true,
  };
}

export type VoiceSummary = {
  voiceId: string;
  name: string;
  requiresVerification: boolean;
  isCloned: boolean;
  previewUrl: string | null;
};

export class ElevenLabsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

export function requireKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new ElevenLabsError(
      503,
      "Voice cloning is not connected yet.",
      "Add ELEVENLABS_API_KEY to .env.local and restart the dev server.",
    );
  }
  return key;
}

/** Maps an upstream failure onto something a parent can act on. */
export async function toFriendlyError(res: Response): Promise<ElevenLabsError> {
  let detail = "";
  try {
    const body = await res.json();
    detail =
      body?.detail?.message ??
      (typeof body?.detail === "string" ? body.detail : "") ??
      "";
  } catch {
    /* upstream did not return JSON */
  }

  switch (res.status) {
    case 401:
      return new ElevenLabsError(
        401,
        "That ElevenLabs API key was rejected.",
        "Check ELEVENLABS_API_KEY in .env.local.",
      );
    case 403:
      return new ElevenLabsError(
        403,
        "Your ElevenLabs plan does not allow this yet.",
        detail || "Instant Voice Cloning needs at least the Starter plan.",
      );
    case 422:
      return new ElevenLabsError(
        422,
        "ElevenLabs could not use those recordings.",
        detail || "Try recording again somewhere quieter.",
      );
    case 429:
      return new ElevenLabsError(
        429,
        "ElevenLabs is rate limiting us.",
        "Wait a moment and try again.",
      );
    default:
      return new ElevenLabsError(
        502,
        "ElevenLabs had a problem.",
        detail || `Upstream returned ${res.status}.`,
      );
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ElevenLabsError) {
    return Response.json(
      { error: err.message, hint: err.hint },
      { status: err.status },
    );
  }
  console.error("[voice] unexpected", err);
  return Response.json(
    { error: "Something went wrong with the voice service." },
    { status: 500 },
  );
}

/* -------------------------------- alignment -------------------------------- */

export type Alignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

export type SpokenPiece = {
  page: number;
  /** What the page shows. Word timings are reported against this. */
  display: string;
  /** What the voice is given - the same words, the name possibly respelled. */
  spoken: string;
  /** Where `spoken` begins in the assembled speech. */
  offset: number;
};

/**
 * Turns the API's per-character alignment into per-word timings, relative to
 * each page's own displayed text.
 *
 * The alignment covers everything we sent, mood tags included, which is exactly
 * why each piece carries the offset of its spoken text: slicing at that offset
 * drops the tags from the timings without any string matching.
 *
 * Display and spoken text can differ by a respelled name, so timings are
 * matched by word position rather than by character offset. The substitution
 * that produces the spoken text is built to preserve word count for precisely
 * this reason; if it ever failed to, the page keeps its start and end and loses
 * only the word highlighting, rather than lighting up the wrong word.
 *
 * Returns null when the alignment cannot be trusted at all - lengths that
 * disagree, or characters that are not the ones we sent.
 */
export function timingsFromAlignment(
  speech: string,
  pieces: SpokenPiece[],
  alignment: Alignment | null | undefined,
): { pages: PageTiming[]; duration: number } | null {
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;

  if (!characters || !starts || !ends) return null;
  if (characters.length !== starts.length || characters.length !== ends.length) return null;
  if (characters.length !== speech.length) return null;
  if (characters.join("") !== speech) return null;

  const pages: PageTiming[] = pieces.map((piece) => {
    const spoken = tokenize(piece.spoken);
    const shown = tokenize(piece.display);

    const timeOf = (index: number) => {
      const token = spoken[index];
      const first = piece.offset + token.from;
      const last = piece.offset + token.to - 1;
      const start = starts[first] ?? 0;
      return { start, end: Math.max(ends[last] ?? start, start) };
    };

    const first = spoken.length > 0 ? timeOf(0) : null;
    const last = spoken.length > 0 ? timeOf(spoken.length - 1) : null;

    const words: WordTiming[] =
      spoken.length === shown.length
        ? shown.map((token, index) => ({
            from: token.from,
            to: token.to,
            ...timeOf(index),
          }))
        : [];

    return {
      page: piece.page,
      start: first?.start ?? starts[piece.offset] ?? 0,
      end: last?.end ?? ends[piece.offset] ?? 0,
      words,
    };
  });

  return { pages, duration: ends[ends.length - 1] ?? 0 };
}
