import { useEffect, useState } from 'react';
import { t } from '../i18n';

/** 콤보가 사라질 때까지 남은 시간(4.25): 분:초. 30초 아래로 내려가면 붉게 바뀐다. until은 사라질 시각(performance.now 기준 ms), 제한이 없으면 null. */
export function ComboTimer({ until }: { until: number | null }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (until === null) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [until]);
  if (until === null) return null;
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return <span className={`combo-time${left <= 30 ? ' low' : ''}`} title={t('gamescreen.comboTimeTitle')} aria-label={t('gamescreen.comboTimeAria', { n: left })}>⏱ {text}</span>;
}
