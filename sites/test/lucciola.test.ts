import { beforeEach, describe, expect, it } from 'vitest';
import type { MenuSection } from '../../shared/site';
import { DICT } from '../lucciola/src/i18n';
import { renderMenu, renderMenuError } from '../lucciola/src/menu';

const sections: MenuSection[] = ['Antipasti', 'Primi', 'Secondi', 'Dolci'].map((title, i) => ({
  id: i + 1, title,
  dishes: [
    { id: i * 10 + 1, name: `Piatto ${i}`, desc: 'Descrizione', price: 1250, weight: null, photo: '', fire: false, outOfStock: false },
    { id: i * 10 + 2, name: `Finito ${i}`, desc: 'Descrizione', price: 900, weight: null, photo: '', fire: false, outOfStock: i === 1 },
  ],
}));

let el: HTMLElement;
beforeEach(() => { el = document.createElement('div'); });

describe('lucciola menu', () => {
  it('renders four courses', () => {
    renderMenu(el, sections, 'it');
    expect(el.querySelectorAll('.course')).toHaveLength(4);
  });

  it('prints prices the local way', () => {
    renderMenu(el, sections, 'it');
    expect(el.querySelector('.price')!.textContent!.replace(/\s/g, ' ')).toBe('12,50 €');
    renderMenu(el, sections, 'en');
    expect(el.querySelector('.price')!.textContent).toBe('€12.50');
  });

  it('crosses out a dish that ran out and says so', () => {
    renderMenu(el, sections, 'it');
    const out = el.querySelectorAll('.dish.is-out');
    expect(out).toHaveLength(1);
    expect(out[0].textContent).toContain(DICT.it['menu.out']);
  });

  it('escapes dish text', () => {
    renderMenu(el, [{ ...sections[0], dishes: [{ ...sections[0].dishes[0], name: '<img src=x onerror=alert(1)>' }] }], 'en');
    expect(el.querySelector('img[onerror]')).toBeNull();
  });

  it('shows the phone when the menu cannot load', () => {
    renderMenuError(el, '+39 071 555 0142', 'it');
    expect(el.textContent).toContain('+39 071 555 0142');
  });
});

describe('lucciola i18n', () => {
  it('has the same keys in Italian and English', () => {
    expect(Object.keys(DICT.it).sort()).toEqual(Object.keys(DICT.en).sort());
  });
});
