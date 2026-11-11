import { createContext, useContext } from 'react';
import type { Api } from '../../shared/api';
import type { Key, Lang } from './i18n';

export type Rid = 'lucciola' | 'zhar';
export const RESTAURANTS: { id: Rid; name: string }[] = [
  { id: 'lucciola', name: 'Trattoria Lucciola' },
  { id: 'zhar', name: 'ЖАР' },
];

export interface User { login: string; role: 'owner' | 'demo' }

export interface Ctx {
  api: Api;
  lang: Lang;
  t: (k: Key) => string;
  user: User;
  rid: Rid;
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

/** Today's date in the restaurant's zone, as YYYY-MM-DD. */
export function today(rid: Rid): string {
  const tz = rid === 'lucciola' ? 'Europe/Rome' : 'Europe/Kyiv';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const money = (cents: number, rid: Rid) =>
  rid === 'lucciola' ? `€${(cents / 100).toFixed(2)}` : `${(cents / 100).toFixed(0)} ₴`;
