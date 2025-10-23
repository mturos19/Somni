import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

const TestSupabase: React.FC = () => {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testEnvironmentVars = () => {
    addResult('=== Testing Environment Variables ===');
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    addResult(`URL: ${url ? 'Set ✓' : 'MISSING ✗'}`);
    addResult(`Key: ${key ? 'Set ✓' : 'MISSING ✗'}`);
    
    if (url) {
      addResult(`URL Value: ${url.substring(0, 40)}...`);
    }
  };

  const testSupabaseConnection = async () => {
    setLoading(true);
    addResult('=== Testing Supabase Connection ===');
    
    try {
      // Test 1: Check if we can get session
      addResult('Testing auth.getSession()...');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        addResult(`❌ Session Error: ${sessionError.message}`);
      } else {
        addResult(`✓ Session check successful. User: ${sessionData.session?.user?.email || 'No user'}`);
      }
      
      // Test 2: Try to query a table (will fail if not authenticated, but shows connectivity)
      addResult('Testing database query...');
      const { data, error, count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        if (error.message.includes('JWT')) {
          addResult('⚠️ Database query requires authentication (expected)');
        } else {
          addResult(`❌ Database Error: ${error.message}`);
        }
      } else {
        addResult(`✓ Database connected! Profile count: ${count || 0}`);
      }
      
      // Test 3: Check auth endpoint
      addResult('Testing auth endpoint...');
      const testEmail = `test${Date.now()}@example.com`;
      const { error: signUpError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'testpassword123'
      });
      
      if (signUpError) {
        addResult(`⚠️ Auth test: ${signUpError.message}`);
      } else {
        addResult('✓ Auth endpoint is reachable!');
        // Clean up test user
        await supabase.auth.signOut();
      }
      
    } catch (error: any) {
      addResult(`❌ Unexpected error: ${error.message}`);
      console.error('Test error:', error);
    } finally {
      setLoading(false);
      addResult('=== Tests Complete ===');
    }
  };

  const clearResults = () => setResults([]);

  return (
    <div className="min-h-screen bg-gradient-starry p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Supabase Connection Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={testEnvironmentVars} disabled={loading}>
                Test Environment Variables
              </Button>
              <Button onClick={testSupabaseConnection} disabled={loading}>
                Test Supabase Connection
              </Button>
              <Button onClick={clearResults} variant="outline">
                Clear Results
              </Button>
            </div>
            
            <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              {results.length === 0 ? (
                <div>Click a button to start testing...</div>
              ) : (
                results.map((result, index) => (
                  <div key={index}>{result}</div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TestSupabase;
