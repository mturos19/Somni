import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Star, Crown, Sparkles } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const Pricing = () => {
  const navigate = useNavigate();
  const { subscription, tiers } = useSubscription();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleSubscribe = async (tierName: string) => {
    if (!user) {
      navigate('/login');
      return;
    }

    // For now, just show a toast - Stripe integration will be added later
    toast({
      title: "Coming Soon!",
      description: "Payment processing will be available soon. For now, enjoy the free tier!",
    });
  };

  const getTierIcon = (tierName: string) => {
    switch (tierName) {
      case 'family':
        return <Crown className="w-8 h-8 text-yellow-500" />;
      case 'premium':
        return <Sparkles className="w-8 h-8 text-purple-500" />;
      default:
        return <Star className="w-8 h-8 text-blue-500" />;
    }
  };

  const getTierFeatures = (tierName: string) => {
    switch (tierName) {
      case 'free':
        return [
          '5 stories per month',
          'Basic ElevenLabs voices',
          'Standard story themes',
          'Save up to 10 stories',
          'Community support'
        ];
      case 'premium':
        return [
          '50 stories per month',
          'Premium ElevenLabs voices',
          '1 custom voice clone',
          'Custom story themes',
          'Unlimited story library',
          'Download stories as MP3',
          'Sleep timer feature',
          'Story analytics'
        ];
      case 'family':
        return [
          '200 stories per month',
          'All premium voices',
          '5 custom voice clones',
          'Up to 4 family profiles',
          'Collaborative stories',
          'Advanced AI features',
          'Priority support',
          'Early access to features'
        ];
      default:
        return [];
    }
  };

  return (
    <div className="min-h-screen bg-gradient-starry">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-fredoka font-bold text-white mb-4">
            Choose Your Dream Plan
          </h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Unlock magical bedtime stories with AI-powered narration
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {tiers.map((tier) => {
            const isCurrentPlan = subscription?.tierName === tier.name;
            const features = getTierFeatures(tier.name);
            
            return (
              <Card 
                key={tier.id}
                className={`shadow-dreamy border-primary/20 relative ${
                  tier.name === 'premium' ? 'scale-105 border-2 border-purple-500' : ''
                }`}
              >
                {tier.name === 'premium' && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500">
                    MOST POPULAR
                  </Badge>
                )}
                
                <CardHeader className="text-center pb-6">
                  <div className="flex justify-center mb-4">
                    {getTierIcon(tier.name)}
                  </div>
                  <CardTitle className="text-2xl magical-text">
                    {tier.displayName}
                  </CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">
                      ${tier.price}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                
                <CardFooter>
                  <Button
                    onClick={() => handleSubscribe(tier.name)}
                    variant={tier.name === 'premium' ? 'magical' : 'outline'}
                    className="w-full"
                    disabled={isCurrentPlan}
                  >
                    {isCurrentPlan ? 'Current Plan' : `Choose ${tier.displayName}`}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-4xl mx-auto">
          <h2 className="text-3xl font-fredoka font-bold text-white text-center mb-8">
            Frequently Asked Questions
          </h2>
          
          <div className="grid gap-6">
            <Card className="shadow-dreamy border-primary/20">
              <CardHeader>
                <CardTitle>Can I change plans anytime?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately,
                  and we'll prorate any differences.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-dreamy border-primary/20">
              <CardHeader>
                <CardTitle>Do unused stories roll over?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Stories don't roll over month-to-month, but your saved stories in the library
                  are yours forever, even if you downgrade or cancel.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-dreamy border-primary/20">
              <CardHeader>
                <CardTitle>Is my child's data safe?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Absolutely! We take privacy seriously and comply with COPPA regulations.
                  We never share personal data and all stories are encrypted.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center mt-12">
          <Button 
            onClick={() => navigate('/')}
            variant="ghost"
            className="text-white hover:text-white/80"
          >
            ← Back to Stories
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
