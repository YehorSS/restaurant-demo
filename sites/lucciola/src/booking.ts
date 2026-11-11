import { ApiError } from '../../../shared/api';
import { bookableDays, readStored, store, type Info, type Made, type SiteApi, type Slot } from '../../../shared/site';
import { t, type Lang } from './i18n';

const RID = 'lucciola';
const LAST = 'lucciola-last';
const MAX_PARTY = 8;

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

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const loc = (lang: Lang) => (lang === 'it' ? 'it-IT' : 'en-GB');

/** Mounts the reservation-book widget; returns a handle to switch its language. */
export function createBooking(root: HTMLElement, api: SiteApi, info: Info, lang: Lang, phone: string) {
  let s = initial();
  const days = bookableDays(info, Date.now(), 14);
  const tel = `<a href="tel:${phone.replace(/[^+\d]/g, '')}">${esc(phone)}</a>`;

  try {
    const last = JSON.parse(readStored(LAST) ?? 'null') as (Made & { phone: string }) | null;
    if (last && last.date >= days[0].date) s = { ...s, step: 'done', made: last, guest: { ...s.guest, phone: last.phone } };
  } catch { /* ignore a broken stored value */ }

  const dispatch = (e: Event) => { s = reduce(s, e); render(); };

  let autoTries = 0; // on first load, walk forward past days with nothing left
  async function loadSlots() {
    if (!s.date || s.party > MAX_PARTY) return;
    const want = { date: s.date, party: s.party };
    try {
      const r = await api.slots(RID, want.date, want.party);
      if (s.date !== want.date || s.party !== want.party) return;
      const next = days.slice(days.findIndex(d => d.date === want.date) + 1).find(d => d.open);
      if (autoTries > 0 && !r.slots.some(x => x.available) && next) {
        autoTries--;
        dispatch({ type: 'date', date: next.date, open: true });
        return loadSlots();
      }
      autoTries = 0;
      dispatch({ type: 'slots', slots: r.slots });
    } catch {
      autoTries = 0;
      dispatch({ type: 'failed', error: 'error', from: 'slots' });
    }
  }

  async function send() {
    if (!s.date || !s.time) return;
    dispatch({ type: 'send' });
    try {
      const made = await api.book(RID, { date: s.date, time: s.time, party: s.party, ...s.guest, website: (root.querySelector<HTMLInputElement>('#bk-website')?.value ?? '') });
      store(LAST, JSON.stringify({ ...made, phone: s.guest.phone }));
      dispatch({ type: 'booked', made });
    } catch (err) {
      if (err instanceof ApiError && err.error === 'slot_taken') dispatch({ type: 'failed', error: 'taken', slots: err.body.slots as Slot[] | undefined });
      else dispatch({ type: 'failed', error: err instanceof ApiError && err.status === 400 ? 'invalid' : 'error' });
    }
  }

  async function cancel() {
    if (!s.made) return;
    try {
      await api.cancel(RID, s.made.code, s.guest.phone);
      store(LAST, null);
      dispatch({ type: 'cancelled' });
    } catch (err) {
      // the booking is gone already (nightly demo reset or staff cancelled it)
      if (err instanceof ApiError && err.status === 404) { store(LAST, null); dispatch({ type: 'forget' }); return; }
      dispatch({ type: 'failed', error: 'error', from: 'cancel' });
    }
  }

  function dayLabel(date: string) {
    const d = new Date(`${date}T12:00:00Z`);
    return {
      wd: d.toLocaleDateString(loc(lang), { weekday: 'short', timeZone: 'UTC' }),
      n: d.getUTCDate(),
      m: d.toLocaleDateString(loc(lang), { month: 'short', timeZone: 'UTC' }),
    };
  }

  function slotRows() {
    if (!s.date) return '';
    if (s.party > MAX_PARTY) return `<p class="bk-note">${t(lang, 'book.big')} ${tel}</p>`;
    if (s.loading || !s.slots) return `<p class="bk-note">${t(lang, 'book.loading')}</p>`;
    if (!s.slots.some(x => x.available)) return `<p class="bk-note">${t(lang, 'book.none')}</p>`;
    const rows = [['book.lunch', s.slots.filter(x => x.time < '17:00')], ['book.dinner', s.slots.filter(x => x.time >= '17:00')]] as const;
    return rows.filter(([, list]) => list.length).map(([key, list]) => `
      <div class="bk-row"><span class="bk-label">${t(lang, key)}</span>
        <div class="bk-times">${list.map(x => `<button type="button" class="bk-time" data-time="${x.time}" ${x.available ? '' : 'disabled'} aria-pressed="${x.time === s.time}">${x.time}</button>`).join('')}</div>
      </div>`).join('');
  }

  // re-rendering replaces the buttons, so remember which control had focus and put it back
  function focusKey(): string | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !root.contains(a)) return null;
    return a.id ? `#${a.id}` : a.dataset.date ? `[data-date="${a.dataset.date}"]` : a.dataset.time ? `[data-time="${a.dataset.time}"]` : null;
  }

  function render() {
    const key = focusKey();
    paint();
    if (key) root.querySelector<HTMLElement>(key)?.focus();
  }

  function paint() {
    if (s.step === 'done' && s.made) {
      const d = dayLabel(s.made.date);
      root.innerHTML = `<div class="bk-done" role="status">
        <p class="bk-big">${t(lang, 'book.done')}</p>
        <p class="bk-when">${d.wd} ${d.n} ${d.m} · ${s.made.time} · ${s.made.party} ${t(lang, 'book.party').toLowerCase()}</p>
        <p class="bk-code"><span>${t(lang, 'book.code')}</span> <strong>${esc(s.made.code)}</strong></p>
        ${s.error === 'error' ? `<p class="bk-error">${t(lang, 'book.error')} ${tel}</p>` : ''}
        <div class="bk-actions"><button type="button" class="btn ghost" id="bk-cancel">${t(lang, 'book.cancel')}</button>
        <button type="button" class="btn" id="bk-new">${t(lang, 'book.again')}</button></div>
      </div>`;
      root.querySelector('#bk-cancel')!.addEventListener('click', cancel);
      root.querySelector('#bk-new')!.addEventListener('click', () => { dispatch({ type: 'forget' }); pickFirst(); });
      return;
    }
    if (s.step === 'cancelled') {
      root.innerHTML = `<div class="bk-done" role="status"><p class="bk-big">${t(lang, 'book.cancelled')}</p><button type="button" class="btn" id="bk-again">${t(lang, 'book.again')}</button></div>`;
      root.querySelector('#bk-again')!.addEventListener('click', () => dispatch({ type: 'restart' }));
      return;
    }
    const form = s.step === 'form' || s.step === 'sending';
    root.innerHTML = `
      <fieldset class="bk-days"><legend>${t(lang, 'book.day')}</legend>
        <div class="bk-strip">${days.map(d => { const l = dayLabel(d.date); return `<button type="button" class="bk-day" data-date="${d.date}" ${d.open ? '' : 'disabled'} aria-pressed="${d.date === s.date}"><span>${l.wd}</span><strong>${l.n}</strong><span>${d.open ? l.m : t(lang, 'book.closed')}</span></button>`; }).join('')}</div>
      </fieldset>
      <div class="bk-party"><label for="bk-party">${t(lang, 'book.party')}</label>
        <select id="bk-party">${Array.from({ length: 9 }, (_, i) => i + 1).map(n => `<option value="${n}" ${n === s.party ? 'selected' : ''}>${n === 9 ? '9+' : n}</option>`).join('')}</select>
      </div>
      ${s.error === 'taken' ? `<p class="bk-error" role="alert">${t(lang, 'book.taken')}</p>` : ''}
      <div class="bk-slots" aria-live="polite">${slotRows()}</div>
      ${form ? `
      <form class="bk-form" novalidate>
        <p class="bk-chosen">${s.time}</p>
        <label>${t(lang, 'book.name')}<input id="bk-name" autocomplete="name" value="${esc(s.guest.name)}" minlength="2" maxlength="60" required></label>
        <label>${t(lang, 'book.phone')}<input id="bk-phone" type="tel" autocomplete="tel" value="${esc(s.guest.phone)}" required></label>
        <label>${t(lang, 'book.comment')}<textarea id="bk-comment" maxlength="300" rows="2">${esc(s.guest.comment)}</textarea></label>
        <input id="bk-website" name="website" tabindex="-1" autocomplete="off" class="bk-trap" aria-hidden="true">
        ${s.error === 'invalid' ? `<p class="bk-error" role="alert">${t(lang, 'book.invalid')}</p>` : ''}
        ${s.error === 'error' ? `<p class="bk-error" role="alert">${t(lang, 'book.error')} ${tel}</p>` : ''}
        <button class="btn" ${s.step === 'sending' ? 'disabled' : ''}>${t(lang, s.step === 'sending' ? 'book.sending' : 'book.send')}</button>
      </form>` : `${s.error === 'error' ? `<p class="bk-error" role="alert">${t(lang, 'book.error')} ${tel}</p>` : ''}`}`;

    root.querySelectorAll<HTMLButtonElement>('.bk-day').forEach(b => b.addEventListener('click', () => {
      dispatch({ type: 'date', date: b.dataset.date!, open: !b.disabled });
      void loadSlots();
    }));
    root.querySelector<HTMLSelectElement>('#bk-party')!.addEventListener('change', e => {
      dispatch({ type: 'party', party: Number((e.target as HTMLSelectElement).value) });
      void loadSlots();
    });
    root.querySelectorAll<HTMLButtonElement>('.bk-time').forEach(b => b.addEventListener('click', () => {
      dispatch({ type: 'time', time: b.dataset.time! });
      root.querySelector<HTMLInputElement>('#bk-name')?.focus();
    }));
    for (const f of ['name', 'phone', 'comment'] as const)
      root.querySelector<HTMLInputElement>(`#bk-${f}`)?.addEventListener('input', e => { s = reduce(s, { type: 'guest', field: f, value: (e.target as HTMLInputElement).value }); });
    root.querySelector('form')?.addEventListener('submit', e => { e.preventDefault(); void send(); });
  }

  // open on the nearest day that still has a free time, so the guest sees options straight away
  function pickFirst() {
    const first = days.find(d => d.open);
    if (s.step !== 'pick' || !first) return;
    autoTries = 7;
    dispatch({ type: 'date', date: first.date, open: true });
    void loadSlots();
  }

  render();
  pickFirst();
  return { setLang(l: Lang) { lang = l; render(); } };
}
