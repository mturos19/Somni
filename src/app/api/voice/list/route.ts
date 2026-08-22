import {
  ELEVENLABS_BASE,
  errorResponse,
  requireKey,
  toFriendlyError,
  type VoiceSummary,
} from "@/lib/elevenlabs";

export const runtime = "nodejs";

type RawVoice = {
  voice_id: string;
  name?: string;
  category?: string;
  preview_url?: string | null;
  safety_control?: string | null;
  voice_verification?: { requires_verification?: boolean } | null;
};

/** Lists the voices on the account, cloned ones first. */
export async function GET() {
  try {
    const key = requireKey();

    const res = await fetch(`${ELEVENLABS_BASE}/v1/voices`, {
      headers: { "xi-api-key": key },
      cache: "no-store",
    });
    if (!res.ok) throw await toFriendlyError(res);

    const data = (await res.json()) as { voices?: RawVoice[] };

    const voices: VoiceSummary[] = (data.voices ?? []).map((v) => ({
      voiceId: v.voice_id,
      name: v.name ?? "Untitled voice",
      isCloned: v.category === "cloned" || v.category === "professional",
      requiresVerification: Boolean(v.voice_verification?.requires_verification),
      previewUrl: v.preview_url ?? null,
    }));

    voices.sort((a, b) => Number(b.isCloned) - Number(a.isCloned));

    return Response.json({ voices });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Removes a cloned voice from the ElevenLabs account for good. */
export async function DELETE(request: Request) {
  try {
    const key = requireKey();

    const voiceId = new URL(request.url).searchParams.get("voiceId")?.trim();
    if (!voiceId) {
      return Response.json({ error: "No voice specified." }, { status: 400 });
    }

    const res = await fetch(
      `${ELEVENLABS_BASE}/v1/voices/${encodeURIComponent(voiceId)}`,
      { method: "DELETE", headers: { "xi-api-key": key } },
    );
    if (!res.ok) throw await toFriendlyError(res);

    return Response.json({ deleted: voiceId });
  } catch (err) {
    return errorResponse(err);
  }
}
