import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ArchMark } from "@/components/Logo";

/**
 * Client-side auth gate. AERIS is invite-only and accounts are provisioned
 * manually, so there is no self-service auth backend - this layer simply marks
 * the browser session as signed-in (persisted to localStorage) and guards the
 * dashboard route. Swap `signIn` for a real Firebase Auth / session call when
 * the backend lands.
 */

const STORAGE_KEY = "aeris-session";

interface AuthUser {
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore a persisted session; brief delay so the loading state is visible.
    const t = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setUser(JSON.parse(raw) as AuthUser);
      } catch {
        /* ignore corrupt session */
      }
      setLoading(false);
    }, 350);
    return () => window.clearTimeout(t);
  }, []);

  const signIn = (email: string) => {
    const u: AuthUser = { email };
    setUser(u);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } catch {
      /* ignore */
    }
  };

  const signOut = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Guards a route: shows the auth-loading state, then redirects to /login if unauthenticated. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthLoading() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
      <ArchMark className="size-6 shrink-0 text-arch" />
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-arch" />
        authenticating
      </span>
    </div>
  );
}