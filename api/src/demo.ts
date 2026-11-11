import { newCode } from './codes';
import { seedMenu } from './seed';
import { localToUtc, pickTable, slotTimes, utcToLocal, VISIT_MIN, type Busy, type Shift, type Table } from './slots';
import { ACTIVE } from './store';

const DAYS = 7;
const NAMES: Record<string, string[]> = {
  lucciola: ['Giulia Bianchi', 'Marco Ferri', 'Chiara Conti', 'Luca Marini', 'Sara Gallo', 'Paolo Greco', 'Anna Ricci', 'Tom Walker', 'Emma Schulz', 'Davide Costa'],
  zhar: ['Олена Коваль', 'Андрій Шевчук', 'Ірина Бондар', 'Максим Ткаченко', 'Софія Мельник', 'Дмитро Кравець', 'Анна Лисенко', 'Олег Савчук', 'Mark Evans', 'Юлія Руденко'],
};

/** Share of tables to keep busy at a slot: evenings 40-60 %, daytime 15-30 %. */
const targetShare = (time: string, rnd: () => number) => (time >= '18:00' ? 0.4 + rnd() * 0.2 : 0.15 + rnd() * 0.15);

function party(rnd: () => number): number {
  const x = rnd();
  return x < 0.5 ? 2 : x < 0.85 ? 3 + Math.floor(rnd() * 2) : 5 + Math.floor(rnd() * 2);
}

export async function resetDemo(db: D1Database, now: number, rnd: () => number): Promise<{ created: number }> {
  await db.batch([
    db.prepare("DELETE FROM bookings WHERE source IN ('site', 'demo')"),
    db.prepare("DELETE FROM closed_days WHERE created_by = 'demo'"),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM hits WHERE window_start < ?').bind(Math.floor(now / 1000) - 86_400),
  ]);
  await seedMenu(db);

  const restaurants = (await db.prepare('SELECT id, tz, prefix FROM restaurants').all<{ id: string; tz: string; prefix: string }>()).results;
  const stmts: D1PreparedStatement[] = [];
  for (const r of restaurants) {
    const [hours, tables, kept, closed] = await db.batch([
      db.prepare('SELECT weekday, open, close FROM hours WHERE rid = ?').bind(r.id),
      db.prepare('SELECT id, seats FROM tables WHERE rid = ?').bind(r.id),
      db.prepare(`SELECT table_id, start_utc, end_utc FROM bookings WHERE rid = ? AND ${ACTIVE}`).bind(r.id),
      db.prepare('SELECT date FROM closed_days WHERE rid = ?').bind(r.id),
    ]);
    const ts = tables.results as unknown as Table[];
    const busy = [...(kept.results as unknown as Busy[])];
    const closedDays = new Set((closed.results as { date: string }[]).map(x => x.date));
    const names = NAMES[r.id] ?? NAMES.zhar;

    for (let d = 0; d < DAYS; d++) {
      const date = utcToLocal(now + d * 86_400_000, r.tz).date;
      if (closedDays.has(date)) continue;
      for (const time of slotTimes(hours.results as unknown as Shift[], date, r.tz)) {
        const start = localToUtc(date, time, r.tz);
        if (start < now) continue;
        const end = start + VISIT_MIN * 60_000;
        const want = Math.ceil(targetShare(time, rnd) * ts.length);
        let occupied = busy.filter(b => b.start_utc <= start && b.end_utc > start).length;
        while (occupied < want) {
          let p = party(rnd);
          let t = pickTable(ts, busy, p, start, end);
          if (!t) { p = 2; t = pickTable(ts, busy, p, start, end); }
          if (!t) break;
          busy.push({ table_id: t.id, start_utc: start, end_utc: end });
          occupied++;
          const status = rnd() < 0.7 ? 'confirmed' : 'new';
          stmts.push(db.prepare(
            "INSERT OR IGNORE INTO bookings (rid, code, table_id, start_utc, end_utc, party, name, phone, comment, status, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'demo', ?)",
          ).bind(r.id, newCode(r.prefix), t.id, start, end, p, names[Math.floor(rnd() * names.length)], `+${r.id === 'zhar' ? '380 67' : '39 333'} ${100 + Math.floor(rnd() * 900)} ${1000 + Math.floor(rnd() * 9000)}`, status, now));
        }
      }
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { created: stmts.length };
}
