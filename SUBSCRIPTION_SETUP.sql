-- Somni Subscription System Database Schema
-- Run this in your Supabase SQL Editor

-- 1. Create subscription tiers table
CREATE TABLE subscription_tiers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stripe_price_id TEXT, -- For Stripe integration
  story_limit INTEGER NOT NULL,
  voice_limit INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create user subscriptions table
CREATE TABLE user_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  tier_id UUID REFERENCES subscription_tiers NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, canceled, past_due, trialing
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 3. Create usage tracking table
CREATE TABLE usage_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL, -- 'story_generated', 'voice_cloned', 'story_played'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create monthly usage summary table (for efficient queries)
CREATE TABLE monthly_usage (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  month DATE NOT NULL,
  story_count INTEGER DEFAULT 0,
  voice_clone_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- 5. Enable Row Level Security
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies

-- Subscription tiers - readable by all authenticated users
CREATE POLICY "Users can view subscription tiers" ON subscription_tiers
  FOR SELECT USING (is_active = true);

-- User subscriptions - users can only see their own
CREATE POLICY "Users can view own subscription" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Usage logs - users can only see their own
CREATE POLICY "Users can view own usage logs" ON usage_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage logs" ON usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Monthly usage - users can only see their own
CREATE POLICY "Users can view own monthly usage" ON monthly_usage
  FOR SELECT USING (auth.uid() = user_id);

-- 7. Insert default subscription tiers
INSERT INTO subscription_tiers (name, display_name, price, story_limit, voice_limit, features, sort_order) VALUES
  ('free', 'Dream Starter', 0.00, 5, 0, 
   '{"max_saved_stories": 10, "basic_voices": true, "premium_voices": false, "custom_themes": false, "download_mp3": false}', 
   1),
  ('premium', 'Sleep Magic', 9.99, 50, 1,
   '{"max_saved_stories": -1, "basic_voices": true, "premium_voices": true, "custom_themes": true, "download_mp3": true, "sleep_timer": true, "story_analytics": true}',
   2),
  ('family', 'Bedtime Wonder', 19.99, 200, 5,
   '{"max_saved_stories": -1, "basic_voices": true, "premium_voices": true, "custom_themes": true, "download_mp3": true, "sleep_timer": true, "story_analytics": true, "family_profiles": 4, "collaborative_stories": true, "priority_support": true}',
   3);

-- 8. Create function to get user's current subscription with tier details
CREATE OR REPLACE FUNCTION get_user_subscription(user_uuid UUID)
RETURNS TABLE (
  subscription_id UUID,
  tier_name TEXT,
  tier_display_name TEXT,
  story_limit INTEGER,
  voice_limit INTEGER,
  features JSONB,
  status TEXT,
  current_period_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.id as subscription_id,
    st.name as tier_name,
    st.display_name as tier_display_name,
    st.story_limit,
    st.voice_limit,
    st.features,
    us.status,
    us.current_period_end
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = user_uuid
  AND us.status IN ('active', 'trialing')
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create function to get user's usage for current month
CREATE OR REPLACE FUNCTION get_user_monthly_usage(user_uuid UUID)
RETURNS TABLE (
  story_count INTEGER,
  voice_clone_count INTEGER,
  remaining_stories INTEGER,
  remaining_voices INTEGER
) AS $$
DECLARE
  current_month DATE;
  user_story_limit INTEGER;
  user_voice_limit INTEGER;
  usage_story_count INTEGER;
  usage_voice_count INTEGER;
BEGIN
  current_month := DATE_TRUNC('month', CURRENT_DATE);
  
  -- Get user's subscription limits
  SELECT st.story_limit, st.voice_limit 
  INTO user_story_limit, user_voice_limit
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = user_uuid
  AND us.status IN ('active', 'trialing')
  ORDER BY us.created_at DESC
  LIMIT 1;
  
  -- If no subscription, use free tier
  IF user_story_limit IS NULL THEN
    SELECT story_limit, voice_limit 
    INTO user_story_limit, user_voice_limit
    FROM subscription_tiers 
    WHERE name = 'free';
  END IF;
  
  -- Get usage for current month
  SELECT 
    COALESCE(SUM(CASE WHEN action = 'story_generated' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN action = 'voice_cloned' THEN 1 ELSE 0 END), 0)
  INTO usage_story_count, usage_voice_count
  FROM usage_logs
  WHERE user_id = user_uuid
  AND created_at >= current_month
  AND created_at < current_month + INTERVAL '1 month';
  
  RETURN QUERY
  SELECT 
    usage_story_count::INTEGER,
    usage_voice_count::INTEGER,
    GREATEST(user_story_limit - usage_story_count, 0)::INTEGER as remaining_stories,
    GREATEST(user_voice_limit - usage_voice_count, 0)::INTEGER as remaining_voices;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create trigger to update monthly_usage automatically
CREATE OR REPLACE FUNCTION update_monthly_usage()
RETURNS TRIGGER AS $$
DECLARE
  current_month DATE;
BEGIN
  current_month := DATE_TRUNC('month', NEW.created_at);
  
  INSERT INTO monthly_usage (user_id, month, story_count, voice_clone_count, play_count)
  VALUES (NEW.user_id, current_month, 0, 0, 0)
  ON CONFLICT (user_id, month) DO NOTHING;
  
  IF NEW.action = 'story_generated' THEN
    UPDATE monthly_usage 
    SET story_count = story_count + 1,
        updated_at = NOW()
    WHERE user_id = NEW.user_id AND month = current_month;
  ELSIF NEW.action = 'voice_cloned' THEN
    UPDATE monthly_usage 
    SET voice_clone_count = voice_clone_count + 1,
        updated_at = NOW()
    WHERE user_id = NEW.user_id AND month = current_month;
  ELSIF NEW.action = 'story_played' THEN
    UPDATE monthly_usage 
    SET play_count = play_count + 1,
        updated_at = NOW()
    WHERE user_id = NEW.user_id AND month = current_month;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_monthly_usage
  AFTER INSERT ON usage_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_usage();

-- 11. Create function to check if user can perform action
CREATE OR REPLACE FUNCTION can_user_perform_action(
  user_uuid UUID,
  action_type TEXT -- 'story' or 'voice'
)
RETURNS BOOLEAN AS $$
DECLARE
  usage_result RECORD;
BEGIN
  SELECT * INTO usage_result FROM get_user_monthly_usage(user_uuid);
  
  IF action_type = 'story' THEN
    RETURN usage_result.remaining_stories > 0;
  ELSIF action_type = 'voice' THEN
    RETURN usage_result.remaining_voices > 0;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Add subscription_id to profiles table
ALTER TABLE profiles ADD COLUMN subscription_tier TEXT DEFAULT 'free';

-- 13. Create view for easy access to user subscription info
CREATE VIEW user_subscription_info AS
SELECT 
  u.id as user_id,
  u.email,
  COALESCE(sub.tier_name, 'free') as tier_name,
  COALESCE(sub.tier_display_name, 'Dream Starter') as tier_display_name,
  COALESCE(sub.story_limit, 5) as story_limit,
  COALESCE(sub.voice_limit, 0) as voice_limit,
  COALESCE(sub.features, '{"max_saved_stories": 10, "basic_voices": true}'::jsonb) as features,
  COALESCE(sub.status, 'active') as status,
  sub.current_period_end
FROM auth.users u
LEFT JOIN LATERAL (
  SELECT * FROM get_user_subscription(u.id)
) sub ON true;

-- Grant access to the view
GRANT SELECT ON user_subscription_info TO authenticated;

-- 14. Function to automatically assign free tier to new users
CREATE OR REPLACE FUNCTION assign_free_tier_to_new_user()
RETURNS TRIGGER AS $$
DECLARE
  free_tier_id UUID;
BEGIN
  -- Get the free tier ID
  SELECT id INTO free_tier_id FROM subscription_tiers WHERE name = 'free' LIMIT 1;
  
  -- Insert subscription for new user
  INSERT INTO user_subscriptions (user_id, tier_id, status)
  VALUES (NEW.id, free_tier_id, 'active')
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION assign_free_tier_to_new_user();
