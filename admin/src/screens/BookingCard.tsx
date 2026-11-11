import { useEffect, useRef, useState } from 'react';
import { ApiError, type Booking, type TableRow } from '../../../shared/api';
import { useApp } from '../ctx';
import type { Key } from '../i18n';

export function BookingCard({ booking: b, tables, onClose, onChanged }: { booking: Booking; tables: TableRow[]; onClose: () => void; onChanged: () => void }) {
  const { api, t } = useApp();
  const [error, setError] = useState('');
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);

  const set = async (body: object) => {
    try {
      await api(`/api/admin/bookings/${b.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? t('new.taken') : t('err.generic'));
    }
  };
  const table = tables.find(x => x.id === b.table_id);
  const active = b.status !== 'cancelled' && b.status !== 'no_show';

  return (
    <dialog ref={ref} className="card sheet" onClose={onClose} aria-labelledby="card-title">
      <div className="sheet-head">
        <h3 id="card-title">{b.name}</h3>
        <span className={`pill st-${b.status}`}>{t(`status.${b.status}` as Key)}</span>
      </div>
      <dl className="facts">
        <dt>{b.date}</dt><dd>{b.start}–{b.end}</dd>
        <dt>{t('card.guests')}</dt><dd>{b.party}</dd>
        <dt>{t('card.table')}</dt>
        <dd>
          <select aria-label={t('card.table')} value={b.table_id} disabled={!active} onChange={e => set({ table_id: Number(e.target.value) })}>
            {tables.filter(x => x.seats >= b.party).map(x => <option key={x.id} value={x.id}>{x.label} · {x.seats}</option>)}
          </select>
          {!table && '—'}
        </dd>
        <dt>{t('card.phone')}</dt><dd><a href={`tel:${b.phone.replace(/[^+\d]/g, '')}`}>{b.phone}</a></dd>
        <dt>{t('card.code')}</dt><dd className="mono">{b.code}</dd>
        {b.comment && <><dt>{t('card.comment')}</dt><dd>{b.comment}</dd></>}
      </dl>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {b.status === 'new' && <button className="primary" onClick={() => set({ status: 'confirmed' })}>{t('act.confirm')}</button>}
        {(b.status === 'new' || b.status === 'confirmed') && <button className="primary" onClick={() => set({ status: 'seated' })}>{t('act.seat')}</button>}
        {active && b.status !== 'seated' && <button className="ghost" onClick={() => set({ status: 'no_show' })}>{t('act.noshow')}</button>}
        {active && <button className="danger" onClick={() => set({ status: 'cancelled' })}>{t('act.cancel')}</button>}
        {!active && <button className="ghost" onClick={() => set({ status: 'confirmed' })}>{t('act.restore')}</button>}
        <button className="ghost" onClick={() => ref.current?.close()}>{t('card.close')}</button>
      </div>
    </dialog>
  );
}
