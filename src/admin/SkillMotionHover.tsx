import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SkillMotion, MOTION_CODES } from '../ui/SkillMotion';
import { SkillIcon } from '../ui/SkillIcon';
import { categoryNameKo, skillNameKo } from '../ui/skillMeta';
import type { AdminSkill } from '../api/client';

/**
 * 관리자 스킬 화면의 모션 미리보기.
 *  SkillHover: 아이콘에 마우스를 올리면(키보드 포커스도) 옆에 팝업이 떠서 그 스킬의 모션(쓸 때·날아갈 때·맞았을 때·걸려 있을 때)을 되풀이해서 보여 준다.
 *  SkillOverview: 전체 스킬을 카드로 한눈에 보여 주고, 카드마다 모션이 계속 돈다.
 */
const POP_W = 320, POP_H = 262;

export function SkillHover({ code, children }: { code: string; children: ReactNode }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // 아이콘 오른쪽에 띄우고, 화면 밖으로 나가면 왼쪽·위로 당긴다
    const x = r.right + 12 + POP_W > window.innerWidth ? Math.max(8, r.left - 12 - POP_W) : r.right + 12;
    const y = Math.min(Math.max(8, r.top + r.height / 2 - POP_H / 2), Math.max(8, window.innerHeight - POP_H - 8));
    setAt({ x, y });
  };
  const has = MOTION_CODES.includes(code);
  return (
    <span className="sk-hover" tabIndex={has ? 0 : undefined}
          onMouseEnter={(e) => has && show(e.currentTarget)} onMouseLeave={() => setAt(null)}
          onFocus={(e) => has && show(e.currentTarget)} onBlur={() => setAt(null)}>
      {children}
      {at && createPortal(
        <div className="sk-pop" role="tooltip" style={{ left: at.x, top: at.y, width: POP_W }}>
          <strong>{skillNameKo(code)}</strong>
          <SkillMotion code={code} width={POP_W - 22} />
          <span className="muted small">쓸 때 → 날아갈 때 → 맞았을 때 → 걸려 있을 때를 되풀이해서 보여 줘요</span>
        </div>,
        document.body)}
    </span>
  );
}

export function SkillOverview({ items }: { items: AdminSkill[] | null }) {
  if (items === null) return <p className="muted">불러오는 중…</p>;
  return (
    <ul className="sk-overview" aria-label="전체 스킬 미리보기">
      {items.map((s) => (
        <li key={s.code} className={`sk-ov-card${s.enabled ? '' : ' off'}`}>
          <div className="sk-ov-head">
            <SkillHover code={s.code}><span className="sk-icon"><SkillIcon code={s.code} /></span></SkillHover>
            <div className="sk-title">
              <strong>{skillNameKo(s.code)}</strong>
              <span className="sk-sub"><code>{s.code}</code><span className={`sk-cat cat-${s.category.toLowerCase()}`}>{categoryNameKo(s.category)}</span></span>
            </div>
            <span className="muted small">쿨 {s.cooldownSeconds}초 · Lv.{s.requiredLevel}</span>
          </div>
          <SkillMotion code={s.code} width={300} />
        </li>
      ))}
    </ul>
  );
}
