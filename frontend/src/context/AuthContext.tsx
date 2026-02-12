import { useState, useEffect, type ReactNode } from 'react';
import { api, setUserId, getUserId } from '../api/client';
import type { User } from '../types';
import { AuthContext } from './authState';

// Determine initial loading state: only true when there are saved credentials to verify
const hasSavedSession = !!(getUserId() && localStorage.getItem('username'));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(hasSavedSession);

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
