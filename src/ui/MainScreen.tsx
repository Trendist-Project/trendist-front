interface Props { onStart(): void; error: string | null }

export function MainScreen({ onStart, error }: Props) {
  return (
    <main className="main-screen">
      <div className="main-bg" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => <span key={i} className={`bubble b${i % 7}`} />)}
      </div>
      <section className="main-card">
        <h1>Trendist</h1>
        <p className="tagline">유행을 아는 자, 커진다.</p>
        <p className="muted">남들보다 먼저 뜨는 키워드를 찾아 +하고, 내 원을 키워 보세요.</p>
        <ol className="steps">
          <li>🔍 키워드 찾기</li>
          <li>➕ 먼저 +하기</li>
          <li>⭕ 원이 커진다</li>
        </ol>
        <button className="primary big" onClick={onStart} autoFocus>시작</button>
        <button className="secondary big" disabled title="준비 중이에요">G&nbsp;&nbsp;Google로 계속하기</button>
        <p className="muted small">로그인하면 다른 기기에서도 기록이 이어져요 (준비 중)</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
