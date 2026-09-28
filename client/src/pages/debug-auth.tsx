import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function DebugAuth() {
  const [email, setEmail] = useState('teacher@learnify.com');
  const [password, setPassword] = useState('Teacher123');
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(`[DEBUG AUTH] ${message}`);
  };

  const testLogin = async () => {
    setLoading(true);
    setLogs([]);
    addLog('🔵 Starting login test...');

    try {
      addLog(`📤 Preparing request to /api/auth/login`);
      addLog(`📧 Email: ${email}`);
      addLog(`🔑 Password: ${password.substring(0, 3)}***`);

      const requestBody = { email, password };
      addLog(`📦 Request body: ${JSON.stringify(requestBody)}`);

      addLog('🌐 Sending fetch request...');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        credentials: 'include',
      });

      addLog(`✅ Response received! Status: ${response.status} ${response.statusText}`);
      addLog(`📄 Response headers: ${JSON.stringify([...response.headers.entries()])}`);

      const responseText = await response.text();
      addLog(`📨 Response body (raw): ${responseText}`);

      if (response.ok) {
        const data = JSON.parse(responseText);
        addLog(`✅ SUCCESS! User: ${data.user?.email}, Role: ${data.user?.role}`);
        addLog(`🔑 Token length: ${data.token?.length || 0}`);
      } else {
        addLog(`❌ FAILED! Status: ${response.status}`);
        try {
          const errorData = JSON.parse(responseText);
          addLog(`❌ Error: ${errorData.error || 'Unknown error'}`);
        } catch {
          addLog(`❌ Error response: ${responseText}`);
        }
      }
    } catch (error: any) {
      addLog(`💥 EXCEPTION THROWN: ${error.message}`);
      addLog(`💥 Error stack: ${error.stack}`);
      console.error('[DEBUG AUTH] Full error:', error);
    } finally {
      setLoading(false);
      addLog('🏁 Test complete');
    }
  };

  const testSignup = async () => {
    setLoading(true);
    setLogs([]);
    addLog('🔵 Starting signup test...');

    try {
      const randomEmail = `test${Date.now()}@test.com`;
      addLog(`📤 Preparing request to /api/auth/signup`);
      addLog(`📧 Email: ${randomEmail}`);

      const requestBody = { 
        email: randomEmail, 
        password: 'Test123456', 
        name: 'Debug User',
        role: 'student' 
      };
      addLog(`📦 Request body: ${JSON.stringify(requestBody)}`);

      addLog('🌐 Sending fetch request...');
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      addLog(`✅ Response received! Status: ${response.status} ${response.statusText}`);
      const responseText = await response.text();
      addLog(`📨 Response body: ${responseText}`);

      if (response.ok) {
        const data = JSON.parse(responseText);
        addLog(`✅ SUCCESS! User: ${data.user?.email}, Role: ${data.user?.role}`);
      } else {
        addLog(`❌ FAILED! Status: ${response.status}`);
      }
    } catch (error: any) {
      addLog(`💥 EXCEPTION: ${error.message}`);
      console.error('[DEBUG AUTH] Full error:', error);
    } finally {
      setLoading(false);
      addLog('🏁 Test complete');
    }
  };

  const testDirectFetch = async () => {
    setLoading(true);
    setLogs([]);
    addLog('🔵 Testing direct fetch to server...');

    try {
      addLog('🌐 Fetching /api/auth/me (should return 401)...');
      const response = await fetch('/api/auth/me');
      addLog(`✅ Response: ${response.status} ${response.statusText}`);
      const text = await response.text();
      addLog(`📨 Body: ${text}`);
    } catch (error: any) {
      addLog(`💥 EXCEPTION: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>🔧 Auth Debug Console</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="debug-email">Email</Label>
                <Input
                  id="debug-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-debug-email"
                />
              </div>
              <div>
                <Label htmlFor="debug-password">Password</Label>
                <Input
                  id="debug-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-debug-password"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button 
                onClick={testLogin}
                disabled={loading}
                data-testid="button-test-login"
              >
                Test Login
              </Button>
              <Button 
                onClick={testSignup}
                disabled={loading}
                variant="secondary"
                data-testid="button-test-signup"
              >
                Test Signup
              </Button>
              <Button 
                onClick={testDirectFetch}
                disabled={loading}
                variant="outline"
                data-testid="button-test-fetch"
              >
                Test Direct Fetch
              </Button>
              <Button 
                onClick={() => setLogs([])}
                disabled={loading}
                variant="outline"
                data-testid="button-clear-logs"
              >
                Clear Logs
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📋 Debug Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-md max-h-[500px] overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No logs yet. Click a test button above.</p>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {logs.map((log, i) => (
                    <div key={i} className="text-foreground" data-testid={`log-${i}`}>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
