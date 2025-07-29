
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ACCOUNTS_API } from '@/lib/api';

interface UserInfo {
  id: number;
  username: string;
  email: string;
  mfa_enabled: boolean;
  preferences: Record<string, unknown> | null;
  role?: string;
}

interface ProfileInfo {
  bio: string;
  avatar_url: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserInfo | null;
  profile: ProfileInfo | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = ACCOUNTS_API;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('isAuthenticated') === 'true'
  );
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);

  const loadProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/profiles/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProfile(data[0] || null);
      }
    } catch (err) {
      console.log('Profile fetch error', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      console.log('Checking existing session');
      fetch(`${API_BASE}/users/me/`, { credentials: 'include' })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setUser(data);
            await loadProfile();
          } else if (res.status === 401) {
            setIsAuthenticated(false);
            localStorage.removeItem('isAuthenticated');
            console.log('Session check failed', res.status);
          }
        })
        .catch((err) => {
          console.log('Session check error', err);
        });
    }
  }, [isAuthenticated]);

  const login = async (username: string, password: string) => {
    console.log('Attempting login for', username);
    console.log('API base is', API_BASE);
    console.log('Checking backend availability at', `${API_BASE}/users/me/`);
    try {
      const ping = await fetch(`${API_BASE}/users/me/`, { credentials: 'include' });
      // This request is unauthenticated on first login so a 401/403
      // response is expected. It merely confirms the API is reachable.
      console.log('Backend check status', ping.status);
    } catch (err) {
      console.log('Backend check failed', err);
    }
    console.log('Posting to', `${API_BASE}/login/`);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    };
    console.log('Login fetch options', options);
    try {
      let res = await fetch(`${API_BASE}/login/`, options);
      console.log('Login response headers', Array.from(res.headers.entries()));
      console.log('Login response status', res.status);
      if (res.status === 404 || res.status === 405) {
        const altBase = API_BASE.includes('/admin/api')
          ? API_BASE.replace('/admin/api', '/api')
          : API_BASE.replace('/api', '/admin/api');
        if (altBase !== API_BASE) {
          console.log('Retrying login via', `${altBase}/login/`);
          res = await fetch(`${altBase}/login/`, options);
          console.log('Retry response status', res.status);
        }
      }
      if (res.ok) {
        const data = await res.json();
        console.log('Login success, user:', data.username);
        if (data.environment) {
          console.log('Environment after login', data.environment);
          localStorage.setItem('env', JSON.stringify(data.environment));
        }

        // Verify that a session cookie was actually set. Without a
        // valid session further requests (like fetching the apps list)
        // will fail with a 403. If verification fails we treat the
        // login as unsuccessful.
        const verify = await fetch(`${API_BASE}/users/me/`, {
          credentials: 'include',
        });
        if (!verify.ok) {
          console.log('Session verification failed', verify.status);
          return false;
        }

        setUser(data);
        localStorage.setItem('isAuthenticated', 'true');
        setIsAuthenticated(true);
        await loadProfile();
        return true;
      } else {
        const text = await res.text();
        console.log('Login failed:', text);
      }
    } catch (err) {
      console.log('Login request error', err);
    }
    return false;
  };

  const logout = async () => {
    console.log('Logging out');
    await fetch(`${API_BASE}/logout/`, { method: 'POST', credentials: 'include' });
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, profile, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
