/**
 * Proof that this browser is the one that created a given voice.
 *
 * Every family shares a single ElevenLabs account, so a voice id on its own
 * says nothing about who may act on it. Without this, the id is a bearer token
 * that anybody can present: one visitor could delete another parent's cloned
 * voice, or have it read out whatever they liked.
 *
 * There is no database and nothing is stored server-side. The clone route hands
 * the browser a signed list of the voices it made, and the routes that act on a
 * voice check that list first. The cookie is HttpOnly, so page scripts - and
 * anything injected into them - cannot read or extend it.
 */

const COOKIE = "somni_voices";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
/** A family making more than this many voices is not a case worth carrying. */
const MAX_VOICES = 24;

/**
 * Prefer a dedicated secret. Falling back to the ElevenLabs key keeps existing
 * deployments working without a new secret to set, and it is never exposed:
 * only a HMAC derived from it ever leaves the Worker.
 */
function secret(): string | null {
  return process.env.SOMNI_SIGNING_SECRET ?? process.env.ELEVENLABS_API_KEY ?? null;
}

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function key(): Promise<CryptoKey | null> {
  const material = secret();
  if (!material) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Constant-time by construction: verify() does the comparison, not us. */
async function verify(payload: string, signature: string): Promise<boolean> {
  const k = await key();
  const sig = unb64url(signature);
  if (!k || !sig) return false;
  return crypto.subtle.verify(
    "HMAC",
    k,
    sig as unknown as ArrayBuffer,
    encoder.encode(payload) as unknown as ArrayBuffer,
  );
}

async function sign(payload: string): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const sig = await crypto.subtle.sign(
    "HMAC",
    k,
    encoder.encode(payload) as unknown as ArrayBuffer,
  );
  return b64url(new Uint8Array(sig));
}

function readCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return null;
}

/** The voices this browser has proved it created. Empty when it has made none. */
export async function ownedVoices(request: Request): Promise<string[]> {
  const raw = readCookie(request);
  if (!raw) return [];

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return [];
  if (!(await verify(payload, signature))) return [];

  const decoded = unb64url(payload);
  if (!decoded) return [];

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decoded));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export async function owns(request: Request, voiceId: string): Promise<boolean> {
  return (await ownedVoices(request)).includes(voiceId);
}

/**
 * The Set-Cookie value recording one more voice as this browser's, or null when
 * no secret is configured and ownership therefore cannot be proved at all.
 */
export async function grantVoice(
  request: Request,
  voiceId: string,
): Promise<string | null> {
  const existing = await ownedVoices(request);
  if (existing.includes(voiceId)) return null;

  const next = [...existing, voiceId].slice(-MAX_VOICES);
  const payload = b64url(encoder.encode(JSON.stringify(next)));
  const signature = await sign(payload);
  if (!signature) return null;

  return [
    `${COOKIE}=${payload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join("; ");
}

/** True when ownership can be checked at all. See secret(). */
export function ownershipConfigured(): boolean {
  return secret() !== null;
}
