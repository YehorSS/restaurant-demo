import { formatPrice, type MenuSection } from '../../../shared/site';
import { t, type Lang } from './i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const PHOTOS = ['antipasti', 'primi', 'secondi', 'dolci'];
export const locale = (lang: Lang) => (lang === 'it' ? 'it-IT' : 'en-GB');
const base = import.meta.env?.BASE_URL ?? '/';

// a hand-drawn strike line, slightly uneven, for sold-out dishes
const STRIKE = '<svg class="strike" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 8 C 40 3, 80 10, 120 5 S 180 4, 198 7" /></svg>';

export function renderMenu(el: HTMLElement, sections: MenuSection[], lang: Lang): void {
  el.innerHTML = sections.map((s, i) => `
    <article class="course">
      <header class="course-head">
        <span class="course-no">${String(i + 1).padStart(2, '0')}</span>
        <h3>${esc(s.title)}</h3>
      </header>
      ${PHOTOS[i] ? `<figure class="course-photo"><img src="${base}photos/${PHOTOS[i]}.webp" alt="" loading="lazy" width="1200" height="800"></figure>` : ''}
      <ul class="dishes">
        ${s.dishes.map(d => `
          <li class="dish${d.outOfStock ? ' is-out' : ''}">
            <div class="dish-line">
              <span class="name">${esc(d.name)}${d.outOfStock ? STRIKE : ''}</span>
              <span class="dots" aria-hidden="true"></span>
              <span class="price">${formatPrice(d.price, 'EUR', locale(lang))}</span>
            </div>
            <p class="desc">${esc(d.desc)}</p>
            ${d.outOfStock ? `<span class="finito">${t(lang, 'menu.out')}</span>` : ''}
          </li>`).join('')}
      </ul>
    </article>`).join('');
}

export function renderMenuError(el: HTMLElement, phone: string, lang: Lang): void {
  el.innerHTML = `<p class="menu-error">${t(lang, 'menu.error')} <a href="tel:${phone.replace(/[^+\d]/g, '')}">${esc(phone)}</a></p>`;
}
