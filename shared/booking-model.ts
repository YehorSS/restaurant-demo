import type { Made, Slot } from './site';

export const MAX_PARTY = 8;

export interface State {
  step: 'pick' | 'form' | 'sending' | 'done' | 'cancelled';
  date: string | null;
  party: number;
  time: string | null;
  slots: Slot[] | null;
  loading: boolean;
  guest: { name: string; phone: string; comment: string };
  error: null | 'taken' | 'invalid' | 'error';
  made: Made | null;
}

export type Event =
  | { type: 'date'; date: string; open: boolean }
  | { type: 'party'; party: number }
  | { type: 'slots'; slots: Slot[] }
  | { type: 'time'; time: string }
  | { type: 'guest'; field: 'name' | 'phone' | 'comment'; value: string }
  | { type: 'send' }
  | { type: 'failed'; error: 'taken' | 'invalid' | 'error'; slots?: Slot[]; from?: 'slots' | 'send' | 'cancel' }
  | { type: 'forget' }
  | { type: 'booked'; made: Made }
  | { type: 'cancelled' }
  | { type: 'restart' };

export const initial = (): State => ({ step: 'pick', date: null, party: 2, time: null, slots: null, loading: false, guest: { name: '', phone: '', comment: '' }, error: null, made: null });

export function reduce(s: State, e: Event): State {
  switch (e.type) {
    case 'date': return e.open ? { ...s, step: 'pick', date: e.date, time: null, slots: null, loading: true, error: null } : s;
    case 'party': return { ...s, step: 'pick', party: e.party, time: null, slots: null, loading: s.date !== null && e.party <= MAX_PARTY, error: null };
    case 'slots': return { ...s, slots: e.slots, loading: false };
    case 'time': return s.slots?.some(x => x.time === e.time && x.available) ? { ...s, time: e.time, step: 'form', error: null } : s;
    case 'guest': return { ...s, guest: { ...s.guest, [e.field]: e.value } };
    case 'send': return { ...s, step: 'sending', error: null };
    case 'failed':
      if (e.from === 'slots') return { ...s, step: 'pick', loading: false, error: e.error };
      if (e.from === 'cancel') return { ...s, error: e.error };
      return e.error === 'taken'
      ? { ...s, step: 'pick', time: null, slots: e.slots ?? null, loading: !e.slots, error: 'taken' }
      : { ...s, step: 'form', error: e.error };
    case 'booked': return { ...s, step: 'done', made: e.made };
    case 'cancelled': return { ...s, step: 'cancelled' };
    case 'restart': return { ...initial(), guest: s.guest };
    case 'forget': return { ...initial(), guest: s.guest };
  }
}
