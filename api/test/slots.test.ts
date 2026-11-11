import { describe, expect, it } from 'vitest';
import { availableSlots, localToUtc, pickTable, slotTimes, utcToLocal, type Shift, type Table } from '../src/slots';

const LUCCIOLA: Shift[] = [0, 2, 3, 4, 5, 6].flatMap(d => [
  { weekday: d, open: '12:00', close: '15:00' },
  { weekday: d, open: '19:00', close: '23:00' },
]);
const ZHAR: Shift[] = [0, 1, 2, 3, 4, 5, 6].map(d => ({ weekday: d, open: '12:00', close: '23:00' }));
const ROME = 'Europe/Rome', KYIV = 'Europe/Kyiv';
const TABLES: Table[] = [{ id: 1, seats: 2 }, { id: 2, seats: 4 }, { id: 3, seats: 6 }];
const H = 3_600_000;

describe('time zones', () => {
  it('converts Kyiv local time to UTC in winter', () => {
    expect(localToUtc('2026-12-01', '21:00', KYIV)).toBe(Date.UTC(2026, 11, 1, 19, 0));
  });
  it('converts Rome local time to UTC in summer', () => {
    expect(localToUtc('2026-07-01', '19:00', ROME)).toBe(Date.UTC(2026, 6, 1, 17, 0));
  });
  it('round-trips back to local', () => {
    expect(utcToLocal(Date.UTC(2026, 11, 1, 19, 0), KYIV)).toEqual({ date: '2026-12-01', time: '21:00' });
  });
});

describe('slotTimes', () => {
  it('is empty on a lucciola monday', () => expect(slotTimes(LUCCIOLA, '2026-11-16', ROME)).toEqual([]));
  it('covers both lucciola shifts', () => {
    expect(slotTimes(LUCCIOLA, '2026-11-17', ROME)).toEqual(['12:00', '12:30', '13:00', '19:00', '19:30', '20:00', '20:30', '21:00']);
  });
  it('runs from 12:00 to 21:00 at zhar', () => {
    const s = slotTimes(ZHAR, '2026-11-17', KYIV);
    expect(s).toHaveLength(19);
    expect([s[0], s.at(-1)]).toEqual(['12:00', '21:00']);
  });
});

describe('pickTable', () => {
  const at = (h: number) => Date.UTC(2026, 10, 17, h);
  it('takes the smallest table that fits', () => {
    expect(pickTable(TABLES, [], 2, at(18), at(20))?.id).toBe(1);
    expect(pickTable(TABLES, [], 3, at(18), at(20))?.id).toBe(2);
  });
  it('moves up when the small one is busy', () => {
    expect(pickTable(TABLES, [{ table_id: 1, start_utc: at(17), end_utc: at(19) }], 2, at(18), at(20))?.id).toBe(2);
  });
  it('returns null when nothing fits', () => {
    expect(pickTable(TABLES, [{ table_id: 3, start_utc: at(18), end_utc: at(20) }], 6, at(19), at(21))).toBeNull();
  });
  it('lets a booking start exactly when the previous one ends', () => {
    expect(pickTable(TABLES, [{ table_id: 3, start_utc: at(17), end_utc: at(19) }], 6, at(19), at(21))?.id).toBe(3);
  });
});

describe('availableSlots', () => {
  const ctx = { hours: LUCCIOLA, tables: TABLES, busy: [], closed: [], tz: ROME };
  const now = localToUtc('2026-11-17', '18:30', ROME);

  it('needs at least an hour of notice', () => {
    const s = availableSlots(ctx, '2026-11-17', 2, now);
    expect(s.find(x => x.time === '19:00')!.available).toBe(false);
    expect(s.find(x => x.time === '19:30')!.available).toBe(true);
    expect(s.find(x => x.time === '12:00')!.available).toBe(false);
  });

  it('refuses dates more than 30 days ahead', () => {
    expect(availableSlots(ctx, '2026-12-20', 2, now).every(x => !x.available)).toBe(true);
  });

  it('is empty on a closed day', () => {
    expect(availableSlots({ ...ctx, closed: ['2026-11-20'] }, '2026-11-20', 2, now)).toEqual([]);
  });

  it('rejects parties over 8 and under 1', () => {
    expect(() => availableSlots(ctx, '2026-11-18', 9, now)).toThrow(RangeError);
    expect(() => availableSlots(ctx, '2026-11-18', 0, now)).toThrow(RangeError);
  });

  it('closes slots that overlap the only big table', () => {
    const busy = [{ table_id: 3, start_utc: localToUtc('2026-11-18', '19:00', ROME), end_utc: localToUtc('2026-11-18', '21:00', ROME) }];
    const s = availableSlots({ ...ctx, busy }, '2026-11-18', 6, now);
    expect(s.filter(x => x.available).map(x => x.time)).toEqual(['12:00', '12:30', '13:00', '21:00']);
  });
});
