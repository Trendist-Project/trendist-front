import { GoogleButton } from './GoogleButton';

interface Props { onStart(): void; error: string | null }

/** 배경 원: [왼쪽 %, 위 %, 크기 px, 움직임 경로 1~3, 한 바퀴 초, 시작 지연 초]. 원마다 경로·속도를 달리해 따로 떠다니게 한다. */
const BUBBLES: [number, number, number, number, number, number][] = [
  [8, 12, 120, 1, 9, 0], [70, 20, 60, 2, 6, -2], [78, 62, 180, 3, 11, -4], [20, 72, 40, 1, 5, -1],
  [45, 82, 90, 2, 8, -3], [55, 8, 30, 3, 5, -2], [5, 45, 70, 2, 7, -5], [88, 35, 50, 1, 6, -3],
  [32, 30, 26, 3, 4.5, -1], [62, 45, 110, 1, 10, -6], [15, 88, 64, 3, 7, -2], [92, 85, 36, 2, 5.5, -4],
  [38, 5, 80, 2, 9, -7], [72, 92, 24, 1, 4, -1],
];

export function MainScreen({ onStart, error }: Props) {
  return (
    <main className="main-screen">
      <div className="main-bg" aria-hidden="true">
        {BUBBLES.map(([left, top, size, path, seconds, delay], i) => (
          <span key={i} className="bubble" style={{
            left: `${left}%`, top: `${top}%`, width: size, height: size,
            animationName: `drift${path}`, animationDuration: `${seconds}s`, animationDelay: `${delay}s`,
          }} />
        ))}
      </div>
      <section className="main-card">
        <h1>Trendist</h1>
        <p className="tagline">유행을 아는 자, 커진다.</p>
        <p className="muted">남들보다 먼저 뜨는 키워드를 찾아 추가하고, 내 원을 키워 보세요.</p>
        <ol className="steps">
          <li>🔍 키워드 찾기</li>
          <li>➕ 먼저 추가하기</li>
          <li>⭕ 원이 커진다</li>
        </ol>
        <ul className="main-howto" aria-label="조작과 규칙">
          <li>🕹 모바일은 조이스틱, PC는 클릭·방향키로 이동</li>
          <li>⭕ 큰 원이 작은 원을 튕겨내요</li>
          <li>💥 지면 키워드 1개를 잃고, 이기면 그 키워드를 봐요</li>
          <li>🛡 잃으면 3초 무적 · 세이프존 안은 안전</li>
        </ul>
        <button className="primary big" onClick={onStart} autoFocus>시작</button>
        <div className="or-divider" aria-hidden="true"><span>또는</span></div>
        <GoogleButton />
        <p className="muted small">로그인하면 다른 기기에서도 기록이 이어져요. 게스트로 하던 기록도 그대로 이어져요</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
