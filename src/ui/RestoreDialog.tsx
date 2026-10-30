import { useState } from 'react';
import { ApiFailure } from '../api/client';
import { Modal } from './Modal';

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
      setError(e instanceof ApiFailure ? e.message : '복구하지 못했어요. 다시 시도해 주세요');
      setBusy(false);
    }
  }

  return (
    <Modal title="탈퇴한 계정이에요" onClose={onCancel} className="account-dialog">
      <p>이 Google 계정은 탈퇴한 상태예요. 계정을 복구할까요?</p>
      <ul className="account-dialog-list">
        <li>닉네임, 레벨·EXP, 칭호, 꾸미기, 댓글이 탈퇴 전 그대로 돌아와요.</li>
        <li>탈퇴한 동안 24시간이 지난 보관함 키워드는 돌아오지 않아요.</li>
        <li>복구하면 바로 로그인돼요.</li>
      </ul>
      {error && <p className="error small" role="alert">{error}</p>}
      <div className="account-dialog-actions">
        <button onClick={onCancel} disabled={busy}>취소</button>
        <button className="primary" onClick={restore} disabled={busy}>{busy ? '복구하는 중…' : '계정 복구'}</button>
      </div>
    </Modal>
  );
}
