import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api, setUserId, getUserId } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUserId = getUserId();
    const savedUsername = localStorage.getItem('username');
    if (savedUserId && savedUsername) {
      api.getUser(savedUsername)
        .then((u) => setUser(u))
        .catch(() => {
          setUserId(null);
          localStorage.removeItem('username');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const u = await api.login(username, password);
    setUserId(u.userId);
    localStorage.setItem('username', u.username);
    setUser(u);
  };

  const register = async (username: string, displayName: string, password: string) => {
    const u = await api.register(username, displayName, password);
    setUserId(u.userId);
    localStorage.setItem('username', u.username);
    setUser(u);
  };

  const logout = () => {
    setUserId(null);
    localStorage.removeItem('username');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
