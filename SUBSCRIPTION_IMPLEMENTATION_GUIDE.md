# Somni Subscription System Implementation Guide

## 🚀 Overview

This guide walks through the subscription tier system implementation for Somni. The system includes:
- 3 subscription tiers (Free, Premium, Family)
- Usage tracking and enforcement
- Supabase backend integration
- Frontend subscription management

## 📊 Subscription Tiers

### 1. **Dream Starter (Free)** - $0/month
- 5 stories per month
- Basic ElevenLabs voices only
- Save up to 10 stories
- Standard themes

### 2. **Sleep Magic (Premium)** - $9.99/month
- 50 stories per month
- Premium voices + 1 voice clone
- Unlimited story library
- Custom themes & MP3 downloads
- Sleep timer & analytics

### 3. **Bedtime Wonder (Family)** - $19.99/month
- 200 stories per month
- 5 voice clones
- 4 family profiles
- All premium features
- Priority support

## 🗄️ Database Setup

### Step 1: Run SQL Schema

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run the entire contents of `SUBSCRIPTION_SETUP.sql`

This creates:
- `subscription_tiers` table
- `user_subscriptions` table
- `usage_logs` table
- `monthly_usage` table
- RLS policies
- Helper functions
- Default tier data

### Step 2: Verify Installation

Run this query to check if tiers are installed:
```sql
SELECT * FROM subscription_tiers ORDER BY sort_order;
```

You should see 3 tiers: free, premium, and family.

## 🎨 Frontend Integration

### 1. **Subscription Context**
The `SubscriptionContext` provides:
- Current user subscription info
- Usage tracking
- Tier features
- Helper methods

```typescript
const { 
  subscription,     // Current subscription details
  usage,           // Monthly usage stats
  canGenerateStory, // Boolean check
  trackUsage       // Usage tracking function
} = useSubscription();
```

### 2. **Usage Enforcement**
Story generation is automatically limited based on subscription:
- UI shows remaining stories
- Generate button disabled when limit reached
- Helpful alerts guide users to upgrade

### 3. **Subscription Status Widget**
The sidebar widget displays:
- Current tier with icon
- Usage progress bars
- Feature badges
- Upgrade prompts

## 🔧 Key Components

### 1. **Database Functions**
- `get_user_subscription(user_id)` - Gets current subscription
- `get_user_monthly_usage(user_id)` - Gets usage stats
- `can_user_perform_action(user_id, action)` - Checks permissions

### 2. **Frontend Hooks**
- `useSubscription()` - Main subscription hook
- `useAuth()` - Authentication context

### 3. **Usage Tracking**
Actions are tracked automatically:
```typescript
await trackUsage('story_generated', { 
  title, 
  theme 
});
```

## 🚦 Testing the System

### 1. **Test Free Tier Limits**
1. Create a new account
2. Generate 5 stories
3. Verify the 6th story is blocked
4. Check upgrade prompts appear

### 2. **Test Usage Reset**
Monthly usage resets automatically. To test:
```sql
-- Manually reset usage for testing
DELETE FROM usage_logs WHERE user_id = 'YOUR_USER_ID';
DELETE FROM monthly_usage WHERE user_id = 'YOUR_USER_ID';
```

### 3. **Test Subscription Upgrade**
To manually upgrade a user (until Stripe is integrated):
```sql
-- Find tier IDs
SELECT id, name FROM subscription_tiers;

-- Update user subscription
UPDATE user_subscriptions 
SET tier_id = 'PREMIUM_TIER_ID'
WHERE user_id = 'USER_ID';
```

## 💳 Stripe Integration (Next Steps)

### 1. **Required Environment Variables**
```env
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 2. **Webhook Endpoints Needed**
- `/api/webhooks/stripe` - Handle subscription events
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 3. **Price IDs**
Update the `stripe_price_id` in subscription_tiers table with your Stripe price IDs.

## 🐛 Troubleshooting

### Issue: "No subscription found"
**Solution**: Check if user has entry in user_subscriptions table. The trigger should create one automatically on signup.

### Issue: "Usage not tracking"
**Solution**: Verify usage_logs table has INSERT permission for authenticated users.

### Issue: "Features not showing"
**Solution**: Check the features JSONB column in subscription_tiers table.

## 📝 Maintenance

### Monthly Tasks
- Monitor usage_logs table size
- Check for stuck subscriptions
- Review upgrade/downgrade patterns

### Queries for Monitoring
```sql
-- Active subscriptions by tier
SELECT 
  st.display_name,
  COUNT(*) as user_count
FROM user_subscriptions us
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active'
GROUP BY st.display_name;

-- Top users this month
SELECT 
  u.email,
  mu.story_count,
  st.display_name as tier
FROM monthly_usage mu
JOIN auth.users u ON mu.user_id = u.id
JOIN user_subscriptions us ON u.id = us.user_id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE mu.month = DATE_TRUNC('month', CURRENT_DATE)
ORDER BY mu.story_count DESC
LIMIT 10;
```

## 🎯 Next Steps

1. **Stripe Integration**
   - Set up Stripe products/prices
   - Implement checkout flow
   - Add webhook handlers

2. **Advanced Features**
   - Family profile management
   - Usage analytics dashboard
   - Referral system

3. **API Development**
   - Rate-limited public API
   - Developer portal
   - API key management

## 📧 Support

For implementation questions:
- Check Supabase logs for SQL errors
- Verify RLS policies are enabled
- Test with the SQL queries provided

Remember to test thoroughly in development before deploying to production!
