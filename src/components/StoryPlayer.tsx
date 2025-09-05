import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, Square, Volume2 } from 'lucide-react';

interface StoryPlayerProps {
  story: string;
  title: string;
  voiceId: string;
  elevenLabsApiKey: string;
}

export const StoryPlayer: React.FC<StoryPlayerProps> = ({ 
  story, 
  title, 
  voiceId, 
  elevenLabsApiKey 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const words = story.split(/\s+/);

  const generateSpeech = async () => {
    if (!elevenLabsApiKey || !voiceId) {
      toast({
        title: "Missing configuration",
        description: "Please clone a voice first and ensure API key is provided",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: story,
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
        throw new Error('Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      // Create audio element
      const audio = new Audio(url);
      audioRef.current = audio;

      // Set up time update listener for karaoke effect
      const totalDuration = await new Promise<number>((resolve) => {
        audio.addEventListener('loadedmetadata', () => {
          resolve(audio.duration);
        });
      });

      const timePerWord = totalDuration / words.length;

      audio.addEventListener('timeupdate', () => {
        const currentTime = audio.currentTime;
        const wordIndex = Math.floor(currentTime / timePerWord);
        setCurrentWordIndex(Math.min(wordIndex, words.length - 1));
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
      });

      toast({
        title: "Story is ready!",
        description: "Click play to start the magical bedtime story",
      });
    } catch (error) {
      toast({
        title: "Speech generation failed",
        description: "Please check your API key and try again",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const playStory = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseStory = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const stopStory = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentWordIndex(-1);
    }
  };

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <Card className="shadow-dreamy border-primary/20">
      <CardHeader>
        <CardTitle className="magical-text text-center text-xl">
          {title || "Your Bedtime Story"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-center gap-4">
          {!audioUrl ? (
            <Button
              onClick={generateSpeech}
              variant="magical"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Preparing Voice...
                </>
              ) : (
                <>
                  <Volume2 className="mr-2 h-5 w-5" />
                  Prepare Story
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                onClick={isPlaying ? pauseStory : playStory}
                variant="dreamy"
                size="lg"
              >
                {isPlaying ? (
                  <>
                    <Pause className="mr-2 h-5 w-5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Play
                  </>
                )}
              </Button>
              <Button onClick={stopStory} variant="outline" size="lg">
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </>
          )}
        </div>

        <div className="bg-card border-2 border-primary/10 rounded-xl p-6 story-text">
          <p className="leading-relaxed">
            {words.map((word, index) => (
              <span
                key={index}
                className={`${
                  index === currentWordIndex
                    ? 'karaoke-highlight'
                    : index < currentWordIndex
                    ? 'text-primary/70'
                    : ''
                } transition-all duration-300`}
              >
                {word}{' '}
              </span>
            ))}
          </p>
        </div>

        {currentWordIndex >= 0 && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              Reading aloud...
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};