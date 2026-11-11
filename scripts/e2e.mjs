// Books a table through the Lucciola site (local preview, live API), checks the booking
// is visible in the admin API as demo, then cancels it from the site.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';

// on Windows a shell-spawned server survives kill(); take down the whole process tree
const killTree = child => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']); else child.kill(); };

const API = 'https://restaurant-demo.yehorss.workers.dev';
const SITES = {
  lucciola: { port: 5173, key: 'lucciola-lang', last: 'lucciola-last', lang: 'en', open: null, day: '.bk-day', time: '.bk-time', name: '#bk-name', phone: '#bk-phone', send: '.bk-form .btn', code: '.bk-code strong', cancel: '#bk-cancel', anchor: '#prenota' },
  zhar: { port: 5174, key: 'zhar-lang', last: 'zhar-last', lang: 'uk', open: '.hero .btn', day: '.zh-day', time: '.zh-time', name: '#zh-name', phone: '#zh-phone', send: '.zh-form .zh-btn', code: '.zh-code strong', cancel: '#zh-cancel', anchor: '' },
};
const site = process.argv[2] ?? 'lucciola';
const S = SITES[site];
if (!S) { console.error(`unknown site ${site}`); process.exit(1); }
const srv = spawn(`npm run preview:${site} -w sites`, { shell: true, stdio: 'ignore' });
const fail = msg => { console.error('E2E FAIL:', msg); killTree(srv); process.exit(1); };
await new Promise(r => setTimeout(r, 3500));
const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.addInitScript(([k, l, last]) => { localStorage.setItem(k, l); localStorage.removeItem(last); }, [S.key, S.lang, S.last]);
  await p.goto(`http://localhost:${S.port}/restaurant-demo/${site}/${S.anchor}`);
  if (S.open) { await p.waitForTimeout(1500); await p.click(S.open); }
  await p.waitForSelector(S.day);
  // a day at least two days ahead, so every dinner slot is still in the future
  await p.locator(`${S.day}:not([disabled])`).nth(2).click();
  await p.waitForSelector(`${S.time}:not([disabled])`);
  await p.locator(`${S.time}:not([disabled])`).last().click();
  await p.fill(S.name, 'E2E Check');
  await p.fill(S.phone, '+39 333 000 1122');
  await p.click(S.send);
  await p.waitForSelector(S.code, { timeout: 15000 });
  const code = (await p.textContent(S.code)).trim();
  console.log('booked', code);

  const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'demo', password: 'demo' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const found = await (await fetch(`${API}/api/admin/r/${site}/bookings?q=${code}`, { headers: { cookie } })).json();
  if (found.bookings?.[0]?.name !== 'E2E Check') fail(`booking ${code} not visible in admin`);
  console.log('visible in admin:', found.bookings[0].status);

  await p.click(S.cancel);
  await p.waitForSelector(S.cancel, { state: 'detached', timeout: 15000 });
  const after = await (await fetch(`${API}/api/admin/r/${site}/bookings?q=${code}`, { headers: { cookie } })).json();
  if (after.bookings?.[0]?.status !== 'cancelled') fail('cancel did not reach the admin');
  console.log('cancelled from the site: ok');
} finally {
  await b.close(); killTree(srv);
}
process.exit(0);
