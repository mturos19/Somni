import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] useEffect running - checking for existing session');
    
    // Add timeout to prevent infinite loading (reduced from 10s to 5s)
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.error('[AuthContext] Auth check timed out after 5 seconds');
        setIsLoading(false);
        setUser(null);
      }
    }, 5000);
    
    // Check for existing session
    checkUser().finally(() => {
      clearTimeout(timeoutId);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Auth state changed:', event);
      if (event === 'SIGNED_IN') {
        // Only call checkUser for SIGNED_IN, not TOKEN_REFRESHED to avoid redundant calls
        await checkUser();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false);
      } else if (event === 'TOKEN_REFRESHED') {
        // For token refresh, just update the user state without full checkUser call
        if (session?.user) {
          const fullName = session.user.user_metadata?.full_name || 
                          session.user.email?.split('@')[0] || 'User';
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: fullName
          });
        }
      }
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    console.log('[AuthContext] checkUser called');
    try {
      console.log('[AuthContext] Getting session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('[AuthContext] Session result:', { session: session ? 'exists' : 'null', error: sessionError });
      
      if (sessionError) {
        console.error('[AuthContext] Session error:', sessionError);
        setUser(null);
        setIsLoading(false);
        return;
      }
      
      if (session?.user) {
        // Use session user data directly without database query for better performance
        const fullName = session.user.user_metadata?.full_name || 
                        session.user.email?.split('@')[0] || 'User';
        
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: fullName
        });
        
        // Optionally fetch profile in background without blocking UI
        fetchUserProfileInBackground(session.user.id);
      } else {
        console.log('[AuthContext] No session found');
        setUser(null);
      }
    } catch (error) {
      console.error('[AuthContext] Error checking user:', error);
      setUser(null);
    } finally {
      console.log('[AuthContext] Setting isLoading to false');
      setIsLoading(false);
    }
  };

  const fetchUserProfileInBackground = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile && profile.full_name) {
        setUser(prev => prev ? { ...prev, name: profile.full_name } : null);
      }
    } catch (error) {
      // Silently fail - profile fetch is not critical for auth
      console.log('[AuthContext] Background profile fetch failed:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { error: error.message };
      }

      // Don't call checkUser() here - the auth state change listener will handle it
      return {};
    } catch (error: any) {
      return { error: error.message || 'An error occurred during sign in' };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) {
        return { error: error.message };
      }

      // Create user profile in background (don't wait for it)
      if (data.user) {
        supabase.from('profiles').insert({
          id: data.user.id,
          email: data.user.email,
          full_name: fullName
        }).then(() => {
          console.log('[AuthContext] Profile created successfully');
        }, (err) => {
          console.error('[AuthContext] Profile creation failed:', err);
        });
      }

      // Don't call checkUser() here - the auth state change listener will handle it
      return {};
    } catch (error: any) {
      return { error: error.message || 'An error occurred during sign up' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
