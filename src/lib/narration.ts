/**
 * The narration model, shared by the browser and the /api/voice/speak route so
 * the two can never disagree about how a story is cut up or how its words are
 * counted.
 *
 * Three decisions live here, and they are the reason narration sounds like a
 * person reading rather than a machine reciting:
 *
 * 1. Stories are narrated in *segments* of several pages, not page by page.
 *    Eleven v3 is markedly more consistent given a few hundred characters of
 *    context, and a single generation carries its own rhythm across a page turn
 *    for free - something no amount of request stitching recovers. (Stitching
 *    is not an option anyway: `previous_text` / `next_text` are rejected by v3.)
 * 2. Each page carries an audio tag derived from its mood, which is how v3 is
 *    directed. The tag is never displayed and never spoken.
 * 3. Every word gets a start and end time, taken from the character alignment
 *    the API returns, so the reader can light up each word as it is said.
 */

import type { StoryPage } from "./story";

export type Mood = StoryPage["mood"];

/* ------------------------------- tokenizing ------------------------------- */

export type Token = { from: number; to: number };

/**
 * Words are maximal runs of non-whitespace, so punctuation stays attached to
 * the word it belongs to and highlighting never orphans a comma. Both sides of
 * the wire call this, which is what keeps timing indices meaningful.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ from: match.index, to: match.index + match[0].length });
  }
  return tokens;
}

/* -------------------------------- segments -------------------------------- */

/**
 * The first segment is deliberately short so the first words arrive quickly;
 * later segments are longer because they are fetched while the previous one is
 * still playing, where quality matters more than latency. Both sit well above
 * the ~250 characters below which v3 starts to drift.
 */
const FIRST_SEGMENT_CHARS = 520;
const SEGMENT_TARGET_CHARS = 900;
const SEGMENT_MAX_CHARS = 2400;

/** Rough allowance for the mood tag and the blank line between pages. */
const PAGE_OVERHEAD_CHARS = 14;

export type PlannedSegment = {
  index: number;
  /** Page indices, in order, contiguous. */
  pages: number[];
};

export function planSegments(pages: { text: string }[]): PlannedSegment[] {
  const segments: PlannedSegment[] = [];
  let current: number[] = [];
  let chars = 0;

  for (let page = 0; page < pages.length; page += 1) {
    const cost = pages[page].text.length + PAGE_OVERHEAD_CHARS;
    const target = segments.length === 0 ? FIRST_SEGMENT_CHARS : SEGMENT_TARGET_CHARS;

    const full = chars >= target || chars + cost > SEGMENT_MAX_CHARS;
    if (current.length > 0 && full) {
      segments.push({ index: segments.length, pages: current });
      current = [];
      chars = 0;
    }

    current.push(page);
    chars += cost;
  }

  if (current.length > 0) segments.push({ index: segments.length, pages: current });
  return segments;
}

export function segmentOfPage(segments: PlannedSegment[], page: number): number {
  const found = segments.findIndex((segment) => segment.pages.includes(page));
  return found === -1 ? 0 : found;
}

/* ----------------------------- pronunciation ------------------------------ */

/**
 * How a name should be spelled for the voice, rather than for the page.
 *
 * Speech models read unusual names phonetically and get them wrong, and a story
 * that mispronounces the child it was written for is worse than one that never
 * used their name. So the parent can write how it sounds - "Sur-sha" for
 * Saoirse - and that spelling is what goes to the voice while the page still
 * shows the real one.
 *
 * Whitespace is collapsed to hyphens deliberately: the substitution has to
 * leave the word count untouched, because word timings are matched to the
 * displayed text by position.
 */
export function normaliseSaysLike(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** The text to send to the voice: the same words, one of them respelled. */
export function spokenText(text: string, name: string, saysLike: string): string {
  const from = name.trim();
  const to = normaliseSaysLike(saysLike);
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return text;

  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), to);
}

/* --------------------------------- timing --------------------------------- */

/** Char offsets are relative to the page text, so they survive re-rendering. */
export type WordTiming = { from: number; to: number; start: number; end: number };

export type PageTiming = {
  page: number;
  start: number;
  end: number;
  words: WordTiming[];
};

export type SpeakRequest = {
  voiceId: string;
  /** The child's name as written, and how it should actually be said. */
  childName?: string;
  saysLike?: string;
  /** How to read it. Defaults to `natural`. See VoiceMode in elevenlabs.ts. */
  mode?: "steady" | "natural" | "lively";
  pages: { page: number; text: string; mood: Mood }[];
  /** The pages either side of this segment. Ignored by models that reject stitching. */
  previousText?: string;
  nextText?: string;
};

/**
 * The metadata half of a narration response.
 *
 * Audio does not travel inside this. A segment is around half a megabyte, and
 * base64 inside JSON inflates that by a third and makes both ends re-encode it
 * for nothing. The route answers with bytes instead:
 *
 *   [4 bytes, big-endian: header length][header JSON, UTF-8][mp3]
 *
 * Measured, that is about a millisecond of server CPU per segment instead of
 * two and a half - which is what keeps this inside a free Worker - and it saves
 * a phone the work of decoding base64 at bedtime.
 */
export type SpeakHeader = {
  duration: number;
  /**
   * True when the timings came from the API's character alignment. False means
   * they were estimated from text length: page turns still land in roughly the
   * right place, but the reader must not pretend to follow individual words.
   */
  precise: boolean;
  pages: PageTiming[];
};

/** Bytes at the front of a narration response holding the header's length. */
export const NARRATION_PREFIX_BYTES = 4;

/**
 * Timings inferred from how long each page is, for the rare generation that
 * comes back without alignment. Never good enough to highlight a word with,
 * but good enough to keep the pages turning.
 */
export function proportionalTimings(
  pieces: { page: number; text: string }[],
  duration: number,
): PageTiming[] {
  const total = pieces.reduce((sum, piece) => sum + piece.text.length, 0) || 1;
  let elapsed = 0;

  return pieces.map((piece) => {
    const share = (piece.text.length / total) * duration;
    const start = elapsed;
    elapsed += share;

    const tokens = tokenize(piece.text);
    const words: WordTiming[] = tokens.map((token, index) => ({
      from: token.from,
      to: token.to,
      start: start + (share * index) / tokens.length,
      end: start + (share * (index + 1)) / tokens.length,
    }));

    return { page: piece.page, start, end: elapsed, words };
  });
}

/** Which page of a segment is being spoken at `time`. */
export function pageIndexAt(pages: PageTiming[], time: number): number {
  let found = 0;
  for (let i = 0; i < pages.length; i += 1) {
    if (time >= pages[i].start) found = i;
    else break;
  }
  return found;
}

/** The moment the reader should move on from `pages[at]`. */
export function pageBoundary(pages: PageTiming[], at: number, duration: number): number {
  const next = pages[at + 1];
  return next ? next.start : duration;
}

/**
 * Index of the word being spoken at `time`, or -1 before the first one.
 * Binary search because this runs on every animation frame.
 */
export function wordAt(words: WordTiming[], time: number): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (time >= words[mid].start) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
