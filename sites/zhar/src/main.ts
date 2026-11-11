import './styles.css';
import { detectLang, readStored, siteApi, store } from '../../../shared/site';
import { t, type Key, type Lang } from './i18n';
import { renderMenu, renderMenuError } from './menu';
import { createPanel } from './booking';
import photos from '../photos.json';

const RID = 'zhar';
const API = import.meta.env.VITE_API ?? 'https://restaurant-demo.yehorss.workers.dev';
const PHONE = '+380 44 555 0177';
const api = siteApi(API);
const PHOTO_IDS = new Set(Object.keys(photos));
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

let lang: Lang = detectLang(navigator.language, readStored('zhar-lang'), ['uk', 'en'] as const, { uk: 'uk', ru: 'uk' }, 'en');
let panel: ReturnType<typeof createPanel> | null = null;
let menuSeq = 0;

function applyLang(): void {
  document.documentElement.lang = lang;
  document.title = t(lang, 'meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(lang, 'meta.desc'));
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(lang, el.dataset.i18n as Key); });
}

async function loadMenu(): Promise<void> {
  const el = document.getElementById('menu-list')!, tabs = document.getElementById('menu-tabs')!;
  const seq = ++menuSeq;
  try {
    const { sections } = await api.menu(RID, lang === 'uk' ? 'local' : 'en');
    if (seq !== menuSeq) return; // a newer language switch already asked again
    renderMenu(el, sections, lang, PHOTO_IDS);
    tabs.innerHTML = sections.map(s => `<a href="#m-${s.id}">${esc(s.title)}</a>`).join('');
  } catch {
    if (seq === menuSeq) renderMenuError(el, PHONE, lang);
  } finally {
    el.removeAttribute('aria-busy');
  }
}

async function loadCredits(): Promise<void> {
  try {
    const credits: Record<string, { title: string; author: string; license: string; url: string }> = await (await fetch(`${import.meta.env.BASE_URL}photos/credits.json`)).json();
    document.getElementById('credits')!.innerHTML = Object.values(credits)
      .map(c => `<li><a href="${esc(c.url)}">${esc(c.title)}</a> — ${esc(c.author)}, ${esc(c.license)}</li>`).join('');
  } catch { /* credits stay collapsed */ }
}

document.getElementById('lang')!.addEventListener('click', () => {
  lang = lang === 'uk' ? 'en' : 'uk';
  store('zhar-lang', lang);
  applyLang();
  void loadMenu();
  panel?.setLang(lang);
});

applyLang();
void loadMenu();
void loadCredits();

const fab = document.getElementById('fab')!;
api.info(RID)
  .then(info => {
    panel = createPanel(api, info, lang, PHONE, fab);
    document.querySelectorAll('[data-open-booking]').forEach(b => b.addEventListener('click', () => panel!.open()));
  })
  .catch(() => {
    document.querySelectorAll<HTMLElement>('[data-open-booking]').forEach(b => b.addEventListener('click', () => { location.href = 'tel:+380445550177'; }));
  });
