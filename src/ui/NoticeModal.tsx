import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Notice } from '../api/types';
import { Modal } from './Modal';
import { RichText } from './RichText';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

// 이 브라우저에서 본 공지(4.16). 팝업은 띄운 공지 번호들, 빨간 점은 목록을 열었을 때 본 가장 큰 번호로 판단한다
const POPUP_SEEN_KEY = 'trendist.noticePopupSeen';
const LIST_SEEN_KEY = 'trendist.noticeSeenMax';
const POPUP_MAX = 10;

function readSeen(): number[] {
  try { return JSON.parse(localStorage.getItem(POPUP_SEEN_KEY) ?? '[]') as number[]; } catch { return []; }
}
function markPopupSeen(ids: number[]) {
  // 오래된 번호는 버리고 최근 100개만 남긴다
  try { localStorage.setItem(POPUP_SEEN_KEY, JSON.stringify([...new Set([...readSeen(), ...ids])].slice(-100))); } catch { /* 저장 못 해도 동작한다 */ }
}
function seenMax(): number {
  try { return Number(localStorage.getItem(LIST_SEEN_KEY) ?? 0) || 0; } catch { return 0; }
}
export function markNoticesRead(notices: Notice[]) {
  const max = Math.max(seenMax(), ...notices.map((n) => n.id));
  try { localStorage.setItem(LIST_SEEN_KEY, String(max)); } catch { /* 무시 */ }
}
/** [공지] 버튼의 빨간 점: 목록에서 아직 못 본(더 새) 공지가 있다 */
export const hasUnread = (notices: Notice[]) => notices.some((n) => n.id > seenMax());
/** 팝업으로 띄울 공지: 팝업 기간 안이고 이 브라우저에서 아직 안 띄운 것. 고정 먼저, 그다음 최신순(서버 순서), 최대 10개 */
export function popupNotices(notices: Notice[]): Notice[] {
  const seen = new Set(readSeen());
  return notices.filter((n) => n.popup && !seen.has(n.id)).slice(0, POPUP_MAX);
}

function NoticeHead({ n }: { n: Notice }) {
  return (<>
    {(n.pinned || n.fresh) && (
      <div className="notice-article-badges">
        {n.pinned && <span className="notice-badge pin">📌 고정</span>}
        {n.fresh && <span className="notice-badge new">NEW</span>}
      </div>
    )}
    <h3 className="notice-article-title">{n.title}</h3>
    <span className="notice-article-date">{dateFormat.format(new Date(n.createdAt))}{n.edited ? ' · 수정됨' : ''}</span>
  </>);
}

/** 공지사항 목록(4.16). 고정 공지가 먼저, 그다음 최신순. 카드를 누르면 본문이 펼쳐진다(맨 위 하나는 펼친 채로). */
export function NoticeModal({ onClose, onRead }: { onClose(): void; onRead?(): void }) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.notices().then((ns) => { setNotices(ns); markNoticesRead(ns); onRead?.(); }).catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="📢 공지사항" onClose={onClose} className="notice-modal">
      {error && <p className="muted">공지를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
      {!error && notices === null && <p className="muted">불러오는 중…</p>}
      {notices?.length === 0 && <div className="notice-empty-user"><span aria-hidden="true">📭</span><p className="muted">아직 공지가 없어요.</p></div>}
      {notices && notices.length > 0 && (
        <div className="notice-cards">
          {notices.map((n, i) => (
            <details key={n.id} className={n.pinned ? 'notice-card pinned' : 'notice-card'} open={i === 0}>
              <summary><div className="notice-card-head"><NoticeHead n={n} /></div><span className="notice-card-chevron" aria-hidden="true">›</span></summary>
              <div className="notice-card-body"><RichText text={n.body} /></div>
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}

/**
 * 새 공지 팝업(4.16): 게임에 들어올 때 아직 안 본 팝업 공지를 한 창에 모아 좌우로 넘겨 본다.
 * 띄우는 순간 모두 "봤음"으로 기록해 다시 띄우지 않는다. [확인]이나 ESC로 닫는다.
 */
export function NoticePopup({ notices, onClose }: { notices: Notice[]; onClose(): void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { markPopupSeen(notices.map((n) => n.id)); }, [notices]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(notices.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notices.length]);

  const n = notices[index];
  const many = notices.length > 1;
  return (
    <Modal title="📢 새 소식" onClose={onClose} className="notice-popup">
      <article className="notice-popup-article" aria-live="polite">
        <NoticeHead n={n} />
        <div className="notice-popup-body"><RichText text={n.body} /></div>
      </article>
      <footer className="notice-popup-foot">
        {many ? (
          <div className="notice-popup-nav">
            <button onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label="이전 공지">‹</button>
            <div className="notice-dots" role="tablist" aria-label="공지 넘기기">
              {notices.map((x, i) => (
                <button key={x.id} role="tab" aria-selected={i === index} aria-label={`${i + 1}번째 공지`}
                        className={i === index ? 'notice-dot on' : 'notice-dot'} onClick={() => setIndex(i)} />
              ))}
            </div>
            <button onClick={() => setIndex(index + 1)} disabled={index === notices.length - 1} aria-label="다음 공지">›</button>
            <span className="muted small notice-popup-count">{index + 1} / {notices.length}</span>
          </div>
        ) : <span />}
        <button className="primary" onClick={onClose}>확인</button>
      </footer>
    </Modal>
  );
}
