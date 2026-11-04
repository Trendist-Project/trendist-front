import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerCard, ScoreHistory } from '../api/types';
import { TurtleIcon } from './GrowthIcons';
import { STATE_BADGE } from './keywordFormat';
import { Modal } from './Modal';
import { ReportDialog } from './ReportDialog';
import { ScoreChart } from './ScoreChart';
import { LevelText } from './LevelText';
import { fmtNumber, t } from '../i18n';

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
      .catch((e) => { if (alive) setError(e instanceof ApiFailure ? e.message : t('player.loadFailed')); });
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
            <span className="muted small">{t('player.botDesc')}</span>
          </div>
        </section>
        <dl className="kw-stats">
          <div><dt>{t('player.score')}</dt><dd>{fmtNumber(bot.score)}</dd></div>
          <div><dt>{t('profile.level')}</dt><dd><LevelText level={bot.level} prefix={t('common.levelPrefix')} suffix={t('common.levelSuffix')} size={26} /></dd></div>
          <div><dt>{t('player.rank')}</dt><dd className="muted">{t('player.notRanked')}</dd></div>
        </dl>
      </Modal>
    );
  }

  return (
    <Modal title={card?.nickname ?? t('player.title')} onClose={onClose} className="player-modal"
           titleExtra={card && (
             // 플레이어 신고(13.5): 닉네임·행동 등. 세션 번호로 보내면 서버가 같은 방의 그 플레이어로 바꿔 저장한다
             <button className="pi-report" onClick={() => setReporting(true)} aria-label={t('player.reportAria', { name: card.nickname })}>{t('player.report')}</button>
           )}>
      {error && <p className="muted">{error}</p>}
      {!error && !card && <p className="muted">{t('common.loading')}</p>}
      {card && (<>
        <section className="player-hero">
          <TurtleIcon level={card.level} size={64} />
          <div className="player-hero-main">
            <div className="player-name">
              <strong>{card.nickname}</strong>
              {card.admin && <span className="badge admin">{t('player.admin')}</span>}
            </div>
            {card.title && <span className="muted small">{card.title}</span>}
          </div>
        </section>

        <dl className="kw-stats">
          <div><dt>{t('player.score')}</dt><dd>{fmtNumber(card.score)}</dd></div>
          <div><dt>{t('profile.level')}</dt><dd><LevelText level={card.level} prefix={t('common.levelPrefix')} suffix={t('common.levelSuffix')} size={26} /></dd></div>
          <div><dt>{t('player.commentScore')}</dt><dd>{fmtNumber(card.commentScore)}</dd></div>
        </dl>

        <section className="kw-activity" aria-label={t('player.last7dTrend')}>
          <div className="kw-activity-head"><h3>{t('chart.last7d')}</h3></div>
          {history ? <ScoreChart history={history} /> : <div className="chart-placeholder muted small">{t('chart.loading')}</div>}
        </section>

        <section className="player-keywords" aria-label={t('player.keywords')}>
          <h3>{t('player.keywords')} <span className="muted small">{t('player.top3')}</span></h3>
          {card.topKeywords.length === 0 ? <p className="muted small">{t('player.noKeywords')}</p> : (
            <ul>
              {card.topKeywords.map((k) => (
                <li key={k.keywordId}>
                  <button className="mine-open" onClick={() => onOpenKeyword(k.keywordId)} aria-label={t('player.detailAria', { text: k.text })}>
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
        <ReportDialog target="PLAYER" targetId={entityNo} preview={t('player.reportPreview', { name: card.nickname })}
                      onDone={(err) => { setReporting(false); if (err) onNotice(err); }} onClose={() => setReporting(false)} />
      )}
    </Modal>
  );
}
