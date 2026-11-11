import type { Context } from 'hono';
import { cors } from 'hono/cors';

export const ORIGINS = ['https://yehorss.github.io', 'http://localhost:5173', 'http://localhost:5174'];

export const corsGuard = cors({
  origin: o => (ORIGINS.includes(o) ? o : null),
  allowMethods: ['GET', 'POST', 'DELETE', 'PATCH'],
  allowHeaders: ['content-type'],
  credentials: true,
  maxAge: 600,
});

export type ErrorCode = 'invalid' | 'slot_taken' | 'closed' | 'too_many' | 'not_found' | 'forbidden' | 'unauthorized';

export function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 429, error: ErrorCode, message: string, extra: object = {}) {
  return c.json({ error, message, ...extra }, status);
}

export const clientIp = (c: Context) => c.req.header('cf-connecting-ip') ?? 'local';

/** Fixed-window counter; true while the caller is under the limit. */
export async function limit(db: D1Database, key: string, max: number, windowSec: number, now = Date.now()): Promise<boolean> {
  const win = Math.floor(now / 1000 / windowSec) * windowSec;
  const row = await db
    .prepare('INSERT INTO hits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(key, win)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= max;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^\d{2}:\d{2}$/;
export const PHONE_RE = /^[0-9 +()-]{8,20}$/;

export function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface GuestInput { name: string; phone: string; comment: string }

export function checkGuest(b: Record<string, unknown>): GuestInput | null {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  const comment = typeof b.comment === 'string' ? b.comment.trim() : '';
  if (name.length < 2 || name.length > 60) return null;
  if (!PHONE_RE.test(phone)) return null;
  if (comment.length > 300) return null;
  return { name, phone, comment };
}

export const digits = (phone: string) => phone.replace(/\D/g, '');
