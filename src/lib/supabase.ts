import { createClient } from '@supabase/supabase-js';

// Create a single supabase client for interacting with your database
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[Supabase] Checking environment variables...');
console.log('[Supabase] URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING');
console.log('[Supabase] Key:', supabaseAnonKey ? 'Present' : 'MISSING');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

console.log('[Supabase] Creating client...');
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage for better performance
    storage: window.localStorage,
    // Auto refresh tokens
    autoRefreshToken: true,
    // Detect session in URL for auth flows
    detectSessionInUrl: true,
    // Persist session across browser sessions
    persistSession: true,
    // Reduce auth state change events
    flowType: 'pkce'
  },
  // Global fetch configuration for better performance
  global: {
    headers: {
      'X-Client-Info': 'somni-app'
    }
  }
});
console.log('[Supabase] Client created successfully');

// Database types
export interface Story {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  updated_at: string;
}

