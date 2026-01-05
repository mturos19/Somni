const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface ClonedVoice {
  voice_id: string;
  name: string;
}

/**
 * Clone a voice from audio samples
 */
export async function cloneVoice(
  name: string,
  audioFiles: File[],
  description?: string
): Promise<ClonedVoice> {
  const formData = new FormData();
  formData.append("name", name);
  
  if (description) {
    formData.append("description", description);
  }

  // Add audio files (ElevenLabs accepts multiple samples)
  audioFiles.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY!,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.message || "Failed to clone voice");
  }

  return response.json();
}

/**
 * Generate speech from text using a specific voice
 */
export async function textToSpeech(
  text: string,
  voiceId: string,
  settings?: Partial<VoiceSettings>
): Promise<ArrayBuffer> {
  const defaultSettings: VoiceSettings = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.5,
    use_speaker_boost: true,
  };

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { ...defaultSettings, ...settings },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail?.message || "Failed to generate speech");
  }

  return response.arrayBuffer();
}

/**
 * Get list of available voices
 */
export async function getVoices(): Promise<{ voices: ClonedVoice[] }> {
  const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch voices");
  }

  return response.json();
}

/**
 * Delete a cloned voice
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
    method: "DELETE",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to delete voice");
  }
}

/**
 * Get default voice ID (Rachel - warm, friendly voice)
 */
export function getDefaultVoiceId(): string {
  return "21m00Tcm4TlvDq8ikWAM"; // Rachel voice
}

