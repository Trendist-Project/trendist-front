import type { OrbResult } from '../game/protocol';

const STATE_BADGE: Record<string, string> = { 활성: '🔥활성', 비활성: '💤비활성', 금지: '⛔금지' };
export const ORB_REVEAL_MS = 3000;

/** ? 구슬에서 나온 키워드를 3초 동안 보여 준다(4.20). 잃으면 어떤 키워드를 잃었는지 보여 주고, 잃을 것도 없으면 꽝이고, 이미 가진 키워드면 갱신했다고 알린다. */
export function OrbReveal({ result }: { result: OrbResult }) {
  if (result.status === 'MISS') {
    return (
      <div className="orb-reveal muted-reveal miss-reveal" role="status">
        <p className="orb-miss">꽝!</p>
        <p className="muted small">잃을 키워드도 없어요</p>
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
  if (result.status === 'LOST') {
    return (
      <div className="orb-reveal muted-reveal miss-reveal" role="status" aria-live="polite">
        <p className="orb-title">💨 키워드를 잃었어요</p>
        <p className="orb-keyword">
          <strong>{result.text}</strong>
          {result.state && <span className="badge">{STATE_BADGE[result.state] ?? result.state}</span>}
        </p>
        {!!result.gained && <p className="small">내 유행도 -{result.gained}</p>}
        <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
      </div>
    );
  }
  const gained = result.status === 'GAINED';
  return (
    <div className={gained ? 'orb-reveal' : 'orb-reveal muted-reveal'} role="status" aria-live="polite">
      <p className="orb-title">{gained ? '✨ 새 키워드를 얻었어요!' : '키워드를 갱신하였어요'}</p>
      <p className="orb-keyword">
        <strong>{result.text}</strong>
        {result.state && <span className="badge">{STATE_BADGE[result.state] ?? result.state}</span>}
      </p>
      <p className="small">{result.trendValue ?? 0}점 · 👥 {(result.holderCount ?? 0).toLocaleString()}명</p>
      {gained && <p className="orb-gain">내 유행도 +{result.gained ?? 0}</p>}
      <span className="orb-timer" style={{ animationDuration: `${ORB_REVEAL_MS}ms` }} />
    </div>
  );
}
