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

import { afterEach, vi } from 'vitest';
import { createBooking } from '../lucciola/src/booking';

describe('review fixes: errors keep the guest on the right step', () => {
  it('stays on the times when slots fail to load', () => {
    let s = reduce(initial(), { type: 'date', date: '2026-11-17', open: true });
    s = reduce(s, { type: 'failed', error: 'error', from: 'slots' });
    expect([s.step, s.loading, s.error]).toEqual(['pick', false, 'error']);
  });

  it('keeps the confirmation when cancel fails', () => {
    let s = reduce(reduce(ready(), { type: 'send' }), { type: 'booked', made: { code: 'TR-AB12', date: '2026-11-17', time: '19:00', party: 2 } });
    s = reduce(s, { type: 'failed', error: 'error', from: 'cancel' });
    expect([s.step, s.error, s.made?.code]).toEqual(['done', 'error', 'TR-AB12']);
  });

  it('forgets a booking the restaurant no longer has', () => {
    let s = reduce(reduce(ready(), { type: 'send' }), { type: 'booked', made: { code: 'TR-AB12', date: '2026-11-17', time: '19:00', party: 2 } });
    s = reduce(s, { type: 'forget' });
    expect([s.step, s.made]).toEqual(['pick', null]);
  });
});

const info = { id: 'lucciola', name: 'L', tz: 'Europe/Rome', phone: '+39', maxParty: 8, hours: [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, open: '19:00', close: '23:00' })), closed: [] };
const tick = () => new Promise(r => setTimeout(r, 0));
function fakeApi(slotsFor: (date: string) => { time: string; available: boolean }[]) {
  return {
    slots: vi.fn(async (_r: string, date: string) => ({ slots: slotsFor(date) })),
    book: vi.fn(), cancel: vi.fn(), info: vi.fn(), menu: vi.fn(),
  } as any;
}

describe('review fixes: widget', () => {
  afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

  it('keeps keyboard focus on the guests picker after a change', async () => {
    const root = document.createElement('div'); document.body.append(root);
    createBooking(root, fakeApi(() => [{ time: '19:00', available: true }]), info, 'en', '+39');
    await tick();
    const sel = root.querySelector<HTMLSelectElement>('#bk-party')!;
    sel.focus(); sel.value = '3'; sel.dispatchEvent(new Event('change'));
    await tick();
    expect(document.activeElement?.id).toBe('bk-party');
  });

  it('skips to the next day when today has nothing left', async () => {
    const root = document.createElement('div'); document.body.append(root);
    let first: string | null = null;
    createBooking(root, fakeApi(date => { first ??= date; return [{ time: '19:00', available: date !== first }]; }), info, 'en', '+39');
    for (let i = 0; i < 5; i++) await tick();
    expect(root.querySelector('.bk-day[aria-pressed="true"]')!.getAttribute('data-date')).not.toBe(first);
    expect(root.querySelector('.bk-time:not([disabled])')).not.toBeNull();
  });

  it('offers a new booking from the confirmation', async () => {
    localStorage.setItem('lucciola-last', JSON.stringify({ code: 'TR-AB12', date: '2099-01-01', time: '19:00', party: 2, phone: '+39 333' }));
    const root = document.createElement('div'); document.body.append(root);
    createBooking(root, fakeApi(() => []), info, 'en', '+39');
    expect(root.querySelector('#bk-new')).not.toBeNull();
  });
});
