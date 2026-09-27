// Accounts, sessions and synced progress, stored in the `DB` D1 database (see vite.config.ts).
import { env } from 'cloudflare:workers';
import { DEFAULT_AVATAR, isAvatarId } from '../../app/avatars';

type Statement = {
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<unknown>;
};
export type Database = {
  prepare: (query: string) => Statement & { bind: (...values: unknown[]) => Statement };
  batch: (statements: unknown[]) => Promise<unknown>;
};

export const database = () => (env as unknown as { DB: Database }).DB;

let schemaReady: Promise<unknown> | null = null;

/** Creates the tables on first use, once per worker instance. */
export function ready() {
  schemaReady ??= database().batch([
    database().prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      failed_logins INTEGER NOT NULL DEFAULT 0,
      last_failed_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      avatar TEXT NOT NULL DEFAULT 'cat'
    )`),
    database().prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    )`),
    database().prepare(`CREATE TABLE IF NOT EXISTS progress (
      user_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
  ])
    // Databases created before avatars existed get the column added; it fails harmlessly if already there.
    .then(() => database().prepare("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT 'cat'").run().catch(() => undefined))
    .catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  return schemaReady;
}

// --- Passwords and tokens ---

const encoder = new TextEncoder();
const toHex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  // 100,000 iterations is the most Cloudflare Workers allows.
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}

function sameText(first: string, second: string) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return difference === 0;
}

const hashToken = async (token: string) => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));

async function createSession(userId: number) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await database().prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_used_at) VALUES (?, ?, ?, ?)').bind(await hashToken(token), userId, now, now).run();
  return token;
}

// --- Account actions ---

export class AccountError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/;
const SESSION_DAYS = 365;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkUsername(username: unknown) {
  if (typeof username !== 'string' || !USERNAME.test(username)) {
    throw new AccountError('Usernames are 3–32 letters, numbers, dots, dashes or underscores.');
  }
  return username;
}

function checkCredentials(username: unknown, password: unknown) {
  checkUsername(username);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw new AccountError('Passwords need at least 8 characters.');
  }
  return { username: username as string, password };
}

export async function register(rawUsername: unknown, rawPassword: unknown) {
  const { username, password } = checkCredentials(rawUsername, rawPassword);
  await ready();
  const existing = await database().prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: number }>();
  if (existing) throw new AccountError('That username is taken. Try another, or log in.', 409);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await database().prepare('INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)')
    .bind(username, await hashPassword(password, salt), toHex(salt), Date.now()).run();
  const user = await database().prepare('SELECT id, username FROM users WHERE username = ?').bind(username).first<{ id: number; username: string }>();
  if (!user) throw new AccountError('Could not create the account. Please try again.', 500);
  return { token: await createSession(user.id), userId: user.id, username: user.username, avatar: DEFAULT_AVATAR, admin: isAdmin(user.id) };
}

export async function logIn(rawUsername: unknown, rawPassword: unknown) {
  const { username, password } = checkCredentials(rawUsername, rawPassword);
  await ready();
  const user = await database().prepare('SELECT id, username, avatar, password_hash, salt, failed_logins, last_failed_at FROM users WHERE username = ?')
    .bind(username).first<{ id: number; username: string; avatar: string; password_hash: string; salt: string; failed_logins: number; last_failed_at: number }>();
  const wrong = new AccountError('Wrong username or password.', 401);
  if (!user) throw wrong;
  const now = Date.now();
  if (user.failed_logins >= MAX_FAILED_LOGINS && now - user.last_failed_at < LOCKOUT_MS) {
    throw new AccountError('Too many wrong passwords. Wait 15 minutes and try again.', 429);
  }
  if (!sameText(await hashPassword(password, fromHex(user.salt)), user.password_hash)) {
    const failures = now - user.last_failed_at < LOCKOUT_MS ? user.failed_logins + 1 : 1;
    await database().prepare('UPDATE users SET failed_logins = ?, last_failed_at = ? WHERE id = ?').bind(failures, now, user.id).run();
    throw wrong;
  }
  await database().prepare('UPDATE users SET failed_logins = 0 WHERE id = ?').bind(user.id).run();
  return { token: await createSession(user.id), userId: user.id, username: user.username, avatar: user.avatar, admin: isAdmin(user.id) };
}

/** Returns the signed-in user's id for a request's `Authorization: Bearer <token>` header. */
export async function userFor(request: Request) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  if (!token) throw new AccountError('Please log in again.', 401);
  await ready();
  const tokenHash = await hashToken(token);
  const session = await database().prepare('SELECT user_id, last_used_at FROM sessions WHERE token_hash = ?').bind(tokenHash).first<{ user_id: number; last_used_at: number }>();
  const now = Date.now();
  if (!session || now - session.last_used_at > SESSION_DAYS * 86400000) throw new AccountError('Please log in again.', 401);
  // Keep active sessions alive; only write occasionally.
  if (now - session.last_used_at > 86400000) await database().prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  return { userId: session.user_id, tokenHash };
}

export async function logOut(request: Request) {
  const { tokenHash } = await userFor(request);
  await database().prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

/**
 * The owner accounts that may see usage stats, from the ADMIN_USER_IDS secret (comma-separated user
 * ids). It is set on Cloudflare with `wrangler secret put ADMIN_USER_IDS`, so it never appears in the repo.
 */
export function isAdmin(userId: number) {
  const ids = String((env as unknown as { ADMIN_USER_IDS?: string }).ADMIN_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean).map(Number);
  return ids.includes(userId);
}

export async function profileFor(userId: number) {
  const user = await database().prepare('SELECT username, avatar FROM users WHERE id = ?').bind(userId).first<{ username: string; avatar: string }>();
  if (!user) throw new AccountError('Please log in again.', 401);
  return { ...user, admin: isAdmin(userId) };
}

/** Changes the signed-in user's username and/or avatar. */
export async function updateProfile(request: Request, changes: { username?: unknown; avatar?: unknown }) {
  const { userId } = await userFor(request);
  if (changes.username !== undefined) {
    const username = checkUsername(changes.username);
    const taken = await database().prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username, userId).first<{ id: number }>();
    if (taken) throw new AccountError('That username is taken. Try another.', 409);
    await database().prepare('UPDATE users SET username = ? WHERE id = ?').bind(username, userId).run();
  }
  if (changes.avatar !== undefined) {
    if (!isAvatarId(changes.avatar)) throw new AccountError('Choose one of the avatars.');
    await database().prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(changes.avatar, userId).run();
  }
  return profileFor(userId);
}

export async function deleteAccount(request: Request) {
  const { userId } = await userFor(request);
  await database().batch([
    database().prepare('DELETE FROM progress WHERE user_id = ?').bind(userId),
    database().prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    database().prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}

export async function storedProgress(userId: number) {
  const row = await database().prepare('SELECT data FROM progress WHERE user_id = ?').bind(userId).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as unknown) : null;
}

export async function storeProgress(userId: number, data: unknown) {
  await database().prepare('INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(userId, JSON.stringify(data), Date.now()).run();
}

/** Turns a thrown error into a JSON response without leaking internals. */
export function errorResponse(error: unknown) {
  if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

export async function readJson(request: Request) {
  const text = await request.text();
  if (text.length > 2_000_000) throw new AccountError('Request is too large.', 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AccountError('Request is not valid JSON.');
  }
}
