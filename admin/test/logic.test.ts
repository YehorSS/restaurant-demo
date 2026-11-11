import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from '../../shared/api';
import { gridPlacement, gridRange, timeOptions } from '../src/grid';
import { DICT } from '../src/i18n';

describe('i18n', () => {
  it('has the same keys in UA and EN', () => {
    expect(Object.keys(DICT.uk).sort()).toEqual(Object.keys(DICT.en).sort());
  });
});

describe('grid', () => {
  it('places 19:00-21:00 on a day starting at 12:00', () => {
    expect(gridPlacement({ start: '19:00', end: '21:00' }, 12 * 60)).toEqual({ col: 15, span: 4 });
  });
  it('covers all shifts of the day', () => {
    expect(gridRange([{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }])).toEqual({ from: 720, to: 1380 });
  });
  it('falls back to a full day when closed', () => {
    expect(gridRange([])).toEqual({ from: 720, to: 1380 });
  });
  it('offers bookable start times every 30 minutes', () => {
    expect(timeOptions([{ open: '12:00', close: '15:00' }])).toEqual(['12:00', '12:30', '13:00']);
  });
});

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })));

  it('returns parsed JSON', async () => {
    reply(200, { ok: true });
    expect(await createApi('')('/api/health')).toEqual({ ok: true });
  });

  it('turns an error reply into ApiError', async () => {
    reply(409, { error: 'slot_taken', message: 'taken', slots: [] });
    const err = await createApi('')('/api/x', { method: 'POST' }).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, error: 'slot_taken' });
  });

  it('calls the sign-in hook on 401', async () => {
    reply(401, { error: 'unauthorized', message: 'Please sign in' });
    const hook = vi.fn();
    await createApi('', hook)('/api/admin/x').catch(() => {});
    expect(hook).toHaveBeenCalledOnce();
  });

  it('handles an empty 204', async () => {
    reply(204, null);
    expect(await createApi('')('/api/x', { method: 'DELETE' })).toBeNull();
  });
});
