import { Hono } from 'hono';
import type { Env } from './seed';
import { requireRole, type AuthVars } from './auth';
import { checkGuest, fail, TIME_RE, validDate } from './guard';
import { localToUtc, MAX_PARTY, utcToLocal } from './slots';
import { ACTIVE, getRestaurant, insertBooking, loadCtx, type Restaurant } from './store';

type Vars = AuthVars & { r: Restaurant };
export const admin = new Hono<{ Bindings: Env; Variables: Vars }>();

const STATUSES = ['new', 'confirmed', 'seated', 'cancelled', 'no_show'] as const;
const INACTIVE = new Set(['cancelled', 'no_show']);
const TEXT_FIELDS = ['name_en', 'name_local', 'desc_en', 'desc_local'] as const;

admin.use('*', requireRole('owner', 'demo'));

admin.use('/r/:rid/*', async (c, next) => {
  const r = await getRestaurant(c.env.DB, c.req.param('rid'));
  if (!r) return fail(c, 404, 'not_found', 'Unknown restaurant');
  c.set('r', r);
  await next();
});

function view(row: any, tz: string) {
  const s = utcToLocal(row.start_utc, tz), e = utcToLocal(row.end_utc, tz);
  return { id: row.id, code: row.code, table_id: row.table_id, date: s.date, start: s.time, end: e.time, party: row.party, name: row.name, phone: row.phone, comment: row.comment, status: row.status, source: row.source };
}

admin.get('/r/:rid/day', async c => {
  const r = c.get('r'), date = c.req.query('date');
  if (!validDate(date)) return fail(c, 400, 'invalid', 'date must be YYYY-MM-DD');
  const from = localToUtc(date, '00:00', r.tz), to = from + 86_400_000;
  const [tables, rows, hours] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, seats, label FROM tables WHERE rid = ? ORDER BY id').bind(r.id),
    c.env.DB.prepare('SELECT * FROM bookings WHERE rid = ? AND start_utc >= ? AND start_utc < ? ORDER BY start_utc').bind(r.id, from, to),
    c.env.DB.prepare('SELECT open, close FROM hours WHERE rid = ? AND weekday = ? ORDER BY open').bind(r.id, new Date(`${date}T12:00:00Z`).getUTCDay()),
  ]);
  return c.json({ date, tz: r.tz, hours: hours.results, tables: tables.results, bookings: (rows.results as any[]).map(b => view(b, r.tz)) });
});

admin.get('/r/:rid/bookings', async c => {
  const r = c.get('r');
  const q = (c.req.query('q') ?? '').trim(), status = c.req.query('status'), from = c.req.query('from'), to = c.req.query('to');
  const where = ['rid = ?'], args: unknown[] = [r.id];
  if (q) {
    const d = q.replace(/\D/g, '');
    where.push(`(code = ? OR name LIKE ?${d.length >= 3 ? " OR replace(replace(replace(replace(replace(phone,' ',''),'+',''),'-',''),'(',''),')','') LIKE ?" : ''})`);
    args.push(q.toUpperCase(), `%${q}%`, ...(d.length >= 3 ? [`%${d}%`] : []));
  }
  if (status && (STATUSES as readonly string[]).includes(status)) { where.push('status = ?'); args.push(status); }
  if (validDate(from)) { where.push('start_utc >= ?'); args.push(localToUtc(from, '00:00', r.tz)); }
  if (validDate(to)) { where.push('start_utc < ?'); args.push(localToUtc(to, '00:00', r.tz) + 86_400_000); }
  const rows = await c.env.DB.prepare(`SELECT * FROM bookings WHERE ${where.join(' AND ')} ORDER BY start_utc DESC LIMIT 200`).bind(...args).all();
  return c.json({ bookings: (rows.results as any[]).map(b => view(b, r.tz)) });
});

admin.post('/r/:rid/bookings', async c => {
  const r = c.get('r');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const guest = body && checkGuest(body);
  const party = Number(body?.party);
  const { date, time, table_id } = (body ?? {}) as { date: unknown; time: unknown; table_id: unknown };
  if (!guest || !Number.isInteger(party) || party < 1 || party > 20 || !validDate(date) || typeof time !== 'string' || !TIME_RE.test(time))
    return fail(c, 400, 'invalid', 'Check guest, party, date and time');
  const ctx = await loadCtx(c.env.DB, r, date);
  let candidates = ctx.tables;
  if (table_id !== undefined && table_id !== null) {
    candidates = ctx.tables.filter(t => t.id === Number(table_id));
    if (!candidates.length) return fail(c, 400, 'invalid', 'Unknown table');
    if (candidates[0].seats < party) return fail(c, 400, 'invalid', 'The table is too small for this party');
  } else if (party > MAX_PARTY) {
    return fail(c, 400, 'invalid', 'Pick a table for parties over 8');
  }
  const made = await insertBooking(c.env.DB, r, { date, time, party, ...guest, source: 'admin', status: 'confirmed' }, candidates);
  if (!made) return fail(c, 409, 'slot_taken', 'No free table at this time');
  const row = await c.env.DB.prepare('SELECT * FROM bookings WHERE code = ?').bind(made.code).first();
  return c.json(view(row, r.tz), 201);
});

