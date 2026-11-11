import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from './seed';
import { clientIp, fail } from './guard';
import { hashPassword, verifyPassword } from './password';

export type Role = 'owner' | 'demo';
export interface User { login: string; role: Role }
export type AuthVars = { user: User };

const SESSION_MS = 12 * 3_600_000;
const FAIL_WINDOW_SEC = 600, FAIL_MAX = 5;

const failKey = (ip: string) => `loginfail:${ip}`;
const failWindow = (now: number) => Math.floor(now / 1000 / FAIL_WINDOW_SEC) * FAIL_WINDOW_SEC;

async function failures(db: D1Database, ip: string, now: number): Promise<number> {
  const row = await db.prepare('SELECT count FROM hits WHERE key = ? AND window_start = ?').bind(failKey(ip), failWindow(now)).first<{ count: number }>();
  return row?.count ?? 0;
}

async function addFailure(db: D1Database, ip: string, now: number): Promise<void> {
  await db.prepare('INSERT INTO hits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1')
    .bind(failKey(ip), failWindow(now)).run();
}

async function findUser(env: Env, login: string): Promise<{ hash: string; salt: string; role: Role } | null> {
  const row = await env.DB.prepare('SELECT hash, salt, role FROM users WHERE login = ?').bind(login).first<{ hash: string; salt: string; role: Role }>();
  if (row || login !== 'owner' || !env.OWNER_PASSWORD) return row;
  // the owner account is created on first use from the deployment secret
  const h = await hashPassword(env.OWNER_PASSWORD);
  await env.DB.prepare("INSERT OR IGNORE INTO users (login, hash, salt, role) VALUES ('owner', ?, ?, 'owner')").bind(h.hash, h.salt).run();
  return { ...h, role: 'owner' };
}

export async function sessionUser(db: D1Database, token: string | undefined, now = Date.now()): Promise<User | null> {
  if (!token) return null;
  return db.prepare('SELECT u.login, u.role FROM sessions s JOIN users u ON u.login = s.login WHERE s.token = ? AND s.expires_at > ?')
    .bind(token, now).first<User>();
}

export const requireRole = (...roles: Role[]): MiddlewareHandler<{ Bindings: Env; Variables: AuthVars }> => async (c, next) => {
  const user = await sessionUser(c.env.DB, getCookie(c, 'sid'));
  if (!user) return fail(c, 401, 'unauthorized', 'Please sign in');
  if (!roles.includes(user.role)) return fail(c, 403, 'forbidden', 'Your account cannot do this');
  c.set('user', user);
  await next();
};

export const auth = new Hono<{ Bindings: Env; Variables: AuthVars }>();

auth.post('/login', async c => {
  const now = Date.now(), ip = clientIp(c);
  if ((await failures(c.env.DB, ip, now)) >= FAIL_MAX) return fail(c, 429, 'too_many', 'Too many attempts, try again in 10 minutes');
  const body = await c.req.json<{ login?: unknown; password?: unknown }>().catch(() => ({} as { login?: unknown; password?: unknown }));
  const login = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const user = login ? await findUser(c.env, login) : null;
  if (!user || !(await verifyPassword(password, user.hash, user.salt))) {
    await addFailure(c.env.DB, ip, now);
    return fail(c, 401, 'unauthorized', 'Wrong login or password');
  }
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    c.env.DB.prepare('INSERT INTO sessions (token, login, expires_at) VALUES (?, ?, ?)').bind(token, login, now + SESSION_MS),
  ]);
  setCookie(c, 'sid', token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSION_MS / 1000 });
  return c.json({ login, role: user.role });
});

auth.post('/logout', async c => {
  const token = getCookie(c, 'sid');
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  deleteCookie(c, 'sid', { path: '/', secure: true });
  return c.body(null, 204);
});

auth.get('/me', async c => {
  const user = await sessionUser(c.env.DB, getCookie(c, 'sid'));
  return user ? c.json(user) : fail(c, 401, 'unauthorized', 'Please sign in');
});
