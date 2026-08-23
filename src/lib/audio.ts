"use client";

import { NARRATION_PREFIX_BYTES, type SpeakHeader } from "./narration";

export type Narration = SpeakHeader & { audio: Blob };

/**
 * Reads a narration response: a length-prefixed JSON header followed by the
 * mp3 itself. See SpeakHeader for why the audio is not JSON.
 */
export function decodeNarration(buffer: ArrayBuffer): Narration {
  if (buffer.byteLength < NARRATION_PREFIX_BYTES) {
    throw new Error("That narration arrived empty.");
  }

  const headerLength = new DataView(buffer).getUint32(0, false);
  const audioAt = NARRATION_PREFIX_BYTES + headerLength;
  if (audioAt > buffer.byteLength) {
    throw new Error("That narration arrived incomplete.");
  }

  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, NARRATION_PREFIX_BYTES, headerLength)),
  ) as SpeakHeader;

  return { ...header, audio: new Blob([buffer.slice(audioAt)], { type: "audio/mpeg" }) };
}