admin.patch('/bookings/:id', async c => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ status?: unknown; table_id?: unknown }>().catch(() => ({} as { status?: unknown; table_id?: unknown }));
  const row = await c.env.DB.prepare('SELECT b.*, r.tz FROM bookings b JOIN restaurants r ON r.id = b.rid WHERE b.id = ?').bind(id).first<any>();
  if (!row) return fail(c, 404, 'not_found', 'Booking not found');
  const status = body.status === undefined ? row.status : body.status;
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) return fail(c, 400, 'invalid', `status must be one of ${STATUSES.join(', ')}`);
  const tableId = body.table_id === undefined ? row.table_id : Number(body.table_id);
  if (tableId !== row.table_id) {
    const t = await c.env.DB.prepare('SELECT seats FROM tables WHERE id = ? AND rid = ?').bind(tableId, row.rid).first<{ seats: number }>();
    if (!t) return fail(c, 400, 'invalid', 'Unknown table');
    if (t.seats < row.party) return fail(c, 400, 'invalid', 'The table is too small for this party');
  }
  // becoming active again, or moving tables, must not overlap another active booking
  const guard = !INACTIVE.has(status) && (tableId !== row.table_id || INACTIVE.has(row.status));
  const res = await c.env.DB.prepare(
    `UPDATE bookings SET status = ?, table_id = ? WHERE id = ?${guard ? ` AND NOT EXISTS (SELECT 1 FROM bookings WHERE id != ? AND table_id = ? AND ${ACTIVE} AND start_utc < ? AND end_utc > ?)` : ''}`,
  ).bind(status, tableId, id, ...(guard ? [id, tableId, row.end_utc, row.start_utc] : [])).run();
  if (res.meta.changes !== 1) return fail(c, 409, 'slot_taken', 'That table is taken at this time');
  return c.json(view({ ...row, status, table_id: tableId }, row.tz));
});

admin.get('/r/:rid/menu', async c => {
  const r = c.get('r');
  const [sections, dishes] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM menu_sections WHERE rid = ? ORDER BY sort').bind(r.id),
    c.env.DB.prepare('SELECT d.* FROM dishes d JOIN menu_sections s ON s.id = d.section_id WHERE s.rid = ? ORDER BY d.sort').bind(r.id),
  ]);
  const ds = dishes.results as any[];
  return c.json({ sections: (sections.results as any[]).map(s => ({ ...s, dishes: ds.filter(d => d.section_id === s.id) })) });
});

admin.patch('/dishes/:id', async c => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return fail(c, 400, 'invalid', 'JSON body expected');
  const touchesText = TEXT_FIELDS.some(f => f in body);
  if (touchesText && c.get('user').role !== 'owner') return fail(c, 403, 'forbidden', 'The demo account cannot change menu texts');
  const sets: string[] = [], args: unknown[] = [];
  if ('price_cents' in body) {
    const p = Number(body.price_cents);
    if (!Number.isInteger(p) || p < 0 || p > 10_000_000) return fail(c, 400, 'invalid', 'price_cents must be a whole number from 0');
    sets.push('price_cents = ?'); args.push(p);
  }
  if ('out_of_stock' in body) { sets.push('out_of_stock = ?'); args.push(body.out_of_stock ? 1 : 0); }
  for (const f of TEXT_FIELDS) if (f in body) {
    const v = typeof body[f] === 'string' ? (body[f] as string).trim() : '';
    if (!v || v.length > 300) return fail(c, 400, 'invalid', `${f} must be 1-300 characters`);
    sets.push(`${f} = ?`); args.push(v);
  }
  if (!sets.length) return fail(c, 400, 'invalid', 'Nothing to change');
  const res = await c.env.DB.prepare(`UPDATE dishes SET ${sets.join(', ')} WHERE id = ?`).bind(...args, Number(c.req.param('id'))).run();
  if (res.meta.changes !== 1) return fail(c, 404, 'not_found', 'Dish not found');
  return c.json(await c.env.DB.prepare('SELECT * FROM dishes WHERE id = ?').bind(Number(c.req.param('id'))).first());
});

admin.get('/r/:rid/closed-days', async c => {
  const rows = await c.env.DB.prepare('SELECT date FROM closed_days WHERE rid = ? ORDER BY date').bind(c.get('r').id).all<{ date: string }>();
  return c.json({ closed: rows.results.map(x => x.date) });
});

admin.post('/r/:rid/closed-days', requireRole('owner'), async c => {
  const { date } = await c.req.json<{ date?: unknown }>().catch(() => ({} as { date?: unknown }));
  if (!validDate(date)) return fail(c, 400, 'invalid', 'date must be YYYY-MM-DD');
  await c.env.DB.prepare("INSERT OR IGNORE INTO closed_days (rid, date, created_by) VALUES (?, ?, 'owner')").bind(c.get('r').id, date).run();
  return c.json({ date }, 201);
});

admin.delete('/r/:rid/closed-days/:date', requireRole('owner'), async c => {
  await c.env.DB.prepare('DELETE FROM closed_days WHERE rid = ? AND date = ?').bind(c.get('r').id, c.req.param('date')).run();
  return c.body(null, 204);
});

