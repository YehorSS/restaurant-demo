import { useState, type FormEvent } from 'react';
import { ApiError, type Api } from '../../../shared/api';
import type { User } from '../ctx';
import type { Key, Lang } from '../i18n';

export function Login({ api, t, onIn, onLang }: { api: Api; t: (k: Key) => string; onIn: (u: User) => void; lang: Lang; onLang: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onIn(await api<User>('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? t('login.locked') : err instanceof ApiError && err.status === 401 ? t('login.wrong') : t('err.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-head">
          <h1>{t('login.title')}</h1>
          <button type="button" className="ghost" onClick={onLang}>{t('lang')}</button>
        </div>
        <label>{t('login.user')}<input id="login" autoComplete="username" value={login} onChange={e => setLogin(e.target.value)} required /></label>
        <label>{t('login.pass')}<input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{t('login.go')}</button>
        <p className="hint">{t('login.demo')}</p>
      </form>
    </div>
  );
}
