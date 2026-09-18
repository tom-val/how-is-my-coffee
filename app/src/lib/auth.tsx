import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { api, setAuth, setUnauthorizedHandler } from './api';
import { clearToken, getToken, setToken } from './tokenStorage';
import type { User } from '@/types';

/**
 * Session state for the app: a username/password sign-in against our own API, which hands back a
 * 30-day HS256 JWT. There is no refresh token and no third-party identity provider — when the JWT
 * expires the API answers 401, `api.ts` calls the handler wired below, and the user signs in again.
 *
 * The stored token is read SYNCHRONOUSLY at module load (`tokenStorage` is SecureStore on native,
 * localStorage on web), so a returning user never sees the login screen flash before their feed.
 * `loading` therefore only covers the first `/me` round trip, not the storage read.
 */
type AuthValue = {
  /** True while the first `/me` is in flight for a token we already had. */
  loading: boolean;
  signedIn: boolean;
  /** The signed-in user, once `/me` has answered. Null while loading or signed out. */
  me: User | null;
  /** Throws `ApiError` on failure (401 `invalid_credentials`); the screen localizes it. */
  signIn: (username: string, password: string) => Promise<void>;
  /** Throws `ApiError` on failure (409 `username_taken`); the screen localizes it. */
  signUp: (username: string, displayName: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Re-read `/me` — after creating a rating, say, so the caffeine total on the profile is current. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

// The token we booted with, read before the first render so `signedIn` is right immediately.
const initialToken = getToken();
setAuth(initialToken);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(initialToken);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(initialToken !== null);

  // Monotonic call id: `/me` loads overlap (bootstrap, refresh, a fresh sign-in), so only the
  // latest may commit — a stale result must never repopulate `me` after a sign-out.
  const loadId = useRef(0);

  const loadMe = useCallback(async () => {
    const callId = ++loadId.current;
    try {
      const user = await api.me();
      if (callId === loadId.current) setMe(user);
    } catch {
      // A 401 already triggered the unauthorized handler below; anything else (offline) leaves the
      // session intact and the screens show their own error state.
      if (callId === loadId.current) setMe(null);
    } finally {
      if (callId === loadId.current) setLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    loadId.current++; // invalidate any in-flight /me so it cannot repopulate `me`
    clearToken();
    setAuth(null);
    setTokenState(null);
    setMe(null);
    setLoading(false);
  }, []);

  // A rejected token ends the session. Registered once; `api.ts` calls it from any 401 that carried
  // a token, so an expired JWT drops the user back to the login screen instead of onto a dead feed.
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (!token) return;
    // Fetching the profile for a token we booted with is exactly the "read from an external
    // system" an effect is for; the state lands in `loadMe`'s continuation, after the await, not
    // synchronously in this body. The lint rule cannot see across the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMe();
  }, [token, loadMe]);

  const apply = useCallback((result: { token: string; user: User }) => {
    setToken(result.token);
    setAuth(result.token);
    loadId.current++; // this user's profile came with the response; no bootstrap /me should overwrite it
    setTokenState(result.token);
    setMe(result.user);
    setLoading(false);
  }, []);

  // Both let the ApiError through: only the screen has a `t` to localize it with, and only the
  // screen knows where to put the message.
  const signIn = useCallback(
    async (username: string, password: string) => {
      apply(await api.login({ username: username.trim().toLowerCase(), password }));
    },
    [apply],
  );

  const signUp = useCallback(
    async (username: string, displayName: string, password: string) => {
      apply(
        await api.register({
          username: username.trim().toLowerCase(),
          displayName: displayName.trim(),
          password,
        }),
      );
    },
    [apply],
  );

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      signedIn: token !== null,
      me,
      signIn,
      signUp,
      signOut,
      refresh: loadMe,
    }),
    [loading, token, me, signIn, signUp, signOut, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
