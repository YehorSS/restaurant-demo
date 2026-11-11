import { describe, expect, it } from 'vitest';
import { bookableDays, detectLang, formatPrice } from '../../shared/site';

describe('detectLang', () => {
  const pick = (nav?: string, stored: string | null = null) => detectLang(nav, stored, ['it', 'en'] as const, { it: 'it' }, 'en');
  it('picks Italian for an Italian browser', () => expect(pick('it-IT')).toBe('it'));
  it('falls back to English', () => expect(pick('de-DE')).toBe('en'));
  it('lets the stored choice win', () => expect(pick('it-IT', 'en')).toBe('en'));
  it('ignores a stored language the site lacks', () => expect(pick('it-IT', 'uk')).toBe('it'));
});

describe('bookableDays', () => {
  const lucciola = { tz: 'Europe/Rome', hours: [0, 2, 3, 4, 5, 6].map(weekday => ({ weekday })), closed: ['2026-11-20'] };

  it('marks mondays and closed days as not bookable', () => {
    const days = bookableDays(lucciola, Date.UTC(2026, 10, 15, 10), 7); // Sunday 15 Nov
    expect(days.map(d => d.date)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
    expect(days.find(d => d.date === '2026-11-16')!.open).toBe(false);
    expect(days.find(d => d.date === '2026-11-20')!.open).toBe(false);
    expect(days.find(d => d.date === '2026-11-17')!.open).toBe(true);
  });

  it('starts from today in the restaurant zone, not the visitor zone', () => {
    // 23:30 UTC on the 15th is already the 16th in Kyiv
    const zhar = { tz: 'Europe/Kyiv', hours: [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday })), closed: [] };
    expect(bookableDays(zhar, Date.UTC(2026, 10, 15, 23, 30), 1)[0].date).toBe('2026-11-16');
  });
});

describe('formatPrice', () => {
  it('formats euros the Italian way', () => expect(formatPrice(1250, 'EUR', 'it').replace(/\s/g, ' ')).toBe('12,50 €'));
  it('formats euros the English way', () => expect(formatPrice(1250, 'EUR', 'en')).toBe('€12.50'));
  it('formats hryvnias without kopiyky', () => expect(formatPrice(21000, 'UAH', 'uk').replace(/\s/g, ' ')).toBe('210 ₴'));
});
