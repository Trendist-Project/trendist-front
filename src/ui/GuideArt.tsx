import { TurtleIcon } from './GrowthIcons';
import { t } from '../i18n';

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
        <div className="keys" aria-hidden="true"><span className="key-row"><kbd>M</kbd><kbd>L</kbd><kbd>C</kbd></span></div>
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
