"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, AUTH_TOKEN_KEY } from "./api";
import type { AuthResponse, AuthUser, RegisterValues } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (values: RegisterValues) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function storeSession(data: AuthResponse) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const token = window.localStorage.getItem(AUTH_TOKEN_KEY);

      if (!token) {
        await Promise.resolve();
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const data = await apiFetch<{ user: AuthUser }>("/api/v1/auth/me");
        if (!cancelled) setUser(data.user);
      } catch {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeSession(data);
    setUser(data.user);
  }, []);

  const register = useCallback(async (values: RegisterValues) => {
    const data = await apiFetch<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(values),
    });
    storeSession(data);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Cabut refresh token di server dan hapus cookie httpOnly.
      await apiFetch("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch {
      // Tetap bersihkan sesi lokal walau server tidak bisa dihubungi.
    }

    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth harus dipakai di dalam AuthProvider.");
  }

  return context;
}
