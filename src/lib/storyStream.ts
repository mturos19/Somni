"use client";

import type { Story, StoryRequest } from "./story";

export type StoryProgress =
  | { type: "start"; expectedChars: number }
  | { type: "phase"; phase: "thinking" | "writing" }
  | { type: "progress"; chars: number }
  | { type: "tick" };

export class StoryError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "StoryError";
  }
}

/**
 * Asks for a story and reports back while it is being written.
 *
 * The route answers with an event stream rather than one late JSON blob, so a
 * failure that happens after the response has started still has to arrive as an
 * event. Both shapes end up as a StoryError here, and callers only ever deal
 * with one of them.
 */
export async function writeStory(
  request: StoryRequest,
  onProgress: (event: StoryProgress) => void,
  signal?: AbortSignal,
): Promise<Story> {
  const res = await fetch("/api/story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(request),
  });

  // Anything rejected before writing began comes back as ordinary JSON.
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new StoryError(detail.error ?? "Could not reach the story writer.", detail.hint);
  }
  if (!res.body) throw new StoryError("The story writer sent nothing back.");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let story: Story | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;

      // Server-sent events are separated by a blank line.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const payload = frame.startsWith("data:") ? frame.slice(5).trim() : "";
        if (!payload) continue;

        const event = JSON.parse(payload);
        if (event.type === "error") throw new StoryError(event.error, event.hint);
        if (event.type === "story") story = event.story as Story;
        else onProgress(event as StoryProgress);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (!story) throw new StoryError("The story stopped before it was finished.");
  return story;
}
