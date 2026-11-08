import { useEffect, useState } from 'react';
import type { SkillInfo } from '../api/types';
import type { SkillId } from '../game/protocol';
import { EMOTES, type OrbLook } from '../game/skin';
import { fmtNumber, t } from '../i18n';
import { PlayerOrb } from './PlayerOrb';
import { SkillBar, type DashState, type SkillCooldowns } from './SkillBar';

export interface MeSummary { nickname: string; level: number; currentScore: number | string; exp: number; nextLevelExp: number; holdCount: number }

/**
 * 아레나 아래 가운데의 명령 줄(리그 오브 레전드 HUD처럼 한 덩어리): 내 초상화(원 모양·레벨)와 경험치 막대·유행도·키워드 수 | 스킬(⚡ 대시 + 4개, 키 표시·쿨타임) | 이모트.
 * 채팅은 왼쪽 아래 끝, 미니맵은 오른쪽 아래에 있어서 서로 겹치지 않는다. 작은 화면(모바일)에서는 초상화·정보는 빼고(왼쪽 위 줄에 레벨·유행도를 둔다)
 * 스킬·이모트를 오른쪽 아래에 2줄로 모아, 왼쪽 엄지가 쓰는 조이스틱 자리를 비운다(CSS).
 */
export function BottomBar({ me, skills, readLook, cooldowns, dash, lockedUntil, onUse, onDash, onProfile, emoteOpen, onToggleEmote, onEmote }: {
  me: MeSummary;
  skills: SkillInfo[];
  readLook: () => OrbLook | null;
  cooldowns: SkillCooldowns;
  dash: DashState | null;
  /** 갈고리에 잡혀 끌려오는 동안 스킬을 못 쓰는 끝 시각(performance.now 기준 ms). 아니면 null */
  lockedUntil: number | null;
  onUse: (id: SkillId) => void;
  onDash: () => void;
  onProfile: () => void;
  emoteOpen: boolean;
  onToggleEmote: () => void;
  onEmote: (code: string) => void;
}) {
  // 내 원 모양은 명단에서 읽는다(꾸미기를 바꾸면 곧 바뀐다)
  const [look, setLook] = useState<OrbLook | null>(readLook);
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = readLook();
      setLook((cur) => (v && JSON.stringify(v) !== JSON.stringify(cur) ? v : cur));
    }, 1000);
    return () => window.clearInterval(id);
  }, [readLook]);
  const pct = me.nextLevelExp > 0 ? Math.min(100, Math.round((me.exp / me.nextLevelExp) * 100)) : 100;
  const fallback: OrbLook = { bg: '#3fb68b', borderColor: null, borderWidth: null, art: null, borderEffect: null, bot: false };
  return (
    <div className="bottom-bar">
      <button className="bb-me" onClick={onProfile} title={t('gamescreen.myInfo')} aria-label={t('gamescreen.myInfo')}>
        <PlayerOrb look={look ?? fallback} level={me.level} size={52} />
        <span className="bb-lv">{me.level}</span>
      </button>
      <div className="bb-info">
        <button className="bb-name" onClick={onProfile} title={t('gamescreen.myInfo')}>{me.nickname}</button>
        <div className="bb-exp" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
             title={`EXP ${me.exp}${me.nextLevelExp > 0 ? ` / ${me.nextLevelExp}` : ''}`}>
          <i style={{ width: `${pct}%` }} />
          <span>EXP {me.exp}{me.nextLevelExp > 0 ? ` / ${me.nextLevelExp}` : ''}</span>
        </div>
        <div className="bb-stats">
          <span>{t('gamescreen.score', { n: fmtNumber(Number(me.currentScore)) })}</span>
          <span>{t('gamescreen.keywordCount', { n: me.holdCount })}</span>
        </div>
      </div>
      <div className="bb-skills">
        <SkillBar skills={skills} level={me.level} cooldowns={cooldowns} dash={dash} lockedUntil={lockedUntil} onUse={onUse} onDash={onDash} />
        <div className="bb-emote">
          {emoteOpen && (
            <div className="emote-palette" role="menu" aria-label={t('gamescreen.emote')}>
              {EMOTES.map(([code, ch, label], i) => (
                <button key={code} role="menuitem" title={`${label} (${i + 1})`} aria-label={label} onClick={() => onEmote(code)}>{ch}<kbd>{i + 1}</kbd></button>
              ))}
            </div>
          )}
          <button className="emote-toggle" aria-expanded={emoteOpen} aria-label={t('gamescreen.emote')} title={t('gamescreen.emoteTitle')} onClick={onToggleEmote}>😀<kbd>E</kbd></button>
        </div>
      </div>
    </div>
  );
}
