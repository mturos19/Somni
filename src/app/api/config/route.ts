export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lets the client know which providers are wired up, so the UI can degrade
 * honestly instead of failing at the moment of use. No secrets are exposed -
 * only whether a key is present.
 */
export async function GET() {
  return Response.json({
    story: Boolean(process.env.ANTHROPIC_API_KEY),
    voice: Boolean(process.env.ELEVENLABS_API_KEY),
  });
}
