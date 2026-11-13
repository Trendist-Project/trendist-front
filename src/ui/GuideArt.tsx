import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { effectiveKey, keyLabel } from '../game/skillKeys';
import { fmtNumber, t, tOr } from '../i18n';
import { TurtleIcon } from './GrowthIcons';
import { useSkills } from './useSkills';
import { SkillIcon } from './SkillIcon';

/** 가이드 그림(4.17): 본문에 `[[이름]]` 한 줄로 넣는다. 글로 설명하기 어려운 것을 게임과 같은 모양으로 보여 준다. */

/** 시작 3단계: 찾기 → 추가 → 커지기 */
export function StartSteps() {
  const steps = [
    { icon: '🔎', title: t('guideArt.step1'), text: t('guideArt.step1Desc') },
    { icon: '➕', title: t('guideArt.step2'), text: t('guideArt.step2Desc') },
    { icon: '🐢', title: t('guideArt.step3'), text: t('guideArt.step3Desc') },
  ];
  return (
    <ol className="guide-steps" aria-label={t('guideArt.steps')}>
      {steps.map((s, i) => (
        <li key={s.title}>
          <span className="guide-step-no">{i + 1}</span>
          <span className="guide-step-icon" aria-hidden="true">{s.icon}</span>
          <strong>{s.title}</strong>
          <span className="muted small">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** 조작: PC 키와 모바일 손동작 */
export function Controls() {
  return (
    <div className="guide-controls">
      <figure>
        <div className="keys" aria-hidden="true">
          <span className="key-row"><kbd>W</kbd></span>
          <span className="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
        </div>
        <figcaption><strong>PC</strong><span className="muted small">{t('guideArt.pcDesc')}</span></figcaption>
      </figure>
      <figure>
        <div className="joystick" aria-hidden="true"><span /></div>
        <figcaption><strong>{t('guideArt.mobile')}</strong><span className="muted small">{t('guideArt.mobileDesc')}</span></figcaption>
      </figure>
      <figure>
        <div className="keys" aria-hidden="true"><span className="key-row"><kbd>M</kbd><kbd>E</kbd></span></div>
        <figcaption><strong>{t('guideArt.shortcuts')}</strong><span className="muted small">{t('guideArt.shortcutsDesc')}</span></figcaption>
      </figure>
    </div>
  );
}

/** 키워드 상태 배지(보관함·카드와 같은 모양) */
export function KeywordStates() {
  return (
    <div className="guide-badges">
      <span className="badge state-활성">{t('guideArt.stateActive')}</span>
      <span className="badge state-비활성">{t('guideArt.stateInactive')}</span>
      <span className="badge state-금지">{t('guideArt.stateBanned')}</span>
    </div>
  );
}

/** 아레나에서 보이는 것: 세이프존 두 가지, 봇, ? 구슬, 내 원 */
export function ArenaLegend() {
  return (
    <ul className="guide-legend">
      <li><span className="swatch-zone center" aria-hidden="true" />{t('guideArt.zoneCenter')}</li>
      <li><span className="swatch-zone random" aria-hidden="true" />{t('guideArt.zoneRandom')}</li>
      <li><span className="legend-me" aria-hidden="true"><TurtleIcon level={10} size={26} /></span>{t('guideArt.me')}</li>
      <li><span className="legend-bot" aria-hidden="true" />{t('guideArt.bot')}</li>
      <li><span className="legend-orb" aria-hidden="true">?</span>{t('guideArt.orb')}</li>
    </ul>
  );
}

/**
 * 스킬 해금 표(4.33): 스킬별 해금 레벨, 그 레벨이 되는 데 필요한 누적 EXP, 키, 쿨타임. 값은 운영 값(DB skills·levels)을 지금 읽어 와서 글과 어긋나지 않는다.
 */
export function SkillUnlockTable() {
  const skills = useSkills();
  const [exp, setExp] = useState<Record<string, number>>({});
  const levels = [...new Set(skills.map((k) => k.requiredLevel).filter((l) => l > 1))];
  const key = levels.join(',');
  useEffect(() => {
    if (!levels.length) return;
    let alive = true;
    api.levelExp(levels).then((m) => { if (alive) setExp(m); }).catch(() => { /* EXP 칸만 비운다 */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const rows = [...skills].sort((a, b) => a.requiredLevel - b.requiredLevel);
  return (
    <div className="guide-table-wrap">
      <table className="guide-table" aria-label={t('guideArt.unlockTable')}>
        <thead><tr><th>{t('guideArt.unlockSkill')}</th><th>{t('guideArt.unlockLevel')}</th><th>{t('guideArt.unlockExp')}</th><th>{t('guideArt.unlockKey')}</th><th>{t('guideArt.unlockCooldown')}</th></tr></thead>
        <tbody>
          {rows.map((k) => {
            const kk = effectiveKey(k);
            return (
              <tr key={k.code}>
                <td><span aria-hidden="true"><SkillIcon code={k.code} icon={k.icon} /></span> <strong>{tOr(`skills.${k.code}_name`, k.code)}</strong></td>
                <td>{k.requiredLevel > 1 ? t('guideArt.unlockLv', { n: k.requiredLevel }) : t('guideArt.unlockBasic')}</td>
                <td>{k.requiredLevel > 1 ? (exp[String(k.requiredLevel)] !== undefined ? `${fmtNumber(exp[String(k.requiredLevel)])} EXP` : '…') : '–'}</td>
                <td>{kk ? <kbd>{keyLabel(kk)}</kbd> : '–'}</td>
                <td>{t('guideArt.unlockSec', { n: k.cooldownSeconds })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** ? 구슬 확률(4.20): 🔥 키워드를 얻을 확률과 잃을(또는 꽝) 확률을 막대로. 값은 운영 설정(orb_active_percent)에서 지금 읽어 온다 */
export function OrbOdds() {
  const [odds, setOdds] = useState<{ gainPercent: number; losePercent: number } | null>(null);
  useEffect(() => {
    let alive = true;
    api.orbOdds().then((o) => { if (alive) setOdds(o); }).catch(() => { /* 막대만 빠진다 */ });
    return () => { alive = false; };
  }, []);
  if (!odds) return <div className="orb-odds muted small">{t('common.loading')}</div>;
  return (
    <div className="orb-odds" role="group" aria-label={t('guideArt.orbOddsAria', { gain: odds.gainPercent, lose: odds.losePercent })}>
      <div className="orb-odds-bar" aria-hidden="true">
        <span className="gain" style={{ width: `${odds.gainPercent}%` }} />
        <span className="lose" style={{ width: `${odds.losePercent}%` }} />
      </div>
      <ul>
        <li className="gain"><strong>{odds.gainPercent}%</strong> {t('guideArt.orbGain')}</li>
        <li className="lose"><strong>{odds.losePercent}%</strong> {t('guideArt.orbLose')}</li>
        <li className="bang"><strong>100%</strong> {t('guideArt.orbBang')}</li>
      </ul>
    </div>
  );
}

/**
 * 모든 레벨(1~100)의 필요 누적 EXP(4.9, 4.17). 10레벨씩 묶은 작은 표 열 개로, 값은 운영 DB(levels 표)를 지금 읽어 와서 글과 어긋나지 않는다.
 * 스킬을 해금하는 레벨(DB skills.required_level)에는 그 스킬 아이콘을 붙여 한눈에 보이게 한다.
 */
export function LevelExpTable() {
  const [rows, setRows] = useState<{ level: number; requiredExp: number }[] | null>(null);
  const skills = useSkills();
  useEffect(() => {
    let alive = true;
    api.allLevels().then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);
  if (rows === null) return <div className="muted small">{t('common.loading')}</div>;
  if (rows.length === 0) return null;
  const unlocks = new Map<number, typeof skills>();
  for (const k of skills) if (k.requiredLevel > 1) unlocks.set(k.requiredLevel, [...(unlocks.get(k.requiredLevel) ?? []), k]);
  const groups: { level: number; requiredExp: number }[][] = [];
  for (let i = 0; i < rows.length; i += 10) groups.push(rows.slice(i, i + 10));
  return (
    <div className="level-exp-grid" role="group" aria-label={t('guideArt.levelExpAria')}>
      {groups.map((g) => (
        <table key={g[0].level} className="guide-table level-exp">
          <caption>{t('guideArt.levelRange', { a: g[0].level, b: g[g.length - 1].level })}</caption>
          <tbody>
            {g.map((r) => (
              <tr key={r.level}>
                <th scope="row">{t('guideArt.unlockLv', { n: r.level })}{unlocks.has(r.level) && <span className="lv-unlock" title={t('guideArt.levelUnlocks')}> {unlocks.get(r.level)!.map((k) => <SkillIcon key={k.code} code={k.code} icon={k.icon} />)}</span>}</th>
                <td>{fmtNumber(r.requiredExp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
