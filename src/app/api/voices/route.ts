import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const voices = await prisma.voice.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ voices });
  } catch (error) {
    console.error("Error fetching voices:", error);
    return NextResponse.json(
      { error: "Failed to fetch voices" },
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

    const formData = await request.formData();
    const name = formData.get("name") as string;
    const audioFile = formData.get("audio") as File;

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "Voice name must be at least 2 characters" },
        { status: 400 }
      );
    }

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Create voice record in pending status
    const voice = await prisma.voice.create({
      data: {
        userId: session.user.id,
        name,
        status: "PROCESSING",
      },
    });

    // Clone voice with ElevenLabs
    try {
      const { cloneVoice } = await import("@/lib/elevenlabs");
      const result = await cloneVoice(
        `${name} - Somni`,
        [audioFile],
        `Voice cloned for Somni bedtime stories - ${session.user.email}`
      );

      // Update voice with ElevenLabs ID
      const updatedVoice = await prisma.voice.update({
        where: { id: voice.id },
        data: {
          elevenLabsId: result.voice_id,
          status: "READY",
        },
      });

      return NextResponse.json({ voice: updatedVoice }, { status: 201 });
    } catch (cloneError) {
      // Update status to failed
      await prisma.voice.update({
        where: { id: voice.id },
        data: { status: "FAILED" },
      });
      throw cloneError;
    }
  } catch (error) {
    console.error("Error creating voice:", error);
    return NextResponse.json(
      { error: "Failed to clone voice" },
      { status: 500 }
    );
  }
}

