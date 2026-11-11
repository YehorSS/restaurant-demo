import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../src/seed';
import { utcToLocal } from '../src/slots';

beforeAll(async () => { await seed(env.DB); });

let ipSeq = 0;
const call = (path: string, init: RequestInit = {}, ip = `10.0.0.${++ipSeq}`) =>
  exports.default.fetch(`http://x${path}`, { ...init, headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(init.headers ?? {}) } });

// a lucciola open day (not monday) at least 3 days ahead, in Rome time
function openDay(offset = 3): string {
  for (let i = offset; ; i++) {
    const d = utcToLocal(Date.now() + i * 86_400_000, 'Europe/Rome').date;
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) return d;
  }
}
const guest = { name: 'Marta Rossi', phone: '+39 333 123 4567', comment: '', website: '' };
const book = (rid: string, body: object, ip?: string) => call(`/api/r/${rid}/bookings`, { method: 'POST', body: JSON.stringify({ ...guest, ...body }) }, ip);

describe('info and menu', () => {
  it('returns restaurant info', async () => {
    const r = await call('/api/r/zhar/info');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: 'zhar', tz: 'Europe/Kyiv' });
  });

  it('serves the menu in the local language and in English', async () => {
    const it_ = await (await call('/api/r/lucciola/menu?lang=local')).json() as any;
    const en = await (await call('/api/r/lucciola/menu?lang=en')).json() as any;
    expect(it_.sections[1].title).toBe('Primi');
    expect(en.sections[1].title).toBe('First courses');
    expect(it_.sections[0].dishes[0]).toMatchObject({ name: 'Olive all’ascolana', price: 900, outOfStock: false });
  });

  it('answers 404 for an unknown restaurant', async () => {
    expect((await call('/api/r/nope/info')).status).toBe(404);
  });
});

describe('slots', () => {
  it('lists slots for a date and party', async () => {
    const r = await call(`/api/r/lucciola/slots?date=${openDay()}&party=2`);
    const body = await r.json() as any;
    expect(body.slots.map((s: any) => s.time)).toEqual(['12:00', '12:30', '13:00', '19:00', '19:30', '20:00', '20:30', '21:00']);
    expect(body.slots.every((s: any) => s.available)).toBe(true);
  });

  it('rejects a bad party size', async () => {
    expect((await call(`/api/r/lucciola/slots?date=${openDay()}&party=12`)).status).toBe(400);
  });
});

describe('bookings', () => {
  it('creates a booking with a code', async () => {
    const r = await book('lucciola', { date: openDay(), time: '19:00', party: 2 });
    expect(r.status).toBe(201);
    const b = await r.json() as any;
    expect(b.code).toMatch(/^TR-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(b).toMatchObject({ time: '19:00', party: 2 });
  });

  it('rejects invalid fields', async () => {
    const day = openDay();
    for (const bad of [{ name: 'A' }, { phone: 'call me' }, { comment: 'x'.repeat(301) }, { time: '19:10' }, { party: 0 }])
      expect((await book('lucciola', { date: day, time: '19:00', party: 2, ...bad })).status, JSON.stringify(bad)).toBe(400);
  });

  it('rejects bots that fill the hidden field', async () => {
    expect((await book('lucciola', { date: openDay(), time: '19:00', party: 2, website: 'http://spam' })).status).toBe(400);
  });

  it('limits bookings per address', async () => {
    const day = openDay(5);
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await book('zhar', { date: day, time: '12:00', party: 2 }, '10.9.9.9')).status);
    expect(codes.slice(0, 5).every(s => s === 201)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('gives the last big table to only one of two simultaneous guests', async () => {
    const day = openDay(6);
    expect((await book('lucciola', { date: day, time: '20:00', party: 6 })).status).toBe(201);
    const [a, b] = await Promise.all([
      book('lucciola', { date: day, time: '20:00', party: 6 }),
      book('lucciola', { date: day, time: '20:00', party: 6 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const lost = await (a.status === 409 ? a : b).json() as any;
    expect(lost.error).toBe('slot_taken');
    expect(lost.slots.find((s: any) => s.time === '20:00').available).toBe(false);
  });

  it('cancels only with the matching phone', async () => {
    const r = await book('zhar', { date: openDay(7), time: '18:00', party: 4 });
    const { code } = await r.json() as any;
    const wrong = await call(`/api/r/zhar/bookings/${code}`, { method: 'DELETE', body: JSON.stringify({ phone: '+380 00 000 0000' }) });
    expect(wrong.status).toBe(404);
    const right = await call(`/api/r/zhar/bookings/${code}`, { method: 'DELETE', body: JSON.stringify({ phone: guest.phone }) });
    expect(right.status).toBe(204);
  });

  it('refuses a closed day', async () => {
    const day = openDay(8);
    await env.DB.prepare("INSERT INTO closed_days (rid, date) VALUES ('zhar', ?)").bind(day).run();
    const r = await book('zhar', { date: day, time: '18:00', party: 2 });
    expect(r.status).toBe(409);
    expect((await r.json() as any).error).toBe('closed');
  });
});

describe('cors', () => {
  it('allows the github pages origin only', async () => {
    const ok = await call('/api/r/zhar/info', { headers: { origin: 'https://yehorss.github.io' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://yehorss.github.io');
    const evil = await call('/api/r/zhar/info', { headers: { origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
