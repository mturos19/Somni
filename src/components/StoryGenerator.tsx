import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Sparkles, Wand2, AlertCircle } from 'lucide-react';
import magicBookIcon from '@/assets/magic-book-icon.png';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StoryGeneratorProps {
  onStoryGenerated: (story: string, title: string) => void;
}

export const StoryGenerator: React.FC<StoryGeneratorProps> = ({ onStoryGenerated }) => {
  const [apiKey, setApiKey] = useState('');
  const [childName, setChildName] = useState('');
  const [storyTheme, setStoryTheme] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const { subscription, usage, canGenerateStory, trackUsage } = useSubscription();

  const generateStory = async () => {
    if (!apiKey || !childName) {
      toast({
        title: "Missing information",
        description: "Please provide your OpenAI API key and child's name",
        variant: "destructive"
      });
      return;
    }

    if (!canGenerateStory) {
      toast({
        title: "Story limit reached",
        description: "You've reached your monthly story limit. Upgrade your plan for more stories!",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    const prompt = customPrompt || `Write a gentle, magical bedtime story for a child named ${childName}${storyTheme ? ` about ${storyTheme}` : ''}. The story should be warm, comforting, and appropriate for bedtime. Include positive themes like friendship, kindness, or adventure. Make it about 200-300 words long with simple, beautiful language that flows well when read aloud. End with a peaceful, sleepy conclusion.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a gentle storyteller who creates beautiful, comforting bedtime stories for children. Your stories are magical, kind, and perfect for helping children drift off to sleep.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate story');
      }

      const result = await response.json();
      const story = result.choices[0].message.content;
      
      // Generate a title
      const titleResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: `Create a short, magical title (3-6 words) for this bedtime story: ${story.substring(0, 200)}...`
            }
          ],
          max_tokens: 20,
          temperature: 0.7,
        }),
      });

      const titleResult = await titleResponse.json();
      const title = titleResult.choices[0].message.content.replace(/['"]/g, '');

      // Track usage
      await trackUsage('story_generated', {
        title,
        theme: storyTheme,
        child_name: childName
      });

      onStoryGenerated(story, title);
      
      toast({
        title: "Story created!",
        description: `"${title}" is ready to be told`,
      });
    } catch (error) {
      toast({
        title: "Story generation failed",
        description: "Please check your API key and try again",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const quickThemes = [
    "a magical forest adventure",
    "friendly dragons and castles",
    "underwater mermaids and sea creatures",
    "space exploration with friendly aliens",
    "a cozy cabin in the mountains",
    "talking animals in a garden"
  ];

  return (
    <Card className="shadow-dreamy border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <img src={magicBookIcon} alt="Magic Book" className="w-8 h-8 floating" />
          <div>
            <CardTitle className="magical-text">Create a Story</CardTitle>
            <CardDescription>
              Generate personalized bedtime stories with AI
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage Alert */}
        {usage && usage.remainingStories <= 3 && usage.remainingStories > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You have {usage.remainingStories} {usage.remainingStories === 1 ? 'story' : 'stories'} remaining this month.
              {subscription?.tierName === 'free' && ' Upgrade for more!'}
            </AlertDescription>
          </Alert>
        )}
        
        {!canGenerateStory && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You've reached your monthly story limit. Upgrade your plan to continue creating magical stories!
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="openai-key">OpenAI API Key</Label>
          <Input
            id="openai-key"
            type="password"
            placeholder="Enter your OpenAI API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="child-name">Child's Name</Label>
          <Input
            id="child-name"
            placeholder="Enter your child's name"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <Label>Story Theme (optional)</Label>
          <div className="grid grid-cols-2 gap-2">
            {quickThemes.map((theme, index) => (
              <Button
                key={index}
                variant="story"
                size="sm"
                onClick={() => setStoryTheme(theme)}
                className={storyTheme === theme ? 'bg-primary text-primary-foreground' : ''}
              >
                {theme}
              </Button>
            ))}
          </div>
          <Input
            placeholder="Or write your own theme..."
            value={storyTheme}
            onChange={(e) => setStoryTheme(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-prompt">Custom Story Prompt (optional)</Label>
          <Textarea
            id="custom-prompt"
            placeholder="Write a specific story prompt if you want full control over the story..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={3}
          />
        </div>

        <Button
          onClick={generateStory}
          variant="magical"
          size="lg"
          className="w-full"
          disabled={!apiKey || !childName || isGenerating || !canGenerateStory}
        >
          {isGenerating ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Creating Magic...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Generate Story
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};