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
 * A failure worth one more attempt: the model produced text that would not read
 * back as a story. Authentication, rate limits and connectivity are not - those
 * fail the same way twice and only cost the parent another minute of waiting.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.AuthenticationError) return false;
  if (err instanceof Anthropic.PermissionDeniedError) return false;
  if (err instanceof Anthropic.RateLimitError) return false;
  if (err instanceof Anthropic.APIConnectionError) return false;
  return true;
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

  // What a finished story of this size weighs on the wire: the read aloud text,
  // the moods, and the JSON around them. Re-measured across ages four and seven
  // after the unused scene field came out. Only ever used to move a progress
  // bar, so landing within ten percent is plenty.
  const expectedChars = Math.round(
    ((spec.pageCount[0] + spec.pageCount[1]) / 2) *
      ((spec.wordsPerPage[0] + spec.wordsPerPage[1]) / 2) *
      6.9 +
      300,
  );

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;

      /**
       * Never throws. The heartbeat fires from a timer, outside the try
       * below, and enqueueing onto a stream the browser has already walked
       * away from raises - which would take the whole request down instead
       * of letting it end quietly.
       */
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      const heartbeat = setInterval(() => send({ type: "tick" }), HEARTBEAT_MS);

      /**
       * One attempt at a story. False means the model produced something that
       * could not be read back as a story - a bad roll rather than a broken
       * request, and so worth trying once more.
       */
      const attempt = async (): Promise<boolean> => {
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
              /**
               * Measured, not assumed. Against `high`, on identical briefs:
               *
               *   age 4   20s / 1.2k output tokens   vs   51s / 3.3k
               *   age 7   88s / 5.4k                 vs  178s / 14.3k
               *
               * Both stayed inside the age spec for page count and words per
               * page in every run. `high` spent three to four times the tokens
               * deliberating and bought nothing measurable, while a child sat
               * waiting. The craft in these stories comes from the system
               * prompt, not from the effort dial.
               */
              effort: "medium",
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
          return true; // Answered. Retrying would only refuse again.
        }

        // Truncation and malformed output both land here, and both are worth
        // one more roll of the dice rather than an apology.
        if (final.stop_reason === "max_tokens") return false;

        const story = final.parsed_output;
        if (!story || story.pages.length === 0) return false;

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
        return true;
      };

      try {
        send({ type: "start", expectedChars });

        for (let tries = 0; tries < 2; tries += 1) {
          let answered = false;

          try {
            answered = await attempt();
          } catch (err) {
            // The SDK raises when the model's JSON will not parse against the
            // schema. That is the "invalid JSON" a parent used to see, and it
            // is transient - so it is retried rather than reported.
            if (request.signal.aborted || !isRetryable(err) || tries === 1) throw err;
            console.warn("[story] unreadable output, retrying", err);
          }

          if (answered) return;

          if (tries === 0) {
            send({ type: "retry" });
            send({ type: "phase", phase: "thinking" });
            continue;
          }

          send({
            type: "error",
            error: "The story came back in a shape we could not read.",
            hint: "That is usually a one-off. Please try again.",
          });
          return;
        }
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
