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
        <section className="main-howto" aria-label="조작과 규칙">
          <h2>이렇게 움직여요</h2>
          <ul>
            <li>📱 <strong>모바일</strong> 누른 자리에 생기는 <strong>조이스틱</strong>으로 움직여요. 메뉴의 [이동 방식]에서 누른 곳으로 가는 <strong>터치 이동</strong>으로 바꿀 수 있어요.</li>
            <li>🖱 <strong>PC</strong> 클릭한 곳으로 가요. 방향키·WASD도 돼요.</li>
          </ul>
          <h2>규칙은 간단해요</h2>
          <ul>
            <li>⭕ 키워드를 추가할수록 원이 커지고, <strong>부딪히면 큰 원이 작은 원을 튕겨내요</strong>.</li>
            <li>💥 부딪혔을 때 유행도가 낮은 쪽이 <strong>키워드 하나를 잃어요</strong>. 이긴 쪽은 상대가 잃은 키워드를 알 수 있어요.</li>
            <li>🛡 키워드를 잃으면 <strong>3초 동안 무적</strong>이에요.</li>
            <li>🟦 <strong>세이프존</strong>(가운데 파란 칸, 곳곳에 5분씩 생기는 연두색 칸) 안에서는 부딪히지 않아요. 처음 오면 가운데 세이프존에서 시작해요.</li>
          </ul>
        </section>
        <button className="primary big" onClick={onStart} autoFocus>시작</button>
        <div className="or-divider" aria-hidden="true"><span>또는</span></div>
        <GoogleButton />
        <p className="muted small">로그인하면 다른 기기에서도 기록이 이어져요. 게스트로 하던 기록도 그대로 이어져요</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
