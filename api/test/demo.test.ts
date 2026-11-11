import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDemo } from '../src/demo';
import { seed } from '../src/seed';
import { localToUtc, slotTimes, utcToLocal, type Shift } from '../src/slots';

let ipSeq = 0;
const req = (path: string, cookie: string, init: RequestInit = {}) =>
  exports.default.fetch(`http://x${path}`, { ...init, headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.3.0.${++ipSeq}`, cookie, ...(init.headers ?? {}) } });
const signIn = async (login: string, password: string) =>
  (await req('/api/auth/login', '', { method: 'POST', body: JSON.stringify({ login, password }) })).headers.get('set-cookie')!.split(';')[0];

// deterministic random for repeatable fills
function rng(seedValue = 42) {
  let s = seedValue;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let demo = '', owner = '';
beforeAll(async () => {
  await seed(env.DB);
  demo = await signIn('demo', 'demo');
  owner = await signIn('owner', 'owner-test-pass');
});

describe('reset endpoint', () => {
  it('is for the owner only', async () => {
    expect((await req('/api/admin/reset', demo, { method: 'POST' })).status).toBe(403);
    const r = await req('/api/admin/reset', owner, { method: 'POST' });
    expect(r.status).toBe(200);
    expect((await r.json() as any).created).toBeGreaterThan(0);
  });
});

describe('resetDemo', () => {
  it('never double-books a table', async () => {
    await resetDemo(env.DB, Date.now(), rng(1));
    const clash = await env.DB.prepare(
      `SELECT count(*) n FROM bookings a JOIN bookings b ON a.table_id = b.table_id AND a.id < b.id
       WHERE a.status NOT IN ('cancelled','no_show') AND b.status NOT IN ('cancelled','no_show')
       AND a.start_utc < b.end_utc AND b.start_utc < a.end_utc`).first<{ n: number }>();
    expect(clash!.n).toBe(0);
  });

  it('fills evenings to 40-60 percent of tables', async () => {
    const now = Date.now();
    await resetDemo(env.DB, now, rng(7));
    const tables = (await env.DB.prepare("SELECT count(*) n FROM tables WHERE rid='zhar'").first<{ n: number }>())!.n;
    const hours = (await env.DB.prepare("SELECT weekday, open, close FROM hours WHERE rid='zhar'").all<Shift>()).results;
    const busy = (await env.DB.prepare("SELECT start_utc, end_utc FROM bookings WHERE rid='zhar' AND source='demo'").all<{ start_utc: number; end_utc: number }>()).results;
    for (let d = 1; d <= 6; d++) {
      const date = utcToLocal(now + d * 86_400_000, 'Europe/Kyiv').date;
      for (const time of slotTimes(hours, date, 'Europe/Kyiv').filter(t => t >= '18:00')) {
        const at = localToUtc(date, time, 'Europe/Kyiv');
        const share = busy.filter(b => b.start_utc <= at && b.end_utc > at).length / tables;
        expect(share, `${date} ${time}`).toBeGreaterThanOrEqual(0.4);
        expect(share, `${date} ${time}`).toBeLessThanOrEqual(Math.ceil(0.6 * tables) / tables);
      }
    }
  });

  it('keeps owner bookings and drops guest and demo ones', async () => {
    const date = utcToLocal(Date.now() + 20 * 86_400_000, 'Europe/Kyiv').date;
    const mk = (cookie: string, name: string) => req('/api/admin/r/zhar/bookings', cookie, { method: 'POST', body: JSON.stringify({ name, phone: '+380 67 000 1111', comment: '', party: 2, date, time: '12:00' }) });
    expect((await mk(owner, 'Owner Guest')).status).toBe(201);
    expect((await mk(demo, 'Demo Guest')).status).toBe(201);
    await resetDemo(env.DB, Date.now(), rng(3));
    const names = (await env.DB.prepare('SELECT name FROM bookings WHERE name IN (?, ?)').bind('Owner Guest', 'Demo Guest').all<{ name: string }>()).results.map(x => x.name);
    expect(names).toEqual(['Owner Guest']);
  });

  it('puts menu changes back', async () => {
    const id = (await env.DB.prepare("SELECT d.id FROM dishes d JOIN menu_sections s ON s.id=d.section_id WHERE s.rid='lucciola' LIMIT 1").first<{ id: number }>())!.id;
    await req(`/api/admin/dishes/${id}`, demo, { method: 'PATCH', body: JSON.stringify({ price_cents: 1, out_of_stock: true }) });
    await resetDemo(env.DB, Date.now(), rng(4));
    expect(await env.DB.prepare('SELECT price_cents, out_of_stock FROM dishes WHERE id = ?').bind(id).first()).toEqual({ price_cents: 900, out_of_stock: 0 });
  });
});
