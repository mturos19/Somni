import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { textToSpeech, getDefaultVoiceId } from "@/lib/elevenlabs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const story = await prisma.story.findUnique({
      where: { id },
      include: {
        voice: true,
      },
    });

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (story.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!story.content) {
      return NextResponse.json(
        { error: "Story has no content to narrate" },
        { status: 400 }
      );
    }

    // Use the cloned voice if available, otherwise use default
    const voiceId = story.voice?.elevenLabsId || getDefaultVoiceId();

    // Generate audio
    const audioBuffer = await textToSpeech(story.content, voiceId, {
      stability: 0.6,
      similarity_boost: 0.85,
      style: 0.4, // Slightly more expressive for storytelling
    });

    // Return audio as response
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${story.title.replace(/[^a-z0-9]/gi, '_')}.mp3"`,
      },
    });
  } catch (error) {
    console.error("Error generating audio:", error);
    return NextResponse.json(
      { error: "Failed to generate audio" },
      { status: 500 }
    );
  }
}

