import type { OrbResult } from '../game/protocol';
import { fmtNumber, t } from '../i18n';
import { STATE_BADGE } from './keywordFormat';

export const ORB_REVEAL_MS = 3000;

/** ? 구슬에서 나온 키워드를 3초 동안 보여 준다(4.20). 잃으면 어떤 키워드를 잃었는지 보여 주고, 잃을 것도 없으면 꽝이고, 이미 가진 키워드면 갱신했다고 알린다. */
export function OrbReveal({ result }: { result: OrbResult }) {
  if (result.status === 'MISS') {
    return (
      <div className="orb-reveal muted-reveal miss-reveal" role="status">
        <p className="orb-miss">{t('gamescreen.orbMiss')}</p>
        <p className="muted small">{t('gamescreen.orbMissSub')}</p>
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
  if (result.status === 'NONE') {
    return (
      <div className="orb-reveal muted-reveal" role="status">
        <p className="orb-title">{t('gamescreen.orbNone')}</p>
        <p className="muted small">{t('gamescreen.orbNoneSub')}</p>
      </div>
    );
  }
  if (result.status === 'LOST') {
    return (
      <div className="orb-reveal muted-reveal miss-reveal" role="status" aria-live="polite">
        <p className="orb-title">{t('gamescreen.orbLost')}</p>
        <p className="orb-keyword">
          <strong>{result.text}</strong>
          {result.state && <span className="badge">{STATE_BADGE[result.state] ?? result.state}</span>}
        </p>
        {!!result.gained && <p className="small">{t('gamescreen.orbLostScore', { n: result.gained })}</p>}
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
  const gained = result.status === 'GAINED';
  return (
    <div className={gained ? 'orb-reveal' : 'orb-reveal muted-reveal'} role="status" aria-live="polite">
      <p className="orb-title">{gained ? t('gamescreen.orbGained') : t('gamescreen.orbRenewed')}</p>
      <p className="orb-keyword">
        <strong>{result.text}</strong>
        {result.state && <span className="badge">{STATE_BADGE[result.state] ?? result.state}</span>}
      </p>
      <p className="small">{t('gamescreen.orbStats', { score: result.trendValue ?? 0, holders: fmtNumber(result.holderCount ?? 0) })}</p>
      {gained && <p className="orb-gain">{t('gamescreen.orbGain', { n: result.gained ?? 0 })}</p>}
      <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
    </div>
  );
}
