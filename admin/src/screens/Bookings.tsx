import { useEffect, useState } from 'react';
import type { Booking, TableRow } from '../../../shared/api';
import { useApp } from '../ctx';
import type { Key } from '../i18n';
import { BookingCard } from './BookingCard';

const STATUSES = ['new', 'confirmed', 'seated', 'cancelled', 'no_show'] as const;

export function Bookings() {
  const { api, t, rid } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [open, setOpen] = useState<Booking | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctl = setTimeout(() => {
      const p = new URLSearchParams({ q, ...(status ? { status } : {}) });
      api<{ bookings: Booking[] }>(`/api/admin/r/${rid}/bookings?${p}`).then(r => setRows(r.bookings)).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(ctl);
  }, [api, rid, q, status, tick]);

  useEffect(() => {
    api<{ tables: TableRow[] }>(`/api/admin/r/${rid}/day?date=2000-01-01`).then(r => setTables(r.tables)).catch(() => {});
  }, [api, rid]);

  const label = (id: number) => tables.find(x => x.id === id)?.label ?? '';

  return (
    <section>
      <div className="toolbar">
        <input type="search" id="search" placeholder={t('list.search')} aria-label={t('list.search')} value={q} onChange={e => setQ(e.target.value)} />
        <select id="status" aria-label={t('status.all')} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('status.all')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}` as Key)}</option>)}
        </select>
      </div>
      {rows && !rows.length && <p className="hint">{t('list.none')}</p>}
      {rows && rows.length > 0 && (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>{t('list.when')}</th><th>{t('list.guest')}</th><th>{t('card.guests')}</th><th>{t('card.table')}</th><th>{t('card.code')}</th><th /></tr></thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.id} onClick={() => setOpen(b)}>
                  <td className="mono">{b.date} {b.start}</td>
                  <td><strong>{b.name}</strong><br /><span className="muted">{b.phone}</span></td>
                  <td>{b.party}</td>
                  <td>{label(b.table_id)}</td>
                  <td className="mono">{b.code}</td>
                  <td><span className={`pill st-${b.status}`}>{t(`status.${b.status}` as Key)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <BookingCard booking={open} tables={tables} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); setTick(x => x + 1); }} />}
    </section>
  );
}
