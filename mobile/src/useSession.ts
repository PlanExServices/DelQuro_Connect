import { useCallback, useEffect, useRef, useState } from 'react';
import { exchange, origin, revoke, saveRefresh, ServiceError, serviceRequest, storedRefresh } from './service';
import type { Account, Session } from './types';

type Credentials = { email: string; password: string };
type Registration = Credentials & { code: string; name: string; community_terms_accepted: true };

export function useSession(workspace = origin) {
  const [account, setAccount] = useState<Account | null>(null);
  const [starting, setStarting] = useState(Boolean(workspace));
  const [startupError, setStartupError] = useState('');
  const session = useRef<Session | null>(null);
  const refreshInFlight = useRef<Promise<Session | null> | null>(null);
  const signingOut = useRef(false);
  const persist = workspace === origin;

  const saveSession = useCallback(async (next: Session) => {
    try {
      if (persist) await saveRefresh(next.refresh_token);
    } catch {
      await revoke(workspace, next.refresh_token).catch(() => undefined);
      throw new Error('This device could not save your session. Unlock the device and try again.');
    }
    session.current = next;
    setAccount(next.user);
    return next;
  }, [persist, workspace]);

  const clearSession = useCallback(async () => {
    session.current = null;
    setAccount(null);
    if (persist) await saveRefresh(null);
  }, [persist]);

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;
    if (signingOut.current) return Promise.resolve(null);
    const task = (async () => {
      const credential = session.current?.refresh_token ?? (persist ? await storedRefresh() : null);
      if (!credential) return null;
      try {
        const next = await exchange(workspace, 'refresh', { refresh_token: credential });
        return await saveSession(next);
      } catch (error) {
        if (error instanceof ServiceError && error.status === 401) {
          await clearSession();
          return null;
        }
        throw error;
      }
    })();
    refreshInFlight.current = task;
    task.then(() => { refreshInFlight.current = null; }, () => { refreshInFlight.current = null; });
    return task;
  }, [clearSession, persist, saveSession, workspace]);

  const initialize = useCallback(async () => {
    if (!workspace) return;
    setStarting(true);
    setStartupError('');
    try {
      await refresh();
    } catch (error) {
      setStartupError(error instanceof Error ? error.message : 'Could not restore your session.');
    } finally {
      setStarting(false);
    }
  }, [refresh, workspace]);

  useEffect(() => { void initialize(); }, [initialize]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const current = session.current;
    if (!current) throw new ServiceError(401, 'Sign in to continue.');
    try {
      return await serviceRequest(workspace, path, init, current.access_token);
    } catch (error) {
      if (!(error instanceof ServiceError) || error.status !== 401 || !session.current) throw error;
      const next = session.current === current ? await refresh() : session.current;
      if (!next) throw new ServiceError(401, 'Session expired. Sign in again.');
      return serviceRequest(workspace, path, init, next.access_token);
    }
  }, [refresh, workspace]);

  const api = useCallback(async <T,>(path: string, method = 'GET', data?: object): Promise<T> => {
    const response = await request(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });
    return response.json();
  }, [request]);

  async function signIn(credentials: Credentials) { await saveSession(await exchange(workspace, 'login', credentials)); }
  async function register(credentials: Registration) { await saveSession(await exchange(workspace, 'register', credentials)); }

  async function signOut() {
    signingOut.current = true;
    try {
      await refreshInFlight.current?.catch(() => undefined);
      const credential = session.current?.refresh_token;
      if (credential) await revoke(workspace, credential).catch(() => undefined);
      await clearSession();
    } finally {
      signingOut.current = false;
    }
  }

  async function deleteAccount(password: string) {
    const result = await api<{ status?: 'deleted' | 'requested' }>('/me', 'DELETE', { current_password: password });
    if (result.status !== 'requested') await clearSession();
    return result.status;
  }

  async function acceptTerms() {
    await api('/mobile/community/accept', 'POST');
    const current = session.current;
    if (current) {
      current.user = { ...current.user, community_terms_accepted: true };
      setAccount(current.user);
    }
  }

  return { account, api, request, starting, startupError, initialize, signIn, register, signOut, deleteAccount, acceptTerms, workspace };
}
