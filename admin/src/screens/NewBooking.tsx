import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, type Booking, type Hours, type TableRow } from '../../../shared/api';
import { today, useApp } from '../ctx';
import { timeOptions } from '../grid';

export function NewBooking() {
  const { api, t, rid } = useApp();
  const [date, setDate] = useState(() => today(rid));
  const [hours, setHours] = useState<Hours[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [form, setForm] = useState({ time: '', party: 2, name: '', phone: '', comment: '', table: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ hours: Hours[]; tables: TableRow[] }>(`/api/admin/r/${rid}/day?date=${date}`).then(r => {
      setHours(r.hours);
      setTables(r.tables);
      setForm(f => ({ ...f, time: timeOptions(r.hours).includes(f.time) ? f.time : timeOptions(r.hours)[0] ?? '' }));
    }).catch(() => {});
  }, [api, rid, date]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: k === 'party' ? Number(e.target.value) : e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const b = await api<Booking>(`/api/admin/r/${rid}/bookings`, {
        method: 'POST',
        body: JSON.stringify({ date, time: form.time, party: form.party, name: form.name, phone: form.phone, comment: form.comment, table_id: form.table ? Number(form.table) : undefined }),
      });
      setMsg({ ok: true, text: `${t('new.done')}: ${b.code} · ${b.date} ${b.start}` });
      setForm(f => ({ ...f, name: '', phone: '', comment: '' }));
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError && err.status === 409 ? t('new.taken') : err instanceof ApiError && err.status === 400 ? t('new.invalid') : t('err.generic') });
    }
  };

  const times = timeOptions(hours);
  return (
    <section>
      <form className="card form" onSubmit={submit}>
        <div className="row">
          <label>{t('new.date')}<input type="date" id="nb-date" value={date} onChange={e => e.target.value && setDate(e.target.value)} required /></label>
          <label>{t('new.time')}
            <select id="nb-time" value={form.time} onChange={set('time')} required disabled={!times.length}>
              {times.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>{t('new.party')}<input type="number" id="nb-party" min={1} max={20} value={form.party} onChange={set('party')} required /></label>
        </div>
        {!times.length && <p className="notice">{t('day.closed')}</p>}
        <div className="row">
          <label>{t('new.name')}<input id="nb-name" value={form.name} onChange={set('name')} minLength={2} maxLength={60} required /></label>
          <label>{t('new.phone')}<input id="nb-phone" type="tel" value={form.phone} onChange={set('phone')} pattern="[0-9 +\(\)\-]{8,20}" required /></label>
        </div>
        <label>{t('new.table')}
          <select id="nb-table" value={form.table} onChange={set('table')}>
            <option value="">{t('new.auto')}</option>
            {tables.filter(x => x.seats >= form.party).map(x => <option key={x.id} value={x.id}>{x.label} · {x.seats} {t('day.seats')}</option>)}
          </select>
        </label>
        <label>{t('new.comment')}<textarea id="nb-comment" value={form.comment} onChange={set('comment')} maxLength={300} rows={2} /></label>
        {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
        <button className="primary" disabled={!times.length}>{t('new.save')}</button>
      </form>
    </section>
  );
}
