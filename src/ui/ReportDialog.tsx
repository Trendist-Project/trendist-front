import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api/client';
import { successToast } from './toast';
import { t } from '../i18n';

/** value는 서버(관리자 화면)에 저장되는 값이라 한국어 그대로 두고, 화면에는 언어별 이름(key)을 보여 준다 */
const REASONS = [
  { value: '욕설·비방', key: 'dialogs.reasonAbuse' }, { value: '스팸·광고', key: 'dialogs.reasonSpam' },
  { value: '개인정보 노출', key: 'dialogs.reasonPrivacy' }, { value: '음란·폭력', key: 'dialogs.reasonAdult' },
  { value: '기타', key: 'dialogs.reasonOther' },
];

interface Props {
  target: 'COMMENT' | 'CHAT' | 'PLAYER';
  targetId: number;
  /** 신고하는 글 미리보기(누가 뭐라고 썼는지) */
  preview: string;
  /** 끝나면 부른다. 성공은 여기서 토스트로 알리고, 실패면 오류 문구를 넘긴다 */
  onDone(error?: string): void;
  onClose(): void;
}

/**
 * 댓글·채팅·플레이어 신고(13.5). 사유를 하나 고르고 보낸다. 같은 글은 한 번만 신고할 수 있고, 관리자가 검토한다.
 * 키워드 창 위에 겹쳐 뜨므로 Esc는 이 창만 닫는다(캡처 단계에서 받아 아래 창으로 넘기지 않는다).
 */
export function ReportDialog({ target, targetId, preview, onDone, onClose }: Props) {
  const [reason, setReason] = useState(REASONS[0].value);
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
      successToast(t('dialogs.reportDone'));
      onDone();
    } catch (err) {
      onDone(err instanceof ApiFailure ? err.message : t('dialogs.reportFailed'));
    }
  }

  return (
    <div className="modal-backdrop report-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal report-dialog" role="dialog" aria-modal="true" aria-label={t('dialogs.reportLabel')} onSubmit={submit}>
        <header className="modal-head">
          <h2>{target === 'COMMENT' ? t('dialogs.reportComment') : t('dialogs.reportChat')}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('dialogs.close')}>✕</button>
        </header>
        <div className="modal-body">
          <blockquote className="report-preview">{preview}</blockquote>
          <fieldset className="report-reasons">
            <legend className="muted small">{t('dialogs.reportReason')}</legend>
            {REASONS.map((r, i) => (
              <label key={r.value}>
                <input ref={i === 0 ? firstRef : undefined} type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} /> {t(r.key)}
              </label>
            ))}
          </fieldset>
          <p className="muted small">{t('dialogs.reportOnce')}</p>
          <div className="comment-actions">
            <span className="spacer" />
            <button type="button" onClick={onClose}>{t('dialogs.cancel')}</button>
            <button className="primary danger" disabled={busy}>{t('dialogs.reportSubmit')}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
