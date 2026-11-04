import { useEffect, useState } from 'react';
import { t } from '../i18n';

/** 대시 상태(4.27): until은 대시가 끝나는 시각, readyAt은 다시 쓸 수 있는 시각(둘 다 performance.now 기준 ms). 아직 안 썼으면 null */
export interface DashState { until: number; readyAt: number }

/** 이모트 버튼 왼쪽에 보이는 대시 표시: 준비됨 / 대시 중(남은 초) / 쿨타임(남은 초와 진행 막대). */
export function DashChip({ dash }: { dash: DashState | null }) {
  const [now, setNow] = useState(() => performance.now());
  const busy = dash !== null && now < dash.readyAt;
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [busy]);
  if (!dash || now >= dash.readyAt) {
    return <span className="dash-chip ready" title={t('gamescreen.dashReadyTitle')}>{t('gamescreen.dashReady')}</span>;
  }
  if (now < dash.until) {
    return <span className="dash-chip active" role="status">{t('gamescreen.dashActive', { n: Math.ceil((dash.until - now) / 1000) })}</span>;
  }
  const total = Math.max(1, dash.readyAt - dash.until);
  const p = Math.min(1, Math.max(0, (dash.readyAt - now) / total));
  return <span className="dash-chip cool" style={{ ['--p' as string]: `${Math.round(p * 100)}%` }} title={t('gamescreen.dashCool')}>{t('gamescreen.dashSec', { n: Math.ceil((dash.readyAt - now) / 1000) })}</span>;
}
