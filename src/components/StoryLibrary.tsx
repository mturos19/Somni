import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Trash2, Play, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Story {
  id: string;
  user_id: string;
  title: string;
  content: string;
  theme?: string;
  child_name?: string;
  created_at: string;
  updated_at: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadStories();
    }
  }, [user]);

  useEffect(() => {
    // Save current story if it exists
    if (currentStory && currentStory.title && currentStory.content && user) {
      saveCurrentStory();
    }
  }, [currentStory, user]);

  const loadStories = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setStories(data || []);
    } catch (error: any) {
      console.error('Error loading stories:', error);
      toast({
        title: "Failed to load stories",
        description: error.message || "Unable to fetch your stories",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveCurrentStory = async () => {
    if (!currentStory || !user) return;

    // Check if story already exists (avoid duplicates)
    const isDuplicate = stories.some((story) => 
      story.content === currentStory.content
    );

    if (!isDuplicate) {
      setIsSaving(true);
      try {
        const { data, error } = await supabase
          .from('stories')
          .insert({
            user_id: user.id,
            title: currentStory.title,
            content: currentStory.content
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        if (data) {
          setStories([data, ...stories]);
          toast({
            title: "Story saved!",
            description: `"${data.title}" has been added to your library`,
          });
        }
      } catch (error: any) {
        console.error('Error saving story:', error);
        toast({
          title: "Failed to save story",
          description: error.message || "Unable to save your story",
          variant: "destructive"
        });
      } finally {
        setIsSaving(false);
      }
    }
  };

  const deleteStory = async (storyId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      setStories(stories.filter(story => story.id !== storyId));
      
      toast({
        title: "Story deleted",
        description: "The story has been removed from your library",
      });
    } catch (error: any) {
      console.error('Error deleting story:', error);
      toast({
        title: "Failed to delete story",
        description: error.message || "Unable to delete the story",
        variant: "destructive"
      });
    }
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
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">
              Loading your magical stories...
            </p>
          </div>
        ) : stories.length === 0 ? (
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
                      {formatDate(story.created_at)}
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