/**
 * Thin server-side wrapper around the ElevenLabs REST API. The API key never
 * leaves the server; the browser only ever talks to our own /api/voice/* routes.
 */

export const ELEVENLABS_BASE =
  process.env.ELEVENLABS_BASE_URL?.replace(/\/$/, "") ??
  "https://api.elevenlabs.io";

/**
 * eleven_multilingual_v2 is the most expressive of the current models, which is
 * what long emotional narration needs. Flash/Turbo are cheaper and faster but
 * noticeably flatter across a whole story.
 */
export const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2";

/** Tuned for reading a bedtime story aloud: steady, warm, and unhurried. */
export const BEDTIME_VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.1,
  speed: 0.92,
  use_speaker_boost: true,
} as const;

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
