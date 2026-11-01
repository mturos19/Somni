import { elevenLabsBase, errorResponse, requireKey, toFriendlyError } from "@/lib/elevenlabs";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { owns } from "@/lib/voiceOwnership";

export const runtime = "nodejs";

/*
 * There is deliberately no GET handler here.
 *
 * Every family's clone lives on one shared ElevenLabs account, so listing that
 * account answers "whose voices exist, and what are their ids" to anyone who
 * asks - and an id is all the other routes used to need. The app never called
 * it: the voice picker reads this browser's own IndexedDB (see
 * VoiceStudio.tsx), which is the only list that was ever the right one.
 */

/**
 * Removes a cloned voice from the ElevenLabs account for good.
 *
 * Only the browser that created the voice may delete it. The id alone is not
 * proof of anything - see voiceOwnership.ts.
 */
export async function DELETE(request: Request) {
  const quota = rateLimit(request, "voice-delete", LIMITS.voiceDelete);
  if (!quota.ok) {
    return tooManyRequests(quota.retryAfter, "Too many deletions at once.");
  }

  try {
    const key = requireKey();

    const voiceId = new URL(request.url).searchParams.get("voiceId")?.trim();
    if (!voiceId) {
      return Response.json({ error: "No voice specified." }, { status: 400 });
    }

    if (!(await owns(request, voiceId))) {
      return Response.json(
        {
          error: "That voice was not created on this device.",
          hint: "A voice can only be deleted from the device that recorded it.",
        },
        { status: 403 },
      );
    }

    const res = await fetch(
      `${elevenLabsBase()}/v1/voices/${encodeURIComponent(voiceId)}`,
      { method: "DELETE", headers: { "xi-api-key": key } },
    );
    if (!res.ok) throw await toFriendlyError(res);

    return Response.json({ deleted: voiceId });
  } catch (err) {
    return errorResponse(err);
  }
}
