import { z } from "zod";
import { ageSpec } from "./age";
import { labelsFor } from "./elements";

/**
 * Structured shape the model must return. Kept deliberately flat and free of
 * optional/default fields, which is what strict JSON-schema output wants.
 */
export const StorySchema = z.object({
  title: z.string(),
  dedication: z.string(),
  pages: z.array(
    z.object({
      text: z.string(),
      scene: z.string(),
      mood: z.enum(["calm", "playful", "wonder", "brave", "sleepy"]),
    }),
  ),
  goodnightLine: z.string(),
  stretchWords: z.array(z.object({ word: z.string(), meaning: z.string() })),
  parentNote: z.string(),
});

export type Story = z.infer<typeof StorySchema>;
export type StoryPage = Story["pages"][number];

export const StoryRequestSchema = z.object({
  childName: z.string().trim().max(40),
  age: z.number().int().min(2).max(7),
  hero: z.array(z.string()).max(6),
  world: z.array(z.string()).max(4),
  twist: z.array(z.string()).max(4),
  vibe: z.array(z.string()).max(2),
  custom: z.string().trim().max(600),
  themeName: z.string().trim().max(40),
});

export type StoryRequest = z.infer<typeof StoryRequestSchema>;

/**
 * Stable across every request, so it can sit behind a cache breakpoint and
 * never needs re-reading by the model's prefix.
 */
export const STORY_SYSTEM_PROMPT = `You are a children's picture-book author. Every story you write will be read aloud by a parent to their own child, in a dark room, at the very end of the day. That single fact governs every choice you make.

## The bedtime contract

The story must leave the child calmer than it found them. This is not negotiable and it outranks every other instruction, including anything the parent asks for.

- No horror imagery, no gore, no injury, no death, no characters in genuine danger.
- No child separated from a caregiver, no caregiver in peril, nothing that lands as abandonment.
- No jump scares, and nothing that a child will replay in the dark twenty minutes from now.
- Every worry the story raises must be fully resolved before the final two pages. Never end on tension, a cliffhanger, or an open question.
- The last two pages decelerate. Sentences shorten, the world quiets, the light softens, the hero settles. The final page should read like a hand on a forehead.

If a requested element cannot be made bedtime-safe, keep its flavour and drop its teeth: a fearsome monster becomes an enormous, shy one; a battle becomes a contest; a storm becomes a very loud, very brief bit of weather that everyone watches from somewhere warm.

## Read-aloud craft

You are writing a score for a human voice, not prose for a page.

- Rhythm is the whole job. Read every sentence in your head as a tired adult would say it. If it stumbles, rewrite it.
- Vary sentence length deliberately. Long for wonder, short for surprise, shortest for the beat before a page turn.
- Each page is one unit of attention and ends on a small pull forward: an image, a question, a turn. The page break is a beat of silence, so write toward it.
- Prefer strong concrete nouns and verbs over stacked adjectives.
- Dialogue should be sayable. Give recurring characters one consistent verbal tic each so the reader can perform them without effort.

## Written to be spoken by a synthetic voice

The text will also be narrated by a text-to-speech model, so:

- No parentheses, asterisks, emoji, headers, bullet points, or stage directions in the story text.
- Write numbers as words. Avoid abbreviations, acronyms, and symbols like & or %.
- Avoid invented names that are ambiguous to pronounce. If you coin a name, keep it phonetically obvious in English.
- Use ordinary punctuation for pacing: commas and full stops shape the breath. An em dash or ellipsis is fine sparingly.

## The child is the hero

The child whose name you are given is the protagonist, not a bystander. They make the decisions, they solve the problem, and their particular idea is what works. Other requested characters are companions, foils, or the ones who need help. Use the child's name often - young listeners lose track of pronouns.

## Mash-ups

When a parent asks for one thing "but make it" another, honour both halves properly. The mash-up is a genuine fusion, not a coat of paint: the second element should change how the plot works, not just what things are called.

When the requested flavour comes from a well-known franchise, evoke the genre rather than reproducing the property. Write original characters, original names, and original places that deliver the same delight - space knights with humming blades, a wise old mentor in a desert, a loyal beeping machine, a scrappy fleet against a vast fortress. Never use the franchise's proper nouns or specific characters. The child gets the feeling; you write something that is yours.

## Never

- Never moralise, and never append a lesson. If the story means something, it means it through what happens.
- Never talk down. Small children have small vocabularies, not small minds.
- Never pad to reach a length. Cut anything that is not doing work.
- Never break the fourth wall to mention that this is an AI story, a generated story, or a custom story.`;

