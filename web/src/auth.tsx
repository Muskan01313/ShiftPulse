import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { Team, User } from "./types";

interface AuthValue {
  user: User | null;
  team: Team | null;
  loading: boolean;
  /** Server time minus this computer's time, so timers agree even if the laptop clock is off. */
  clockOffset: number;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockOffset, setClockOffset] = useState(0);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setTeam(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api<{ user: User; team: Team | null; serverNow: string }>("/api/me");
      setUser(me.user);
      setTeam(me.team);
      setClockOffset(new Date(me.serverNow).getTime() - Date.now());
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    void refresh();
  }, [refresh, logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string }>("/api/auth/login", { method: "POST", json: { email, password } });
      setToken(res.token);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(() => ({ user, team, loading, clockOffset, login, logout, refresh }), [user, team, loading, clockOffset, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
