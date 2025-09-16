import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Moon, Star, Sparkles, LogIn, Shield, User, Lock, Eye, EyeOff } from 'lucide-react';
import heroBedtime from '@/assets/hero-bedtime.jpg';


const Login: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, signUp } = useAuth();
  
  // Get the page user was trying to access
  const from = location.state?.from?.pathname || '/';


  // Check if user is already logged in
  React.useEffect(() => {
    if (user) {
      // If user is already logged in, redirect to main app
      navigate(from, { replace: true });
    }
  }, [user, from, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validation
      if (!email || !password) {
        toast({
          title: "Missing information",
          description: "Please fill in all fields",
          variant: "destructive"
        });
        return;
      }

      // Sign in with Supabase
      const { error } = await signIn(email, password);
      
      if (error) {
        toast({
          title: "Login failed",
          description: error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Welcome back! ✨",
        description: "Ready for magical bedtime stories?",
      });

      // The redirect will happen automatically via useEffect when user state updates

    } catch (error) {
      toast({
        title: "Login failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validation
      if (!name || !email || !password) {
        toast({
          title: "Missing information",
          description: "Please fill in all fields",
          variant: "destructive"
        });
        return;
      }

      // Sign up with Supabase
      const { error } = await signUp(email, password, name);
      
      if (error) {
        toast({
          title: "Sign up failed",
          description: error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Account created! ✨",
        description: `Welcome ${name}, let's create magical stories!`,
      });

      // The redirect will happen automatically via useEffect when user state updates

    } catch (error) {
      toast({
        title: "Sign up failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-starry">
      {/* Hero Section */}
      <div 
        className="relative h-96 bg-cover bg-center bg-no-repeat flex items-center justify-center"
        style={{ backgroundImage: `url(${heroBedtime})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-night-sky/30 to-night-sky/60"></div>
        <div className="relative text-center text-white z-10 px-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Moon className="w-8 h-8 floating" />
            <h1 className="text-4xl md:text-6xl font-fredoka font-bold">
              Welcome to Somni
            </h1>
            <Star className="w-6 h-6 twinkling" />
          </div>
          <p className="text-lg md:text-xl font-comic opacity-90 max-w-2xl mx-auto">
            Sign in to create magical, personalized bedtime stories
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <Sparkles className="w-4 h-4 twinkling" />
            <Sparkles className="w-3 h-3 twinkling animation-delay-300" />
            <Sparkles className="w-5 h-5 twinkling animation-delay-600" />
          </div>
        </div>
      </div>

      {/* Login Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
            <Card className="shadow-dreamy border-primary/20">
              <CardHeader className="text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Shield className="w-8 h-8 text-primary floating" />
                </div>
                <CardTitle className="magical-text">
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </CardTitle>
                <CardDescription>
                  {isSignUp 
                    ? 'Join the magical world of bedtime stories' 
                    : 'Enter the magical world of bedtime stories'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={isSignUp ? handleSignUp : handleLogin} className="space-y-4">
                  {isSignUp && (
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="name"
                          type="text"
                          placeholder="Enter your full name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <Button
                    type="submit"
                    variant="dreamy"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {isSignUp ? 'Creating Account...' : 'Signing In...'}
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        {isSignUp ? 'Create Account' : 'Sign In'}
                      </>
                    )}
                  </Button>
                </form>
                
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm text-primary hover:underline"
                  >
                    {isSignUp 
                      ? 'Already have an account? Sign in' 
                      : "Don't have an account? Sign up"
                    }
                  </button>
                </div>

                <div className="p-4 bg-secondary/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-primary mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium mb-1">Secure Login</p>
                      <p>
                        Your credentials are stored locally and validated securely. 
                        Create an account to get started with magical bedtime stories!
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-8 text-muted-foreground">
        <p className="font-comic">Sweet dreams and magical stories ✨</p>
      </footer>
    </div>
  );
};

export default Login;
