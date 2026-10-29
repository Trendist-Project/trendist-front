import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerCard, ScoreHistory } from '../api/types';
import { TurtleIcon } from './GrowthIcons';
import { STATE_BADGE } from './keywordFormat';
import { Modal } from './Modal';
import { ReportDialog } from './ReportDialog';
import { ScoreChart } from './ScoreChart';

interface Props {
  entityNo: number;
  /** NPC 봇이면 서버에 묻지 않고 이 값으로 간단한 카드만 보여 준다(4.21) */
  bot?: { nickname: string; level: number; score: number } | null;
  onClose(): void;
  onOpenKeyword(keywordId: number): void;
  /** 신고 결과 안내(알림창) */
  onNotice(message: string): void;
}

/**
 * 다른 플레이어 정보 팝업(4.11). 아레나에서 다른 원을 누르면 열린다. 게임은 멈추지 않는다.
 * 아이콘·닉네임(관리자 배지)·활성 칭호, 현재 유행도·레벨·댓글 점수, 최근 7일 점수 추이, 보관함 중 점수 상위 3개(이름·상태만).
 */
export function PlayerInfoModal({ entityNo, bot, onClose, onOpenKeyword, onNotice }: Props) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [history, setHistory] = useState<ScoreHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (bot) return; // 봇은 서버에 기록이 없다
    let alive = true;
    api.roomPlayer(entityNo)
      .then((c) => { if (alive) setCard(c); })
      .catch((e) => { if (alive) setError(e instanceof ApiFailure ? e.message : '정보를 불러오지 못했어요'); });
    api.roomPlayerHistory(entityNo).then((h) => { if (alive) setHistory(h); }).catch(() => { /* 그래프만 빠진다 */ });
    return () => { alive = false; };
  }, [entityNo, bot]);

  if (bot) {
    return (
      <Modal title={bot.nickname} onClose={onClose} className="player-modal">
        <section className="player-hero">
          <TurtleIcon level={bot.level} size={64} />
          <div className="player-hero-main">
            <div className="player-name"><strong>{bot.nickname}</strong><span className="badge bot">BOT</span></div>
            <span className="muted small">아레나를 함께 돌아다니는 봇이에요. 사람과 같은 규칙으로 커지고 작아지고, 부딪히면 이기고 져요.</span>
          </div>
        </section>
        <dl className="kw-stats">
          <div><dt>현재 유행도</dt><dd>{bot.score.toLocaleString()}</dd></div>
          <div><dt>레벨</dt><dd>🐢 {bot.level}</dd></div>
          <div><dt>순위</dt><dd className="muted">집계 안 함</dd></div>
        </dl>
      </Modal>
    );
  }

  return (
    <Modal title={card?.nickname ?? '플레이어'} onClose={onClose} className="player-modal"
           titleExtra={card && (
             // 플레이어 신고(13.5): 닉네임·행동 등. 세션 번호로 보내면 서버가 같은 방의 그 플레이어로 바꿔 저장한다
             <button className="pi-report" onClick={() => setReporting(true)} aria-label={`${card.nickname} 신고하기`}>🚩 신고</button>
           )}>
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
      {reporting && card && (
        <ReportDialog target="PLAYER" targetId={entityNo} preview={`플레이어: ${card.nickname}`}
                      onDone={(m) => { setReporting(false); onNotice(m); }} onClose={() => setReporting(false)} />
      )}
    </Modal>
  );
}