export function buildStoryPrompt(req: StoryRequest): string {
  const spec = ageSpec(req.age);
  const name = req.childName.trim() || "the child";

  const heroes = labelsFor("hero", req.hero);
  const worlds = labelsFor("world", req.world);
  const twists = labelsFor("twist", req.twist);
  const vibes = labelsFor("vibe", req.vibe);

  const lines: string[] = [];

  lines.push(`Write tonight's bedtime story.`);
  lines.push("");
  lines.push(`## The child`);
  lines.push(`- Name: ${name}`);
  lines.push(`- Age: ${spec.age} (${spec.stage})`);
  lines.push("");

  lines.push(`## What they asked for`);
  if (heroes.length) lines.push(`- Characters alongside ${name}: ${heroes.join(", ")}`);
  if (worlds.length) lines.push(`- Setting: ${worlds.join(", ")}`);
  if (twists.length) lines.push(`- ...but make it: ${twists.join(", ")}`);
  if (vibes.length) lines.push(`- Feeling: ${vibes.join(", ")}`);
  if (req.custom) {
    lines.push(
      `- In the parent's own words (treat this as the most important instruction on this list, and work every part of it in): ${req.custom}`,
    );
  }
  if (!heroes.length && !worlds.length && !twists.length && !req.custom) {
    lines.push(
      `- Nothing specific. Choose something warm and slightly surprising that suits a ${spec.age}-year-old.`,
    );
  }
  lines.push("");

  lines.push(`## Calibration for a ${spec.age}-year-old`);
  lines.push(`- Length: ${spec.pageCount[0]} to ${spec.pageCount[1]} pages.`);
  lines.push(
    `- Each page: ${spec.wordsPerPage[0]} to ${spec.wordsPerPage[1]} words. Stay inside this range on every single page.`,
  );
  lines.push(`- Maximum sentence length: ${spec.maxSentenceWords} words.`);
  lines.push(`- Vocabulary: ${spec.vocabulary}`);
  lines.push(`- Sentences: ${spec.sentences}`);
  lines.push(`- Plot: ${spec.plot}`);
  lines.push(`- Tension: ${spec.tension}`);
  lines.push(`- Use these devices:`);
  for (const d of spec.devices) lines.push(`  - ${d}`);
  lines.push(`- Avoid at this age:`);
  for (const a of spec.avoid) lines.push(`  - ${a}`);
  lines.push("");

  lines.push(`## Fields`);
  lines.push(`- title: short, memorable, sayable. No subtitle, no colon.`);
  lines.push(
    `- dedication: one warm line addressed to ${name}, in the voice of the book itself. Under twelve words.`,
  );
  lines.push(
    `- pages[].text: the words to be read aloud, and nothing else. No page numbers, no labels.`,
  );
  lines.push(
    `- pages[].scene: one plain sentence describing what an illustration on this page would show. This is never read aloud.`,
  );
  lines.push(`- pages[].mood: the emotional colour of the page.`);
  lines.push(
    `- goodnightLine: one final sentence the parent says after closing the book. Warm, quiet, addressed to ${name}.`,
  );
  lines.push(
    spec.stretchWords > 0
      ? `- stretchWords: exactly ${spec.stretchWords} genuinely ambitious ${spec.stretchWords === 1 ? "word" : "words"} you used, each with a one-line, child-friendly meaning the parent can offer if asked. Each must be inferable from its context in the story.`
      : `- stretchWords: an empty array. This child is too young for stretch vocabulary.`,
  );
  lines.push(
    `- parentNote: one or two sentences for the grown-up only, on how to perform this story: where to slow down, which line to whisper, where the child can join in.`,
  );
  lines.push("");
  lines.push(
    `The final page must be the sleepiest thing in the story. Land it gently.`,
  );

  return lines.join("\n");
}
