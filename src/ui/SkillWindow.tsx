import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { t, tOr } from '../i18n';
import type { SkillInfo } from '../api/types';
import { conflictOf, keyLabel, SLOT_COUNT, type SlotKeys } from '../game/skillKeys';
import { SkillIcon } from './SkillIcon';

const CATEGORY_KEY: Record<string, string> = { MOVE: 'move', ATTACK: 'attack', DEFENSE: 'defense', STEALTH: 'stealth' };
const DRAG_TYPE = 'application/x-trendist-skill';

interface Props {
  skills: SkillInfo[];
  slots: (string | null)[];
  keys: SlotKeys;
  level: number;
  onClose(): void;
  /** 장착 4칸을 서버에 보낸다(빈 칸은 null). 서버가 확인해서 {loadout}으로 돌려준다 */
  onChangeSlots(slots: (string | null)[]): void;
  /** 칸(번호 0부터)이나 대시의 키를 바꾼다. 서버에 저장하고 겹치면 거절한다(GameScreen이 안내한다) */
  onSetKey(target: number | 'dash', code: string): void;
  /** 키를 모두 기본값으로 되돌린다(서버에서 바꾼 연결을 지운다) */
  onResetKeys(): void;
  onNotice(text: string): void;
}

/**
 * 스킬창(4.33, K 키): 가로로 넓은 창을 둘로 나눈다.
 *  왼쪽: 장착한 스킬 4칸(세로 목록: 칸 번호·아이콘·이름·단축키 키캡)과 늘 쓰는 대시, [자동 장착]·[전체 해제].
 *  오른쪽 위: 스킬 아이콘 격자(누르면 선택, 장착 중이면 칸 번호 배지, 잠겼으면 🔒 Lv.N). 오른쪽 아래: 선택한 스킬의 설명과 [장착]/[해제] 버튼.
 * 노란 강조(놓을 수 있는 칸)는 "지금 놓는 중"일 때만 보인다.
 *  ① 목록에서 스킬을 고르면(armed) 다른 칸이 강조되고, 칸을 누르면 그 칸에 들어가며 강조와 선택이 모두 사라진다. 고른 스킬이 있던 칸을 다시 누르면 강조만 사라진다.
 *  ② 장착한 칸을 누르면(moving) 그 칸을 뺀 나머지 칸이 강조되고, 다른 칸을 누르면 두 칸의 자리가 바뀐다(빈 칸이면 옮겨진다). 처음 누른 칸을 다시 누르면 강조가 사라진다.
 * [장착]을 누르면 칸이 깜빡이고 원하는 칸을 눌러 고른다. 데스크톱은 끌어 놓기도 된다. 키는 칸 옆 키캡을 눌러 바꾼다.
 */
