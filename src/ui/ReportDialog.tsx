import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';

const REASONS = ['욕설·비방', '스팸·광고', '개인정보 노출', '음란·폭력', '기타'];

interface Props {
  target: 'COMMENT' | 'CHAT';
  targetId: number;
  /** 신고하는 글 미리보기(누가 뭐라고 썼는지) */
  preview: string;
  onDone(message: string): void;
  onClose(): void;
}

/**
 * 댓글·채팅 신고(13.5). 사유를 하나 고르고 보낸다. 같은 글은 한 번만 신고할 수 있고, 관리자가 검토한다.
 * 키워드 창 위에 겹쳐 뜨므로 Esc는 이 창만 닫는다(캡처 단계에서 받아 아래 창으로 넘기지 않는다).
 */
export function ReportDialog({ target, targetId, preview, onDone, onClose }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.report(target, targetId, reason);
      onDone('신고했어요. 관리자가 확인할게요');
    } catch (err) {
      onDone(err instanceof ApiFailure ? err.message : '신고하지 못했어요');
    }
  }

  return (
    <div className="modal-backdrop report-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal report-dialog" role="dialog" aria-modal="true" aria-label="신고하기" onSubmit={submit}>
        <header className="modal-head">
          <h2>{target === 'COMMENT' ? '댓글 신고' : '채팅 신고'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        <div className="modal-body">
          <blockquote className="report-preview">{preview}</blockquote>
          <fieldset className="report-reasons">
            <legend className="muted small">신고 사유</legend>
            {REASONS.map((r, i) => (
              <label key={r}>
                <input ref={i === 0 ? firstRef : undefined} type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {r}
              </label>
            ))}
          </fieldset>
          <p className="muted small">같은 글은 한 번만 신고할 수 있어요. 관리자가 확인한 뒤 처리해요.</p>
          <div className="comment-actions">
            <span className="spacer" />
            <button type="button" onClick={onClose}>취소</button>
            <button className="primary danger" disabled={busy}>신고하기</button>
          </div>
        </div>
      </form>
    </div>
  );
}
