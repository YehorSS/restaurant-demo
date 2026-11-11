import { Hono } from 'hono';
import type { Env } from './seed';
import { checkGuest, clientIp, digits, fail, limit, TIME_RE, validDate } from './guard';
import { availableSlots, MAX_PARTY } from './slots';
import { getRestaurant, insertBooking, loadCtx, type Restaurant } from './store';

type Vars = { r: Restaurant };
export const pub = new Hono<{ Bindings: Env; Variables: Vars }>();

pub.use('/r/:rid/*', async (c, next) => {
  const r = await getRestaurant(c.env.DB, c.req.param('rid'));
  if (!r) return fail(c, 404, 'not_found', 'Unknown restaurant');
  c.set('r', r);
  await next();
});

pub.get('/r/:rid/info', async c => {
  const r = c.get('r');
  const [hours, closed] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT weekday, open, close FROM hours WHERE rid = ? ORDER BY weekday, open').bind(r.id),
    c.env.DB.prepare('SELECT date FROM closed_days WHERE rid = ? ORDER BY date').bind(r.id),
  ]);
  return c.json({ id: r.id, name: r.name, tz: r.tz, phone: r.phone, maxParty: MAX_PARTY, hours: hours.results, closed: (closed.results as { date: string }[]).map(x => x.date) });
});

pub.get('/r/:rid/menu', async c => {
  const r = c.get('r');
  const local = c.req.query('lang') !== 'en';
  const [sections, dishes] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, title_en, title_local FROM menu_sections WHERE rid = ? ORDER BY sort').bind(r.id),
    c.env.DB.prepare('SELECT d.* FROM dishes d JOIN menu_sections s ON s.id = d.section_id WHERE s.rid = ? ORDER BY d.sort').bind(r.id),
  ]);
  const ds = dishes.results as any[];
  return c.json({
    sections: (sections.results as any[]).map(s => ({
      id: s.id,
      title: local ? s.title_local : s.title_en,
      dishes: ds.filter(d => d.section_id === s.id).map(d => ({
        id: d.id, name: local ? d.name_local : d.name_en, desc: local ? d.desc_local : d.desc_en,
        price: d.price_cents, weight: d.weight_g, photo: d.photo, fire: !!d.fire, outOfStock: !!d.out_of_stock,
      })),
    })),
  });
});

function parseParty(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PARTY ? n : null;
}

pub.get('/r/:rid/slots', async c => {
  if (!(await limit(c.env.DB, `slots:${clientIp(c)}`, 20, 60))) return fail(c, 429, 'too_many', 'Too many requests, try again in a minute');
  const date = c.req.query('date'), party = parseParty(c.req.query('party'));
  if (!validDate(date) || party === null) return fail(c, 400, 'invalid', 'date must be YYYY-MM-DD and party 1..8');
  const r = c.get('r');
  return c.json({ date, party, slots: availableSlots(await loadCtx(c.env.DB, r, date), date, party, Date.now()) });
});

pub.post('/r/:rid/bookings', async c => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object') return fail(c, 400, 'invalid', 'JSON body expected');
  if (body.website) return fail(c, 400, 'invalid', 'Invalid request');
  if (!(await limit(c.env.DB, `book:${clientIp(c)}`, 5, 60))) return fail(c, 429, 'too_many', 'Too many bookings, try again in a minute');
  const guest = checkGuest(body);
  const party = parseParty(body.party);
  const { date, time } = body as { date: unknown; time: unknown };
  if (!guest || party === null || !validDate(date) || typeof time !== 'string' || !TIME_RE.test(time))
    return fail(c, 400, 'invalid', 'Check name (2-60), phone, comment (up to 300), date, time and party');

  const r = c.get('r');
  const ctx = await loadCtx(c.env.DB, r, date);
  if (ctx.closed.includes(date)) return fail(c, 409, 'closed', 'The restaurant is closed on this day');
  const slots = availableSlots(ctx, date, party, Date.now());
  const slot = slots.find(s => s.time === time);
  if (!slot) return fail(c, 400, 'invalid', 'No such time slot');
  if (!slot.available) return fail(c, 409, 'slot_taken', 'This time is no longer available', { slots });

  const made = await insertBooking(c.env.DB, r, { date, time, party, ...guest, source: 'site' }, ctx.tables);
  if (!made) {
    const fresh = availableSlots(await loadCtx(c.env.DB, r, date), date, party, Date.now());
    return fail(c, 409, 'slot_taken', 'Someone just took this time', { slots: fresh });
  }
  return c.json({ code: made.code, date, time, party }, 201);
});

pub.delete('/r/:rid/bookings/:code', async c => {
  const body = await c.req.json<{ phone?: unknown }>().catch(() => ({} as { phone?: unknown }));
  const phone = typeof body.phone === 'string' ? digits(body.phone) : '';
  if (phone.length < 6) return fail(c, 404, 'not_found', 'Booking not found');
  const row = await c.env.DB.prepare("SELECT id, phone FROM bookings WHERE rid = ? AND code = ? AND status NOT IN ('cancelled')")
    .bind(c.get('r').id, c.req.param('code').toUpperCase()).first<{ id: number; phone: string }>();
  if (!row || digits(row.phone) !== phone) return fail(c, 404, 'not_found', 'Booking not found');
  await c.env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(row.id).run();
  return c.body(null, 204);
});
