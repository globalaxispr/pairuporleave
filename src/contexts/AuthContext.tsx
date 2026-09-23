import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  adminRole: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Demo authentication is strictly gated to local development.
// It is impossible to activate in production builds (import.meta.env.DEV === false).
const isDev = import.meta.env.DEV === true;
const isDemoAuthEnabled = isDev && (import.meta.env.VITE_ENABLE_DEMO_AUTH !== "false");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  // loading stays true until the FIRST full auth+admin check completes.
  // After initialization, it never returns to true — navigation is instant.
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  // Returns the resolved admin record so callers can chain on it.
  const checkAdmin = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("admin_users")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();
      setIsAdmin(!!data);
      setAdminRole(data?.role ?? null);
      return data;
    } catch {
      setIsAdmin(false);
      setAdminRole(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // Development-only demo auth hydration
    if (isDemoAuthEnabled) {
      const demoAuth = localStorage.getItem("vote_demo_auth");
      if (demoAuth) {
        try {
          const parsed = JSON.parse(demoAuth);
          if (parsed.user) {
            setSession({ access_token: "demo-token", user: parsed.user } as any);
            setIsAdmin(true);
            setAdminRole("super_admin");
            initialized.current = true;
            setLoading(false);
          }
        } catch {
          // ignore
        }
      }
    } else {
      // Production guard: purge any demo auth remnants from localStorage
      try {
        localStorage.removeItem("vote_demo_auth");
      } catch {
        // ignore
      }
    }

    // Perform the initial session + admin check together before clearing loading.
    // This is the KEY fix: loading stays true until BOTH resolve, so ProtectedRoute
    // never sees a transient (loading=false, isAdmin=false) state on first render.
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (initialSession?.user) {
        setSession(initialSession);
        await checkAdmin(initialSession.user.id);
      }
      initialized.current = true;
      setLoading(false);
    }).catch(() => {
      initialized.current = true;
      setLoading(false);
    });

    // onAuthStateChange handles token refreshes, sign-ins from other tabs, etc.
    // After initialization it NEVER re-triggers the loading spinner — navigation stays instant.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSession(session);
        // Only block navigation with a loading state on the very first check.
        // After that, update isAdmin silently in the background.
        void checkAdmin(session.user.id);
      } else if (!isDemoAuthEnabled || !localStorage.getItem("vote_demo_auth")) {
        setSession(null);
        setIsAdmin(false);
        setAdminRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAdmin]);

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (!error && data?.user) {
        // Step 1 & 2: Get authenticated user and check admin_users table
        const { data: adminRecord, error: adminErr } = await supabase
          .from("admin_users")
          .select("id, role")
          .eq("id", data.user.id)
          .maybeSingle();

        // Step 3 & 4: Verify authorization/role
        if (adminErr || !adminRecord) {
          // Authenticated but unauthorized user -> deny admin access and sign out
          await supabase.auth.signOut();
          setSession(null);
          setIsAdmin(false);
          setAdminRole(null);
          return { error: "Access denied. Your account is not authorized as an administrator." };
        }

        // Authorized admin -> grant access
        setSession(data.session);
        setIsAdmin(true);
        setAdminRole(adminRecord.role ?? "admin");
        return { error: null };
      }

      // Demo fallback: strictly gated to local development.
      // In production builds, this block is completely unreachable.
      if (isDemoAuthEnabled && email.toLowerCase().includes("admin") && password.length >= 6) {
        const demoUser: any = {
          id: "admin-demo-id",
          email: email,
          user_metadata: { role: "admin" },
        };
        const demoSession: any = {
          access_token: "demo-token",
          user: demoUser,
        };
        setSession(demoSession);
        setIsAdmin(true);
        setAdminRole("super_admin");
        localStorage.setItem("vote_demo_auth", JSON.stringify({ user: demoUser }));
        return { error: null };
      }

      if (error) return { error: error.message };
    } catch {
      if (isDemoAuthEnabled && email.toLowerCase().includes("admin") && password.length >= 6) {
        const demoUser: any = {
          id: "admin-demo-id",
          email: email,
        };
        const demoSession: any = {
          access_token: "demo-token",
          user: demoUser,
        };
        setSession(demoSession);
        setIsAdmin(true);
        setAdminRole("super_admin");
        localStorage.setItem("vote_demo_auth", JSON.stringify({ user: demoUser }));
        return { error: null };
      }
    }
    return { error: "Invalid login credentials." };
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    localStorage.removeItem("vote_demo_auth");
    setSession(null);
    setIsAdmin(false);
    setAdminRole(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isAdmin,
        adminRole,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
