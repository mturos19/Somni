import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Wand2, Volume2 } from 'lucide-react';
import magicMicIcon from '@/assets/magic-mic-icon.png';

interface VoiceCloningProps {
  onVoiceCloned: (voiceId: string, apiKey: string) => void;
}

// Default ElevenLabs voices that work with free tier
const DEFAULT_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Calm and soothing female voice' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', description: 'Warm and friendly female voice' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Gentle male voice' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', description: 'Deep and reassuring male voice' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Clear and articulate male voice' },
  { id: 'Yko7PKHZNXotIFUBG7I9', name: 'Domi', description: 'Young and energetic female voice' },
  { id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Mimi', description: 'Childlike and playful female voice' },
];

export const VoiceCloning: React.FC<VoiceCloningProps> = ({ onVoiceCloned }) => {
  const [apiKey, setApiKey] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const { toast } = useToast();

  const handleVoiceSelection = () => {
    if (!apiKey || !selectedVoice) {
      toast({
        title: "Missing information",
        description: "Please provide API key and select a voice",
        variant: "destructive"
      });
      return;
    }

    // Pass both voice ID and API key
    onVoiceCloned(selectedVoice, apiKey);
    
    const voiceName = DEFAULT_VOICES.find(v => v.id === selectedVoice)?.name || 'Selected voice';
    toast({
      title: "Voice selected successfully!",
      description: `${voiceName} is ready to tell bedtime stories`,
    });
  };

  const testVoice = async () => {
    if (!apiKey || !selectedVoice) {
      toast({
        title: "Missing information",
        description: "Please provide API key and select a voice",
        variant: "destructive"
      });
      return;
    }

    setIsTestingVoice(true);

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: "Once upon a time, in a magical forest filled with twinkling stars...",
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate test speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      await audio.play();

      toast({
        title: "Voice preview playing",
        description: "Listen to how the stories will sound",
      });
    } catch (error) {
      toast({
        title: "Test failed",
        description: "Please check your API key and try again",
        variant: "destructive"
      });
    } finally {
      setIsTestingVoice(false);
    }
  };

  return (
    <Card className="shadow-dreamy border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <img src={magicMicIcon} alt="Magic Microphone" className="w-8 h-8 floating" />
          <div>
            <CardTitle className="magical-text">Select Story Voice</CardTitle>
            <CardDescription>
              Choose a magical voice for your bedtime stories
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
          <p className="text-xs text-muted-foreground">
            Works with free tier API keys - no voice cloning needed!
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="voice-select">Choose a Voice</Label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger id="voice-select">
              <SelectValue placeholder="Select a storyteller voice" />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_VOICES.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{voice.name}</span>
                    <span className="text-xs text-muted-foreground">{voice.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-4">
          <Button
            onClick={testVoice}
            variant="outline"
            disabled={!apiKey || !selectedVoice || isTestingVoice}
            className="flex-1"
          >
            {isTestingVoice ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Testing...
              </>
            ) : (
              <>
                <Volume2 className="mr-2 h-4 w-4" />
                Test Voice
              </>
            )}
          </Button>

          <Button
            onClick={handleVoiceSelection}
            variant="dreamy"
            disabled={!apiKey || !selectedVoice}
            className="flex-1"
          >
            <Wand2 className="mr-2 h-5 w-5" />
            Use This Voice
          </Button>
        </div>

        <div className="p-4 bg-secondary/30 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Tip:</strong> These voices work with free ElevenLabs accounts. 
            For personalized voice cloning, upgrade to a paid plan.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};