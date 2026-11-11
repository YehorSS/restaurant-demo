import { useCallback, useEffect, useState } from 'react';
import type { Booking, Hours, TableRow } from '../../../shared/api';
import { shiftDate, today, useApp } from '../ctx';
import { fmt, gridPlacement, gridRange, STEP } from '../grid';
import type { Key } from '../i18n';
import { BookingCard } from './BookingCard';

interface DayData { date: string; hours: Hours[]; tables: TableRow[]; bookings: Booking[] }

export function Day() {
  const { api, t, rid, lang } = useApp();
  const [date, setDate] = useState(() => today(rid));
  const [data, setData] = useState<DayData | null>(null);
  const [open, setOpen] = useState<Booking | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<DayData>(`/api/admin/r/${rid}/day?date=${date}`).then(d => { setData(d); setError(''); }).catch(() => setError(t('err.generic')));
  }, [api, rid, date, t]);
  useEffect(load, [load]);

  const range = gridRange(data?.hours ?? []);
  const cols = (range.to - range.from) / STEP;
  const ticks = Array.from({ length: cols / 2 }, (_, i) => range.from + i * 60);
  const shown = (data?.bookings ?? []).filter(b => b.status !== 'cancelled');
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  return (
    <section>
      <div className="toolbar">
        <button className="ghost" aria-label={t('day.prev')} onClick={() => setDate(d => shiftDate(d, -1))}>←</button>
        <input type="date" id="day-date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
        <button className="ghost" aria-label={t('day.next')} onClick={() => setDate(d => shiftDate(d, 1))}>→</button>
        <button className="ghost" onClick={() => setDate(today(rid))}>{t('day.today')}</button>
        <h2 className="day-label">{label}</h2>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {data && !data.hours.length && <p className="notice">{t('day.closed')}</p>}
      {data && (
        <div className="grid-scroll">
          <div className="grid" style={{ gridTemplateColumns: `120px repeat(${cols}, minmax(28px, 1fr))` }}>
            <div className="grid-corner" />
            {ticks.map((m, i) => <div key={m} className="tick" style={{ gridColumn: `${i * 2 + 2} / span 2` }}>{fmt(m)}</div>)}
            {data.tables.map((tb, row) => (
              <div key={tb.id} className="grid-row" style={{ gridRow: row + 2 }}>
                <div className="table-cell" style={{ gridRow: row + 2 }}>
                  <strong>{tb.label}</strong><span>{tb.seats} {t('day.seats')}</span>
                </div>
                <div className="lane" style={{ gridRow: row + 2, gridColumn: `2 / span ${cols}` }} />
                {shown.filter(b => b.table_id === tb.id).map(b => {
                  const p = gridPlacement(b, range.from);
                  if (p.col < 1 || p.col > cols) return null;
                  return (
                    <button key={b.id} className={`bar st-${b.status}`} style={{ gridRow: row + 2, gridColumn: `${p.col + 1} / span ${Math.min(p.span, cols - p.col + 1)}` }}
                      onClick={() => setOpen(b)} title={`${b.start}–${b.end} ${b.name}`}>
                      <span className="bar-name">{b.name}</span><span className="bar-meta">{b.party} · {b.start}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {data && !shown.length && data.hours.length > 0 && <p className="hint">{t('day.empty')}</p>}
      <div className="legend">
        {(['new', 'confirmed', 'seated', 'no_show'] as const).map(s => <span key={s}><i className={`dot st-${s}`} />{t(`status.${s}` as Key)}</span>)}
      </div>
      {open && data && <BookingCard booking={open} tables={data.tables} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </section>
  );
}
