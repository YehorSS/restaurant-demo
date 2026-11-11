import { useEffect, useState } from 'react';
import type { Dish, Section } from '../../../shared/api';
import { money, useApp } from '../ctx';
import { parsePrice } from '../grid';

function DishRow({ dish }: { dish: Dish }) {
  const { api, t, user, rid, lang } = useApp();
  const owner = user.role === 'owner';
  const [d, setD] = useState(dish);
  const [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>('');

  const save = async (patch: Partial<Dish>) => {
    setState('saving');
    try {
      const fresh = await api<Dish>(`/api/admin/dishes/${d.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setD(fresh);
      setState('saved');
    } catch {
      setState('error');
    }
  };
  const priceUnits = d.price_cents / 100;

  return (
    <li className={`dish ${d.out_of_stock ? 'is-out' : ''}`}>
      <div className="dish-text">
        {owner ? (
          <>
            <input aria-label={t('menu.nameLocal')} defaultValue={d.name_local} onBlur={e => e.target.value !== d.name_local && save({ name_local: e.target.value })} />
            <input aria-label={t('menu.nameEn')} defaultValue={d.name_en} onBlur={e => e.target.value !== d.name_en && save({ name_en: e.target.value })} />
          </>
        ) : (
          <>
            <strong>{lang === 'en' ? d.name_en : d.name_local}</strong>
            <span className="muted">{lang === 'en' ? d.desc_en : d.desc_local}</span>
          </>
        )}
      </div>
      <label className="price">{t('menu.price')}
        <input type="number" min={0} step={rid === 'lucciola' ? 0.5 : 5} defaultValue={priceUnits}
          onBlur={e => { const c = parsePrice(e.target.value); if (c === null) e.target.value = String(d.price_cents / 100); else if (c !== d.price_cents) save({ price_cents: c }); }} />
        <span className="muted">{money(d.price_cents, rid)}</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={!!d.out_of_stock} onChange={e => save({ out_of_stock: e.target.checked ? 1 : 0 })} />
        {t('menu.out')}
      </label>
      <span className="save-state" role="status">{state === 'saved' ? t('menu.saved') : state === 'error' ? t('err.generic') : ''}</span>
    </li>
  );
}

export function Menu() {
  const { api, t, rid, user, lang } = useApp();
  const [sections, setSections] = useState<Section[] | null>(null);

  useEffect(() => { api<{ sections: Section[] }>(`/api/admin/r/${rid}/menu`).then(r => setSections(r.sections)).catch(() => setSections([])); }, [api, rid]);

  return (
    <section>
      {user.role === 'demo' && <p className="notice">{t('menu.textLocked')}</p>}
      {sections?.map(s => (
        <div key={s.id} className="card menu-section">
          <h2>{lang === 'en' ? s.title_en : s.title_local}</h2>
          <ul className="dishes">{s.dishes.map(d => <DishRow key={d.id} dish={d} />)}</ul>
        </div>
      ))}
    </section>
  );
}
