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

/** 플레이어 신고(13.5): 채팅 말고 플레이(부정행위·허점 악용·방해)도 신고할 수 있다. 아래 설명 칸에 상황을 적을 수 있다 */
const PLAYER_REASONS = [
  { value: '부정행위(핵·매크로·프로그램)', key: 'dialogs.reasonCheat' }, { value: '버그·허점 악용', key: 'dialogs.reasonExploit' },
  { value: '부적절한 닉네임', key: 'dialogs.reasonNickname' },
  { value: '욕설·비방', key: 'dialogs.reasonAbuse' }, { value: '기타', key: 'dialogs.reasonOther' },
];
const MEMO_MAX = 200;

interface Props {
  target: 'KEYWORD' | 'COMMENT' | 'CHAT' | 'PLAYER' | 'PLAYER_ID';
  targetId: number;
  /** 신고하는 글 미리보기(누가 뭐라고 썼는지) */
  preview: string;
  /** 끝나면 부른다. 성공은 여기서 토스트로 알리고, 실패면 오류 문구를 넘긴다 */
  onDone(error?: string): void;
  onClose(): void;
}

/**
 * 키워드·댓글·채팅·플레이어 신고(13.5). 사유를 하나 고르고 보낸다. 같은 글은 한 번만 신고할 수 있고, 관리자가 검토한다.
 * 키워드 창 위에 겹쳐 뜨므로 Esc는 이 창만 닫는다(캡처 단계에서 받아 아래 창으로 넘기지 않는다).
 */
export function ReportDialog({ target, targetId, preview, onDone, onClose }: Props) {
  const isPlayer = target === 'PLAYER' || target === 'PLAYER_ID';
  const reasons = isPlayer ? PLAYER_REASONS : REASONS;
  const [reason, setReason] = useState(reasons[0].value);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const detail = isPlayer ? memo.replace(/\s+/g, ' ').trim() : '';
      await api.report(target, targetId, detail ? `${reason}: ${detail}` : reason);
      successToast(t('dialogs.reportDone'));
      onDone();
    } catch (err) {
      // 실패(이미 신고했어요 등)는 창을 닫지 않고 그 자리에서 알린다. 다른 창 뒤에 문구가 숨지 않게
      setError(err instanceof ApiFailure ? err.message : t('dialogs.reportFailed'));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop report-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal report-dialog" role="dialog" aria-modal="true" aria-label={t('dialogs.reportLabel')} onSubmit={submit}>
        <header className="modal-head">
          <h2>{target === 'KEYWORD' ? t('dialogs.reportKeyword') : target === 'COMMENT' ? t('dialogs.reportComment') : isPlayer ? t('dialogs.reportPlayer') : t('dialogs.reportChat')}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('dialogs.close')}>✕</button>
        </header>
        <div className="modal-body">
          <blockquote className="report-preview">{preview}</blockquote>
          <fieldset className="report-reasons">
            <legend className="muted small">{t('dialogs.reportReason')}</legend>
            {reasons.map((r, i) => (
              <label key={r.value}>
                <input ref={i === 0 ? firstRef : undefined} type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} /> {t(r.key)}
              </label>
            ))}
          </fieldset>
          {isPlayer && (
            <label className="report-memo">
              <span className="muted small">{t('dialogs.reportMemo')}</span>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={MEMO_MAX} rows={3} placeholder={t('dialogs.reportMemoHint')} />
            </label>
          )}
          {error && <p className="error small" role="alert">{error}</p>}
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
