import { useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import { Modal } from './Modal';

/** 서버와 같은 확인 문구(4.1) */
const PHRASE = '탈퇴 합니다.';

interface Props { onDone(): void; onCancel(): void }

/**
 * 회원 탈퇴 확인(4.1): 확인 문구를 직접 입력해야 탈퇴된다. 실수로 누르지 않게 붙여넣기·끌어 놓기는 막는다.
 * 탈퇴해도 기록은 지우지 않고, 같은 Google 계정으로 다시 로그인하면 복구할 수 있다.
 */
export function WithdrawDialog({ onDone, onCancel }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const ok = text === PHRASE;

  const blockPaste = (e: ClipboardEvent | DragEvent) => { e.preventDefault(); setHint('붙여넣기는 할 수 없어요. 직접 입력해 주세요'); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setError(null);
    try {
      await api.withdraw(text);
      onDone();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : '탈퇴하지 못했어요. 다시 시도해 주세요');
      setBusy(false);
    }
  }

  return (
    <Modal title="회원 탈퇴" onClose={onCancel} className="account-dialog">
      <form onSubmit={submit} className="account-dialog-form">
        <ul className="account-dialog-list">
          <li>탈퇴하면 바로 로그아웃되고, 랭킹·아레나에서 빠져요.</li>
          <li>기록은 지우지 않아요. 같은 Google 계정으로 다시 로그인하면 복구할 수 있어요.</li>
        </ul>
        <label htmlFor="withdraw-input">계속하려면 <strong className="withdraw-phrase">{PHRASE}</strong> 를 직접 입력해 주세요.</label>
        <input id="withdraw-input" value={text} autoComplete="off" spellCheck={false} placeholder={PHRASE}
               onChange={(e) => { setText(e.target.value); setHint(null); }}
               onPaste={blockPaste} onDrop={blockPaste} />
        {hint && <p className="warn small" role="status">{hint}</p>}
        {error && <p className="error small" role="alert">{error}</p>}
        <div className="account-dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>취소</button>
          <button type="submit" className="danger-fill" disabled={!ok || busy}>{busy ? '탈퇴하는 중…' : '탈퇴'}</button>
        </div>
      </form>
    </Modal>
  );
}
