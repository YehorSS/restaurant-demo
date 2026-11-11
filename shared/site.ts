import { createApi } from './api';

export function detectLang<L extends string>(nav: string | undefined, stored: string | null, langs: readonly L[], byPrefix: Record<string, L>, fallback: L): L {
  if (stored && (langs as readonly string[]).includes(stored)) return stored as L;
  const base = (nav ?? '').toLowerCase().split('-')[0];
  return byPrefix[base] ?? fallback;
}

export function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function store(key: string, value: string | null): void {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

const dateIn = (ms: number, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

export interface DayInfo { tz: string; hours: { weekday: number }[]; closed: string[] }

/** The next `count` dates from today in the restaurant's zone; `open` is false on days without hours or closed. */
export function bookableDays(info: DayInfo, now: number, count = 30): { date: string; open: boolean }[] {
  const first = new Date(`${dateIn(now, info.tz)}T12:00:00Z`);
  const openDays = new Set(info.hours.map(h => h.weekday));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return { date, open: openDays.has(d.getUTCDay()) && !info.closed.includes(date) };
  });
}

export function formatPrice(cents: number, currency: 'EUR' | 'UAH', locale: string): string {
  const whole = currency === 'UAH';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
}

export interface Info { id: string; name: string; tz: string; phone: string; maxParty: number; hours: { weekday: number; open: string; close: string }[]; closed: string[] }
export interface MenuDish { id: number; name: string; desc: string; price: number; weight: number | null; photo: string; fire: boolean; outOfStock: boolean }
export interface MenuSection { id: number; title: string; dishes: MenuDish[] }
export interface Slot { time: string; available: boolean }
export interface BookingBody { date: string; time: string; party: number; name: string; phone: string; comment: string; website: string }
export interface Made { code: string; date: string; time: string; party: number }

export function siteApi(base: string) {
  const call = createApi(base);
  const opt = (init: RequestInit = {}): RequestInit => ({ ...init, credentials: 'omit' });
  return {
    info: (rid: string) => call<Info>(`/api/r/${rid}/info`, opt()),
    menu: (rid: string, lang: 'en' | 'local') => call<{ sections: MenuSection[] }>(`/api/r/${rid}/menu?lang=${lang}`, opt()),
    slots: (rid: string, date: string, party: number) => call<{ slots: Slot[] }>(`/api/r/${rid}/slots?date=${date}&party=${party}`, opt()),
    book: (rid: string, body: BookingBody) => call<Made>(`/api/r/${rid}/bookings`, opt({ method: 'POST', body: JSON.stringify(body) })),
    cancel: (rid: string, code: string, phone: string) => call<null>(`/api/r/${rid}/bookings/${code}`, opt({ method: 'DELETE', body: JSON.stringify({ phone }) })),
  };
}
export type SiteApi = ReturnType<typeof siteApi>;
