import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mic, MicOff, Upload, Wand2 } from 'lucide-react';
import magicMicIcon from '@/assets/magic-mic-icon.png';

interface VoiceCloningProps {
  onVoiceCloned: (voiceId: string) => void;
}

export const VoiceCloning: React.FC<VoiceCloningProps> = ({ onVoiceCloned }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      toast({
        title: "Recording started",
        description: "Speak clearly for at least 30 seconds for best results",
      });
    } catch (error) {
      toast({
        title: "Recording failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast({
        title: "Recording completed",
        description: "Audio captured successfully!",
      });
    }
  };

  const cloneVoice = async () => {
    if (!audioBlob || !apiKey || !voiceName) {
      toast({
        title: "Missing information",
        description: "Please provide API key, voice name, and record audio",
        variant: "destructive"
      });
      return;
    }

    setIsCloning(true);
    
    try {
      const formData = new FormData();
      formData.append('files', audioBlob, 'recording.wav');
      formData.append('name', voiceName);
      formData.append('description', `Cloned voice for bedtime stories - ${voiceName}`);

      const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to clone voice');
      }

      const result = await response.json();
      onVoiceCloned(result.voice_id);
      
      toast({
        title: "Voice cloned successfully!",
        description: `${voiceName} is ready to tell bedtime stories`,
      });
    } catch (error) {
      toast({
        title: "Voice cloning failed",
        description: "Please check your API key and try again",
        variant: "destructive"
      });
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Card className="shadow-dreamy border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <img src={magicMicIcon} alt="Magic Microphone" className="w-8 h-8 floating" />
          <div>
            <CardTitle className="magical-text">Clone Your Voice</CardTitle>
            <CardDescription>
              Record your voice to create personalized bedtime stories
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="api-key">ElevenLabs API Key</Label>
          <Input
            id="api-key"
            type="password"
            placeholder="Enter your ElevenLabs API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="voice-name">Voice Name</Label>
          <Input
            id="voice-name"
            placeholder="Mom's Bedtime Voice"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
          />
        </div>

        <div className="flex flex-col items-center space-y-4 p-6 bg-secondary/30 rounded-xl">
          <div className="text-center">
            <h3 className="font-fredoka font-medium text-lg mb-2">Record Your Voice</h3>
            <p className="text-muted-foreground text-sm">
              Speak naturally for 30-60 seconds. Read a short story or talk about your day.
            </p>
          </div>
          
          <div className="flex gap-4">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                variant="magical"
                size="lg"
                disabled={!apiKey || !voiceName}
              >
                <Mic className="mr-2 h-5 w-5" />
                Start Recording
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                variant="destructive"
                size="lg"
                className="animate-pulse"
              >
                <MicOff className="mr-2 h-5 w-5" />
                Stop Recording
              </Button>
            )}
          </div>

          {audioBlob && (
            <div className="w-full max-w-md">
              <audio controls className="w-full">
                <source src={URL.createObjectURL(audioBlob)} type="audio/wav" />
              </audio>
            </div>
          )}
        </div>

        <Button
          onClick={cloneVoice}
          variant="dreamy"
          size="lg"
          className="w-full"
          disabled={!audioBlob || !apiKey || !voiceName || isCloning}
        >
          {isCloning ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Cloning Voice...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-5 w-5" />
              Clone Voice
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};