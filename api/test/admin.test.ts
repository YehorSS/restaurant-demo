import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../src/seed';
import { utcToLocal } from '../src/slots';

let demo = '', owner = '', ipSeq = 0;
const req = (path: string, cookie: string, init: RequestInit = {}) =>
  exports.default.fetch(`http://x${path}`, { ...init, headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.2.0.${++ipSeq}`, cookie, ...(init.headers ?? {}) } });
const signIn = async (login: string, password: string) =>
  (await req('/api/auth/login', '', { method: 'POST', body: JSON.stringify({ login, password }) })).headers.get('set-cookie')!.split(';')[0];

const day = (offset: number) => utcToLocal(Date.now() + offset * 86_400_000, 'Europe/Kyiv').date;

beforeAll(async () => {
  await seed(env.DB);
  demo = await signIn('demo', 'demo');
  owner = await signIn('owner', 'owner-test-pass');
});

const manual = (cookie: string, body: object) =>
  req('/api/admin/r/zhar/bookings', cookie, { method: 'POST', body: JSON.stringify({ name: 'Ivan Petrenko', phone: '+380 67 111 2233', comment: '', party: 2, ...body }) });

describe('admin access', () => {
  it('needs a session', async () => {
    expect((await req(`/api/admin/r/zhar/day?date=${day(3)}`, '')).status).toBe(401);
  });
});

describe('day view and bookings', () => {
  it('shows tables and bookings of the local day', async () => {
    const d = day(3);
    expect((await manual(demo, { date: d, time: '19:00' })).status).toBe(201);
    const r = await (await req(`/api/admin/r/zhar/day?date=${d}`, demo)).json() as any;
    expect(r.tables).toHaveLength(18);
    const b = r.bookings.find((x: any) => x.name === 'Ivan Petrenko');
    expect(b).toMatchObject({ start: '19:00', end: '21:00', status: 'confirmed', source: 'admin' });
  });

  it('puts a manual booking on the chosen table and refuses a taken one', async () => {
    const d = day(4);
    const t = (await env.DB.prepare("SELECT id FROM tables WHERE rid='zhar' AND seats=8").first<{ id: number }>())!.id;
    expect((await manual(owner, { date: d, time: '18:00', party: 7, table_id: t })).status).toBe(201);
    const again = await manual(owner, { date: d, time: '19:00', party: 7, table_id: t });
    expect(again.status).toBe(409);
  });

  it('finds bookings by phone fragment and code', async () => {
    const made = await (await manual(demo, { date: day(5), time: '13:00', phone: '+380 50 999 4242' })).json() as any;
    const byPhone = await (await req('/api/admin/r/zhar/bookings?q=4242', demo)).json() as any;
    expect(byPhone.bookings.some((b: any) => b.code === made.code)).toBe(true);
    const byCode = await (await req(`/api/admin/r/zhar/bookings?q=${made.code}`, demo)).json() as any;
    expect(byCode.bookings).toHaveLength(1);
  });

  it('moves through statuses and frees the table on cancel', async () => {
    const d = day(6);
    const t = (await env.DB.prepare("SELECT id FROM tables WHERE rid='zhar' AND seats=8").first<{ id: number }>())!.id;
    const made = await (await manual(demo, { date: d, time: '18:00', party: 8, table_id: t })).json() as any;
    for (const status of ['confirmed', 'seated'])
      expect((await req(`/api/admin/bookings/${made.id}`, demo, { method: 'PATCH', body: JSON.stringify({ status }) })).status).toBe(200);
    expect((await req(`/api/admin/bookings/${made.id}`, demo, { method: 'PATCH', body: JSON.stringify({ status: 'eaten' }) })).status).toBe(400);
    expect((await manual(demo, { date: d, time: '18:30', party: 8, table_id: t })).status).toBe(409);
    await req(`/api/admin/bookings/${made.id}`, demo, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
    expect((await manual(demo, { date: d, time: '18:30', party: 8, table_id: t })).status).toBe(201);
  });
});

describe('menu and closed days by role', () => {
  const dish = async () => (await env.DB.prepare("SELECT d.id FROM dishes d JOIN menu_sections s ON s.id=d.section_id WHERE s.rid='zhar' LIMIT 1").first<{ id: number }>())!.id;
  const patch = async (cookie: string, body: object) => req(`/api/admin/dishes/${await dish()}`, cookie, { method: 'PATCH', body: JSON.stringify(body) });

  it('lets demo change price and stock', async () => {
    expect((await patch(demo, { price_cents: 22000, out_of_stock: true })).status).toBe(200);
    const menu = await (await req('/api/r/zhar/menu?lang=en', '')).json() as any;
    expect(menu.sections[0].dishes[0]).toMatchObject({ price: 22000, outOfStock: true });
  });

  it('keeps demo away from menu texts even through the API', async () => {
    expect((await patch(demo, { name_en: 'Something rude' })).status).toBe(403);
  });

  it('lets the owner change texts', async () => {
    expect((await patch(owner, { name_en: 'Salo, three ways' })).status).toBe(200);
  });

  it('rejects a negative price', async () => {
    expect((await patch(owner, { price_cents: -5 })).status).toBe(400);
  });

  it('keeps closed days for the owner', async () => {
    const d = day(9);
    expect((await req('/api/admin/r/zhar/closed-days', demo, { method: 'POST', body: JSON.stringify({ date: d }) })).status).toBe(403);
    expect((await req('/api/admin/r/zhar/closed-days', owner, { method: 'POST', body: JSON.stringify({ date: d }) })).status).toBe(201);
    const info = await (await req('/api/r/zhar/info', '')).json() as any;
    expect(info.closed).toContain(d);
    expect((await req(`/api/admin/r/zhar/closed-days/${d}`, owner, { method: 'DELETE' })).status).toBe(204);
  });
});