export function SkillWindow({ skills, slots, keys, level, onClose, onChangeSlots, onSetKey, onResetKeys, onNotice }: Props) {
  const grid = skills.filter((s) => s.code !== 'dash')
    .sort((a, b) => (Number(a.requiredLevel > level) - Number(b.requiredLevel > level)) || a.requiredLevel - b.requiredLevel);
  const [picked, setPicked] = useState<string | null>(null); // 처음에는 아무것도 고르지 않는다(고른 스킬은 칸을 누르는 순간 그 칸에 들어간다)
  const [replacing, setReplacing] = useState(false); // [장착]으로 원하는 칸을 고르는 중(칸이 깜빡인다)
  const [armed, setArmed] = useState<string | null>(null); // 목록에서 고른 스킬을 칸에 놓는 중: 그 스킬이 있는 칸을 뺀 칸이 강조된다
  const [moving, setMoving] = useState<number | null>(null); // 장착한 칸을 눌러 자리를 옮기는 중: 그 칸을 뺀 칸이 강조된다
  const [listening, setListening] = useState<number | 'dash' | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const info = (code: string | null) => (code ? skills.find((s) => s.code === code) ?? null : null);
  const nameOf = (s: SkillInfo) => tOr(`skills.${s.code}_name`, s.code);
  const catOf = (s: SkillInfo) => CATEGORY_KEY[s.category] ?? 'move';
  const dashInfo = skills.find((s) => s.code === 'dash');
  const sel = info(picked);
  const selSlot = sel ? slots.indexOf(sel.code) : -1;
  const selLocked = !!sel && sel.requiredLevel > level;

  // 키 바꾸는 중에는 다음에 누른 키를 받는다. Modal(Esc로 닫기)보다 먼저 받아서 Esc는 창이 아니라 키 바꾸기만 취소한다
  useEffect(() => {
    if (listening === null) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { setListening(null); return; }
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
      const c = conflictOf(listening, e.code, keys);
      if (c === 'reserved') { onNotice(t('gamescreen.keyReserved')); return; }
      if (c !== null) { onNotice(t('gamescreen.keyTaken', { name: c === 'dash' ? t('gamescreen.skillKeyDash') : t('gamescreen.skillKeySlot', { n: c + 1 }) })); return; }
      onSetKey(listening, e.code);
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, keys, onNotice, onSetKey]);

  /** code를 칸 target에 놓는다. 이미 다른 칸에 있으면 그 칸과 자리를 바꾼다 */
  const place = (code: string, target: number) => {
    const s = info(code);
    if (!s) return;
    if (s.requiredLevel > level) { onNotice(t('gamescreen.skillLockedToast', { n: s.requiredLevel })); return; }
    const next = [...slots];
    const from = next.indexOf(code);
    if (from === target) return;
    if (from >= 0) next[from] = next[target] ?? null;
    next[target] = code;
    setReplacing(false); setArmed(null); setMoving(null); setPicked(null); // 장착하면 선택도 끝난다
    onChangeSlots(next);
  };
  /** [장착]: 원하는 칸을 직접 고르게 한다(칸이 깜빡인다). 다시 누르면 취소 */
  const equipPicked = () => {
    if (!sel || selLocked) return;
    if (replacing) { setReplacing(false); setArmed(null); } else { setReplacing(true); setArmed(sel.code); setMoving(null); }
  };
  const unequip = (i: number) => { const next = [...slots]; next[i] = null; setReplacing(false); setArmed(null); setMoving(null); onChangeSlots(next); };
  const autoEquip = () => {
    const best = grid.filter((s) => s.requiredLevel <= level).slice(0, SLOT_COUNT).map((s) => s.code);
    setReplacing(false); setArmed(null); setMoving(null);
    onChangeSlots(Array.from({ length: SLOT_COUNT }, (_, i) => best[i] ?? null));
  };
  const clearAll = () => { setReplacing(false); setArmed(null); setMoving(null); onChangeSlots(Array(SLOT_COUNT).fill(null)); };
  /**
   * 칸을 누른다. 목록에서 고른 스킬을 놓는 중(armed)이면 그 칸에 넣고(이미 다른 칸에 있으면 자리를 바꾼다) 강조를 모두 끈다. 그 스킬이 있던 칸이면 강조만 끈다.
   * 자리를 옮기는 중(moving)이면 누른 칸과 자리를 바꾸고(빈 칸이면 옮긴다) 강조를 끈다. 처음 누른 칸이면 강조만 끈다.
   * 아무것도 하는 중이 아니면 장착한 스킬을 골라(상세 표시) 자리 옮기기를 시작한다.
   */
  const onSlot = (i: number) => {
    const here = info(slots[i] ?? null);
    const a = info(armed);
    if (a && a.requiredLevel <= level) {
      if (here?.code === a.code) { setArmed(null); setReplacing(false); setPicked(null); return; }
      place(a.code, i);
      return;
    }
    if (moving !== null) {
      if (moving !== i) { const next = [...slots]; [next[i], next[moving]] = [next[moving] ?? null, next[i] ?? null]; onChangeSlots(next); }
      setMoving(null); setPicked(null);
      return;
    }
    if (here) { setPicked(here.code); setMoving(i); }
  };

  const keycap = (target: number | 'dash', code: string) => (
    <button type="button" className={`sw-keycap${listening === target ? ' listening' : ''}`} onClick={() => setListening(listening === target ? null : target)}
            aria-label={`${t('gamescreen.keyChange')} (${keyLabel(code)})`} title={t('gamescreen.keyChange')}>
      {listening === target ? '…' : keyLabel(code)}
    </button>
  );

  // 안내 띠: 키를 바꾸는 중에만 보인다. 스킬을 고른 뒤에는 글 대신 왼쪽 칸의 노란 테두리와 화살표가 어디에 넣을지 알려 준다
  // PC와 가로 모드 폰은 장착 칸 영역 바깥쪽 바로 밑에, 세로로 쌓이는 좁은 화면(세로 폰)은 오른쪽 위에 띄운다(CSS가 둘 중 하나만 보인다)
  const banner = (where: 'under' | 'top') => listening !== null
    ? <p className={`sw-status banner warn sw-banner-${where}`} role="status" aria-live="polite"><span className="sw-arrow side" aria-hidden="true">◀</span>{t('gamescreen.keyPress')}</p>
    : null;
  const armedSkill = info(armed);
  const placing = (!!armedSkill && armedSkill.requiredLevel <= level) || moving !== null; // 놓는 중이거나 옮기는 중일 때만 칸을 강조한다

  return (
    <Modal title={t('gamescreen.skillWindowTitle')} onClose={onClose} className="skill-window">
      <div className="sw-layout">
        {/* 왼쪽: 장착한 스킬(칸 영역 바로 밑에 키 바꾸기 안내가 뜬다) */}
        <div className="sw-leftcol">
        <section className={`sw-left${placing ? ' has-pick' : ''}`} aria-label={t('gamescreen.skillSlots')}>
          <div className="sw-head"><h3>{t('gamescreen.skillSlots')}</h3><span className="sw-count">{t('gamescreen.skillSlotsCount', { n: slots.filter(Boolean).length, max: SLOT_COUNT })}</span></div>
          <div className="sw-bar-slots">
            {dashInfo && (<>
              {/* 대시는 늘 쓰는 스킬이라 맨 왼쪽에 두고, 세로 구분선으로 장착 칸 4개와 나눈다 */}
              <div className="sw-cell dash">
                <span className="sw-target-arrow" aria-hidden="true">▼</span>
                <span className="sw-slot cat-move fixed" title={`${tOr('skills.dash_name', 'dash')} · ${t('gamescreen.skillAlways')}`}>
                  <span className="sw-no" aria-hidden="true">⚡</span><span className="sw-ico">{dashInfo.icon}</span>
                </span>
                {keycap('dash', keys.dash)}
              </div>
              <span className="sw-vsep" aria-hidden="true" />
            </>)}
            {Array.from({ length: SLOT_COUNT }, (_, i) => {
              const sk = info(slots[i] ?? null), target = armedSkill && armedSkill.requiredLevel <= level ? sk?.code !== armedSkill.code : moving !== null && moving !== i;
              return (
                <div key={i} className="sw-cell"
                     onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDragOver(i); } }}
                     onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
                     onDrop={(e) => { e.preventDefault(); setDragOver(null); const c = e.dataTransfer.getData(DRAG_TYPE); if (c) place(c, i); }}>
                  <span className={`sw-target-arrow${target ? ' on' : ''}`} aria-hidden="true">▼</span>
                  <button type="button" className={`sw-slot${sk ? ` cat-${catOf(sk)}` : ' empty'}${target ? ' target' : ''}${replacing && target ? ' swap' : ''}${dragOver === i ? ' over' : ''}${sk && sk.code === picked ? ' picked' : ''}`}
                          onClick={() => onSlot(i)} draggable={!!sk} title={sk ? nameOf(sk) : t('gamescreen.skillEmptySlot')}
                          onDragStart={(e) => { if (sk) { e.dataTransfer.setData(DRAG_TYPE, sk.code); e.dataTransfer.effectAllowed = 'move'; } }}
                          aria-label={sk ? `${i + 1}. ${nameOf(sk)}` : `${i + 1}. ${t('gamescreen.skillEmptySlot')}`}>
                    <span className="sw-no" aria-hidden="true">{i + 1}</span>
                    <span className="sw-ico">{sk ? <SkillIcon code={sk.code} icon={sk.icon} /> : '＋'}</span>
                  </button>
                  {keycap(i, keys.slots[i])}
                </div>
              );
            })}
          </div>
          <div className="sw-bar-tools">
            <button type="button" onClick={autoEquip}>{t('gamescreen.skillAuto')}</button>
            <button type="button" onClick={clearAll}>{t('gamescreen.skillClearAll')}</button>
          </div>
        </section>
        {banner('under')}
        </div>

        {/* 오른쪽: 스킬 목록 + 선택한 스킬 상세 */}
        <section className="sw-right">
          {banner('top')}
          <div className="sw-head"><h3>{t('gamescreen.skillList')}</h3></div>
          <ul className="sw-grid" aria-label={t('gamescreen.skillList')}>
            {grid.map((sk) => {
              const locked = sk.requiredLevel > level, slot = slots.indexOf(sk.code);
              return (
                <li key={sk.code}>
                  <button type="button" className={`sw-tile cat-${catOf(sk)}${locked ? ' locked' : ''}${sk.code === picked ? ' picked' : ''}`}
                          onClick={() => { setPicked(sk.code); setReplacing(false); setMoving(null); setArmed(locked ? null : sk.code); }} aria-pressed={sk.code === picked} draggable={!locked} title={nameOf(sk)}
                          onDragStart={(e) => { if (!locked) { e.dataTransfer.setData(DRAG_TYPE, sk.code); e.dataTransfer.effectAllowed = 'move'; } }}
                          aria-label={`${nameOf(sk)}${locked ? `, ${t('gamescreen.skillLockedAria', { n: sk.requiredLevel })}` : slot >= 0 ? `, ${t('gamescreen.skillEquipped')} ${slot + 1}` : ''}`}>
                    <span className="sw-ico"><SkillIcon code={sk.code} icon={sk.icon} /></span>
                    {slot >= 0 && <span className="sw-badge">{slot + 1}</span>}
                    {locked && <span className="sw-locked"><span aria-hidden="true">🔒</span><b>Lv.{sk.requiredLevel}</b></span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 상세 칸은 처음부터 정해진 높이로 두고 설명만 안에서 스크롤한다: 스킬을 바꿔 눌러도 창 높이가 변하지 않는다 */}
          <section className={`sw-detail${sel ? '' : ' empty'}`} aria-label={t('gamescreen.skillDetail')}>
            {sel && (<>
              <div className="sw-d-head">
                <span className={`sw-d-ico cat-${catOf(sel)}`}><SkillIcon code={sel.code} icon={sel.icon} /></span>
                <div className="sw-d-title">
                  <strong>{nameOf(sel)}</strong>
                  <div className="sw-d-chips">
                    <span className={`sw-chip cat-${catOf(sel)}`}>{t(`gamescreen.skillCat_${catOf(sel)}`)}</span>
                    <span className="sw-chip plain">{t('gamescreen.skillCooldown', { n: sel.cooldownSeconds })}</span>
                    {sel.requiredLevel > 1 && <span className="sw-chip plain">{t('gamescreen.skillNeedLevel', { n: sel.requiredLevel })}</span>}
                    {selLocked
                      ? <button type="button" className="sw-mini-btn" disabled title={t('gamescreen.skillLocked', { n: sel.requiredLevel, cur: level })}>🔒 {t('gamescreen.skillLockedShort')}</button>
                      : selSlot >= 0
                        ? <button type="button" className="sw-mini-btn off" onClick={() => unequip(selSlot)}>{t('gamescreen.skillUnequip')}</button>
                        : <button type="button" className={`sw-mini-btn${replacing ? ' active' : ''}`} onClick={equipPicked}>{replacing ? t('gamescreen.skillChooseCancel') : t('gamescreen.skillEquip')}</button>}
                  </div>
                </div>
              </div>
              <p className="sw-d-desc" tabIndex={0}>{tOr(`skills.${sel.code}_desc`, '')}</p>
            </>)}
          </section>
        </section>
      </div>

      <footer className="sw-foot">
        <span />
        <button type="button" className="link" onClick={() => { setListening(null); onResetKeys(); }}>{t('gamescreen.keyReset')}</button>
      </footer>
    </Modal>
  );
}
