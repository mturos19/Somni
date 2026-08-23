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
// Opus with adaptive thinking takes its time on a creative brief. The response
// streams from the first second, so this is a ceiling rather than a wait.
export const maxDuration = 300;

/** Nothing arrives on the wire while the model thinks; this keeps the pipe warm. */
const HEARTBEAT_MS = 10_000;

/** Enough delta to be worth a repaint, not enough to flood the connection. */
const PROGRESS_STEP_CHARS = 150;

function fail(status: number, message: string, hint?: string) {
  return NextResponse.json({ error: message, hint }, { status });
}

/** Turns an SDK error into something a parent at bedtime can act on. */
function describe(err: unknown): { error: string; hint?: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return {
      error: "That Anthropic API key was rejected.",
      hint: "Check ANTHROPIC_API_KEY in .env.local.",
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { error: "The story writer is busy right now.", hint: "Try again in a moment." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { error: "Could not reach the story writer.", hint: "Check your connection." };
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[story] Anthropic error", err.status, err.message);
    return { error: "The story writer had a problem.", hint: err.message };
  }
  console.error("[story] unexpected", err);
  return { error: "Something went wrong writing that story." };
}

/**
 * Writes tonight's story, reporting progress as it goes.
 *
 * A good story takes Opus a couple of minutes of real thinking, and a parent
 * staring at a still screen for two minutes assumes it has broken. So the
 * response is an event stream: the phase changes when the model stops thinking
 * and starts writing, and the character count gives an honest progress bar.
 * Keeping bytes moving also stops anything between here and the browser from
 * deciding the request has stalled.
 */
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
  const spec = ageSpec(req.age);

  // What a finished story of this size usually weighs on the wire - the read
  // aloud text plus the scene notes, moods and JSON scaffolding around it.
  // Calibrated against real generations; only ever used to move a progress bar,
  // so landing within ten percent is plenty.
  const expectedChars = Math.round(
    ((spec.pageCount[0] + spec.pageCount[1]) / 2) *
      ((spec.wordsPerPage[0] + spec.wordsPerPage[1]) / 2) *
      9.8 +
      400,
  );

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const heartbeat = setInterval(() => send({ type: "tick" }), HEARTBEAT_MS);

      try {
        send({ type: "start", expectedChars });

        const message = client.beta.messages.stream(
          {
            model: "claude-opus-5",
            max_tokens: 16000,
            // Server-side fallbacks: if a safety classifier declines, the API
            // routes to a suitable alternative rather than a dead end.
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
          },
          { signal: request.signal },
        );

        let chars = 0;
        let reported = 0;

        for await (const event of message) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "thinking") send({ type: "phase", phase: "thinking" });
            if (event.content_block.type === "text") send({ type: "phase", phase: "writing" });
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            chars += event.delta.text.length;
            if (chars - reported >= PROGRESS_STEP_CHARS) {
              reported = chars;
              send({ type: "progress", chars });
            }
          }
        }

        const final = await message.finalMessage();

        if (final.stop_reason === "refusal") {
          send({
            type: "error",
            error: "The story writer stopped part-way through that one.",
            hint: "Try softening the custom description, then ask again.",
          });
          return;
        }
        if (final.stop_reason === "max_tokens") {
          send({
            type: "error",
            error: "The story ran longer than expected and got cut off.",
            hint: "Please try again.",
          });
          return;
        }

        const story = final.parsed_output;
        if (!story || story.pages.length === 0) {
          send({
            type: "error",
            error: "The story came back in a shape we could not read.",
            hint: "Please try again.",
          });
          return;
        }

        send({
          type: "story",
          story,
          meta: {
            age: req.age,
            stage: spec.stage,
            pageCount: story.pages.length,
            usage: {
              input: final.usage.input_tokens,
              output: final.usage.output_tokens,
              cacheRead: final.usage.cache_read_input_tokens ?? 0,
            },
          },
        });
      } catch (err) {
        // A parent closing the tab is not a failure worth reporting.
        if (!request.signal.aborted) send({ type: "error", ...describe(err) });
      } finally {
        clearInterval(heartbeat);
        open = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Tells nginx-shaped proxies not to sit on the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
