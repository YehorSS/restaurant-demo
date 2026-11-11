export interface Shift { weekday: number; open: string; close: string }
export interface Table { id: number; seats: number }
export interface Busy { table_id: number; start_utc: number; end_utc: number }
export interface SlotCtx { hours: Shift[]; tables: Table[]; busy: Busy[]; closed: string[]; tz: string }
export interface Slot { time: string; available: boolean }

export const STEP_MIN = 30;
export const VISIT_MIN = 120;
export const MIN_NOTICE_MS = 60 * 60_000;
export const MAX_AHEAD_DAYS = 30;
export const MAX_PARTY = 8;

const MIN = 60_000;
const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function parts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(ms).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function utcToLocal(ms: number, tz: string): { date: string; time: string } {
  return parts(ms, tz);
}

export function localToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d) + toMin(time) * MIN;
  // offset of the zone at a given instant, in ms
  const offset = (ms: number) => {
    const p = parts(ms, tz);
    const [py, pm, pd] = p.date.split('-').map(Number);
    return Date.UTC(py, pm - 1, pd) + toMin(p.time) * MIN - ms;
  };
  let guess = wall - offset(wall);
  guess = wall - offset(guess); // second pass settles DST edges
  return guess;
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function slotTimes(hours: Shift[], date: string, _tz: string): string[] {
  const wd = weekdayOf(date);
  return hours
    .filter(h => h.weekday === wd)
    .sort((a, b) => toMin(a.open) - toMin(b.open))
    .flatMap(h => {
      const out: string[] = [];
      for (let t = toMin(h.open); t + VISIT_MIN <= toMin(h.close); t += STEP_MIN) out.push(fromMin(t));
      return out;
    });
}

export function pickTable(tables: Table[], busy: Busy[], party: number, start: number, end: number): Table | null {
  return [...tables]
    .filter(t => t.seats >= party)
    .sort((a, b) => a.seats - b.seats || a.id - b.id)
    .find(t => !busy.some(b => b.table_id === t.id && b.start_utc < end && b.end_utc > start)) ?? null;
}

export function availableSlots(ctx: SlotCtx, date: string, party: number, now: number): Slot[] {
  if (!Number.isInteger(party) || party < 1 || party > MAX_PARTY) throw new RangeError(`party must be 1..${MAX_PARTY}`);
  if (ctx.closed.includes(date)) return [];
  const latest = now + MAX_AHEAD_DAYS * 86_400_000;
  return slotTimes(ctx.hours, date, ctx.tz).map(time => {
    const start = localToUtc(date, time, ctx.tz);
    const end = start + VISIT_MIN * MIN;
    const inWindow = start >= now + MIN_NOTICE_MS && start <= latest;
    return { time, available: inWindow && pickTable(ctx.tables, ctx.busy, party, start, end) !== null };
  });
}
