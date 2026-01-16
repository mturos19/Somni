import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateStory, AgeGroup } from "@/lib/openai";
import { z } from "zod";

const createStorySchema = z.object({
  prompt: z.string().min(10, "Please describe your story idea in more detail"),
  childName: z.string().optional(),
  ageGroup: z.enum(["TODDLER", "PRESCHOOL", "EARLY_READER", "CHAPTER_BOOK"]).default("PRESCHOOL"),
  voiceId: z.string().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stories = await prisma.story.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        voice: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({ stories });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return NextResponse.json(
      { error: "Failed to fetch stories" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, childName, ageGroup, voiceId } = createStorySchema.parse(body);

    // Create story in draft status
    const story = await prisma.story.create({
      data: {
        userId: session.user.id,
        prompt,
        childName: childName || null,
        ageGroup,
        voiceId: voiceId || null,
        title: "Generating...",
        content: "",
        status: "GENERATING",
      },
    });

    // Generate story content (async)
    try {
      const { title, content } = await generateStory(
        prompt,
        childName || null,
        ageGroup as AgeGroup
      );

      // Calculate estimated duration (average reading speed for bedtime: ~120 words/min)
      const wordCount = content.split(/\s+/).length;
      const duration = Math.ceil((wordCount / 120) * 60);

      // Update story with generated content
      const updatedStory = await prisma.story.update({
        where: { id: story.id },
        data: {
          title,
          content,
          duration,
          status: "READY",
        },
      });

      return NextResponse.json({ story: updatedStory }, { status: 201 });
    } catch (genError) {
      // Update status to failed
      await prisma.story.update({
        where: { id: story.id },
        data: { status: "DRAFT" },
      });
      throw genError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("Error creating story:", error);
    return NextResponse.json(
      { error: "Failed to create story" },
      { status: 500 }
    );
  }
}

