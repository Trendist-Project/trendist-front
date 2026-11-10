import { t } from '../i18n';

export type HpFlash = { kind: 'hit' | 'heal'; key: number } | null;

/**
 * 내 체력(4.36): 명령 줄 안, 스킬 버튼 줄 바로 아래에 놓인 한 줄 막대(롤·메이플처럼 스킬 옆에 체력 게이지를 붙인다). 항상 %로 보이고 숫자는 막대 안 가운데에 있다.
 * 맞으면 하얀 조각이 잠깐 남았다 줄고 막대가 번쩍하며, 회복하면 밝은 빛이 번쩍한다.
 * 스킬을 누르는 손과 눈 가까이에 있어 곁눈으로 보이도록 폭을 명령 줄 전체로 하고, 빨간색(초록인 경험치 막대와 구별)과 숫자를 함께 쓰고, 25% 이하는 깜빡여 위급함을 알린다.
 */
export function HpHud({ pct, flash }: { pct: number; flash: HpFlash }) {
  const tone = pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'low';
  return (
    <div className={`hp-hud ${tone}`} role="progressbar" aria-label={t('hp.aria')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span className="hp-icon" aria-hidden="true">♥</span>
      <div className="hp-track">
        <i className="hp-ghost" style={{ width: `${pct}%` }} />
        <i key={flash?.kind === 'heal' ? flash.key : 0} className={flash?.kind === 'heal' ? 'hp-fill heal' : 'hp-fill'} style={{ width: `${pct}%` }} />
        {flash?.kind === 'hit' && <i key={flash.key} className="hp-hitflash" />}
        <span className="hp-pct"><b>HP</b> {pct}%</span>
      </div>
    </div>
  );
}
