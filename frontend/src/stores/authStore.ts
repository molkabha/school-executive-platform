import { createContext, ReactNode, useContext, useEffect, useState, createElement } from 'react';
import { api } from '../services/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId?: string | null;
  schoolName?: string;
  permissions: string[];
  lastLoginAt?: string | null;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type StoredUserPreview = { id: string; name: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Used only to avoid a UI flash before the session check below completes.
    // The JWT itself lives in a secure httpOnly cookie, never in localStorage.
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    try {
      const preview = JSON.parse(stored) as StoredUserPreview;
      // Return a partial object; /api/auth/me will fill in the rest.
      return { id: preview.id, name: preview.name } as User;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const preview: StoredUserPreview = { id: user.id, name: user.name };
      localStorage.setItem('user', JSON.stringify(preview));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  useEffect(() => {
    // Verify the session cookie is still valid on load / refresh.
    let cancelled = false;
    api
      .get('/api/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (userValue: User) => {
    setUser(userValue);
  };

  const logout = () => {
    setUser(null);
    api.post('/api/auth/logout').catch(() => {
      // Cookie is httpOnly; even if this call fails, clearing local state
      // logs the user out of the UI and the cookie will expire on its own.
    });
  };

  return createElement(AuthContext.Provider, { value: { user, isLoading, login, logout } }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
