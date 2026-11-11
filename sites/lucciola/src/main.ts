import './styles.css';
import { detectLang, readStored, siteApi, store, type Info } from '../../../shared/site';
import { DICT, t, type Key, type Lang } from './i18n';
import { renderMenu, renderMenuError } from './menu';
import { tileUrl } from './maiolica';
import { createBooking } from './booking';

const RID = 'lucciola';
const API = import.meta.env.VITE_API ?? 'https://restaurant-demo.yehorss.workers.dev';
const PHONE = '+39 071 555 0142';
const api = siteApi(API);

document.documentElement.style.setProperty('--tile', tileUrl());

let lang: Lang = detectLang(navigator.language, readStored('lucciola-lang'), ['it', 'en'] as const, { it: 'it' }, 'en');
let info: Info | null = null;
let booking: { setLang(l: Lang): void } | null = null;

function applyLang(): void {
  document.documentElement.lang = lang;
  document.title = t(lang, 'meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(lang, 'meta.desc'));
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(lang, el.dataset.i18n as Key); });
}

async function loadMenu(): Promise<void> {
  const el = document.getElementById('menu-list')!;
  try {
    const { sections } = await api.menu(RID, lang === 'it' ? 'local' : 'en');
    renderMenu(el, sections, lang);
  } catch {
    renderMenuError(el, PHONE, lang);
  } finally {
    el.removeAttribute('aria-busy');
  }
}

async function loadCredits(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}photos/credits.json`);
    const credits: Record<string, { title: string; author: string; license: string; url: string }> = await res.json();
    document.getElementById('credits')!.innerHTML = Object.values(credits)
      .map(c => `<li><a href="${c.url}">${c.title.replace(/[<>&]/g, '')}</a> — ${c.author.replace(/[<>&]/g, '')}, ${c.license}</li>`).join('');
  } catch { /* credits stay hidden behind the summary */ }
}

document.getElementById('lang')!.addEventListener('click', () => {
  lang = lang === 'it' ? 'en' : 'it';
  store('lucciola-lang', lang);
  applyLang();
  void loadMenu();
  booking?.setLang(lang);
});

applyLang();
void loadMenu();
void loadCredits();
api.info(RID)
  .then(i => { info = i; booking = createBooking(document.getElementById('booking')!, api, info, lang, PHONE); })
  .catch(() => { document.getElementById('booking')!.innerHTML = `<p class="book-error">${t(lang, 'book.error')} <a href="tel:+390715550142">${PHONE}</a></p>`; });

export { DICT };
