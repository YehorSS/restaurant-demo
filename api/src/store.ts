import { newCode } from './codes';
import { localToUtc, MIN_NOTICE_MS, VISIT_MIN, type Busy, type Shift, type SlotCtx, type Table } from './slots';

export interface Restaurant { id: string; name: string; tz: string; phone: string; prefix: string }

export const ACTIVE = "status NOT IN ('cancelled','no_show')";

export async function getRestaurant(db: D1Database, rid: string): Promise<Restaurant | null> {
  return db.prepare('SELECT id, name, tz, phone, prefix FROM restaurants WHERE id = ?').bind(rid).first<Restaurant>();
}

/** Everything needed to compute slots for one local date. */
export async function loadCtx(db: D1Database, r: Restaurant, date: string): Promise<SlotCtx> {
  const from = localToUtc(date, '00:00', r.tz) - 86_400_000;
  const to = from + 3 * 86_400_000;
  const [hours, tables, busy, closed] = await db.batch([
    db.prepare('SELECT weekday, open, close FROM hours WHERE rid = ?').bind(r.id),
    db.prepare('SELECT id, seats FROM tables WHERE rid = ? ORDER BY seats, id').bind(r.id),
    db.prepare(`SELECT table_id, start_utc, end_utc FROM bookings WHERE rid = ? AND ${ACTIVE} AND start_utc < ? AND end_utc > ?`).bind(r.id, to, from),
    db.prepare('SELECT date FROM closed_days WHERE rid = ?').bind(r.id),
  ]);
  return {
    hours: hours.results as unknown as Shift[],
    tables: tables.results as unknown as Table[],
    busy: busy.results as unknown as Busy[],
    closed: (closed.results as { date: string }[]).map(x => x.date),
    tz: r.tz,
  };
}

export interface NewBooking { date: string; time: string; party: number; name: string; phone: string; comment: string; source: 'site' | 'admin' | 'demo'; status?: string }

/**
 * Tries the candidate tables smallest first. Each insert re-checks overlap inside the same
 * statement, so two simultaneous requests can never both get one table.
 */
export async function insertBooking(db: D1Database, r: Restaurant, b: NewBooking, candidates: Table[]): Promise<{ code: string; table_id: number } | null> {
  const start = localToUtc(b.date, b.time, r.tz);
  const end = start + VISIT_MIN * 60_000;
  for (const t of [...candidates].sort((x, y) => x.seats - y.seats || x.id - y.id)) {
    if (t.seats < b.party) continue;
    const code = newCode(r.prefix);
    const res = await db.prepare(
      `INSERT INTO bookings (rid, code, table_id, start_utc, end_utc, party, name, phone, comment, status, source, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE table_id = ? AND ${ACTIVE} AND start_utc < ? AND end_utc > ?)`,
    ).bind(r.id, code, t.id, start, end, b.party, b.name, b.phone, b.comment, b.status ?? 'new', b.source, Date.now(), t.id, end, start).run();
    if (res.meta.changes === 1) return { code, table_id: t.id };
  }
  return null;
}

export const noticeOk = (r: Restaurant, date: string, time: string, now = Date.now()) => localToUtc(date, time, r.tz) >= now + MIN_NOTICE_MS;
