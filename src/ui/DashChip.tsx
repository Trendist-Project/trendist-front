import { useEffect, useState } from 'react';

/** 대시 상태(4.27): until은 대시가 끝나는 시각, readyAt은 다시 쓸 수 있는 시각(둘 다 performance.now 기준 ms). 아직 안 썼으면 null */
export interface DashState { until: number; readyAt: number }

/** 아래 내 정보 줄에 보이는 대시 표시: 준비됨 / 대시 중(남은 초) / 쿨타임(남은 초와 진행 막대). */
export function DashChip({ dash }: { dash: DashState | null }) {
  const [now, setNow] = useState(() => performance.now());
  const busy = dash !== null && now < dash.readyAt;
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [busy]);
  if (!dash || now >= dash.readyAt) {
    return <span className="dash-chip ready" title="대시: PC는 스페이스바, 모바일은 조이스틱을 쥔 채 다른 손가락으로 화면을 탭">⚡ 대시</span>;
  }
  if (now < dash.until) {
    return <span className="dash-chip active" role="status">⚡ 대시 {Math.ceil((dash.until - now) / 1000)}초</span>;
  }
  const total = Math.max(1, dash.readyAt - dash.until);
  const p = Math.min(1, Math.max(0, (dash.readyAt - now) / total));
  return <span className="dash-chip cool" style={{ ['--p' as string]: `${Math.round(p * 100)}%` }} title="대시 쿨타임">⚡ {Math.ceil((dash.readyAt - now) / 1000)}초</span>;
}
