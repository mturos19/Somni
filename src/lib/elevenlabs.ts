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
 * Eleven v3 is the expressive model, and the one that makes a cloned parent
 * sound like a person performing rather than a person reading. Two consequences
 * shape the rest of this file:
 *
 * - v3 takes direction through inline audio tags, so each page carries one.
 * - v3 rejects `previous_text` / `next_text` outright, so continuity across a
 *   page turn has to come from narrating several pages in one generation.
 *
 * Setting ELEVENLABS_TTS_MODEL back to a v2 model is supported and flips both
 * behaviours; it is flatter, but cheaper and faster.
 */
export function ttsModel(): string {
  return process.env.ELEVENLABS_TTS_MODEL ?? "eleven_v3";
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

/**
 * Pace, by mood. A story that quickens for the brave page and slows for the
 * last one does more for the illusion of a person reading than any amount of
 * parameter tuning.
 */
const MOOD_SPEED: Record<string, number> = {
  calm: 0.95,
  playful: 1.0,
  wonder: 0.95,
  brave: 1.0,
  sleepy: 0.9,
};

/**
 * Settings for one generation.
 *
 * stability 0.5 is v3's "Natural" - the setting that stays closest to the
 * recording the parent actually made. Lower is more theatrical but starts
 * inventing; higher flattens the clone into the monotone this app exists to
 * avoid. Style stays at zero because on v3 expression comes from the tags, and
 * exaggeration on top of a two-minute clone mostly buys artefacts.
 */
export function voiceSettingsFor(moods: string[], model: string) {
  const speeds = moods.map((mood) => MOOD_SPEED[mood] ?? 0.95);
  const speed = speeds.length
    ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length
    : 0.95;

  return {
    stability: isV3(model) ? 0.5 : 0.55,
    similarity_boost: 0.8,
    style: isV3(model) ? 0 : 0.1,
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
  text: string;
  /** Index in the assembled speech where this page's displayed text begins. */
  offset: number;
};

/**
 * Turns the API's per-character alignment into per-word timings, relative to
 * each page's own text.
 *
 * The alignment covers everything we sent, mood tags included, which is exactly
 * why each piece carries the offset of its *displayed* text: slicing at that
 * offset drops the tags from the timings without any string matching.
 *
 * Returns null when the alignment cannot be trusted - lengths that disagree, or
 * characters that are not the ones we sent - so the caller can fall back rather
 * than highlight the wrong word.
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
    const words: WordTiming[] = [];

    for (const token of tokenize(piece.text)) {
      const first = piece.offset + token.from;
      const last = piece.offset + token.to - 1;
      const start = starts[first] ?? 0;
      const end = Math.max(ends[last] ?? start, start);
      words.push({ from: token.from, to: token.to, start, end });
    }

    return {
      page: piece.page,
      start: words[0]?.start ?? starts[piece.offset] ?? 0,
      end: words[words.length - 1]?.end ?? ends[piece.offset] ?? 0,
      words,
    };
  });

  return { pages, duration: ends[ends.length - 1] ?? 0 };
}
