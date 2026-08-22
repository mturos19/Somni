/**
 * Age engine. This is the piece that actually makes a story feel right for a
 * given child, so it is deliberately explicit rather than a vague "write for a
 * 4 year old" instruction. Every field below lands in the prompt.
 */

export const MIN_AGE = 2;
export const MAX_AGE = 7;

export type AgeSpec = {
  age: number;
  stage: string;
  pageCount: [number, number];
  wordsPerPage: [number, number];
  maxSentenceWords: number;
  vocabulary: string;
  sentences: string;
  plot: string;
  tension: string;
  devices: string[];
  avoid: string[];
  /** Stretch words introduced in context, with a gloss for the parent. */
  stretchWords: number;
};

const SPECS: Record<number, Omit<AgeSpec, "age">> = {
  2: {
    stage: "Toddler",
    pageCount: [6, 8],
    wordsPerPage: [12, 25],
    maxSentenceWords: 8,
    vocabulary:
      "Only words a two-year-old already uses or hears daily: concrete nouns for things they can touch, basic colours, basic animals, family words. No abstractions.",
    sentences:
      "Very short. Mostly subject-verb-object. One idea per sentence. Present tense feels most natural.",
    plot:
      "Barely a plot: a warm, familiar routine with one small delightful surprise. Going somewhere, finding something, coming home.",
    tension:
      "None at all. Nothing is lost, nobody is scared, nobody is alone. Surprise should be pleasant, never startling.",
    devices: [
      "A repeated refrain the child can say along with the parent, appearing on at least three pages",
      "Sound words (splash, thump, whoosh) the reader can perform",
      "Naming and re-naming the hero often, since the child is still tracking who is who",
    ],
    avoid: [
      "Any villain, monster, or chase",
      "Anyone being separated from a caregiver",
      "Metaphor, sarcasm, or wordplay",
      "More than two named characters",
    ],
    stretchWords: 0,
  },
  3: {
    stage: "Toddler",
    pageCount: [7, 9],
    wordsPerPage: [20, 35],
    maxSentenceWords: 10,
    vocabulary:
      "Everyday words, plus a few playful invented sounds. Feelings can be named directly: happy, sleepy, silly, proud.",
    sentences:
      "Short and rhythmic. Occasional two-clause sentence joined by 'and' or 'so'.",
    plot:
      "A simple want and a simple getting: the hero wants something small, tries, and succeeds with a friend's help.",
    tension:
      "A tiny wobble at most, resolved on the very next page. Never leave worry hanging across a page turn.",
    devices: [
      "A repeated refrain, ideally with a small action the child can do",
      "Counting or a repeating pattern of three",
      "Direct questions to the listener on a page or two",
    ],
    avoid: [
      "Villains or genuine danger",
      "Sad endings or unresolved feelings",
      "Long descriptive passages",
    ],
    stretchWords: 1,
  },
  4: {
    stage: "Preschool",
    pageCount: [8, 10],
    wordsPerPage: [35, 55],
    maxSentenceWords: 12,
    vocabulary:
      "Familiar words with room for vivid ones. Sensory description is welcome now: soft, glittering, enormous, cosy.",
    sentences:
      "Mostly short, with variation for rhythm. Compound sentences are fine; keep clauses in the order events happen.",
    plot:
      "A clear beginning, a small problem, two attempts, and a satisfying fix. The hero is the one who solves it.",
    tension:
      "Gentle and brief. A problem may last two pages, but the reader must always be able to see a way out.",
    devices: [
      "A rule-of-three structure (three tries, three friends, three doors)",
      "Playful, exaggerated imagery",
      "One small joke a four-year-old would actually find funny",
    ],
    avoid: [
      "Genuine peril or menace",
      "Irony the child would misread as literal",
      "Ambiguous endings",
    ],
    stretchWords: 2,
  },
  5: {
    stage: "Preschool",
    pageCount: [9, 11],
    wordsPerPage: [50, 75],
    maxSentenceWords: 14,
    vocabulary:
      "Rich and concrete, with a couple of deliberately delicious longer words explained by context.",
    sentences:
      "Varied. Short punchy sentences for beats that matter; longer flowing ones for description.",
    plot:
      "A real little arc: setup, a complication that matters to the hero, a turning point, a resolution that changes something.",
    tension:
      "Mild and honest. The hero can feel nervous or unsure, as long as the feeling is named and resolved warmly.",
    devices: [
      "Dialogue with distinct character voices",
      "A secret, a map, or a small mystery",
      "A friend who is funny in a consistent way",
    ],
    avoid: [
      "Cruelty, or characters being mean without repair",
      "Cliffhangers at the end",
      "Anything genuinely frightening in the dark",
    ],
    stretchWords: 2,
  },
  6: {
    stage: "Early reader",
    pageCount: [10, 12],
    wordsPerPage: [70, 100],
    maxSentenceWords: 18,
    vocabulary:
      "Confident and colourful. Similes are understood now. A few ambitious words per story, always inferable from context.",
    sentences:
      "Full range. Use sentence length as rhythm: long for wonder, short for surprise.",
    plot:
      "A proper story: a goal, an obstacle with real stakes for the hero, a cost, a clever resolution, and a changed hero.",
    tension:
      "Real but safe. Suspense is allowed and enjoyed; it must resolve fully before the closing pages.",
    devices: [
      "A twist the child can feel proud of half-guessing",
      "Running jokes that pay off at the end",
      "A character whose small flaw becomes the thing that saves the day",
    ],
    avoid: [
      "Horror imagery, injury, or death",
      "Moralising or a tacked-on lesson",
      "Ending on unresolved tension",
    ],
    stretchWords: 3,
  },
  7: {
    stage: "Early reader",
    pageCount: [11, 14],
    wordsPerPage: [90, 130],
    maxSentenceWords: 22,
    vocabulary:
      "Genuinely literary. Metaphor, wordplay, and wit all land. Do not write down to this child.",
    sentences:
      "Full craft. Paragraph-level rhythm matters as much as sentence rhythm.",
    plot:
      "A layered story with a subplot or a secondary character who has their own small want. Set up details early that matter later.",
    tension:
      "Genuine stakes and a real reversal, fully resolved with time to spare before the ending settles.",
    devices: [
      "Foreshadowing that rewards attention",
      "A morally interesting choice rather than a simple right answer",
      "Dry humour alongside the silly kind",
    ],
    avoid: [
      "Horror, gore, or peril to caregivers",
      "Being preachy",
      "Rushing the resolution into the final page",
    ],
    stretchWords: 4,
  },
};

export function ageSpec(age: number): AgeSpec {
  const clamped = Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(age)));
  return { age: clamped, ...SPECS[clamped] };
}

/** Rough target so the UI can promise a believable reading time. */
export function estimatedMinutes(age: number): number {
  const s = ageSpec(age);
  const pages = (s.pageCount[0] + s.pageCount[1]) / 2;
  const words = (s.wordsPerPage[0] + s.wordsPerPage[1]) / 2;
  // ~110 wpm read aloud, slowly, to a sleepy child.
  return Math.max(2, Math.round((pages * words) / 110));
}
