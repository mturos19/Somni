import OpenAI from "openai";

// Lazy initialization to avoid build-time errors
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export type AgeGroup = "TODDLER" | "PRESCHOOL" | "EARLY_READER" | "CHAPTER_BOOK";

const ageGroupGuidelines: Record<AgeGroup, string> = {
  TODDLER: `
    - Use very simple words (1-2 syllables)
    - Short sentences (5-7 words max)
    - Lots of repetition and rhythm
    - Focus on familiar objects, animals, and daily routines
    - Story length: 200-300 words
    - Include onomatopoeia and sound words
  `,
  PRESCHOOL: `
    - Simple vocabulary with some new words
    - Sentences of 8-12 words
    - Clear cause and effect
    - Include fantasy elements, talking animals, simple adventures
    - Story length: 400-600 words
    - Gentle conflict with happy resolution
  `,
  EARLY_READER: `
    - Varied vocabulary with context clues for new words
    - Mix of short and medium sentences
    - Character development and emotions
    - Can include mild suspense and humor
    - Story length: 600-900 words
    - Clear beginning, middle, and end
  `,
  CHAPTER_BOOK: `
    - Rich vocabulary appropriate for 7-10 year olds
    - Complex sentences with varied structure
    - Multi-dimensional characters
    - Can handle more complex emotions and themes
    - Story length: 900-1200 words
    - Can include subplots and twists
  `,
};

export async function generateStory(
  prompt: string,
  childName: string | null,
  ageGroup: AgeGroup
): Promise<{ title: string; content: string }> {
  const nameInstruction = childName
    ? `The main character or a friend should be named "${childName}".`
    : "Create a relatable main character with a friendly name.";

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a beloved children's story author known for creating magical, heartwarming tales that captivate young minds. Your stories are filled with wonder, gentle lessons, and characters children love.

Guidelines for this age group (${ageGroup.replace("_", " ")}):
${ageGroupGuidelines[ageGroup]}

Important rules:
- Create content that is 100% appropriate for children
- Include sensory details and vivid imagery
- End with a positive, satisfying conclusion
- Make it feel like a warm bedtime story
- ${nameInstruction}

Format your response as:
TITLE: [Your creative story title]
---
[The full story text]`,
      },
      {
        role: "user",
        content: `Please write a children's story based on this idea: ${prompt}`,
      },
    ],
    temperature: 0.8,
    max_tokens: 2000,
  });

  const fullResponse = response.choices[0]?.message?.content || "";
  
  // Parse title and content
  const titleMatch = fullResponse.match(/TITLE:\s*(.+?)(?:\n|---)/);
  const title = titleMatch ? titleMatch[1].trim() : "A Magical Story";
  
  const contentStart = fullResponse.indexOf("---");
  const content = contentStart !== -1 
    ? fullResponse.slice(contentStart + 3).trim()
    : fullResponse.replace(/TITLE:.*\n?/, "").trim();

  return { title, content };
}

