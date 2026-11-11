import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, createApi } from '../../shared/api';
import { AppCtx, RESTAURANTS, type Rid, type User } from './ctx';
import { DICT, type Key, type Lang } from './i18n';
import { Login } from './screens/Login';
import { Day } from './screens/Day';
import { Bookings } from './screens/Bookings';
import { NewBooking } from './screens/NewBooking';
import { Menu } from './screens/Menu';
import { ClosedDays } from './screens/ClosedDays';
import './styles.css';

type Screen = 'day' | 'list' | 'new' | 'menu' | 'closed';
const SCREENS: Screen[] = ['day', 'list', 'new', 'menu', 'closed'];

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

// short status line for one-off actions; the viewer has no alert dialogs worth relying on
function alertText(text: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2500);
}

function fromHash(): Screen {
  const h = location.hash.replace('#', '') as Screen;
  return SCREENS.includes(h) ? h : 'day';
}

function App() {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = read('admin-lang');
    if (saved === 'en' || saved === 'uk') return saved;
    return /^(uk|ru)/i.test(navigator.language) ? 'uk' : 'en';
  });
  const [rid, setRid] = useState<Rid>(() => (read('admin-rid') === 'lucciola' ? 'lucciola' : 'zhar'));
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>(fromHash);

  const t = useCallback((k: Key) => DICT[lang][k], [lang]);
  const api = useMemo(() => createApi('', () => setUser(null)), []);

  useEffect(() => { document.documentElement.lang = lang; document.title = t('app.title'); }, [lang, t]);
  useEffect(() => {
    const on = () => setScreen(fromHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { api<User>('/api/auth/me').then(setUser).catch((e: unknown) => { if (e instanceof ApiError) setUser(null); }); }, [api]);

  const switchLang = () => { const l = lang === 'uk' ? 'en' : 'uk'; setLang(l); write('admin-lang', l); };
  const switchRid = (r: Rid) => { setRid(r); write('admin-rid', r); };

  if (user === undefined) return <div className="boot" aria-busy="true" />;
  if (user === null) return <Login api={api} t={t} onIn={setUser} lang={lang} onLang={switchLang} />;

  const resetDemo = async () => {
    try { await api('/api/admin/reset', { method: 'POST' }); alertText(t('reset.done')); location.reload(); }
    catch { alertText(t('err.generic')); }
  };
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); };
  const NAV: Record<Screen, Key> = { day: 'nav.day', list: 'nav.list', new: 'nav.new', menu: 'nav.menu', closed: 'nav.closed' };

  return (
    <AppCtx.Provider value={{ api, lang, t, user, rid }}>
      <header className="top">
        <div className="brand">
          <select aria-label="Restaurant" value={rid} onChange={e => switchRid(e.target.value as Rid)}>
            {RESTAURANTS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <span className={`role role-${user.role}`}>{t(`role.${user.role}` as Key)}</span>
        </div>
        <nav className="tabs">
          {SCREENS.map(s => <a key={s} href={`#${s}`} aria-current={s === screen ? 'page' : undefined}>{t(NAV[s])}</a>)}
        </nav>
        <div className="tools">
          {user.role === 'owner' && <button className="ghost" onClick={resetDemo}>{t('reset.btn')}</button>}
          <button className="ghost" onClick={switchLang}>{t('lang')}</button>
          <button className="ghost" onClick={logout}>{t('nav.logout')}</button>
        </div>
      </header>
      <main className="page" key={rid}>
        {screen === 'day' && <Day />}
        {screen === 'list' && <Bookings />}
        {screen === 'new' && <NewBooking />}
        {screen === 'menu' && <Menu />}
        {screen === 'closed' && <ClosedDays />}
      </main>
    </AppCtx.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
