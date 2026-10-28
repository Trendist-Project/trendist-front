import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Notice } from '../api/types';
import { Modal } from './Modal';
import { RichText } from './RichText';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

/** 공지사항 목록(4.16). 고정 공지가 먼저, 그다음 최신순. 제목을 누르면 본문이 펼쳐진다. */
export function NoticeModal({ onClose }: { onClose(): void }) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.notices().then(setNotices).catch(() => setError(true));
  }, []);

  return (
    <Modal title="공지사항" onClose={onClose}>
      {error && <p className="muted">공지를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
      {!error && notices === null && <p className="muted">불러오는 중…</p>}
      {notices?.length === 0 && <p className="muted">아직 공지가 없어요.</p>}
      {notices && notices.length > 0 && (
        <div className="accordion">
          {notices.map((n, i) => (
            <details key={n.id} open={i === 0}>
              <summary>
                {n.pinned && <span className="badge">📌 고정</span>}
                {n.fresh && <span className="badge new">NEW</span>}
                <span className="summary-title">{n.title}</span>
                <span className="muted small">{dateFormat.format(new Date(n.createdAt))}{n.edited ? ' · 수정됨' : ''}</span>
              </summary>
              <RichText text={n.body} />
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}
