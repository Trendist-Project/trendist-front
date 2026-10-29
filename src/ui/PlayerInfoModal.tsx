import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerCard, ScoreHistory } from '../api/types';
import { TurtleIcon } from './GrowthIcons';
import { STATE_BADGE } from './keywordFormat';
import { Modal } from './Modal';
import { ScoreChart } from './ScoreChart';

interface Props {
  entityNo: number;
  onClose(): void;
  onOpenKeyword(keywordId: number): void;
}

/**
 * 다른 플레이어 정보 팝업(4.11). 아레나에서 다른 원을 누르면 열린다. 게임은 멈추지 않는다.
 * 아이콘·닉네임(관리자 배지)·활성 칭호, 현재 유행도·레벨·댓글 점수, 최근 7일 점수 추이, 보관함 중 점수 상위 3개(이름·상태만).
 */
export function PlayerInfoModal({ entityNo, onClose, onOpenKeyword }: Props) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [history, setHistory] = useState<ScoreHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.roomPlayer(entityNo)
      .then((c) => { if (alive) setCard(c); })
      .catch((e) => { if (alive) setError(e instanceof ApiFailure ? e.message : '정보를 불러오지 못했어요'); });
    api.roomPlayerHistory(entityNo).then((h) => { if (alive) setHistory(h); }).catch(() => { /* 그래프만 빠진다 */ });
    return () => { alive = false; };
  }, [entityNo]);

  return (
    <Modal title={card?.nickname ?? '플레이어'} onClose={onClose} className="player-modal">
      {error && <p className="muted">{error}</p>}
      {!error && !card && <p className="muted">불러오는 중…</p>}
      {card && (<>
        <section className="player-hero">
          <TurtleIcon level={card.level} size={64} />
          <div className="player-hero-main">
            <div className="player-name">
              <strong>{card.nickname}</strong>
              {card.admin && <span className="badge admin">관리자</span>}
            </div>
            {card.title && <span className="muted small">{card.title}</span>}
          </div>
        </section>

        <dl className="kw-stats">
          <div><dt>현재 유행도</dt><dd>{card.score.toLocaleString()}</dd></div>
          <div><dt>레벨</dt><dd>🐢 {card.level}</dd></div>
          <div><dt>댓글 점수</dt><dd>{card.commentScore.toLocaleString()}</dd></div>
        </dl>

        <section className="kw-activity" aria-label="최근 7일 점수 추이">
          <div className="kw-activity-head"><h3>최근 7일</h3></div>
          {history ? <ScoreChart history={history} /> : <div className="chart-placeholder muted small">그래프를 불러오는 중…</div>}
        </section>

        <section className="player-keywords" aria-label="가진 키워드">
          <h3>가진 키워드 <span className="muted small">점수 상위 3개</span></h3>
          {card.topKeywords.length === 0 ? <p className="muted small">지금 가진 키워드가 없어요</p> : (
            <ul>
              {card.topKeywords.map((k) => (
                <li key={k.keywordId}>
                  <button className="mine-open" onClick={() => onOpenKeyword(k.keywordId)} aria-label={`${k.text} 자세히 보기`}>
                    <span><strong>{k.text}</strong> <span className="badge">{STATE_BADGE[k.state] ?? k.state}</span></span>
                    <span className="mine-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>)}
    </Modal>
  );
}
