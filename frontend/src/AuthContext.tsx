// Authentication state for the app — PHASE_03 §3.67, §3.72–§3.75.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  fetchAuthState,
  login as loginRequest,
  logout as logoutRequest,
  logoutEverywhere,
  safeReturnPath,
  type AuthState,
  type AuthUser,
  type LoginFailure,
} from "./auth";

interface AuthContextValue {
  state: AuthState;
  /** null on success; the server's refusal otherwise (code AND its sentence). */
  signIn: (username: string, password: string) => Promise<LoginFailure | null>;
  signOut: () => Promise<void>;
  /** §3.34 — sign out everywhere. Returns the count, or null if it failed. */
  signOutEverywhere: () => Promise<number | null>;
  /** Called when any API answers 401 while the page is open (§3.74). */
  sessionExpired: () => void;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // §3.73 — "loading" is a real state. Starting as anonymous would
  // flash the login page at someone who is already signed in.
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchAuthState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password);
    if (result.ok) {
      setState({ status: "authenticated", user: result.user });
      return null;
    }
    setState({ status: "anonymous" });
    return result.failure;
  }, []);

  const signOut = useCallback(async () => {
    await logoutRequest();
    setState({ status: "anonymous" });
  }, []);

  const signOutEverywhere = useCallback(async () => {
    // Deliberately does NOT flip state here, matching the password
    // change: this session is already dead server-side, and flipping
    // immediately unmounts the page before it can tell the user what
    // happened. The caller says its piece, then calls signOut.
    return await logoutEverywhere();
  }, []);

  const sessionExpired = useCallback(() => {
    setState({ status: "anonymous", reason: "expired" });
  }, []);

  const setUser = useCallback((user: AuthUser) => {
    setState({ status: "authenticated", user });
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, signOutEverywhere, sessionExpired, setUser }),
    [state, signIn, signOut, signOutEverywhere, sessionExpired, setUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth used outside AuthProvider");
  return context;
}

/**
 * §3.67 — a protected route.
 *
 * While loading it renders nothing rather than redirecting: sending
 * someone to /login before the session check has answered would
 * sign out every refresh.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <p className="hint">Checking your session…</p>;
  if (state.status === "anonymous") {
    // The intended destination travels as a query parameter and is
    // sanitised on the way back out (§3.68).
    const from = safeReturnPath(location.pathname + location.search);
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }
  return <>{children}</>;
}
