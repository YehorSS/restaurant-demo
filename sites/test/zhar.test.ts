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

let el: HTMLElement;
beforeEach(() => { el = document.createElement('div'); });

describe('zhar menu', () => {
  it('renders four sections as bars, the first open', () => {
    renderMenu(el, sections, 'uk');
    const bars = el.querySelectorAll<HTMLDetailsElement>('details.zh-section');
    expect(bars).toHaveLength(4);
    expect([...bars].map(b => b.open)).toEqual([true, false, false, false]);
  });

  it('prints price in hryvnias and weight in grams', () => {
    renderMenu(el, sections, 'uk');
    expect(el.querySelector('.zh-price')!.textContent!.replace(/\s/g, ' ')).toBe('210 ₴');
    expect(el.querySelector('.zh-weight')!.textContent).toBe('120 г');
    renderMenu(el, sections, 'en');
    expect(el.querySelector('.zh-weight')!.textContent).toBe('120 g');
  });

  it('marks dishes cooked on fire in words', () => {
    renderMenu(el, sections, 'uk');
    const fire = el.querySelectorAll('.zh-dish.is-fire');
    expect(fire).toHaveLength(1);
    expect(fire[0].textContent).toContain(DICT.uk['menu.fire']);
  });

  it('says in words when a dish ran out', () => {
    renderMenu(el, sections, 'uk');
    const out = el.querySelectorAll('.zh-dish.is-out');
    expect(out).toHaveLength(1);
    expect(out[0].textContent).toContain(DICT.uk['menu.out']);
  });

  it('escapes dish text', () => {
    renderMenu(el, [{ ...sections[0], dishes: [{ ...sections[0].dishes[0], name: '<img src=x onerror=1>' }] }], 'en');
    expect(el.querySelector('img')).toBeNull();
  });
});

import { fireNow } from '../zhar/src/fire';

describe('fire clock', () => {
  it('burns oak in the afternoon', () => expect(fireNow(13 * 60).phase).toBe('oak'));
  it('switches to cherry at five', () => expect(fireNow(17 * 60).phase).toBe('cherry'));
  it('leaves embers after nine', () => expect(fireNow(21 * 60 + 30).phase).toBe('embers'));
  it('is out at night and counts minutes to the next lighting', () => {
    expect(fireNow(23 * 60 + 30)).toEqual({ phase: 'closed', untilOpen: 12 * 60 + 30 });
    expect(fireNow(9 * 60)).toEqual({ phase: 'closed', untilOpen: 180 });
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

describe('zhar panel focus (review fixes)', () => {
  afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

  it('keeps focus inside the panel when the focused button disappears', async () => {
    localStorage.setItem('zhar-last', JSON.stringify({ code: 'ZH-AB12', date: '2099-01-01', time: '19:00', party: 2, phone: '+380' }));
    const opener = document.createElement('button'); document.body.append(opener);
    const panel = createPanel(api(), info, 'uk', '+380', opener);
    panel.open(); await tick();
    const root = document.querySelector<HTMLElement>('.zh-panel')!;
    root.querySelector<HTMLButtonElement>('#zh-new')!.focus();
    root.querySelector<HTMLButtonElement>('#zh-new')!.click();
    await tick();
    expect(root.contains(document.activeElement)).toBe(true);
  });

  it('returns focus to whatever opened it', async () => {
    const fab = document.createElement('button'); const hero = document.createElement('button');
    document.body.append(fab, hero);
    const panel = createPanel(api(), info, 'uk', '+380', fab);
    hero.focus(); panel.open(); await tick();
    panel.close();
    expect(document.activeElement).toBe(hero);
  });
});
