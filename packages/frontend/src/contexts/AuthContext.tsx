import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { setCurrentUserId, clearStoredPublicKey } from '@/lib/org-keypair';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
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
      // Scope keypair to email — readable in localStorage and unique per account.
      // Falls back to numeric Google ID only if email is somehow absent.
      setCurrentUserId(data.user?.email ?? data.user?.id ?? null);
    } catch {
      setUser(null);
      setCurrentUserId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchUser();
  }, [refetchUser]);

  const login = useCallback(() => {
    // Full-page redirect so the browser goes to backend OAuth and comes back with cookie
    window.location.href = '/api/auth/google';
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      // Clear stored public key before resetting the user ID so the
      // scoped localStorage key is still reachable for removal.
      clearStoredPublicKey();
      setUser(null);
      setCurrentUserId(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    refetchUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
