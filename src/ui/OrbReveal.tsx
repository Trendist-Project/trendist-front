import type { OrbResult } from '../game/protocol';
import { fmtNumber, t } from '../i18n';
import { STATE_BADGE } from './keywordFormat';

export const ORB_REVEAL_MS = 3000;

/** 결과 카드 한 장. 구슬뿐 아니라 키워드를 빼앗고 빼앗기고, 봇을 이겨 얻고, 부딪혀 잃을 때도 같은 카드를 쓴다.
 *  kind는 카드 위의 작은 표시: GAIN 획득, LOSE 잃음, STEAL 뺏음, STOLEN 뺏김. who는 상대 이름(있으면 보여 준다). */
export type RevealKind = 'GAIN' | 'LOSE' | 'STEAL' | 'STOLEN';
/** wipe는 🔥 불꽃으로 키워드를 모두 날린(GAINED) 또는 모두 잃은(LOST) 개수. 키워드를 빼앗거나 빼앗긴 것이 아니라 표시(kind)는 없다 */
/** lostCount는 독 스택으로 한 번에 여러 개를 잃었을 때의 개수(2개 이상이면 개수만 크게 보여 주고 어떤 키워드인지는 보여 주지 않는다) */
export type RevealResult = OrbResult & { kind?: RevealKind; who?: string; wipe?: number; kill?: string; lostCount?: number; lostLabel?: string };
const TAG_KEY: Record<RevealKind, string> = { GAIN: 'gamescreen.tagGain', LOSE: 'gamescreen.tagLose', STEAL: 'gamescreen.tagSteal', STOLEN: 'gamescreen.tagStolen' };

function Tag({ kind }: { kind?: RevealKind }) {
  return kind ? <span className={`orb-tag ${kind.toLowerCase()}`}>{t(TAG_KEY[kind])}</span> : null;
}

/** ? 구슬에서 나온 키워드를 3초 동안 보여 준다(4.20). 잃으면 어떤 키워드를 잃었는지 보여 주고, 잃을 것도 없으면 꽝이고, 이미 가진 키워드면 갱신했다고 알린다. */
export function OrbReveal({ result }: { result: RevealResult }) {
  if (result.kill !== undefined) { // 처치: 키워드가 없는 상대를 쓰러뜨렸다(4.31). 상대 이름이 둘째 줄
    return (
      <div className="orb-reveal" role="status" aria-live="polite">
        <p className="orb-title">{t('gamescreen.killTitle')}</p>
        <p className="orb-keyword"><strong title={result.kill}>{result.kill}</strong></p>
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
  if (result.wipe !== undefined) {
    const mine = result.status === 'GAINED'; // 내 불꽃이 상대의 키워드를 모두 날렸다 / 상대 불꽃에 내 키워드를 모두 잃었다
    return (
      <div className={mine ? 'orb-reveal' : 'orb-reveal muted-reveal miss-reveal'} role="status" aria-live="polite">
        <p className="orb-title">{result.lostLabel ?? t(mine ? 'gamescreen.wipeHitTitle' : 'gamescreen.wipeLostTitle')}</p>
        <p className="orb-keyword"><strong>{t('gamescreen.wipeCount', { n: result.wipe })}</strong></p>
        {result.who && <p className="orb-meta"><span className="orb-who">👤 {result.who}</span></p>}
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
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
  if (result.status === 'LOST' && (result.lostCount ?? 0) > 1) { // 독 스택으로 한 번에 여러 개를 잃었다: 개수만 크게 보여 준다(어떤 키워드인지는 보여 주지 않는다)
    return (
      <div className="orb-reveal muted-reveal miss-reveal" role="status" aria-live="polite">
        <p className="orb-title"><Tag kind={result.kind} />{result.lostLabel ?? t('gamescreen.poisonLostTitle')}</p>
        <p className="orb-keyword"><strong>{t('gamescreen.wipeCount', { n: result.lostCount ?? 0 })}</strong></p>
        <p className="orb-meta">
          {result.who && <span className="orb-who">👤 {result.who}</span>}
          {!!result.gained && <span className="orb-lostscore">{t('gamescreen.orbLostScore', { n: result.gained })}</span>}
        </p>
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
  if (result.status === 'LOST') {
    return (
      <div className="orb-reveal muted-reveal miss-reveal" role="status" aria-live="polite">
        <p className="orb-title"><Tag kind={result.kind} />{t('gamescreen.orbLost')}</p>
        <p className="orb-keyword"><strong title={result.text}>{result.text}</strong></p>
        <p className="orb-meta">
          {result.state && <span className="badge">{STATE_BADGE[result.state] ?? result.state}</span>}
          {result.holderCount !== undefined && <span className="orb-holders">👥 {t('side.holders', { n: fmtNumber(result.holderCount) })}</span>}
          {result.who && <span className="orb-who">👤 {result.who}</span>}
          {!!result.gained && <span className="orb-lostscore">{t('gamescreen.orbLostScore', { n: result.gained })}</span>}
        </p>
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
  const gained = result.status === 'GAINED';
  return (
    <div className={gained ? 'orb-reveal' : 'orb-reveal muted-reveal'} role="status" aria-live="polite">
      <p className="orb-title"><Tag kind={result.kind} />{gained ? t('gamescreen.orbGained') : t('gamescreen.orbRenewed')}</p>
      <p className="orb-keyword"><strong title={result.text}>{result.text}</strong></p>
      <p className="orb-meta">
        {result.state && <span className="badge">{STATE_BADGE[result.state] ?? result.state}</span>}
        {result.holderCount !== undefined && <span className="orb-holders">👥 {t('side.holders', { n: fmtNumber(result.holderCount) })}</span>}
        {result.who && <span className="orb-who">👤 {result.who}</span>}
        {gained && !!result.gained && <span className="orb-gain">{t('gamescreen.orbGain', { n: result.gained ?? 0 })}</span>}
      </p>
      <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
    </div>
  );
}
