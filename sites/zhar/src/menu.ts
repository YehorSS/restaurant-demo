import { formatPrice, type MenuSection } from '../../../shared/site';
import { t, type Lang } from './i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The menu as a column of bars; each section opens in place. */
export function renderMenu(el: HTMLElement, sections: MenuSection[], lang: Lang): void {
  const gram = lang === 'uk' ? 'г' : 'g';
  const loc = lang === 'uk' ? 'uk-UA' : 'en-GB';
  el.innerHTML = sections.map((s, i) => `
    <details class="zh-section" id="m-${s.id}"${i === 0 ? ' open' : ''}>
      <summary><span>${esc(s.title)}</span><span class="zh-count">${s.dishes.length}</span></summary>
      <ul class="zh-dishes">
        ${s.dishes.map(d => `
          <li class="zh-dish${d.fire ? ' is-fire' : ''}${d.outOfStock ? ' is-out' : ''}">
            <div class="zh-line"><span class="zh-name">${esc(d.name)}</span><span class="zh-price">${formatPrice(d.price, 'UAH', loc)}</span></div>
            <p class="zh-desc">${esc(d.desc)}${d.weight ? ` · <span class="zh-weight">${d.weight} ${gram}</span>` : ''}${d.fire ? ` · <span class="zh-fire">${t(lang, 'menu.fire')}</span>` : ''}${d.outOfStock ? ` · <span class="zh-out">${t(lang, 'menu.out')}</span>` : ''}</p>
          </li>`).join('')}
      </ul>
    </details>`).join('');
}

export function renderMenuError(el: HTMLElement, phone: string, lang: Lang): void {
  el.innerHTML = `<p class="zh-error">${t(lang, 'menu.error')} <a href="tel:${phone.replace(/[^+\d]/g, '')}">${esc(phone)}</a></p>`;
}
