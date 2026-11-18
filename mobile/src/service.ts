import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import type { Session } from './types';

const SESSION_KEY = 'connect.refresh.v1';
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const loopback = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

function connectOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    const validScheme = url.protocol === 'https:' ||
      (__DEV__ && url.protocol === 'http:' && loopback.has(url.hostname));
    if (validScheme && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password) {
      return url.origin;
    }
  } catch {
    // Missing and malformed configuration render the same setup state.
  }
  return null;
}

export const origin = connectOrigin(process.env.EXPO_PUBLIC_CONNECT_URL);
const reviewOrigin = connectOrigin(process.env.EXPO_PUBLIC_CONNECT_REVIEW_URL);
export const demoOrigin = reviewOrigin && reviewOrigin !== origin ? reviewOrigin : null;

export class ServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type PublicPage = 'privacy' | 'support' | 'account-deletion' | 'community-guidelines';

export async function openPublicPage(page: PublicPage, workspace = origin) {
  if (!workspace) throw new Error('The Connect service is unavailable.');
  await Linking.openURL(`${workspace}/${page}`);
}

export async function serviceRequest(workspace: string | null, path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  if (!workspace) throw new Error('The Connect service is unavailable.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${workspace}/api${path}`, { ...init, headers, signal: controller.signal });
    if (response.ok) return response;
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const validation = Array.isArray(detail) ? detail.find(item => typeof item.msg === 'string')?.msg : null;
    throw new ServiceError(response.status, typeof detail === 'string'
      ? detail
      : validation?.replace(/^Value error, /, '') || 'Connect could not complete that request. Try again.');
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new Error('Could not reach Connect. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function storedRefresh() {
  if (Platform.OS === 'web') return null;
  const raw = await SecureStore.getItemAsync(SESSION_KEY, STORE_OPTIONS);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (stored.origin === origin && typeof stored.credential === 'string') return stored.credential;
  } catch {
    // A previous installation may have used another format.
  }
  await saveRefresh(null);
  return null;
}

export async function saveRefresh(credential: string | null) {
  if (Platform.OS === 'web') return;
  if (credential) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ origin, credential }), STORE_OPTIONS);
  else await SecureStore.deleteItemAsync(SESSION_KEY, STORE_OPTIONS);
}

export async function exchange(workspace: string | null, path: 'login' | 'register' | 'refresh', body: object): Promise<Session> {
  const response = await serviceRequest(workspace, `/mobile/auth/${path}`, {
    method: 'POST', body: JSON.stringify(body),
  });
  return response.json();
}

export async function revoke(workspace: string | null, credential: string) {
  await serviceRequest(workspace, '/mobile/auth/logout', {
    method: 'POST', body: JSON.stringify({ refresh_token: credential }),
  });
}

export type RequestApi = <T>(path: string, method?: string, data?: object) => Promise<T>;
