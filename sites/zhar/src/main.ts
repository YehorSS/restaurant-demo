import './styles.css';
import { detectLang, readStored, siteApi, store, type Info } from '../../../shared/site';
import { t, type Key, type Lang } from './i18n';
import { renderMenu, renderMenuError } from './menu';
import { createPanel } from './booking';
import { fireNow, kyivNow } from './fire';

const RID = 'zhar';
const API = import.meta.env.VITE_API ?? 'https://restaurant-demo.yehorss.workers.dev';
const PHONE = '+380 44 555 0177';
const api = siteApi(API);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let lang: Lang = detectLang(navigator.language, readStored('zhar-lang'), ['uk', 'en'] as const, { uk: 'uk', ru: 'uk' }, 'en');
let panel: ReturnType<typeof createPanel> | null = null;
let wantPanel = false;
let menuSeq = 0;
let nextFree: string | null | undefined;

function applyLang(): void {
  document.documentElement.lang = lang;
  document.title = t(lang, 'meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(lang, 'meta.desc'));
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(lang, el.dataset.i18n as Key); });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(lang, el.dataset.i18nAria as Key)));
  renderNow();
}

async function loadMenu(): Promise<void> {
  const el = document.getElementById('menu-list')!;
  const seq = ++menuSeq;
  try {
    const { sections } = await api.menu(RID, lang === 'uk' ? 'local' : 'en');
    if (seq === menuSeq) renderMenu(el, sections, lang);
  } catch {
    if (seq === menuSeq) renderMenuError(el, PHONE, lang);
  } finally {
    el.removeAttribute('aria-busy');
  }
}

/** The live part: what the fire is doing in Kyiv right now and the next free table today. */
function renderNow(): void {
  const k = kyivNow();
  const f = fireNow(k.minute);
  document.getElementById('now-time')!.textContent = k.time;
  const line = document.getElementById('now-line')!;
  if (f.phase === 'closed') {
    const h = Math.floor(f.untilOpen! / 60), m = f.untilOpen! % 60;
    line.textContent = `${t(lang, 'now.closed')} ${h} ${t(lang, 'now.h')} ${m} ${t(lang, 'now.m')}.`;
  } else line.textContent = t(lang, `now.${f.phase}` as Key);
  document.querySelectorAll<HTMLElement>('.phases li').forEach(li => li.toggleAttribute('data-current', li.dataset.phase === f.phase));
  const next = document.getElementById('now-next')!;
  next.textContent = nextFree === undefined ? t(lang, 'now.loading') : nextFree ? `${t(lang, 'now.next')} ${nextFree}.` : t(lang, 'now.none');
}

async function loadNextFree(): Promise<void> {
  try {
    const { slots } = await api.slots(RID, kyivNow().date, 2);
    nextFree = slots.find(s => s.available)?.time ?? null;
  } catch {
    nextFree = null;
  }
  renderNow();
}

async function loadCredits(): Promise<void> {
  try {
    const credits: Record<string, { title: string; author: string; license: string; url: string }> = await (await fetch(`${import.meta.env.BASE_URL}photos/credits.json`)).json();
    document.getElementById('credits')!.innerHTML = Object.values(credits)
      .map(c => `<li><a href="${esc(c.url)}">${esc(c.title)}</a>, ${esc(c.author)}, ${esc(c.license)}</li>`).join('');
  } catch { /* credits stay collapsed */ }
}

// sections rise in as they enter; content is visible without script (the .js class gates the hidden state)
function mountEntrances(): void {
  const items = [...document.querySelectorAll<HTMLElement>('[data-rise]')];
  if (!('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const group = [...(e.target.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-rise], :scope > * > [data-rise]') ?? [])];
      const i = Math.max(0, group.indexOf(e.target as HTMLElement));
      (e.target as HTMLElement).style.transitionDelay = `${Math.min(i, 5) * 80}ms`;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
}

// the pinned pictures drift a little with the scroll
function mountDrift(): void {
  if (reduced) return;
  const pics = [...document.querySelectorAll<HTMLElement>('.wp img, .intro-pic img')];
  let ticking = false;
  const move = () => {
    ticking = false;
    for (const img of pics) {
      const r = img.getBoundingClientRect();
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      img.style.transform = `translateY(${(-p * 24).toFixed(1)}px) scale(1.06)`;
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(move); } }, { passive: true });
  move();
}

// the floating button stays out of the way while the first screen's own button is visible
function mountFab(): void {
  const fab = document.getElementById('fab')!;
  const hero = document.querySelector('.hero')!;
  new IntersectionObserver(([e]) => fab.classList.toggle('shown', !e.isIntersecting), { threshold: 0.15 }).observe(hero);
}

document.getElementById('lang')!.addEventListener('click', () => {
  lang = lang === 'uk' ? 'en' : 'uk';
  store('zhar-lang', lang);
  applyLang();
  void loadMenu();
  panel?.setLang(lang);
});

// a tap before the restaurant info arrives is remembered and opens the panel as soon as it can
document.querySelectorAll('[data-open-booking]').forEach(b => b.addEventListener('click', () => { if (panel) panel.open(); else wantPanel = true; }));

applyLang();
void loadMenu();
void loadCredits();
void loadNextFree();
setInterval(renderNow, 30_000);
mountEntrances();
mountDrift();
mountFab();

api.info(RID)
  .then((info: Info) => {
    panel = createPanel(api, info, lang, PHONE, document.getElementById('fab')!);
    if (wantPanel) panel.open();
  })
  .catch(() => {
    document.querySelectorAll<HTMLElement>('[data-open-booking]').forEach(b => b.addEventListener('click', () => { location.href = 'tel:+380445550177'; }));
  });
