import { beforeEach, describe, expect, it } from 'vitest';
import type { MenuSection } from '../../shared/site';
import { DICT } from '../zhar/src/i18n';
import { renderMenu } from '../zhar/src/menu';

const sections: MenuSection[] = ['Закуски', 'З вогню', 'Гаряче', 'Десерти'].map((title, i) => ({
  id: 5 + i, title,
  dishes: [
    { id: 18 + i * 4, name: `Страва ${i}`, desc: 'Опис', price: 21000, weight: 120, photo: '', fire: i === 1, outOfStock: false },
    { id: 19 + i * 4, name: `Скінчилось ${i}`, desc: 'Опис', price: 16500, weight: 150, photo: '', fire: false, outOfStock: i === 2 },
  ],
}));
const photos = new Set(['18']);

let el: HTMLElement;
beforeEach(() => { el = document.createElement('div'); });

describe('zhar menu', () => {
  it('renders four sections', () => {
    renderMenu(el, sections, 'uk', photos);
    expect(el.querySelectorAll('.zh-section')).toHaveLength(4);
  });

  it('prints price in hryvnias and weight in grams', () => {
    renderMenu(el, sections, 'uk', photos);
    expect(el.querySelector('.zh-price')!.textContent!.replace(/\s/g, ' ')).toBe('210 ₴');
    expect(el.querySelector('.zh-weight')!.textContent).toBe('120 г');
    renderMenu(el, sections, 'en', photos);
    expect(el.querySelector('.zh-weight')!.textContent).toBe('120 g');
  });

  it('marks dishes cooked on fire', () => {
    renderMenu(el, sections, 'uk', photos);
    const fire = el.querySelectorAll('.zh-dish.is-fire');
    expect(fire).toHaveLength(1);
    expect(fire[0].textContent).toContain(DICT.uk['menu.fire']);
  });

  it('says in words when a dish ran out', () => {
    renderMenu(el, sections, 'uk', photos);
    const out = el.querySelectorAll('.zh-dish.is-out');
    expect(out).toHaveLength(1);
    expect(out[0].textContent).toContain(DICT.uk['menu.out']);
  });

  it('shows a photo only for dishes that have one', () => {
    renderMenu(el, sections, 'uk', photos);
    expect(el.querySelectorAll('.zh-dish img')).toHaveLength(1);
    expect(el.querySelector('.zh-dish img')!.getAttribute('src')).toMatch(/photos\/18\.webp$/);
  });
});

describe('zhar i18n', () => {
  it('has the same keys in Ukrainian and English', () => {
    expect(Object.keys(DICT.uk).sort()).toEqual(Object.keys(DICT.en).sort());
  });
});

import { afterEach, vi } from 'vitest';
import { createPanel } from '../zhar/src/booking';

const info = { id: 'zhar', name: 'ЖАР', tz: 'Europe/Kyiv', phone: '+380', maxParty: 8, hours: [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, open: '12:00', close: '23:00' })), closed: [] };
const tick = () => new Promise(r => setTimeout(r, 0));
const api = (fail = false) => ({
  slots: vi.fn(async () => { if (fail) throw new Error('down'); return { slots: [{ time: '19:00', available: true }] }; }),
  book: vi.fn(), cancel: vi.fn(), info: vi.fn(), menu: vi.fn(),
}) as any;

describe('zhar booking panel', () => {
  afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

  function mount(a = api()) {
    const fab = document.createElement('button'); fab.id = 'fab'; document.body.append(fab);
    const panel = createPanel(a, info, 'uk', '+380 44 555 0177', fab);
    return { fab, panel, root: document.querySelector<HTMLElement>('.zh-panel')! };
  }

  it('opens with focus inside the panel', async () => {
    const { panel, root } = mount();
    panel.open(); await tick();
    expect(root.hidden).toBe(false);
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const { fab, panel, root } = mount();
    fab.focus(); panel.open(); await tick();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.hidden).toBe(true);
    expect(document.activeElement).toBe(fab);
  });

  it('keeps the date picker usable when slots fail', async () => {
    const { panel, root } = mount(api(true));
    panel.open(); for (let i = 0; i < 4; i++) await tick();
    expect(root.querySelector('.zh-days')).not.toBeNull();
    expect(root.textContent).toContain(DICT.uk['book.error']);
  });
});
