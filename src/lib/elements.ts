/**
 * The story-element catalogue. Everything here is a suggestion the parent can
 * take, ignore, or override with free text - the prompt treats custom input as
 * equally authoritative.
 */

export type Element = { id: string; label: string; emoji: string };

export type GroupId = "hero" | "world" | "twist" | "vibe";

export type ElementGroup = {
  id: GroupId;
  title: string;
  hint: string;
  /** How many the UI lets you pick before it starts nudging. */
  softMax: number;
  options: Element[];
};

export const ELEMENT_GROUPS: ElementGroup[] = [
  {
    id: "hero",
    title: "Who else is in it?",
    hint: "Pick one or two. Your child is always the hero.",
    softMax: 3,
    options: [
      { id: "knight", label: "A brave knight", emoji: "\u{1F6E1}️" },
      { id: "dragon", label: "A very small dragon", emoji: "\u{1F409}" },
      { id: "astronaut", label: "An astronaut", emoji: "\u{1F9D1}‍\u{1F680}" },
      { id: "mermaid", label: "A mermaid", emoji: "\u{1F9DC}" },
      { id: "robot", label: "A worried robot", emoji: "\u{1F916}" },
      { id: "fox", label: "A clever fox cub", emoji: "\u{1F98A}" },
      { id: "wizard", label: "A forgetful wizard", emoji: "\u{1F9D9}" },
      { id: "pirate", label: "A pirate captain", emoji: "\u{1F99C}" },
      { id: "unicorn", label: "A unicorn", emoji: "\u{1F984}" },
      { id: "dinosaur", label: "A gentle dinosaur", emoji: "\u{1F995}" },
      { id: "cat", label: "A cat with opinions", emoji: "\u{1F408}" },
      { id: "inventor", label: "A tiny inventor", emoji: "\u{1F527}" },
    ],
  },
  {
    id: "world",
    title: "Where does it happen?",
    hint: "The place the story lives in.",
    softMax: 2,
    options: [
      { id: "castle", label: "A castle in the clouds", emoji: "\u{1F3F0}" },
      { id: "forest", label: "An enchanted forest", emoji: "\u{1F332}" },
      { id: "space", label: "Deep space", emoji: "\u{1F30C}" },
      { id: "reef", label: "An underwater kingdom", emoji: "\u{1F41A}" },
      { id: "village", label: "A cosy little village", emoji: "\u{1F3E1}" },
      { id: "desert", label: "A singing desert", emoji: "\u{1F3DC}️" },
      { id: "library", label: "A library that never ends", emoji: "\u{1F4DA}" },
      { id: "snow", label: "A mountain of soft snow", emoji: "\u{1F3D4}️" },
      { id: "market", label: "A night market", emoji: "\u{1F3EE}" },
      { id: "garden", label: "A garden that grows at night", emoji: "\u{1F33B}" },
    ],
  },
  {
    id: "twist",
    title: "...but make it",
    hint: "The mash-up. This is where it gets fun.",
    softMax: 2,
    options: [
      { id: "starwars", label: "Star Wars", emoji: "⭐" },
      { id: "space", label: "In space", emoji: "\u{1F680}" },
      { id: "underwater", label: "Underwater", emoji: "\u{1F30A}" },
      { id: "cats", label: "Everyone is a cat", emoji: "\u{1F43E}" },
      { id: "musical", label: "A musical", emoji: "\u{1F3B5}" },
      { id: "mystery", label: "A detective mystery", emoji: "\u{1F50D}" },
      { id: "dinosaurs", label: "With dinosaurs", emoji: "\u{1F996}" },
      { id: "tiny", label: "Everything is tiny", emoji: "\u{1F52C}" },
      { id: "backwards", label: "Told backwards", emoji: "\u{1F504}" },
      { id: "pirates", label: "Pirates", emoji: "⚓" },
      { id: "superhero", label: "Superheroes", emoji: "\u{1F9B8}" },
      { id: "rhyme", label: "All in rhyme", emoji: "\u{1F4DC}" },
    ],
  },
  {
    id: "vibe",
    title: "How should it feel?",
    hint: "Pick one.",
    softMax: 1,
    options: [
      { id: "cosy", label: "Cosy and warm", emoji: "\u{1F56F}️" },
      { id: "silly", label: "Really silly", emoji: "\u{1F92A}" },
      { id: "brave", label: "Brave and bold", emoji: "⚔️" },
      { id: "magical", label: "Full of wonder", emoji: "✨" },
      { id: "gentle", label: "Slow and gentle", emoji: "☁️" },
      { id: "funny", label: "Properly funny", emoji: "\u{1F602}" },
    ],
  },
];

export function groupById(id: GroupId): ElementGroup {
  return ELEMENT_GROUPS.find((g) => g.id === id)!;
}

export function labelsFor(groupId: GroupId, ids: string[]): string[] {
  const group = groupById(groupId);
  return ids
    .map((id) => group.options.find((o) => o.id === id)?.label)
    .filter((v): v is string => Boolean(v));
}

/** A pleasing random pick, used by the "Surprise us" button. */
export function randomSelection(): Record<GroupId, string[]> {
  const pick = (arr: Element[], n: number) =>
    [...arr].sort(() => Math.random() - 0.5).slice(0, n).map((o) => o.id);
  return {
    hero: pick(groupById("hero").options, 1 + Math.round(Math.random())),
    world: pick(groupById("world").options, 1),
    twist: pick(groupById("twist").options, 1),
    vibe: pick(groupById("vibe").options, 1),
  };
}
