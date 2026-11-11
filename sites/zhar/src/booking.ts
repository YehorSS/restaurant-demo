import { ApiError } from '../../../shared/api';
import { initial, MAX_PARTY, reduce, type Event } from '../../../shared/booking-model';
import { bookableDays, readStored, store, type Info, type Made, type SiteApi, type Slot } from '../../../shared/site';
import { t, type Lang } from './i18n';

const RID = 'zhar';
const LAST = 'zhar-last';
const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Booking side panel (bottom sheet on phones) opened from a floating button. */
export function createPanel(api: SiteApi, info: Info, lang: Lang, phone: string, opener: HTMLElement) {
  const days = bookableDays(info, Date.now(), 21);
  const tel = `<a href="tel:${phone.replace(/[^+\d]/g, '')}">${esc(phone)}</a>`;
  let s = initial();
  let autoTries = 0;
  let started = false;

  try {
    const last = JSON.parse(readStored(LAST) ?? 'null') as (Made & { phone: string }) | null;
    if (last && last.date >= days[0].date) s = { ...s, step: 'done', made: last, guest: { ...s.guest, phone: last.phone } };
  } catch { /* ignore a broken stored value */ }

  const shade = document.createElement('div');
  shade.className = 'zh-shade';
  shade.hidden = true;
  const root = document.createElement('div');
  root.className = 'zh-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'zh-panel-title');
  root.hidden = true;
  document.body.append(shade, root);

  const dispatch = (e: Event) => { s = reduce(s, e); render(); };

  async function loadSlots(): Promise<void> {
    if (!s.date || s.party > MAX_PARTY) return;
    const want = { date: s.date, party: s.party };
    try {
      const r = await api.slots(RID, want.date, want.party);
      if (s.date !== want.date || s.party !== want.party) return;
      const next = days.slice(days.findIndex(d => d.date === want.date) + 1).find(d => d.open);
      if (autoTries > 0 && !r.slots.some((x: Slot) => x.available) && next) {
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

  async function send(): Promise<void> {
    if (!s.date || !s.time) return;
    dispatch({ type: 'send' });
    try {
      const made = await api.book(RID, { date: s.date, time: s.time, party: s.party, ...s.guest, website: root.querySelector<HTMLInputElement>('#zh-website')?.value ?? '' });
      store(LAST, JSON.stringify({ ...made, phone: s.guest.phone }));
      dispatch({ type: 'booked', made });
    } catch (err) {
      if (err instanceof ApiError && err.error === 'slot_taken') dispatch({ type: 'failed', error: 'taken', slots: err.body.slots as Slot[] | undefined });
      else dispatch({ type: 'failed', error: err instanceof ApiError && err.status === 400 ? 'invalid' : 'error' });
    }
  }

  async function cancel(): Promise<void> {
    if (!s.made) return;
    try {
      await api.cancel(RID, s.made.code, s.guest.phone);
      store(LAST, null);
      dispatch({ type: 'cancelled' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) { store(LAST, null); dispatch({ type: 'forget' }); pickFirst(); return; }
      dispatch({ type: 'failed', error: 'error', from: 'cancel' });
    }
  }

  function pickFirst(): void {
    const first = days.find(d => d.open);
    if (s.step !== 'pick' || !first) return;
    autoTries = 7;
    dispatch({ type: 'date', date: first.date, open: true });
    void loadSlots();
  }

  const label = (date: string) => {
    const d = new Date(`${date}T12:00:00Z`), loc = lang === 'uk' ? 'uk-UA' : 'en-GB';
    return { wd: d.toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }), n: d.getUTCDate(), m: d.toLocaleDateString(loc, { month: 'short', timeZone: 'UTC' }) };
  };

  function body(): string {
    if (s.step === 'done' && s.made) {
      const d = label(s.made.date);
      return `<div class="zh-done" role="status">
        <p class="zh-big">${t(lang, 'book.done')}</p>
        <p>${d.wd}, ${d.n} ${d.m} · ${esc(s.made.time)} · ${s.made.party}</p>
        <p class="zh-code"><span>${t(lang, 'book.code')}</span><strong>${esc(s.made.code)}</strong></p>
        ${s.error === 'error' ? `<p class="zh-err">${t(lang, 'book.error')} ${tel}</p>` : ''}
        <button type="button" class="zh-btn ghost" id="zh-cancel">${t(lang, 'book.cancel')}</button>
        <button type="button" class="zh-btn" id="zh-new">${t(lang, 'book.again')}</button>
      </div>`;
    }
    if (s.step === 'cancelled') return `<div class="zh-done" role="status"><p class="zh-big">${t(lang, 'book.cancelled')}</p><button type="button" class="zh-btn" id="zh-new">${t(lang, 'book.again')}</button></div>`;

    const slots = !s.date ? '' : s.party > MAX_PARTY ? `<p class="zh-note">${t(lang, 'book.big')} ${tel}</p>`
      : s.error === 'error' && !s.slots ? `<p class="zh-err" role="alert">${t(lang, 'book.error')} ${tel}</p>`
      : s.loading || !s.slots ? `<p class="zh-note">${t(lang, 'book.loading')}</p>`
      : !s.slots.some(x => x.available) ? `<p class="zh-note">${t(lang, 'book.none')}</p>`
      : `<div class="zh-times">${s.slots.map(x => `<button type="button" class="zh-time" data-time="${esc(x.time)}" ${x.available ? '' : 'disabled'} aria-pressed="${x.time === s.time}">${esc(x.time)}</button>`).join('')}</div>`;
    const form = s.step === 'form' || s.step === 'sending';
    return `
      <p class="zh-lbl">${t(lang, 'book.day')}</p>
      <div class="zh-days">${days.map(d => { const l = label(d.date); return `<button type="button" class="zh-day" data-date="${d.date}" ${d.open ? '' : 'disabled'} aria-pressed="${d.date === s.date}"><span>${l.wd}</span><strong>${l.n}</strong><span>${d.open ? l.m : t(lang, 'book.closed')}</span></button>`; }).join('')}</div>
      <p class="zh-lbl" id="zh-party-l">${t(lang, 'book.party')}</p>
      <div class="zh-party" role="group" aria-labelledby="zh-party-l">${Array.from({ length: 9 }, (_, i) => i + 1).map(n => `<button type="button" class="zh-n" id="zh-n${n}" data-n="${n}" aria-pressed="${n === s.party}">${n === 9 ? '9+' : n}</button>`).join('')}</div>
      <p class="zh-lbl">${t(lang, 'book.time')}</p>
      ${s.error === 'taken' ? `<p class="zh-err" role="alert">${t(lang, 'book.taken')}</p>` : ''}
      <div aria-live="polite">${slots}</div>
      ${form ? `<form class="zh-form" novalidate>
        <label>${t(lang, 'book.name')}<input id="zh-name" autocomplete="name" value="${esc(s.guest.name)}" required></label>
        <label>${t(lang, 'book.phone')}<input id="zh-phone" type="tel" autocomplete="tel" value="${esc(s.guest.phone)}" required></label>
        <label>${t(lang, 'book.comment')}<textarea id="zh-comment" rows="2" maxlength="300">${esc(s.guest.comment)}</textarea></label>
        <input id="zh-website" tabindex="-1" autocomplete="off" class="zh-trap" aria-hidden="true">
        ${s.error === 'invalid' ? `<p class="zh-err" role="alert">${t(lang, 'book.invalid')}</p>` : ''}
        ${s.error === 'error' ? `<p class="zh-err" role="alert">${t(lang, 'book.error')} ${tel}</p>` : ''}
        <button class="zh-btn" ${s.step === 'sending' ? 'disabled' : ''}>${t(lang, s.step === 'sending' ? 'book.sending' : 'book.send')} · ${esc(s.time ?? '')}</button>
      </form>` : ''}`;
  }

  function focusKey(): string | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !root.contains(a)) return null;
    return a.id ? `#${a.id}` : a.dataset.date ? `[data-date="${a.dataset.date}"]` : a.dataset.time ? `[data-time="${a.dataset.time}"]` : null;
  }

  function render(): void {
    const key = focusKey();
    root.innerHTML = `<div class="zh-panel-head"><h2 id="zh-panel-title">${t(lang, 'book.title')}</h2><button type="button" class="zh-x" id="zh-close" aria-label="${t(lang, 'book.close')}">×</button></div><div class="zh-panel-body">${body()}</div>`;
    root.querySelector('#zh-close')!.addEventListener('click', close);
    root.querySelector('#zh-cancel')?.addEventListener('click', cancel);
    root.querySelector('#zh-new')?.addEventListener('click', () => { dispatch({ type: 'forget' }); pickFirst(); });
    root.querySelectorAll<HTMLButtonElement>('.zh-day').forEach(b => b.addEventListener('click', () => { dispatch({ type: 'date', date: b.dataset.date!, open: !b.disabled }); void loadSlots(); }));
    root.querySelectorAll<HTMLButtonElement>('.zh-n').forEach(b => b.addEventListener('click', () => { dispatch({ type: 'party', party: Number(b.dataset.n) }); void loadSlots(); }));
    root.querySelectorAll<HTMLButtonElement>('.zh-time').forEach(b => b.addEventListener('click', () => { dispatch({ type: 'time', time: b.dataset.time! }); root.querySelector<HTMLInputElement>('#zh-name')?.focus(); }));
    for (const f of ['name', 'phone', 'comment'] as const)
      root.querySelector<HTMLInputElement>(`#zh-${f}`)?.addEventListener('input', e => { s = reduce(s, { type: 'guest', field: f, value: (e.target as HTMLInputElement).value }); });
    root.querySelector('form')?.addEventListener('submit', e => { e.preventDefault(); void send(); });
    if (key) root.querySelector<HTMLElement>(key)?.focus();
  }

  function focusables(): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([tabindex="-1"]), textarea, a[href]')];
  }

  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  shade.addEventListener('click', close);

  function open(): void {
    root.hidden = false;
    shade.hidden = false;
    document.body.classList.add('zh-locked');
    if (!started) { started = true; render(); pickFirst(); } else render();
    (root.querySelector<HTMLElement>('.zh-day[aria-pressed="true"]') ?? focusables()[1] ?? root).focus();
  }

  function close(): void {
    root.hidden = true;
    shade.hidden = true;
    document.body.classList.remove('zh-locked');
    opener.focus();
  }

  return { open, close, setLang(l: Lang) { lang = l; if (!root.hidden) render(); } };
}
