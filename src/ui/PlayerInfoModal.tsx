import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../api/client';
import type { PlayerCard } from '../api/types';
import { TurtleIcon } from './GrowthIcons';
import { PlayerOrb } from './PlayerOrb';
import { BOT_BASE } from '../game/turtle';
import type { OrbLook } from '../game/skin';
import { STATE_BADGE } from './keywordFormat';
import { Modal } from './Modal';
import { ReportDialog } from './ReportDialog';
import { PopularityVote } from './PopularityVote';
import { fmtDate, fmtNumber, t } from '../i18n';

interface Props {
  /** 방 안 세션 번호. 검색 결과에서 열 때는 -1이고 playerId로 가리킨다 */
  entityNo: number;
  /** 검색 결과에서 열 때의 플레이어 번호(접속 중이 아니어도 본다) */
  playerId?: number;
  /** NPC 봇이면 서버에 묻지 않고 이 값으로 간단한 카드만 보여 준다(4.21) */
  bot?: { nickname: string; level: number; score: number } | null;
  /** 그 원의 아레나 모양(바탕색·테두리·그림·효과). 봇은 빨간 바탕. 없으면 기본 성장 거북이 */
  look?: OrbLook | null;
  onClose(): void;
  onOpenKeyword(keywordId: number): void;
  /** [공유]: 채팅에 이 플레이어를 보낸다(채팅의 닉네임을 누르면 이 카드가 열린다). 없으면 버튼을 숨긴다 */
  onShare?(playerId: number, nickname: string): void;
  /** 신고 결과 안내(알림창) */
  onNotice(message: string): void;
}

/**
 * 다른 플레이어 정보 팝업(4.11). 아레나에서 다른 원을 누르면 열린다. 게임은 멈추지 않는다.
 * 아이콘·닉네임(관리자 배지)·활성 칭호, 현재 유행도·레벨, 보관함 중 점수 상위 3개(이름·상태만). 점수 추이 그래프는 없다.
 */
export function PlayerInfoModal({ entityNo, playerId, bot, look, onClose, onOpenKeyword, onNotice, onShare }: Props) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [shared, setShared] = useState(false); // 공유 직후 잠깐 막는다(채팅은 1초에 1회)

  useEffect(() => {
    if (bot) return; // 봇은 서버에 기록이 없다
    let alive = true;
    (playerId !== undefined ? api.playerCard(playerId) : api.roomPlayer(entityNo))
      .then((c) => { if (alive) setCard(c); })
      .catch((e) => { if (alive) setError(e instanceof ApiFailure ? e.message : t('player.loadFailed')); });
    return () => { alive = false; };
  }, [entityNo, playerId, bot]);

  if (bot) {
    return (
      <Modal title={bot.nickname} onClose={onClose} className="player-modal">
        <section className="player-hero">
          <PlayerOrb look={look ?? { bg: BOT_BASE, borderColor: null, borderWidth: null, art: null, borderEffect: null, bot: true }} level={bot.level} size={72} />
          <div className="player-hero-main">
            <div className="player-name"><strong>{bot.nickname}</strong><span className="badge bot">BOT</span></div>
            <span className="muted small">{t('player.botDesc')}</span>
          </div>
        </section>
        <dl className="kw-stats">
          <div><dt>{t('player.score')}</dt><dd>{fmtNumber(bot.score)}</dd></div>
          <div><dt>{t('profile.level')}</dt><dd>{t('common.levelPrefix')}{bot.level}{t('common.levelSuffix')}</dd></div>
          <div><dt>{t('player.rank')}</dt><dd className="muted">{t('player.notRanked')}</dd></div>
        </dl>
      </Modal>
    );
  }

  return (
    <Modal title={card?.nickname ?? t('player.title')} onClose={onClose} className="player-modal"
           titleExtra={card && (
             // 플레이어 신고(13.5): 닉네임·행동 등. 방에서 연 카드는 세션 번호로(서버가 같은 방의 그 플레이어로 바꿔 저장), 검색에서 연 카드는 플레이어 번호로 보낸다
             <span className="pi-actions">
               {onShare && (
                 <button className="pi-share" disabled={shared} aria-label={t('player.shareAria', { name: card.nickname })} title={t('player.shareTitle')}
                         onClick={() => { onShare(card.playerId, card.nickname); setShared(true); window.setTimeout(() => setShared(false), 1500); }}>
                   {shared ? t('player.shared') : t('player.share')}
                 </button>
               )}
               {!card.me && <button className="pi-report" onClick={() => setReporting(true)} aria-label={t('player.reportAria', { name: card.nickname })}>{t('player.report')}</button>}
             </span>
           )}>
      {error && <p className="muted">{error}</p>}
      {!error && !card && <p className="muted">{t('common.loading')}</p>}
      {card && (<>
        <section className="player-hero">
          {look ? <PlayerOrb look={look} level={card.level} size={72} /> : <TurtleIcon level={card.level} size={64} />}
          <div className="player-hero-main">
            <div className="player-name">
              <strong>{card.nickname}</strong>
            </div>
            {card.title && <span className="muted small">{card.title}</span>}
          </div>
        </section>

        <dl className="kw-stats">
          <div><dt>{t('player.score')}</dt><dd>{fmtNumber(card.score)}</dd></div>
          <div><dt>{t('profile.level')}</dt><dd>{t('common.levelPrefix')}{card.level}{t('common.levelSuffix')}</dd></div>
          <div className="pop-stat"><dt>{t('player.popularity')}</dt><dd>
            <PopularityVote playerId={card.playerId} name={card.nickname} me={card.me} popularity={card.popularity} myVote={card.myVote}
                          onChange={(popularity, myVote) => setCard((c) => c && { ...c, popularity, myVote })} />
          </dd></div>
          <div><dt>{t('player.createdLabel')}</dt><dd>{fmtDate(card.createdAt)}</dd></div>
        </dl>

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
        <ReportDialog target={playerId !== undefined ? 'PLAYER_ID' : 'PLAYER'} targetId={playerId !== undefined ? playerId : entityNo} preview={t('player.reportPreview', { name: card.nickname })}
                      onDone={(err) => { setReporting(false); if (err) onNotice(err); }} onClose={() => setReporting(false)} />
      )}
    </Modal>
  );
}
