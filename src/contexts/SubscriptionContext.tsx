import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface SubscriptionTier {
  id: string;
  name: string;
  displayName: string;
  price: number;
  storyLimit: number;
  voiceLimit: number;
  features: {
    maxSavedStories: number;
    basicVoices: boolean;
    premiumVoices: boolean;
    customThemes: boolean;
    downloadMp3: boolean;
    sleepTimer?: boolean;
    storyAnalytics?: boolean;
    familyProfiles?: number;
    collaborativeStories?: boolean;
    prioritySupport?: boolean;
  };
}

export interface UserSubscription {
  subscriptionId?: string;
  tierName: string;
  tierDisplayName: string;
  storyLimit: number;
  voiceLimit: number;
  features: any;
  status: string;
  currentPeriodEnd?: string;
}

export interface UsageData {
  storyCount: number;
  voiceCloneCount: number;
  remainingStories: number;
  remainingVoices: number;
}

interface SubscriptionContextType {
  subscription: UserSubscription | null;
  usage: UsageData | null;
  tiers: SubscriptionTier[];
  isLoading: boolean;
  canGenerateStory: boolean;
  canCloneVoice: boolean;
  trackUsage: (action: 'story_generated' | 'voice_cloned' | 'story_played', metadata?: any) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  refreshUsage: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

interface SubscriptionProviderProps {
  children: ReactNode;
}

export const SubscriptionProvider: React.FC<SubscriptionProviderProps> = ({ children }) => {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Load subscription tiers on mount
  useEffect(() => {
    loadSubscriptionTiers();
  }, []);

  // Load user subscription and usage when user changes
  useEffect(() => {
    if (user) {
      loadUserSubscription();
      loadUserUsage();
    } else {
      setSubscription(null);
      setUsage(null);
      setIsLoading(false);
    }
  }, [user]);

  const loadSubscriptionTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;

      const mappedTiers: SubscriptionTier[] = (data || []).map(tier => ({
        id: tier.id,
        name: tier.name,
        displayName: tier.display_name,
        price: parseFloat(tier.price),
        storyLimit: tier.story_limit,
        voiceLimit: tier.voice_limit,
        features: {
          maxSavedStories: tier.features.max_saved_stories || 10,
          basicVoices: tier.features.basic_voices || false,
          premiumVoices: tier.features.premium_voices || false,
          customThemes: tier.features.custom_themes || false,
          downloadMp3: tier.features.download_mp3 || false,
          sleepTimer: tier.features.sleep_timer,
          storyAnalytics: tier.features.story_analytics,
          familyProfiles: tier.features.family_profiles,
          collaborativeStories: tier.features.collaborative_stories,
          prioritySupport: tier.features.priority_support,
        }
      }));

      setTiers(mappedTiers);
    } catch (error) {
      console.error('Error loading subscription tiers:', error);
    }
  };

  const loadUserSubscription = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_subscription', { user_uuid: user.id });

      if (error) throw error;

      if (data && data.length > 0) {
        const sub = data[0];
        setSubscription({
          subscriptionId: sub.subscription_id,
          tierName: sub.tier_name,
          tierDisplayName: sub.tier_display_name,
          storyLimit: sub.story_limit,
          voiceLimit: sub.voice_limit,
          features: sub.features,
          status: sub.status,
          currentPeriodEnd: sub.current_period_end
        });
      } else {
        // User has no subscription, set to free tier
        setSubscription({
          tierName: 'free',
          tierDisplayName: 'Dream Starter',
          storyLimit: 5,
          voiceLimit: 0,
          features: {
            maxSavedStories: 10,
            basicVoices: true,
            premiumVoices: false,
            customThemes: false,
            downloadMp3: false
          },
          status: 'active'
        });
      }
    } catch (error) {
      console.error('Error loading user subscription:', error);
      // Default to free tier on error
      setSubscription({
        tierName: 'free',
        tierDisplayName: 'Dream Starter',
        storyLimit: 5,
        voiceLimit: 0,
        features: {
          maxSavedStories: 10,
          basicVoices: true,
          premiumVoices: false,
          customThemes: false,
          downloadMp3: false
        },
        status: 'active'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserUsage = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_monthly_usage', { user_uuid: user.id });

      if (error) throw error;

      if (data && data.length > 0) {
        const usageData = data[0];
        setUsage({
          storyCount: usageData.story_count,
          voiceCloneCount: usageData.voice_clone_count,
          remainingStories: usageData.remaining_stories,
          remainingVoices: usageData.remaining_voices
        });
      }
    } catch (error) {
      console.error('Error loading user usage:', error);
      // Set default usage on error
      setUsage({
        storyCount: 0,
        voiceCloneCount: 0,
        remainingStories: subscription?.storyLimit || 5,
        remainingVoices: subscription?.voiceLimit || 0
      });
    }
  };

  const trackUsage = async (action: 'story_generated' | 'voice_cloned' | 'story_played', metadata?: any) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('usage_logs')
        .insert({
          user_id: user.id,
          action,
          metadata: metadata || {}
        });

      if (error) throw error;

      // Refresh usage data after tracking
      await loadUserUsage();
    } catch (error) {
      console.error('Error tracking usage:', error);
    }
  };

  const refreshSubscription = async () => {
    await loadUserSubscription();
  };

  const refreshUsage = async () => {
    await loadUserUsage();
  };

  const canGenerateStory = usage ? usage.remainingStories > 0 : false;
  const canCloneVoice = usage ? usage.remainingVoices > 0 : false;

  const value: SubscriptionContextType = {
    subscription,
    usage,
    tiers,
    isLoading,
    canGenerateStory,
    canCloneVoice,
    trackUsage,
    refreshSubscription,
    refreshUsage
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
