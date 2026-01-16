import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteVoice as deleteElevenLabsVoice } from "@/lib/elevenlabs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const voice = await prisma.voice.findUnique({
      where: { id },
    });

    if (!voice) {
      return NextResponse.json({ error: "Voice not found" }, { status: 404 });
    }

    if (voice.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete from ElevenLabs if it was cloned
    if (voice.elevenLabsId) {
      try {
        await deleteElevenLabsVoice(voice.elevenLabsId);
      } catch (error) {
        console.error("Failed to delete voice from ElevenLabs:", error);
        // Continue with local deletion even if ElevenLabs fails
      }
    }

    await prisma.voice.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting voice:", error);
    return NextResponse.json(
      { error: "Failed to delete voice" },
      { status: 500 }
    );
  }
}

