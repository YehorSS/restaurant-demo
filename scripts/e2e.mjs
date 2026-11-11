// Books a table through the Lucciola site (local preview, live API), checks the booking
// is visible in the admin API as demo, then cancels it from the site.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const API = 'https://restaurant-demo.yehorss.workers.dev';
const srv = spawn('npm run preview:lucciola -w sites', { shell: true, stdio: 'ignore' });
const fail = msg => { console.error('E2E FAIL:', msg); srv.kill(); process.exit(1); };
await new Promise(r => setTimeout(r, 3500));
const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.addInitScript(() => { localStorage.setItem('lucciola-lang', 'en'); localStorage.removeItem('lucciola-last'); });
  await p.goto('http://localhost:5173/restaurant-demo/lucciola/#prenota');
  await p.waitForSelector('.bk-day');
  // a day at least two days ahead, so every dinner slot is still in the future
  await p.locator('.bk-day:not([disabled])').nth(2).click();
  await p.waitForSelector('.bk-time:not([disabled])');
  await p.locator('.bk-time:not([disabled])').last().click();
  await p.fill('#bk-name', 'E2E Check');
  await p.fill('#bk-phone', '+39 333 000 1122');
  await p.click('.bk-form .btn');
  await p.waitForSelector('.bk-code strong', { timeout: 15000 });
  const code = (await p.textContent('.bk-code strong')).trim();
  console.log('booked', code);

  const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'demo', password: 'demo' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const found = await (await fetch(`${API}/api/admin/r/lucciola/bookings?q=${code}`, { headers: { cookie } })).json();
  if (found.bookings?.[0]?.name !== 'E2E Check') fail(`booking ${code} not visible in admin`);
  console.log('visible in admin:', found.bookings[0].status);

  await p.click('#bk-cancel');
  await p.waitForSelector('#bk-again', { timeout: 15000 });
  const after = await (await fetch(`${API}/api/admin/r/lucciola/bookings?q=${code}`, { headers: { cookie } })).json();
  if (after.bookings?.[0]?.status !== 'cancelled') fail('cancel did not reach the admin');
  console.log('cancelled from the site: ok');
} finally {
  await b.close(); srv.kill();
}
process.exit(0);
