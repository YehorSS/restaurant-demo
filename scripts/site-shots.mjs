// Screenshots each built site at 1440 and 390 px in both languages (live API) and fails
// on horizontal scroll or clipped dish names.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';

// on Windows a shell-spawned server survives kill(); take down the whole process tree
const killTree = child => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']); else child.kill(); };
import { mkdirSync } from 'node:fs';

const SITES = [
  { id: 'lucciola', port: 5173, langs: ['it', 'en'], key: 'lucciola-lang', ready: '.course, .menu-error' },
  { id: 'zhar', port: 5174, langs: ['uk', 'en'], key: 'zhar-lang', ready: '.zh-section, .zh-error' },
];
mkdirSync('shots', { recursive: true });
const problems = [];
const b = await chromium.launch();
for (const s of SITES) {
  const srv = spawn(`npm run preview:${s.id} -w sites`, { shell: true, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 3500));
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const lang of s.langs) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.addInitScript(([k, l]) => localStorage.setItem(k, l), [s.key, lang]);
    await p.goto(`http://localhost:${s.port}/restaurant-demo/${s.id}/`);
    await p.waitForSelector(s.ready, { timeout: 15000 });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `shots/${s.id}-${w}-${lang}.png`, fullPage: true });
    const bad = await p.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push(`page ${document.documentElement.scrollWidth}px wide`);
      document.querySelectorAll('h1, h2, h3, h4, .name, .bk-day').forEach(el => { if (el.scrollWidth > el.clientWidth + 1) out.push(`"${el.textContent.trim().slice(0, 30)}" overflows`); });
      return out;
    });
    bad.forEach(x => problems.push(`${s.id} ${w} ${lang}: ${x}`));
    await p.close();
  }
  killTree(srv);
}
await b.close();
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('site shots ok');
process.exit(0);
