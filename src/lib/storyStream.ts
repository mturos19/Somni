"use client";

import type { Story, StoryRequest } from "./story";

export type StoryProgress =
  | { type: "start"; expectedChars: number }
  | { type: "phase"; phase: "thinking" | "writing" }
  | { type: "progress"; chars: number }
  | { type: "retry" }
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
 * Pulls the payload out of one server-sent event.
 *
 * The spec allows a frame to carry several `data:` lines, which are joined with
 * newlines, and to use either line ending. Nothing here sends multi-line frames
 * today, but a parser that assumes otherwise breaks silently and at a distance.
 */
function payloadOf(frame: string): string {
  return frame
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
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

  // Anything rejected before writing began comes back as ordinary JSON - or,
  // if something between here and the route failed, as a page of HTML.
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new StoryError(detail.error ?? "Could not reach the story writer.", detail.hint);
  }
  if (!res.body) throw new StoryError("The story writer sent nothing back.");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let story: Story | null = null;

  /** Returns true once the story has arrived. */
  const handle = (frame: string): boolean => {
    const payload = payloadOf(frame);
    if (!payload) return false;

    let event: { type?: string; [key: string]: unknown };
    try {
      event = JSON.parse(payload);
    } catch {
      // A frame we cannot read is not worth failing the whole story over. If
      // the unreadable one was the story itself, the check at the end catches
      // it and says something a parent can act on.
      console.warn("[story] skipped an unreadable event");
      return false;
    }

    if (event.type === "error") {
      throw new StoryError(
        typeof event.error === "string" ? event.error : "The story writer had a problem.",
        typeof event.hint === "string" ? event.hint : undefined,
      );
    }

    if (event.type === "story") {
      story = event.story as Story;
      return true;
    }

    onProgress(event as StoryProgress);
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;

      // Events are separated by a blank line, in either line ending.
      let match = /\r?\n\r?\n/.exec(buffer);
      while (match) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (handle(frame)) return story!;
        match = /\r?\n\r?\n/.exec(buffer);
      }
    }

    // A final frame with no trailing blank line.
    if (buffer.trim() && handle(buffer)) return story!;
  } finally {
    await reader.cancel().catch(() => {});
  }

  throw new StoryError(
    "The story stopped before it was finished.",
    "Please try again.",
  );
}
