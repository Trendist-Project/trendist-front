import type { OrbResult } from '../game/protocol';

const STATE_BADGE: Record<string, string> = { 활성: '🔥활성', 비활성: '💤비활성', 금지: '⛔금지' };
export const ORB_REVEAL_MS = 3000;

/** ? 구슬에서 나온 키워드를 3초 동안 보여 준다(4.20). 꽝이거나 이미 가진 키워드면 바뀐 것이 없다고만 알린다. */
export function OrbReveal({ result }: { result: OrbResult }) {
  if (result.status === 'MISS') {
    return (
      <div className="orb-reveal muted-reveal miss-reveal" role="status">
        <p className="orb-miss">꽝!</p>
        <p className="muted small">다음 구슬을 노려 보세요</p>
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
  if (result.status === 'NONE') {
    return (
      <div className="orb-reveal muted-reveal" role="status">
        <p className="orb-title">텅 빈 구슬이에요</p>
        <p className="muted small">지금은 뜨는 키워드가 없어요</p>
      </div>
    );
  }
  const gained = result.status === 'GAINED';
  return (
    <div className={gained ? 'orb-reveal' : 'orb-reveal muted-reveal'} role="status" aria-live="polite">
      <p className="orb-title">{gained ? '✨ 새 키워드를 얻었어요!' : '이미 보관함에 있는 키워드예요'}</p>
      <p className="orb-keyword">
        <strong>{result.text}</strong>
        {result.state && <span className="badge">{STATE_BADGE[result.state] ?? result.state}</span>}
      </p>
      <p className="small">{Number(result.trendValue ?? 0).toFixed(0)}점 · 👥 {(result.holderCount ?? 0).toLocaleString()}명</p>
      {gained && <p className="orb-gain">내 유행도 +{Number(result.gained ?? 0).toFixed(1)}</p>}
      <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
    </div>
  );
}
