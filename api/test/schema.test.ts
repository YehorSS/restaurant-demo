import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../src/seed';

beforeAll(async () => { await seed(env.DB); });

const count = async (sql: string, ...args: unknown[]) =>
  (await env.DB.prepare(sql).bind(...args).first<{ n: number }>())!.n;

describe('seed', () => {
  it('creates both restaurants', async () => {
    expect(await count('SELECT count(*) n FROM restaurants')).toBe(2);
  });

  it('creates 13 tables for lucciola and 18 for zhar', async () => {
    expect(await count("SELECT count(*) n FROM tables WHERE rid='lucciola'")).toBe(13);
    expect(await count("SELECT count(*) n FROM tables WHERE rid='zhar'")).toBe(18);
  });

  it('closes lucciola on mondays', async () => {
    expect(await count("SELECT count(*) n FROM hours WHERE rid='lucciola' AND weekday=1")).toBe(0);
    expect(await count("SELECT count(*) n FROM hours WHERE rid='lucciola' AND weekday=2")).toBe(2);
  });

  it('has four menu sections with dishes for each restaurant', async () => {
    for (const rid of ['lucciola', 'zhar']) {
      expect(await count('SELECT count(*) n FROM menu_sections WHERE rid=?', rid)).toBe(4);
      expect(await count('SELECT count(*) n FROM dishes d JOIN menu_sections s ON s.id=d.section_id WHERE s.rid=?', rid)).toBeGreaterThanOrEqual(16);
    }
  });

  it('can run twice without duplicating', async () => {
    await seed(env.DB);
    expect(await count('SELECT count(*) n FROM restaurants')).toBe(2);
  });
});

describe('health', () => {
  it('answers ok', async () => {
    const res = await exports.default.fetch('http://x/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
