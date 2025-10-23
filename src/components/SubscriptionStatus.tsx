import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Sparkles, Star, AlertCircle } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';

export const SubscriptionStatus: React.FC = () => {
  const { subscription, usage, isLoading } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="shadow-dreamy border-primary/20">
        <CardContent className="flex items-center justify-center p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription || !usage) return null;

  const getTierIcon = () => {
    switch (subscription.tierName) {
      case 'family':
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 'premium':
        return <Sparkles className="w-5 h-5 text-purple-500" />;
      default:
        return <Star className="w-5 h-5 text-blue-500" />;
    }
  };

  const getTierColor = () => {
    switch (subscription.tierName) {
      case 'family':
        return 'bg-gradient-to-r from-yellow-500 to-orange-500';
      case 'premium':
        return 'bg-gradient-to-r from-purple-500 to-pink-500';
      default:
        return 'bg-gradient-to-r from-blue-500 to-cyan-500';
    }
  };

  const storyPercentage = subscription.storyLimit > 0 
    ? ((subscription.storyLimit - usage.remainingStories) / subscription.storyLimit) * 100
    : 0;

  const shouldShowUpgrade = subscription.tierName === 'free' || 
    (subscription.tierName === 'premium' && usage.remainingStories < 5);

  return (
    <Card className="shadow-dreamy border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getTierIcon()}
            <CardTitle className="text-lg">{subscription.tierDisplayName}</CardTitle>
          </div>
          <Badge className={getTierColor()}>
            {subscription.tierName.toUpperCase()}
          </Badge>
        </div>
        <CardDescription>
          Your subscription status and usage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Story Usage */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Stories this month</span>
            <span className="font-medium">
              {usage.storyCount} / {subscription.storyLimit === -1 ? '∞' : subscription.storyLimit}
            </span>
          </div>
          {subscription.storyLimit > 0 && (
            <Progress value={storyPercentage} className="h-2" />
          )}
          {usage.remainingStories === 0 && (
            <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span>You've reached your monthly story limit</span>
            </div>
          )}
        </div>

        {/* Voice Cloning Usage */}
        {subscription.voiceLimit > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Voice clones</span>
              <span className="font-medium">
                {usage.voiceCloneCount} / {subscription.voiceLimit}
              </span>
            </div>
            <Progress 
              value={(usage.voiceCloneCount / subscription.voiceLimit) * 100} 
              className="h-2" 
            />
          </div>
        )}

        {/* Features */}
        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium text-muted-foreground">Your features:</p>
          <div className="flex flex-wrap gap-2">
            {subscription.features.basicVoices && (
              <Badge variant="secondary" className="text-xs">Basic Voices</Badge>
            )}
            {subscription.features.premiumVoices && (
              <Badge variant="secondary" className="text-xs">Premium Voices</Badge>
            )}
            {subscription.features.customThemes && (
              <Badge variant="secondary" className="text-xs">Custom Themes</Badge>
            )}
            {subscription.features.downloadMp3 && (
              <Badge variant="secondary" className="text-xs">MP3 Download</Badge>
            )}
            {subscription.features.sleepTimer && (
              <Badge variant="secondary" className="text-xs">Sleep Timer</Badge>
            )}
            {subscription.features.familyProfiles && (
              <Badge variant="secondary" className="text-xs">
                {subscription.features.familyProfiles} Family Profiles
              </Badge>
            )}
          </div>
        </div>

        {/* Upgrade CTA */}
        {shouldShowUpgrade && (
          <div className="pt-2">
            <Button 
              onClick={() => navigate('/pricing')}
              variant="magical"
              className="w-full"
              size="sm"
            >
              {subscription.tierName === 'free' 
                ? 'Upgrade for more stories' 
                : 'Running low? Upgrade to Family'}
            </Button>
          </div>
        )}

        {/* Period End Date */}
        {subscription.currentPeriodEnd && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
