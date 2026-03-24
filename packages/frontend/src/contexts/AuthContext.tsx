import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';

const AUTH_SESSION_FLAG = 'app_registry_authenticated';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  username: string | null;
  verified: boolean;
  isAdmin?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
  claimUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchUser = useCallback(async () => {
    try {
      const { data } = await api.get<{ user: AuthUser }>('/auth/me');
      setUser(data.user);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(AUTH_SESSION_FLAG, '1');
      }
    } catch {
      setUser(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(AUTH_SESSION_FLAG);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchUser();
  }, [refetchUser]);

  useEffect(() => {
    if (!user) return undefined;

    const intervalId = window.setInterval(() => {
      void refetchUser();
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [user, refetchUser]);

  const login = useCallback(() => {
    // Full-page redirect so the browser goes to backend OAuth and comes back with cookie
    window.location.href = '/api/auth/google';
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(AUTH_SESSION_FLAG);
      }
    }
  }, []);

  const claimUsername = useCallback(
    async (username: string) => {
      await api.post('/auth/username', { username });
      await refetchUser();
    },
    [refetchUser]
  );

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    refetchUser,
    claimUsername,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
