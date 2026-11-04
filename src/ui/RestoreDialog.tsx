import { useState } from 'react';
import { ApiFailure } from '../api/client';
import { Modal } from './Modal';
import { t } from '../i18n';

interface Props { onRestore(): Promise<void>; onCancel(): void }

/** 탈퇴한 구글 계정으로 다시 로그인했을 때(4.1): 복구하면 탈퇴 전 기록으로 바로 로그인한다. 취소하면 아무것도 바뀌지 않는다. */
export function RestoreDialog({ onRestore, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true); setError(null);
    try {
      await onRestore();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t('dialogs.restoreFailed'));
      setBusy(false);
    }
  }

  return (
    <Modal title={t('dialogs.restoreTitle')} onClose={onCancel} className="account-dialog">
      <p>{t('dialogs.restoreAsk')}</p>
      <ul className="account-dialog-list">
        <li>{t('dialogs.restore1')}</li>
        <li>{t('dialogs.restore2')}</li>
        <li>{t('dialogs.restore3')}</li>
      </ul>
      {error && <p className="error small" role="alert">{error}</p>}
      <div className="account-dialog-actions">
        <button onClick={onCancel} disabled={busy}>{t('dialogs.cancel')}</button>
        <button className="primary" onClick={restore} disabled={busy}>{busy ? t('dialogs.restoring') : t('dialogs.restoreBtn')}</button>
      </div>
    </Modal>
  );
}
