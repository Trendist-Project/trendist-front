import { useState, type FormEvent } from 'react';
import { ApiFailure } from '../api/client';
import { t } from '../i18n';

interface Props { onSubmit(nickname: string): Promise<void> }

export function NicknameScreen({ onSubmit }: Props) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(nickname);
    } catch (err) {
      // 서버 검사 결과만 믿는다(4.1)
      setError(err instanceof ApiFailure ? err.message : t('nickname.retry'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={submit}>
        <h2>{t('nickname.title')}</h2>
        <label htmlFor="nickname" className="muted small">{t('nickname.rule')}</label>
        <input id="nickname" value={nickname} maxLength={20} autoFocus autoComplete="off"
               onChange={(e) => setNickname(e.target.value)} placeholder={t('nickname.placeholder')} />
        <p className="muted small">{t('nickname.country')}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !nickname.trim()}>{t('nickname.submit')}</button>
      </form>
    </main>
  );
}
