import { useEffect, useState } from 'react';
import { fmtNumber, t } from '../i18n';
import { getLang } from '../country';
import type { MonsterHud as Hud } from '../game/monsterFx';

export interface MonsterEndNote {
  key: number; kind: 'end'; result: 'KILLED' | 'TIMEOUT' | 'REMOVED'; name: string; en: string;
  top: { playerId: number; nickname: string; damage: number; hits: number }[];
}
export interface MonsterRewardNote { key: number; kind: 'reward'; name: string; en: string; cleared: boolean; rank: number; damage: number; exp: number; keywords: string[] }
export type MonsterNote = MonsterEndNote | MonsterRewardNote;

const fmtTime = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const nameOf = (name: string, en: string) => (getLang() === 'en' && en ? en : name);

/**
 * 보스 체력 막대(4.35): 화면 위 가운데. 이름·남은 시간·체력·분노·불꽃 상태와 내가 입힌 피해.
 * read는 Arena가 들고 있는 현재 상태를 읽는 함수이고, 5번/초 다시 읽는다. 보스가 없으면 아무것도 그리지 않는다.
 */
export function MonsterHud({ read, mine }: { read: () => Hud | null; mine: { dmg: number; hits: number } }) {
  const [hud, setHud] = useState<Hud | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setHud(read()), 200);
    return () => window.clearInterval(id);
  }, [read]);
  if (!hud) return null;
  const pct = hud.max > 0 ? Math.max(0, Math.min(100, (hud.hp / hud.max) * 100)) : 0;
  const name = nameOf(hud.name, hud.en);
  return (
    <div className={`monster-hud${hud.rage ? ' rage' : ''}${hud.flame ? ' flame' : ''}`} role="status" aria-label={t('monster.hpAria', { name, pct: Math.round(pct) })}>
      <div className="mh-portrait" aria-hidden="true">
        {hud.img ? <img src={`/monsters/${hud.img}.svg`} alt="" draggable={false} /> : <span>🐢</span>}
      </div>
      <div className="mh-main">
        <div className="mh-top">
          <strong className="mh-name">{name}</strong>
          {hud.rage && <span className="mh-badge rage">{t('monster.rage')}</span>}
          {hud.flame && <span className="mh-badge flame">{t('monster.flame')}</span>}
          <span className="mh-time" title={t('monster.hudTime')}>⏱ {fmtTime(hud.leftMs)}</span>
        </div>
        <div className="mh-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="mh-bottom">
          <span className="mh-hp"><b>{t('monster.hudHp')}</b> {fmtNumber(Math.round(hud.hp))} / {fmtNumber(hud.max)} <em>({Math.round(pct)}%)</em></span>
          {mine.hits > 0 && (
            <span className="mh-mine">
              <b>{t('monster.hudMineLabel')}</b> {fmtNumber(mine.dmg)}
              <em className="mh-share">{(Math.round((mine.dmg / Math.max(1, hud.max)) * 1000) / 10).toString()}%</em>
              <i aria-hidden="true">·</i>{t('monster.hudMineHits', { n: mine.hits })}
            </span>
          )}
        </div>
        {hud.flame && <div className="mh-warn">{t('monster.flameWarn')}</div>}
      </div>
    </div>
  );
}

/** 보스가 끝났을 때(피해 순위)와 내 보상을 알려 주는 카드. onClose로 닫는다 */
export function MonsterNoteCard({ note, onClose }: { note: MonsterNote; onClose: () => void }) {
  const name = nameOf(note.name, note.en);
  if (note.kind === 'end') {
    const title = note.result === 'KILLED' ? t('monster.endKilled', { name }) : note.result === 'TIMEOUT' ? t('monster.endTimeout', { name }) : t('monster.endRemoved', { name });
    return (
      <div className="monster-note" role="dialog" aria-label={title}>
        <button type="button" className="mn-close" onClick={onClose} aria-label={t('monster.close')}>✕</button>
        <p className="mn-title">{title}</p>
        <p className="mn-sub">{t('monster.endRank')}</p>
        {note.top.length === 0 ? <p className="muted small">{t('monster.endNone')}</p> : (
          <ol className="mn-rank">
            {note.top.map((r, i) => (
              <li key={r.playerId}><span className="mn-pos">{i + 1}</span><span className="mn-nick">{r.nickname}</span><span className="mn-dmg">{fmtNumber(r.damage)}</span><span className="muted small">{t('monster.hits', { n: r.hits })}</span></li>
            ))}
          </ol>
        )}
      </div>
    );
  }
  return (
    <div className="monster-note reward" role="dialog" aria-label={t(note.cleared ? 'monster.rewardTitleKilled' : 'monster.rewardTitleFail', { name })}>
      <button type="button" className="mn-close" onClick={onClose} aria-label={t('monster.close')}>✕</button>
      <p className="mn-title">{t(note.cleared ? 'monster.rewardTitleKilled' : 'monster.rewardTitleFail', { name })}</p>
      <p className="mn-sub">{t('monster.rewardRank', { rank: note.rank, dmg: fmtNumber(note.damage) })}</p>
      <p className="mn-line">{t('monster.rewardExp', { n: fmtNumber(note.exp) })}</p>
      {note.keywords.length > 0 && <p className="mn-line">{t('monster.rewardKeywords', { list: note.keywords.map((k) => `'${k}'`).join(', ') })}</p>}
    </div>
  );
}
