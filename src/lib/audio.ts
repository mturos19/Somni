"use client";

/** Decoding a whole clip in one atob call stalls a phone for a beat. */
const DECODE_CHUNK = 32 * 1024;

/** Narration arrives as base64 inside JSON, alongside its word timings. */
export function base64ToBlob(base64: string, type = "audio/mpeg"): Blob {
  const binary = atob(base64);
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < binary.length; offset += DECODE_CHUNK) {
    const slice = binary.slice(offset, offset + DECODE_CHUNK);
    const bytes = new Uint8Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) bytes[i] = slice.charCodeAt(i);
    parts.push(bytes);
  }
  return new Blob(parts as BlobPart[], { type });
}
