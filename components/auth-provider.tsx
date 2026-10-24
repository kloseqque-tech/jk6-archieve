"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@/lib/types";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  toast: string;
  showToast: (message: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      let payload = await response.json();
      if (!payload.user) {
        const privateLogin = await fetch("/api/auth/private-auto-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (privateLogin.ok) payload = await privateLogin.json();
      }
      setUser(payload.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    showToast("已安全退出。");
  }, [showToast]);

  const value = useMemo(
    () => ({ user, loading, refresh, logout, toast, showToast }),
    [user, loading, refresh, logout, toast, showToast],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
