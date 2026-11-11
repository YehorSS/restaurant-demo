import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { shiftDate, today, useApp } from '../ctx';

export function ClosedDays() {
  const { api, t, rid, user, lang } = useApp();
  const owner = user.role === 'owner';
  const [days, setDays] = useState<string[]>([]);
  const [date, setDate] = useState(() => shiftDate(today(rid), 7));
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ closed: string[] }>(`/api/admin/r/${rid}/closed-days`).then(r => setDays(r.closed)).catch(() => {});
  }, [api, rid]);
  useEffect(load, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try { await api(`/api/admin/r/${rid}/closed-days`, { method: 'POST', body: JSON.stringify({ date }) }); setError(''); load(); }
    catch { setError(t('err.generic')); }
  };
  const remove = async (d: string) => { await api(`/api/admin/r/${rid}/closed-days/${d}`, { method: 'DELETE' }).catch(() => {}); load(); };
  const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <section>
      {!owner && <p className="notice">{t('closed.ownerOnly')}</p>}
      {owner && (
        <form className="card form row" onSubmit={add}>
          <label>{t('closed.add')}<input type="date" id="closed-date" value={date} min={today(rid)} onChange={e => setDate(e.target.value)} required /></label>
          <button className="primary">{t('closed.addBtn')}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {!days.length && <p className="hint">{t('closed.none')}</p>}
      <ul className="closed-list">
        {days.map(d => (
          <li key={d} className="card">
            <span>{nice(d)}</span>
            {owner && <button className="ghost" onClick={() => remove(d)}>{t('closed.remove')}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
