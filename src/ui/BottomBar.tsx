import { useEffect, useRef, useState } from 'react';
import type { SkillInfo } from '../api/types';
import type { SkillId } from '../game/protocol';
import { EMOTES, type OrbLook } from '../game/skin';
import { fmtNumber, t } from '../i18n';
import { PlayerOrb } from './PlayerOrb';
import { useLayer } from './layers';
import { SkillBar, type DashState, type SkillCooldowns } from './SkillBar';
import { HpHud, type HpFlash } from './HpHud';

export interface MeSummary { nickname: string; level: number; currentScore: number | string; exp: number; nextLevelExp: number; holdCount: number }

/**
 * 아레나 아래 가운데의 명령 줄(리그 오브 레전드 HUD처럼 한 덩어리): 내 초상화(원 모양·레벨)와 경험치 막대·유행도·키워드 수 | 스킬(⚡ 대시 + 4개, 키 표시·쿨타임) | 이모트.
 * 채팅은 왼쪽 아래 끝, 미니맵은 오른쪽 아래에 있어서 서로 겹치지 않는다. 작은 화면(모바일)에서는 초상화·정보는 빼고(왼쪽 위 줄에 레벨·유행도를 둔다)
 * 스킬·이모트를 오른쪽 아래에 2줄로 모아, 왼쪽 엄지가 쓰는 조이스틱 자리를 비운다(CSS).
 */
export function BottomBar({ me, hp, skills, slots, keys, onOpenSkills, readLook, cooldowns, dash, lockedUntil, onUse, onDash, onProfile, emoteOpen, onToggleEmote, onEmote }: {
  me: MeSummary;
  /** 내 체력(%)과 맞음·회복 번쩍임(4.36). 스킬 줄 바로 아래 한 줄로 그린다. 죽었거나 연결 전이면 null(막대를 숨긴다) */
  hp: { pct: number; flash: HpFlash } | null;
  skills: SkillInfo[];
  slots: (string | null)[];
  keys: import('../game/skillKeys').SlotKeys;
  onOpenSkills: () => void;
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
  // 명령 줄의 실제 높이를 --bar-h로 알려 준다(세로 모드에서 채팅이 그 위에 일정한 간격으로 뜨게)
  const layer = useLayer('bar');
  useEffect(() => { if (emoteOpen) layer.front(); }, [emoteOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // 모바일 세로 모드: 내 정보 줄을 접으면 스킬(과 이모트)만 남는다. 기억해 둔다
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem('trendist.barFolded') === '1'; } catch { return false; } });
  const toggleFold = () => setFolded((v) => { const n = !v; try { localStorage.setItem('trendist.barFolded', n ? '1' : '0'); } catch { /* 저장 못 해도 된다 */ } return n; });
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current, host = el?.closest('.arena-wrap') as HTMLElement | null;
    if (!el || !host || typeof ResizeObserver === 'undefined') return;
    const set = () => host.style.setProperty('--bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); host.style.removeProperty('--bar-h'); };
  }, []);
  const pct = me.nextLevelExp > 0 ? Math.min(100, Math.round((me.exp / me.nextLevelExp) * 100)) : 100;
  const fallback: OrbLook = { bg: '#3fb68b', borderColor: null, borderWidth: null, art: null, borderEffect: null, bot: false };
  return (
    <div className={`bottom-bar${folded ? ' folded' : ''}${hp ? ' has-hp' : ''}`} ref={barRef} {...layer.props}>
      {hp && <HpHud pct={hp.pct} flash={hp.flash} />}
      <button type="button" className="bb-fold" onClick={toggleFold} aria-expanded={!folded}
              aria-label={folded ? t('gamescreen.barUnfold') : t('gamescreen.barFold')} title={folded ? t('gamescreen.barUnfold') : t('gamescreen.barFold')}>{folded ? '▴' : '▾'}</button>
      <button className="bb-me" onClick={onProfile} style={{ '--exp': pct } as React.CSSProperties}
              aria-label={`${t('gamescreen.myInfo')}. ${t('gamescreen.expLevel', { n: me.level })}, ${me.nextLevelExp > 0 ? t('gamescreen.expProgress', { cur: fmtNumber(me.exp), max: fmtNumber(me.nextLevelExp) }) : t('gamescreen.expMax')}`}>
        {/* 경험치는 초상화를 두른 가는 고리(롤처럼): 체력보다 눈에 띄지 않게 하고, 자세한 값은 마우스를 올리면 보인다 */}
        <span className="bb-ring" role="progressbar" aria-label="EXP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} />
        <PlayerOrb look={look ?? fallback} level={me.level} size={52} />
        <span className="bb-lv">{me.level}</span>
        {/* 경험치 툴팁: 마우스를 올리거나 포커스하면 초상화 위에 카드가 뜬다(스킬 툴팁과 같은 모양). 터치 화면에는 없다 */}
        <span className="exp-tip" role="tooltip">
          <span className="et-head"><strong>{t('gamescreen.expLevel', { n: me.level })}</strong><span className="et-pct">{me.nextLevelExp > 0 ? `${pct}%` : 'MAX'}</span></span>
          <span className="et-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
          <span className="et-meta">
            {me.nextLevelExp > 0 ? (
              <span>{t('gamescreen.expProgress', { cur: fmtNumber(me.exp), max: fmtNumber(me.nextLevelExp) })}</span>
            ) : <span>{t('gamescreen.expMax')}</span>}
          </span>
          <span className="et-hint">{t('gamescreen.expOpen')}</span>
        </span>
      </button>
      <div className="bb-info">
        <button className="bb-name" onClick={onProfile} title={t('gamescreen.myInfo')}>{me.nickname}</button>
        <div className="bb-stats">
          <span>{t('gamescreen.score', { n: fmtNumber(Number(me.currentScore)) })}</span>
          <span>{t('gamescreen.keywordCount', { n: me.holdCount })}</span>
        </div>
      </div>
      <div className="bb-skills">
        <SkillBar skills={skills} slots={slots} keys={keys} level={me.level} cooldowns={cooldowns} dash={dash} lockedUntil={lockedUntil} onUse={onUse} onDash={onDash} onOpenWindow={onOpenSkills} />
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
