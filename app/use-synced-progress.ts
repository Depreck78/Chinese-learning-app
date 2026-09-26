import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_AVATAR, isAvatarId, type AvatarId } from './avatars';
import { emptyProgress, forgetProgress, loadProgress, mergeProgress, readProgress, saveProgress, type Progress } from './progress';

export type Session = { token: string; userId: number; username: string; avatar: AvatarId };
/** Progress on this device and whose it is: an account's id, or null when signed out. */
type Owned = { userId: number | null; progress: Progress };
type Profile = { username: string; avatar: string };
export type SyncStatus =
  | { state: 'signed-out' }
  | { state: 'waiting' }
  | { state: 'syncing' }
  | { state: 'synced'; at: number }
  | { state: 'error'; message: string };

const SESSION_KEY = 'hanzi-session';
const SYNC_DELAY_MS = 2000;
const SYNC_EVERY_MS = 3 * 60 * 1000;

function loadSession(): Session | null {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    if (!session || typeof session.token !== 'string' || typeof session.username !== 'string' || !Number.isInteger(session.userId)) return null;
    return { ...session, avatar: isAvatarId(session.avatar) ? session.avatar : DEFAULT_AVATAR };
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore: the session just won't survive a reload.
  }
}

async function request(path: string, init: RequestInit, token?: string) {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw Object.assign(new Error(body.error ?? 'Could not reach the server.'), { status: response.status });
  return body;
}

const loadOwned = (userId: number | null): Owned => ({ userId, progress: loadProgress(userId) });

/**
 * Progress lives on this device, one copy per account plus one for signed-out use. When signed
 * in and online, the account's copy is sent to the server and merged with its other devices.
 */
export function useSyncedProgress() {
  const [session, setSession] = useState<Session | null>(() => (typeof window === 'undefined' ? null : loadSession()));
  const [owned, setOwned] = useState<Owned>(() => (typeof window === 'undefined' ? { userId: null, progress: emptyProgress() } : loadOwned(loadSession()?.userId ?? null)));
  const [status, setStatus] = useState<SyncStatus>({ state: 'waiting' });
  const [signedOutNotice, setSignedOutNotice] = useState('');
  const latest = useRef(owned);
  const timer = useRef<number | null>(null);
  const running = useRef(false);
  useEffect(() => { latest.current = owned; }, [owned]);

  // Keeps this device's copy of the username and avatar in step with the account.
  const applyProfile = useCallback((profile: Profile) => {
    setSession((current) => {
      if (!current) return current;
      const avatar = isAvatarId(profile.avatar) ? profile.avatar : DEFAULT_AVATAR;
      if (current.username === profile.username && current.avatar === avatar) return current;
      const next = { ...current, username: profile.username, avatar };
      saveSession(next);
      return next;
    });
  }, []);

  const sync = useCallback(async () => {
    if (!session || running.current || latest.current.userId !== session.userId) return;
    if (!navigator.onLine) return setStatus({ state: 'waiting' });
    running.current = true;
    setStatus({ state: 'syncing' });
    try {
      const body = (await request('/api/sync', { method: 'POST', body: JSON.stringify({ progress: latest.current.progress }) }, session.token)) as { progress?: unknown; profile?: Profile };
      const remote = readProgress(body.progress);
      if (body.profile) applyProfile(body.profile);
      // Merge again in case something changed on this device while the request was out,
      // unless the user signed out or switched accounts meanwhile.
      setOwned((current) => {
        if (current.userId !== session.userId) return current;
        const merged = mergeProgress(current.progress, remote);
        saveProgress(merged, current.userId);
        return { ...current, progress: merged };
      });
      setStatus({ state: 'synced', at: Date.now() });
    } catch (error) {
      if ((error as { status?: number }).status === 401) {
        saveSession(null);
        setSession(null);
        setOwned(loadOwned(null));
        setSignedOutNotice('You were signed out. Log in again to see your progress and keep syncing — nothing is lost.');
      } else {
        setStatus(navigator.onLine ? { state: 'error', message: (error as Error).message } : { state: 'waiting' });
      }
    } finally {
      running.current = false;
    }
  }, [session, applyProfile]);

  const scheduleSync = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void sync(), SYNC_DELAY_MS);
  }, [sync]);

  /** Changes progress on this device and syncs it shortly after. */
  const update = useCallback((change: (current: Progress) => Progress) => {
    setOwned((current) => {
      const next = change(current.progress);
      saveProgress(next, current.userId);
      return { ...current, progress: next };
    });
    scheduleSync();
  }, [scheduleSync]);

  // Sync when signing in, when the app comes back to the foreground or online, and every few minutes.
  useEffect(() => {
    if (!session) return;
    const first = window.setTimeout(() => void sync(), 0);
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
    const onOnline = () => void sync();
    const onOffline = () => setStatus({ state: 'waiting' });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = window.setInterval(() => void sync(), SYNC_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearTimeout(first);
      window.clearInterval(interval);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [session, sync]);

  /**
   * Signs in and switches to the account's own progress. A new account starts empty unless
   * `bringDeviceProgress` copies in what was done here while signed out.
   */
  async function signIn(kind: 'register' | 'login', username: string, password: string, bringDeviceProgress = false) {
    const body = (await request(`/api/auth/${kind}`, { method: 'POST', body: JSON.stringify({ username, password }) })) as Session;
    const next: Session = { token: body.token, userId: body.userId, username: body.username, avatar: isAvatarId(body.avatar) ? body.avatar : DEFAULT_AVATAR };
    const account = loadOwned(next.userId);
    if (kind === 'register' && bringDeviceProgress) {
      account.progress = mergeProgress(account.progress, loadProgress(null));
      saveProgress(account.progress, next.userId);
    }
    saveSession(next);
    setSession(next);
    setOwned(account);
    setSignedOutNotice('');
  }

  /** Changes the username and/or avatar on the account. Needs a connection. */
  async function updateProfile(changes: { username?: string; avatar?: AvatarId }) {
    if (!session) return;
    applyProfile((await request('/api/account', { method: 'PATCH', body: JSON.stringify(changes) }, session.token)) as Profile);
  }

  async function signOut() {
    if (session) await request('/api/auth/logout', { method: 'POST' }, session.token).catch(() => undefined);
    // The account's copy stays on the device (it may hold changes not yet synced) but is hidden.
    saveSession(null);
    setSession(null);
    setOwned(loadOwned(null));
  }

  async function deleteAccount() {
    if (!session) return;
    await request('/api/account', { method: 'DELETE' }, session.token);
    forgetProgress(session.userId);
    saveSession(null);
    setSession(null);
    setOwned(loadOwned(null));
  }

  return { progress: owned.progress, update, session, status: session ? status : ({ state: 'signed-out' } as const), signedOutNotice, syncNow: sync, signIn, updateProfile, signOut, deleteAccount };
}
