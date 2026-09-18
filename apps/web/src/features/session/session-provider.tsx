'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LoginResponse, UserSummary } from '@alims/contracts';
import {
  api,
  getActiveInstitution,
  setActiveInstitution,
  setAccessToken,
} from '@/lib/api-client';

/**
 * Browser session (PRD §9.1):
 *
 * - The refresh token never leaves the httpOnly `alims_rt` cookie.
 * - The access token lives in module memory only — never localStorage —
 *   so it dies with the tab; silent restore replays the cookie instead.
 * - `mfaChallenge` holds the login continuation state when MFA is enabled.
 */

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: UserSummary }
  | { status: 'mfa-challenge'; challengeToken: string; user: UserSummary };

interface SessionContextValue {
  state: SessionState;
  login: (email: string, password: string) => Promise<
    { kind: 'ok' } | { kind: 'mfa-required' } | { kind: 'error'; message: string }
  >;
  completeMfa: (totpCode: string) => Promise<{ kind: 'ok' } | { kind: 'error'; message: string }>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ kind: 'ok' } | { kind: 'error'; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function adoptLogin(result: LoginResponse): void {
  if (!result.mfaRequired) {
    setAccessToken(result.accessToken);
  }
  reconcileInstitution(result.user);
}

/**
 * Keep the X-Institution-Id claim in step with the user's live memberships:
 * keep the current selection while it is still valid, else fall back to
 * the first membership. Members of no institution act personally (no
 * claim) — records then stay unattached until they join one.
 */
function reconcileInstitution(user: UserSummary): void {
  const active = user.memberships.filter((m) => m.status === 'active');
  const current = getActiveInstitution();
  const stillValid = active.some((m) => m.institutionId === current);
  setActiveInstitution(stillValid ? current : (active[0]?.institutionId ?? null));
}


export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const router = useRouter();

  // Silent session restore: the cookie is the only credential needed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const refreshed = await api.auth.refresh();
      if (cancelled) return;
      if (refreshed) {
        try {
          const user = await api.auth.me();
          reconcileInstitution(user);
          if (!cancelled) setState({ status: 'authenticated', user });
          return;
        } catch {
          /* fall through to anonymous */
        }
      }
      if (!cancelled) setState({ status: 'anonymous' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const result = await api.auth.login({ email, password });
      adoptLogin(result);
      if (result.mfaRequired) {
        api.auth.setMfaChallengeToken(result.accessToken);
        setState({
          status: 'mfa-challenge',
          challengeToken: result.accessToken,
          user: result.user,
        });
        return { kind: 'mfa-required' as const };
      }
      setState({ status: 'authenticated', user: result.user });
      return { kind: 'ok' as const };
    } catch (error) {
      return { kind: 'error' as const, message: errorMessage(error) };
    }
  }, []);

  const completeMfa = useCallback(async (totpCode: string) => {
    try {
      const result = await api.auth.mfaVerify(totpCode);
      reconcileInstitution(result.user);
      setState({ status: 'authenticated', user: result.user });
      return { kind: 'ok' as const };
    } catch (error) {
      return { kind: 'error' as const, message: errorMessage(error) };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      await api.auth.register({ email, password, displayName });
      return { kind: 'ok' as const };
    } catch (error) {
      return { kind: 'error' as const, message: errorMessage(error) };
    }
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    setAccessToken(null);
    setActiveInstitution(null);
    setState({ status: 'anonymous' });
    router.push('/');
  }, [router]);

  const refreshUser = useCallback(async () => {
    try {
      const user = await api.auth.me();
      reconcileInstitution(user);
      setState({ status: 'authenticated', user });
    } catch {
      setState({ status: 'anonymous' });
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ state, login, completeMfa, register, logout, refreshUser }),
    [state, login, completeMfa, register, logout, refreshUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
