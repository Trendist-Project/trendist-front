import { useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import { Modal } from './Modal';
import { t } from '../i18n';

/** 서버가 받는 확인 문구(4.1). 화면에는 언어별 문구를 입력받고, 맞으면 서버에는 이 값을 보낸다 */
const SERVER_PHRASE = '탈퇴 합니다.';

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
  const PHRASE = t('dialogs.withdrawPhrase');
  const ok = text === PHRASE;

  const blockPaste = (e: ClipboardEvent | DragEvent) => { e.preventDefault(); setHint(t('dialogs.noPaste')); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setError(null);
    try {
      await api.withdraw(SERVER_PHRASE);
      onDone();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : t('dialogs.withdrawFailed'));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('dialogs.withdrawTitle')} onClose={onCancel} className="account-dialog">
      <form onSubmit={submit} className="account-dialog-form">
        <ul className="account-dialog-list">
          <li>{t('dialogs.withdraw1')}</li>
          <li>{t('dialogs.withdraw2')}</li>
        </ul>
        <label htmlFor="withdraw-input">{t('dialogs.withdrawPrefix')} <strong className="withdraw-phrase">{PHRASE}</strong> {t('dialogs.withdrawSuffix')}</label>
        <input id="withdraw-input" value={text} autoComplete="off" spellCheck={false} placeholder={PHRASE}
               onChange={(e) => { setText(e.target.value); setHint(null); }}
               onPaste={blockPaste} onDrop={blockPaste} />
        {hint && <p className="warn small" role="status">{hint}</p>}
        {error && <p className="error small" role="alert">{error}</p>}
        <div className="account-dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>{t('dialogs.cancel')}</button>
          <button type="submit" className="danger-fill" disabled={!ok || busy}>{busy ? t('dialogs.withdrawing') : t('dialogs.withdrawBtn')}</button>
        </div>
      </form>
    </Modal>
  );
}
