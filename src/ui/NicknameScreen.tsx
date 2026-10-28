import { useState, type FormEvent } from 'react';
import { ApiFailure } from '../api/client';

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
      setError(err instanceof ApiFailure ? err.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={submit}>
        <h2>닉네임을 정해 주세요</h2>
        <label htmlFor="nickname" className="muted small">1~10자, 한 가지 문자(한글·영문 등)만 섞어 쓸 수 있어요</label>
        <input id="nickname" value={nickname} maxLength={20} autoFocus autoComplete="off"
               onChange={(e) => setNickname(e.target.value)} placeholder="예: 민수" />
        <p className="muted small">나라: 🇰🇷 한국</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !nickname.trim()}>입장하기</button>
      </form>
    </main>
  );
}
