import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { WheelStatus } from '../api/types';
import { fmtNumber, t } from '../i18n';
import { Modal } from './Modal';

/** 칸 색: 숫자가 작을수록 차갑고 클수록 뜨겁게, 맨 마지막(최대) 칸은 금색 */
const COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#d946ef', '#ffc928'];
const SIZE = 300, C = 150, R = 140;
const SPIN_MS = 4800;

const pt = (deg: number, r: number) => { const a = (deg * Math.PI) / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)] as const; };
const slicePath = (i: number, n: number) => {
  const step = 360 / n, [x0, y0] = pt(i * step - step / 2, R), [x1, y1] = pt(i * step + step / 2, R);
  return `M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
};
const fmtLeft = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/**
 * 돌림판(하루 한 번): 칸에 적힌 숫자만큼 🔥 활성 키워드를 바로 받는다. 어느 칸에 멈출지는 서버가 확률(설정 wheel_weight_*)로 정하고, 화면은 그 칸에 맞춰 돈다.
 * onChange는 돌릴 수 있는지가 바뀔 때, onSpun은 키워드를 받은 직후(보관함 새로고침용)에 부른다.
 */
export function WheelModal({ onClose, onChange, onSpun }: { onClose: () => void; onChange: (available: boolean) => void; onSpun: () => void }) {
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ reward: number; keywords: string[] } | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const timer = useRef<number | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => { api.wheelStatus().then(setStatus).catch((e) => setError(e.message)); }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);

  const slices = status?.slices ?? [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];
  const n = slices.length;
  const locked = status?.locked === true;
  const waiting = status !== null && !status.available && !locked && status.enabled;

  const spin = async () => {
    if (!status?.available || spinning) return;
    setSpinning(true); setError(''); setResult(null);
    try {
      const r = await api.wheelSpin();
      const base = Math.ceil(rot / 360) * 360, jitter = (Math.random() * 2 - 1) * (180 / n) * 0.7; // 칸 안에서 조금씩 다른 자리에 멈춘다
      setRot(base + 360 * 5 - r.index * (360 / n) + jitter);
      onSpun(); onChange(false);
      timer.current = window.setTimeout(() => {
        setResult({ reward: r.reward, keywords: r.keywords }); setStatus(r.status); setSpinning(false);
      }, reduce ? 0 : SPIN_MS);
    } catch (e) {
      setSpinning(false);
      setError((e as Error).message);
      api.wheelStatus().then((s) => { setStatus(s); onChange(s.available); }).catch(() => {});
    }
  };

  const left = status ? status.nextAt - now : 0;
  return (
    <Modal title={t('wheel.title')} onClose={onClose} className="wheel-modal">
      <div className="wheel-wrap">
        <p className="wheel-lead">{t('wheel.lead')}</p>
        <div className={`wheel-stage${locked ? ' locked' : ''}`} role="img" aria-label={t('wheel.aria', { list: slices.join(', ') })}>
          <i className="wheel-pointer" aria-hidden="true" title={t('wheel.pointer')} />
          <div className="wheel-disc" style={{ transform: `rotate(${rot}deg)`, transition: spinning && !reduce ? `transform ${SPIN_MS}ms cubic-bezier(0.14, 0.62, 0.1, 1)` : 'none' }}>
            <svg viewBox={`-6 -6 ${SIZE + 12} ${SIZE + 12}`} aria-hidden="true">
              <circle cx={C} cy={C} r={R + 4} fill="#1a2233" stroke="#f2c14e" strokeWidth="4" />
              {slices.map((v, i) => (
                <g key={i}>
                  <path d={slicePath(i, n)} fill={COLORS[i % COLORS.length]} stroke="#0b0f17" strokeWidth="2" />
                  <g transform={`rotate(${i * (360 / n)} ${C} ${C})`}>
                    <text x={C} y={C - R + 40} textAnchor="middle" dominantBaseline="middle" className="wheel-num" fill={i === n - 1 ? '#3a2600' : '#fff'}>{v}</text>
                  </g>
                </g>
              ))}
              {Array.from({ length: n * 2 }, (_, i) => { const [x, y] = pt((i * 360) / (n * 2), R + 1); return <circle key={i} cx={x} cy={y} r="2.6" fill="#fff4c2" />; })}
              <circle cx={C} cy={C} r="24" fill="#0b0f17" stroke="#f2c14e" strokeWidth="4" />
            </svg>
          </div>
          <span className="wheel-hub" aria-hidden="true">🔥</span>
        </div>

        {result && (
          <div className="wheel-result" role="status" aria-live="polite">
            <strong>{t('wheel.resultTitle', { n: result.reward })}</strong>
            <span>{t('wheel.resultDesc', { n: result.reward })}</span>
            <p className="wheel-kws">
              {result.keywords.length > 0
                ? <>{result.keywords.slice(0, 6).map((k) => <em key={k}>{k}</em>)}{result.keywords.length > 6 && <em className="more">{t('wheel.resultMore', { n: result.keywords.length - 6 })}</em>}</>
                : <span className="muted">{t('wheel.resultNone')}</span>}
            </p>
          </div>
        )}
        {error && <p className="error small" role="alert">{error}</p>}

        {status && !status.enabled
          ? <p className="muted">{t('wheel.off')}</p>
          : locked
            ? <p className="wheel-locked">{t('wheel.locked', { n: status!.requiredLevel })}</p>
          : waiting && !spinning
            ? (
              <div className="wheel-wait">
                <b>{t('wheel.done')}</b>
                {status?.todayReward != null && <span>{t('wheel.doneDesc', { n: fmtNumber(status.todayReward) })}</span>}
                <span className="wheel-count">{t('wheel.next', { t: fmtLeft(left) })}</span>
              </div>
            )
            : <button type="button" className="wheel-spin" onClick={spin} disabled={!status || spinning}>{spinning ? t('wheel.spinning') : t('wheel.spin')}</button>}
      </div>
    </Modal>
  );
}
