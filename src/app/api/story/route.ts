import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import {
  STORY_SYSTEM_PROMPT,
  StoryRequestSchema,
  StorySchema,
  buildStoryPrompt,
} from "@/lib/story";
import { ageSpec } from "@/lib/age";

export const runtime = "nodejs";
// Opus with adaptive thinking takes its time on a creative brief. Streaming
// keeps the socket alive; this is the ceiling for the whole request.
export const maxDuration = 300;

function fail(status: number, message: string, hint?: string) {
  return NextResponse.json({ error: message, hint }, { status });
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(
      503,
      "The story writer is not connected yet.",
      "Add ANTHROPIC_API_KEY to .env.local and restart the dev server.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "That request did not look like JSON.");
  }

  const parsed = StoryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "Some of those story settings did not make sense.");
  }
  const req = parsed.data;

  const client = new Anthropic();

  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5",
      max_tokens: 16000,
      // Server-side fallbacks: if a safety classifier declines, the API routes
      // to a suitable alternative model rather than handing us a dead end.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: STORY_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildStoryPrompt(req) }],
      output_config: {
        format: betaZodOutputFormat(StorySchema),
        effort: "high",
      },
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return fail(
        422,
        "The story writer stopped part-way through that one.",
        "Try softening the custom description, then ask again.",
      );
    }

    if (message.stop_reason === "max_tokens") {
      return fail(
        502,
        "The story ran longer than expected and got cut off.",
        "Please try again.",
      );
    }

    const story = message.parsed_output;
    if (!story) {
      return fail(502, "The story came back in a shape we could not read.");
    }

    if (story.pages.length === 0) {
      return fail(502, "The story came back empty. Please try again.");
    }

    return NextResponse.json({
      story,
      meta: {
        age: req.age,
        stage: ageSpec(req.age).stage,
        pageCount: story.pages.length,
        usage: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          cacheRead: message.usage.cache_read_input_tokens ?? 0,
        },
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return fail(
        401,
        "That Anthropic API key was rejected.",
        "Check ANTHROPIC_API_KEY in .env.local.",
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return fail(429, "The story writer is busy right now.", "Try again in a moment.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return fail(503, "Could not reach the story writer.", "Check your connection.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[story] Anthropic error", err.status, err.message);
      return fail(502, "The story writer had a problem.", err.message);
    }
    console.error("[story] unexpected", err);
    return fail(500, "Something went wrong writing that story.");
  }
}
