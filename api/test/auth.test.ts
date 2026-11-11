import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password';
import { seed } from '../src/seed';

beforeAll(async () => { await seed(env.DB); });

let ipSeq = 0;
const login = (body: object, ip = `10.1.0.${++ipSeq}`) =>
  exports.default.fetch('http://x/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
const me = (cookie?: string) => exports.default.fetch('http://x/api/auth/me', { headers: cookie ? { cookie } : {} });
const sid = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];

describe('passwords', () => {
  it('verifies the right password only', async () => {
    const h = await hashPassword('secret');
    expect(await verifyPassword('secret', h.hash, h.salt)).toBe(true);
    expect(await verifyPassword('Secret', h.hash, h.salt)).toBe(false);
  });
  it('salts every hash', async () => {
    expect((await hashPassword('x')).hash).not.toBe((await hashPassword('x')).hash);
  });
});

describe('login', () => {
  it('logs in demo with a locked-down cookie', async () => {
    const r = await login({ login: 'demo', password: 'demo' });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie')!;
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(cookie).toContain(flag);
    expect(await (await me(sid(r))).json()).toEqual({ login: 'demo', role: 'demo' });
  });

  it('logs in the owner with the secret password', async () => {
    const r = await login({ login: 'owner', password: 'owner-test-pass' });
    expect(r.status).toBe(200);
    expect(await (await me(sid(r))).json()).toEqual({ login: 'owner', role: 'owner' });
  });

  it('refuses a wrong password', async () => {
    expect((await login({ login: 'demo', password: 'nope' })).status).toBe(401);
    expect((await login({ login: 'owner', password: 'nope' })).status).toBe(401);
  });

  it('locks out after five failures even with the right password', async () => {
    const ip = '10.1.9.9';
    for (let i = 0; i < 5; i++) expect((await login({ login: 'demo', password: 'bad' }, ip)).status).toBe(401);
    expect((await login({ login: 'demo', password: 'demo' }, ip)).status).toBe(429);
  });

  it('needs a session for me', async () => {
    expect((await me()).status).toBe(401);
    expect((await me('sid=forged')).status).toBe(401);
  });

  it('ends the session on logout', async () => {
    const cookie = sid(await login({ login: 'demo', password: 'demo' }));
    const out = await exports.default.fetch('http://x/api/auth/logout', { method: 'POST', headers: { cookie } });
    expect(out.status).toBe(204);
    expect((await me(cookie)).status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const cookie = sid(await login({ login: 'demo', password: 'demo' }));
    await env.DB.prepare('UPDATE sessions SET expires_at = 0').run();
    expect((await me(cookie)).status).toBe(401);
  });
});
