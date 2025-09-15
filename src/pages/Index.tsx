import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VoiceCloning } from '@/components/VoiceCloning';
import { StoryGenerator } from '@/components/StoryGenerator';
import { StoryPlayer } from '@/components/StoryPlayer';
import { StoryLibrary } from '@/components/StoryLibrary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Moon, Star, Sparkles, User, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import heroBedtime from '@/assets/hero-bedtime.jpg';

const Index = () => {
  const [clonedVoiceId, setClonedVoiceId] = useState('');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [currentStory, setCurrentStory] = useState({ title: '', content: '' });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleVoiceCloned = (voiceId: string, apiKey: string) => {
    setClonedVoiceId(voiceId);
    setElevenLabsApiKey(apiKey);
  };

  const handleStoryGenerated = (story: string, title: string) => {
    setCurrentStory({ title, content: story });
  };

  const handleStorySelected = (title: string, content: string) => {
    setCurrentStory({ title, content });
  };

  return (
    <div className="min-h-screen bg-gradient-starry">
      {/* Hero Section */}
      <div 
        className="relative h-96 bg-cover bg-center bg-no-repeat flex items-center justify-center"
        style={{ backgroundImage: `url(${heroBedtime})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-night-sky/30 to-night-sky/60"></div>
        
        {/* User Menu */}
        <div className="absolute top-4 right-4 z-20">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-3 py-2">
              <div className="w-6 h-6 rounded-full bg-gradient-magical flex items-center justify-center">
                <User className="w-3 h-3 text-white" />
              </div>
              <span className="text-white text-sm font-medium hidden sm:block">
                {user?.name || 'Guest'}
              </span>
            </div>
            <Button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              variant="outline"
              size="sm"
              className="bg-white/20 backdrop-blur-sm border-white/30 text-white hover:bg-white/30"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="relative text-center text-white z-10 px-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Moon className="w-8 h-8 floating" />
            <h1 className="text-4xl md:text-6xl font-fredoka font-bold">
              Somni
            </h1>
            <Star className="w-6 h-6 twinkling" />
          </div>
          <p className="text-lg md:text-xl font-comic opacity-90 max-w-2xl mx-auto">
            Create magical, personalized bedtime stories with AI voices
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <Sparkles className="w-4 h-4 twinkling" />
            <Sparkles className="w-3 h-3 twinkling animation-delay-300" />
            <Sparkles className="w-5 h-5 twinkling animation-delay-600" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="voice" className="w-full max-w-4xl mx-auto">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="voice" className="font-fredoka">
              Select Voice
            </TabsTrigger>
            <TabsTrigger value="generate" className="font-fredoka">
              Create Story
            </TabsTrigger>
            <TabsTrigger value="play" className="font-fredoka">
              Story Player
            </TabsTrigger>
            <TabsTrigger value="library" className="font-fredoka">
              Library
            </TabsTrigger>
          </TabsList>

          <TabsContent value="voice" className="space-y-6">
            <VoiceCloning 
              onVoiceCloned={handleVoiceCloned}
            />
            {clonedVoiceId && (
              <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-primary font-fredoka font-medium">
                  ✨ Voice selected successfully! Ready to create stories.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="generate" className="space-y-6">
            <StoryGenerator onStoryGenerated={handleStoryGenerated} />
          </TabsContent>

          <TabsContent value="play" className="space-y-6">
            {currentStory.content ? (
              <StoryPlayer
                story={currentStory.content}
                title={currentStory.title}
                voiceId={clonedVoiceId}
                elevenLabsApiKey={elevenLabsApiKey}
              />
            ) : (
              <div className="text-center p-12 bg-card rounded-xl border border-border">
                <Moon className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-fredoka font-medium text-muted-foreground mb-2">
                  No story to play
                </h3>
                <p className="text-muted-foreground">
                  Generate a story first, then come back here to listen!
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="library" className="space-y-6">
            <StoryLibrary 
              onSelectStory={handleStorySelected}
              currentStory={currentStory.content ? currentStory : undefined}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="text-center py-8 text-muted-foreground">
        <p className="font-comic">Sweet dreams and magical stories ✨</p>
      </footer>
    </div>
  );
};

export default Index;
