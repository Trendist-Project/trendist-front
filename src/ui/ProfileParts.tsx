import type { CSSProperties, ReactNode } from 'react';
import { LevelText } from './LevelText';
import { fmtDate, fmtNumber, t } from '../i18n';

/**
 * 내 정보 창과 다른 플레이어 정보 창이 같은 모습으로 보이도록 나눠 쓰는 조각(4.1, 4.11).
 * ProfileHero: 그 원의 바탕색으로 은은하게 물드는 카드(원 무대 · 닉네임 · 칭호 · 레벨 · 다음 레벨까지의 EXP · 현재 유행도).
 * StatGroups: 활동 · 대결 · 기록 세 묶음.
 */
export function ProfileHero({ orb, name, badge, title, level, exp, nextExp, score, scoreLabel, extra, color }: {
  orb: ReactNode; name: string; badge?: ReactNode; title?: string | null; level: number;
  /** 지금 레벨에서 모은 EXP와 다음 레벨 필요량(최고 레벨이면 0 이하). 없으면 막대를 그리지 않는다(봇) */
  exp?: number; nextExp?: number; score: number; scoreLabel: string; extra?: ReactNode; color?: string | null;
}) {
  const hasExp = exp !== undefined && nextExp !== undefined;
  const pct = hasExp && nextExp! > 0 ? Math.max(0, Math.min(100, Math.round((exp! / nextExp!) * 100))) : 100;
  const label = hasExp ? `EXP ${exp}${nextExp! > 0 ? ` / ${nextExp}` : ''}` : '';
  return (
    <section className="me-hero" style={{ '--hero': color || '#3fb68b' } as CSSProperties}>
      <div className="pi-stage">{orb}</div>
      <div className="me-id">
        <div className="pi-name"><strong className="me-name">{name}</strong>{badge}</div>
        {title && <span className="pi-title"><span aria-hidden="true">🏅</span> {title}</span>}
        <span className="pi-level"><LevelText level={level} prefix={t('common.levelPrefix')} suffix={t('common.levelSuffix')} size={26} /></span>
        {hasExp && (
          <div className="me-exp" role="group" aria-label={label}>
            <div className="me-exp-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
            <div className="me-exp-text"><span>EXP {fmtNumber(exp!)}{nextExp! > 0 ? ` / ${fmtNumber(nextExp!)}` : ''}</span><span className="muted">{nextExp! > 0 ? `${pct}%` : t('profile.maxLevel')}</span></div>
          </div>
        )}
        {extra}
      </div>
      <div className="me-score"><span>{scoreLabel}</span><strong>{fmtNumber(score)}</strong></div>
    </section>
  );
}

export interface StatValues {
  holdCount: number; addCount: number; searchCount: number; activeDays: number;
  stealCount: number; botWinCount: number; killCount: number; deathCount: number;
  /** 인기도 칸의 내용: 내 정보는 숫자, 다른 플레이어는 올리기·내리기 버튼이 붙은 조각 */
  popularity: ReactNode; createdAt: string | null | undefined;
}

export function StatGroups({ s }: { s: StatValues }) {
  return (
    <div className="me-groups">
      <section className="me-group" aria-label={t('profile.groupActivity')}>
        <h3>{t('profile.groupActivity')}</h3>
        <dl className="me-stats">
          <div><dt><span aria-hidden="true">🗂</span>{t('profile.heldKeywords')}</dt><dd>{t('profile.countItems', { n: s.holdCount })}</dd></div>
          <div><dt><span aria-hidden="true">➕</span>{t('profile.adds')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(s.addCount) })}</dd></div>
          <div><dt><span aria-hidden="true">🔎</span>{t('profile.searches')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(s.searchCount) })}</dd></div>
          <div><dt><span aria-hidden="true">📅</span>{t('profile.activeDays')}</dt><dd>{t('profile.countDays', { n: fmtNumber(s.activeDays) })}</dd></div>
        </dl>
      </section>
      <section className="me-group" aria-label={t('profile.groupBattle')}>
        <h3>{t('profile.groupBattle')}</h3>
        <dl className="me-stats">
          <div><dt><span aria-hidden="true">⚔️</span>{t('profile.steals')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(s.stealCount) })}</dd></div>
          <div><dt><span aria-hidden="true">🤖</span>{t('profile.botHunts')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(s.botWinCount) })}</dd></div>
          <div><dt><span aria-hidden="true">💥</span>{t('profile.kills')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(s.killCount) })}</dd></div>
          <div><dt><span aria-hidden="true">🏳️</span>{t('profile.defeats')}</dt><dd>{t('profile.countTimes', { n: fmtNumber(s.deathCount) })}</dd></div>
        </dl>
      </section>
      <section className="me-group" aria-label={t('profile.groupRecord')}>
        <h3>{t('profile.groupRecord')}</h3>
        <dl className="me-stats">
          <div className="pop-stat"><dt><span aria-hidden="true">👍</span>{t('player.popularity')}</dt><dd>{s.popularity}</dd></div>
          <div><dt><span aria-hidden="true">🎂</span>{t('player.createdLabel')}</dt><dd>{s.createdAt ? fmtDate(s.createdAt) : '-'}</dd></div>
        </dl>
      </section>
    </div>
  );
}
