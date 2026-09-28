import { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@shared/schema';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, name: string, role: 'teacher' | 'student', school: string, subject?: string) => Promise<User>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false); // Added isLoading state

  useEffect(() => {
    console.log('[Auth] Component mounted, checking authentication...');
    console.log('[Auth] LocalStorage keys available:', Object.keys(localStorage));
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('auth_token');
    console.log('[Auth] checkAuth called');
    console.log('[Auth] Token found?', !!storedToken);
    
    if (!storedToken) {
      console.log('[Auth] No token, user not authenticated');
      setLoading(false);
      return;
    }

    console.log('[Auth] Token exists, verifying with server...');
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${storedToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('[Auth] User verified:', userData.email, 'Role:', userData.role);
        setUser(userData);
        setToken(storedToken);
      } else {
        console.log('[Auth] Token invalid, removing from storage');
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.error('[Auth] Auth check failed:', error);
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<User> => {
    try {
      setIsLoading(true);
      console.log('[Auth] Login attempt for:', email);
      
      // CRITICAL: Clear all state BEFORE login to prevent cross-contamination
      const { queryClient } = await import('@/lib/queryClient');
      localStorage.removeItem('auth_token');
      setUser(null);
      setToken(null);
      queryClient.clear();
      console.log('[Auth] ✓ Cleared all previous auth state');
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
        console.error('[Auth] Login failed:', errorData);
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      console.log('[Auth] ✓ Login successful');
      console.log('[Auth] User:', data.user.email, 'Role:', data.user.role);
      console.log('[Auth] Token length:', data.token.length);
      
      localStorage.setItem('auth_token', data.token);
      console.log('[Auth] ✓ Token stored in localStorage');
      
      setUser(data.user);
      setToken(data.token);
      
      // Force immediate refetch with new credentials
      await queryClient.refetchQueries();
      console.log('[Auth] ✓ Refetched all queries with new token');
      
      return data.user;
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email: string, password: string, name: string, role: 'teacher' | 'student', school: string, subject?: string): Promise<User> => {
    try {
      // Clear any existing auth state before signup
      const { queryClient } = await import('@/lib/queryClient');
      localStorage.removeItem('auth_token');
      setUser(null);
      setToken(null);
      queryClient.clear();
      console.log('[Auth] ✓ Cleared all previous auth state before signup');

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, role, school, subject }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Signup failed' }));
        throw new Error(error.error || 'Signup failed');
      }

      const data = await response.json();
      console.log('[Auth] ✓ Signup successful');
      console.log('[Auth] User:', data.user.email, 'Role:', data.user.role);
      
      localStorage.setItem('auth_token', data.token);
      console.log('[Auth] ✓ Token stored in localStorage');
      
      setUser(data.user);
      setToken(data.token);
      
      // Force refetch all queries with new auth token
      await queryClient.refetchQueries();
      console.log('[Auth] ✓ Refetched all queries with new token');
      
      return data.user;
    } catch (error: any) {
      console.error('[Auth] Signup error:', error);
      throw error;
    }
  };

  const logout = async () => {
    console.log('[Auth] Logging out...');
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('[Auth] Logout request failed:', error);
    } finally {
      console.log('[Auth] Clearing auth state');
      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_token');
      
      // Clear all queries
      const { queryClient } = await import('@/lib/queryClient');
      queryClient.clear();
      console.log('[Auth] ✓ Logged out successfully');
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}