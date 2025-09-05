import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Trash2, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Story {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface StoryLibraryProps {
  onSelectStory: (title: string, content: string) => void;
  currentStory?: { title: string; content: string };
}

export const StoryLibrary: React.FC<StoryLibraryProps> = ({ 
  onSelectStory, 
  currentStory 
}) => {
  const [stories, setStories] = useState<Story[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadStories();
  }, []);

  useEffect(() => {
    // Save current story if it exists
    if (currentStory && currentStory.title && currentStory.content) {
      saveCurrentStory();
    }
  }, [currentStory]);

  const loadStories = () => {
    const savedStories = localStorage.getItem('bedtime-stories');
    if (savedStories) {
      setStories(JSON.parse(savedStories));
    }
  };

  const saveCurrentStory = () => {
    if (!currentStory) return;

    const storyId = `story-${Date.now()}`;
    const newStory: Story = {
      id: storyId,
      title: currentStory.title,
      content: currentStory.content,
      createdAt: new Date().toISOString(),
    };

    // Check if story already exists (avoid duplicates)
    const existingStories = JSON.parse(localStorage.getItem('bedtime-stories') || '[]');
    const isDuplicate = existingStories.some((story: Story) => 
      story.content === newStory.content
    );

    if (!isDuplicate) {
      const updatedStories = [newStory, ...existingStories];
      localStorage.setItem('bedtime-stories', JSON.stringify(updatedStories));
      setStories(updatedStories);
      
      toast({
        title: "Story saved!",
        description: `"${newStory.title}" has been added to your library`,
      });
    }
  };

  const deleteStory = (storyId: string) => {
    const updatedStories = stories.filter(story => story.id !== storyId);
    setStories(updatedStories);
    localStorage.setItem('bedtime-stories', JSON.stringify(updatedStories));
    
    toast({
      title: "Story deleted",
      description: "The story has been removed from your library",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Card className="shadow-dreamy border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-primary twinkling" />
          <div>
            <CardTitle className="magical-text">Story Library</CardTitle>
            <CardDescription>
              Your collection of magical bedtime stories
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stories.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">
              No stories yet. Generate your first bedtime story!
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stories.map((story) => (
              <div
                key={story.id}
                className="border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-fredoka font-medium text-sm text-foreground truncate">
                      {story.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-2">
                      {formatDate(story.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {story.content.substring(0, 100)}...
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      onClick={() => onSelectStory(story.title, story.content)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => deleteStory(story.id)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};