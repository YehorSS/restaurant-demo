import { describe, expect, it } from 'vitest';
import { initial, reduce, type State } from '../lucciola/src/booking';

const slots = [{ time: '19:00', available: true }, { time: '19:30', available: false }];
const ready = (): State => {
  let s = reduce(initial(), { type: 'date', date: '2026-11-17', open: true });
  s = reduce(s, { type: 'slots', slots });
  s = reduce(s, { type: 'time', time: '19:00' });
  s = reduce(s, { type: 'guest', field: 'name', value: 'Marta' });
  return reduce(s, { type: 'guest', field: 'phone', value: '+39 333 1234567' });
};

describe('booking steps', () => {
  it('ignores a closed day', () => {
    expect(reduce(initial(), { type: 'date', date: '2026-11-16', open: false }).date).toBeNull();
  });

  it('loads slots after picking a day', () => {
    const s = reduce(initial(), { type: 'date', date: '2026-11-17', open: true });
    expect([s.date, s.loading]).toEqual(['2026-11-17', true]);
  });

  it('does not take a time that is not free', () => {
    let s = reduce(initial(), { type: 'date', date: '2026-11-17', open: true });
    s = reduce(s, { type: 'slots', slots });
    expect(reduce(s, { type: 'time', time: '19:30' }).time).toBeNull();
  });

  it('drops the chosen time when the party size changes', () => {
    const s = reduce(ready(), { type: 'party', party: 5 });
    expect([s.time, s.step, s.loading, s.party]).toEqual([null, 'pick', true, 5]);
  });

  it('goes back to times with fresh slots on 409 and keeps the guest', () => {
    const fresh = [{ time: '19:00', available: false }, { time: '20:00', available: true }];
    const s = reduce(reduce(ready(), { type: 'send' }), { type: 'failed', error: 'taken', slots: fresh });
    expect(s.step).toBe('pick');
    expect(s.time).toBeNull();
    expect(s.slots).toEqual(fresh);
    expect(s.error).toBe('taken');
    expect(s.guest).toMatchObject({ name: 'Marta', phone: '+39 333 1234567' });
  });

  it('stays on the form with a hint on 400', () => {
    const s = reduce(reduce(ready(), { type: 'send' }), { type: 'failed', error: 'invalid' });
    expect([s.step, s.error]).toEqual(['form', 'invalid']);
  });

  it('shows the code after booking and can be cancelled', () => {
    let s = reduce(reduce(ready(), { type: 'send' }), { type: 'booked', made: { code: 'TR-AB12', date: '2026-11-17', time: '19:00', party: 2 } });
    expect([s.step, s.made?.code]).toEqual(['done', 'TR-AB12']);
    s = reduce(s, { type: 'cancelled' });
    expect(s.step).toBe('cancelled');
  });
});
