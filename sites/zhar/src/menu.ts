import { formatPrice, type MenuSection } from '../../../shared/site';
import { t, type Lang } from './i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const base = import.meta.env?.BASE_URL ?? '/';
export const FLAME = '<svg class="flame" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z"/></svg>';

export function renderMenu(el: HTMLElement, sections: MenuSection[], lang: Lang, photos: Set<string>): void {
  const gram = lang === 'uk' ? 'г' : 'g';
  el.innerHTML = sections.map(s => `
    <section class="zh-section" id="m-${s.id}">
      <h3>${esc(s.title)}</h3>
      <ul class="zh-dishes">
        ${s.dishes.map(d => `
          <li class="zh-dish${d.fire ? ' is-fire' : ''}${d.outOfStock ? ' is-out' : ''}${photos.has(String(d.id)) ? ' has-photo' : ''}">
            ${photos.has(String(d.id)) ? `<img src="${base}photos/${d.id}.webp" alt="" loading="lazy" width="1200" height="800">` : ''}
            <div class="zh-body">
              <div class="zh-top">
                <h4>${esc(d.name)}</h4>
                <span class="zh-price">${formatPrice(d.price, 'UAH', lang === 'uk' ? 'uk-UA' : 'en-GB')}</span>
              </div>
              <p>${esc(d.desc)}</p>
              <div class="zh-meta">
                ${d.weight ? `<span class="zh-weight">${d.weight} ${gram}</span>` : ''}
                ${d.fire ? `<span class="zh-fire">${FLAME}${t(lang, 'menu.fire')}</span>` : ''}
                ${d.outOfStock ? `<span class="zh-out">${t(lang, 'menu.out')}</span>` : ''}
              </div>
            </div>
          </li>`).join('')}
      </ul>
    </section>`).join('');
}

export function renderMenuError(el: HTMLElement, phone: string, lang: Lang): void {
  el.innerHTML = `<p class="zh-error">${t(lang, 'menu.error')} <a href="tel:${phone.replace(/[^+\d]/g, '')}">${esc(phone)}</a></p>`;
}
