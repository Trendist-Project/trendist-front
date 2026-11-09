import { useEffect, useState } from 'react';
import { t, tOr } from '../i18n';
import type { SkillId } from '../game/protocol';
import type { SkillInfo } from '../api/types';
import { keyLabel, type SlotKeys } from '../game/skillKeys';

/** readyAt: 스킬마다 다시 쓸 수 있는 시각(performance.now 기준 ms). 아직 안 썼으면 없다 */
export type SkillCooldowns = Partial<Record<SkillId, number>>;

/** 대시 상태(4.27): until은 대시가 끝나는 시각, readyAt은 다시 쓸 수 있는 시각(둘 다 performance.now 기준 ms). 아직 안 썼으면 null */
export interface DashState { until: number; readyAt: number }

const CATEGORY_KEY: Record<string, string> = { MOVE: 'move', ATTACK: 'attack', DEFENSE: 'defense', STEALTH: 'stealth' };

/**
 * 스킬 버튼 줄(4.33). 장착한 4칸(slots)과 대시를 보여 주고, 칸의 키(keys)는 사용자가 바꾼 것이 있으면 그것을 쓴다. 스킬 목록·아이콘·쿨타임은 DB에서 온다(useSkills).
 * 빈 칸을 누르면 스킬창이 열린다. 마우스를 올리거나 키보드로 포커스하면 툴팁 카드(이름·키·종류·쿨타임·설명·지금 상태)가 위로 뜬다.
 * 대시(dash)는 대시 상태로, 나머지는 서버가 알려 준 쿨타임으로 보인다.
 */
export function SkillBar({ skills, slots, keys, level, cooldowns, dash, lockedUntil, onUse, onDash, onOpenWindow }: {
  skills: SkillInfo[]; slots: (string | null)[]; keys: SlotKeys; level: number; cooldowns: SkillCooldowns; dash: DashState | null; lockedUntil: number | null;
  onUse: (id: SkillId) => void; onDash: () => void; onOpenWindow: () => void;
}) {
  // 지금 시각은 그리는 순간마다 새로 잰다. 상태로 들고 있으면 쿨타임이 없던 동안 낡은 값이 남아서, 쓴 직후에 30초가 31초로 보였다
  const [, setTick] = useState(0);
  const now = performance.now();
  const hooked = lockedUntil !== null && now < lockedUntil; // 갈고리에 잡혀 끌려오는 동안은 모든 스킬이 잠깐 못 쓴다(4.33)
  const busy = hooked || (dash !== null && dash.readyAt > now) || Object.values(cooldowns).some((r) => r !== undefined && r > now);
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [busy]);
  const dashInfo = skills.find((k) => k.code === 'dash');
  const entries: { skill: SkillInfo | null; key: string; slot: number | null }[] = [
    ...slots.map((code, i) => ({ skill: (code && skills.find((k) => k.code === code)) || null, key: keys.slots[i], slot: i })),
    ...(dashInfo ? [{ skill: dashInfo, key: keys.dash, slot: null }] : []),
  ];
  return (
    <div className="skill-row" role="group" aria-label={t('gamescreen.skills')}>
      {entries.map(({ skill: s, key: keyCode, slot }) => {
        const key = keyLabel(keyCode);
        if (!s) { // 빈 칸: 누르면 스킬창
          return (
            <div key={`empty-${slot}`} className="skill-slot">
              <button type="button" className="skill-btn empty" onClick={(e) => { e.currentTarget.blur(); onOpenWindow(); }}
                      aria-label={`${t('gamescreen.skillEmptySlot')} (${key})`} title={t('gamescreen.skillEmptySlotTip')}>
                <span className="skill-icon" aria-hidden="true">＋</span>
                {key && <kbd>{key}</kbd>}
              </button>
            </div>
          );
        }
        const isDash = s.code === 'dash';
        const locked = s.requiredLevel > level; // 아직 해금 레벨이 안 됐다(4.33)
        const active = isDash && dash !== null && now < dash.until;
        const readyAt = isDash ? dash?.readyAt ?? 0 : cooldowns[s.code] ?? 0;
        const left = Math.max(0, readyAt - now);
        const shown = active && dash ? dash.until - now : left;
        const cat = CATEGORY_KEY[s.category] ?? 'move';
        const name = tOr(`skills.${s.code}_name`, s.code), desc = tOr(`skills.${s.code}_desc`, '');
        return (
          <div key={s.code} className="skill-slot">
            <button type="button" className={`skill-btn cat-${cat}${isDash ? ' dash-btn' : ''}${locked ? ' locked' : hooked ? ' hooked' : active ? ' active' : left > 0 ? ' cooling' : ''}`}
                    aria-disabled={hooked || undefined}
                    aria-label={`${name}${key ? ` (${key})` : ''}. ${locked ? t('gamescreen.skillLockedAria', { n: s.requiredLevel }) + ' ' : ''}${desc}`}
                    onClick={(e) => { e.currentTarget.blur(); if (hooked) return; if (isDash) onDash(); else onUse(s.code); }}>
              <span className="skill-icon">{s.icon}</span>
              {key && <kbd>{key}</kbd>}
              {hooked && !locked ? <span className="skill-hooked" aria-hidden="true">🪝</span>
                : locked ? <span className="skill-lock" aria-hidden="true">🔒<b>{s.requiredLevel}</b></span>
                : shown > 0 && <span className="skill-cd">{Math.ceil(shown / 1000)}</span>}
            </button>
            <div className="skill-tip" role="tooltip">
              <div className="st-head">
                <span className="st-icon" aria-hidden="true">{s.icon}</span>
                <strong>{name}</strong>
                {key && <kbd>{key}</kbd>}
              </div>
              <div className="st-meta">
                <span className={`st-cat cat-${cat}`}>{t(`gamescreen.skillCat_${cat}`)}</span>
                <span>{t('gamescreen.skillCooldown', { n: s.cooldownSeconds })}</span>
                {s.requiredLevel > 1 && <span className="st-lv">{t('gamescreen.skillNeedLevel', { n: s.requiredLevel })}</span>}
              </div>
              {desc && <p className="st-desc">{desc}</p>}
              <div className={`st-state${locked || hooked ? ' locked' : active ? ' on' : left > 0 ? ' wait' : ' ready'}`}>
                {hooked && !locked ? t('gamescreen.skillHooked') : locked ? t('gamescreen.skillLocked', { n: s.requiredLevel, cur: level })
                  : active ? t('gamescreen.skillActive', { n: Math.ceil(shown / 1000) })
                  : left > 0 ? t('gamescreen.skillWait', { n: Math.ceil(left / 1000) })
                  : t('gamescreen.skillReady')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
